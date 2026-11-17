"""Official Databricks clients own all authentication. No credential material crosses IPC."""
import json
import os
import sys
import threading
from databricks.sdk import WorkspaceClient
from trace_config import configure_trace_destination
from trace_diagnostics import TraceDiagnostics, safe_failure

_output_lock = threading.Lock()

def emit(value):
    with _output_lock:
        print(json.dumps(value, default=str), flush=True)

_client = None
_tracing = None
_diagnostics = TraceDiagnostics(emit)
def main(request):
    global _client, _tracing
    action = request.pop("action", "responses")
    if action == "responses":
        from databricks_openai import DatabricksOpenAI
        if _client is None and os.environ.get("MLFLOW_EXPERIMENT_ID"):
            import mlflow
            _diagnostics.install()
            mlflow.set_tracking_uri("databricks")
            try:
                configure_trace_destination(mlflow, os.environ["MLFLOW_EXPERIMENT_ID"], os.environ.get("SHOPIBRICKS_TRACE_TABLE_PREFIX"))
                mlflow.openai.autolog()
                _tracing = mlflow
                emit({"type": "diagnostic", "source": "mlflow", "status": "configured"})
            except Exception as exc:
                emit({"type": "diagnostic", "source": "mlflow", "status": "configuration_failed", **safe_failure(exc)})
        if _client is None:
            _client = DatabricksOpenAI(use_ai_gateway_native_api=True, timeout=85, max_retries=1)
        completed = None
        failed = None
        for event in _client.responses.create(**request, stream=True):
            if event.type == "response.output_text.delta":
                emit({"type": "delta", "delta": event.delta})
            elif event.type == "response.completed":
                completed = event.response.model_dump()
            elif event.type in ("response.failed", "response.incomplete", "error"):
                failed = event.model_dump()
        # Autolog finalizes the span only when its stream wrapper is exhausted.
        # Do not release this worker for another request before that point.
        if _tracing is not None:
            try:
                _diagnostics.finish(_tracing, probe=os.environ.get("SHOPIBRICKS_TRACE_VERIFY") == "1")
            except Exception as exc:
                emit({"type": "diagnostic", "source": "mlflow", "status": "diagnostic_failed", **safe_failure(exc)})
        if failed is not None:
            emit({"type": "error", "error": failed})
        elif completed is not None:
            emit({"type": "completed", "response": completed})
        else:
            raise RuntimeError("Model stream ended without a completed response")
    elif action == "sql":
        from databricks.sdk.service.sql import StatementState
        import time
        w = WorkspaceClient()
        result = w.statement_execution.execute_statement(
            warehouse_id=os.environ["DATABRICKS_WAREHOUSE_ID"],
            statement=request["statement"], wait_timeout="10s", row_limit=100,
        )
        deadline = time.monotonic() + 35
        while result.status.state in (StatementState.PENDING, StatementState.RUNNING):
            if time.monotonic() > deadline:
                w.statement_execution.cancel_execution(result.statement_id)
                raise TimeoutError("Warehouse query exceeded 35 seconds")
            time.sleep(1)
            result = w.statement_execution.get_statement(result.statement_id)
        if result.status.state != StatementState.SUCCEEDED:
            raise RuntimeError(str(result.status.error))
        columns = [c.name for c in result.manifest.schema.columns]
        emit({"type": "completed", "response": {"rows": [dict(zip(columns, row)) for row in (result.result.data_array or [])], "statement_id": result.statement_id}})
    elif action == "vector":
        w = WorkspaceClient()
        result = w.vector_search_indexes.query_index(
            index_name=os.environ["SHOPIBRICKS_VECTOR_INDEX"],
            columns=["id", "name", "description", "price_cents", "category"],
            query_text=request["query"], query_type="HYBRID", num_results=6,
        )
        emit({"type": "completed", "response": result.as_dict()})
    elif action == "genie":
        w = WorkspaceClient()
        result = w.genie.start_conversation_and_wait(space_id=os.environ["SHOPIBRICKS_GENIE_SPACE_ID"], content=request["question"])
        payload = result.as_dict()
        payload["source"] = "Databricks AI/BI Genie"
        payload["query_results"] = []
        for attachment in result.attachments or []:
            if attachment.query and attachment.attachment_id:
                query_result = w.genie.get_message_attachment_query_result(
                    space_id=result.space_id,
                    conversation_id=result.conversation_id,
                    message_id=result.message_id,
                    attachment_id=attachment.attachment_id,
                ).statement_response
                if query_result and query_result.manifest and query_result.result:
                    columns = [column.name for column in query_result.manifest.schema.columns]
                    rows = query_result.result.data_array or []
                    payload["query_results"].append({
                        "attachment_id": attachment.attachment_id,
                        "statement_id": query_result.statement_id,
                        "rows": [dict(zip(columns, row)) for row in rows[:100]],
                        "returned_rows": min(len(rows), 100),
                        "truncated": len(rows) > 100 or bool(query_result.result.next_chunk_index),
                    })
        emit({"type": "completed", "response": payload})
    elif action == "job":
        w = WorkspaceClient()
        result = w.jobs.run_now(job_id=int(os.environ["SHOPIBRICKS_STREAM_JOB_ID"]), job_parameters={"minutes":"60"})
        emit({"type": "completed", "response": {"run_id": result.run_id}})
    elif action == "ug_overview":
        emit({"type": "completed", "response": unity_gateway_overview(request["service"])})
    elif action == "ug_lab":
        import ug_bench
        from concurrent.futures import ThreadPoolExecutor
        scenario = ug_bench.scenario(request["scenario"])
        models = [m for m in request["models"] if m in ug_bench.PRICES_DBU][:4]
        with ThreadPoolExecutor(max(len(models), 1)) as pool:
            rows = list(pool.map(lambda m: ug_bench.run_once(m, scenario, None, request.get("effort", "low")), models))
        emit({"type": "completed", "response": {"scenario": {"id": scenario.id, "title": scenario.title, "prompt": scenario.prompt}, "rows": rows}})
    elif action == "ug_route":
        w = WorkspaceClient()
        service = request["service"]
        destinations = [{"name": f"primary-{request['primary']}", "destination_type": "DESTINATION_TYPE_PAY_PER_TOKEN_FOUNDATION_MODEL",
                         "pay_per_token_config": {"model": f"models/system.ai.databricks-{request['primary']}"}, "traffic_percentage": 100}]
        result = w.api_client.do("PATCH", f"/api/2.1/unity-catalog/model-services/{service}",
                                 query={"update_mask": "config.routing.destinations"},
                                 body={"config": {"routing": {"destinations": destinations}}})
        emit({"type": "completed", "response": result})
    else:
        raise ValueError("Unknown gateway operation")


def unity_gateway_overview(service):
    """Read-only view of the Unity Gateway configuration that governs this app."""
    w = WorkspaceClient()

    def get(path, query=None):
        try:
            return w.api_client.do("GET", path, query=query)
        except Exception as exc:
            return {"error": str(exc)[:400]}

    def list_all(path, parent):
        items, token = [], None
        for _ in range(10):
            page = get(path, {"parent": parent, **({"page_token": token} if token else {})})
            if "error" in page:
                return page
            items += next((v for v in page.values() if isinstance(v, list)), [])
            token = page.get("next_page_token")
            if not token:
                break
        return items

    out = {"service": service, "workspace_id": str(w.get_workspace_id())}
    try:
        out["identity"] = w.current_user.me().user_name
    except Exception:
        out["identity"] = None
    out["model_service"] = get(f"/api/2.1/unity-catalog/model-services/{service}")
    out["grants"] = get(f"/api/2.1/unity-catalog/permissions/model_service/{service}")
    system_models = list_all("/api/2.1/unity-catalog/model-services", "schemas/system.ai")
    out["system_ai_models"] = system_models if isinstance(system_models, dict) else [
        {"name": m.get("name", "").split("/")[-1], "api_types": m.get("supported_api_types", [])} for m in system_models]
    parent = ".".join(service.split(".")[:2])
    mcp = []
    for schema in dict.fromkeys(["system.ai", parent]):
        found = list_all("/api/2.1/unity-catalog/mcp-services", f"schemas/{schema}")
        if isinstance(found, list):
            mcp += [{"name": m.get("name", "").split("/")[-1], "comment": (m.get("comment") or "").split(". ")[0][:140]} for m in found]
    out["mcp_services"] = mcp
    if not service.startswith("system.ai."):
        app_models = list_all("/api/2.1/unity-catalog/model-services", f"schemas/{parent}")
        out["app_schema_services"] = [m.get("name", "").split("/")[-1] for m in app_models] if isinstance(app_models, list) else app_models
    return out

if __name__ == "__main__":
    for line in sys.stdin:
        try:
            main(json.loads(line))
        except Exception as exc:
            emit({"type":"error", "error": {"message":str(exc)[:1200], "kind":type(exc).__name__}})
