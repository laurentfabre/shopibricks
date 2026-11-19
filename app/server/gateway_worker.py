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
            api = os.environ.get("SHOPIBRICKS_GATEWAY_API", "native")
            if api not in ("native", "mlflow"):
                raise ValueError("SHOPIBRICKS_GATEWAY_API must be native or mlflow")
            _client = DatabricksOpenAI(use_ai_gateway_native_api=api == "native", use_ai_gateway=api == "mlflow", timeout=85, max_retries=1)
        completed = None
        failed = None
        if os.environ.get("SHOPIBRICKS_GATEWAY_API", "native") == "mlflow":
            # The unified route can omit function arguments in every streamed
            # event, including response.completed. Non-streaming preserves them.
            # Deliver actual completed text in one chunk; do not simulate tokens.
            response = _client.responses.create(**request, stream=False)
            if response.status == "completed":
                completed = response.model_dump()
                if response.output_text:
                    emit({"type": "delta", "delta": response.output_text})
            else:
                failed = response.model_dump()
        else:
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
    else:
        raise ValueError("Unknown gateway operation")

if __name__ == "__main__":
    for line in sys.stdin:
        try:
            main(json.loads(line))
        except Exception as exc:
            emit({"type":"error", "error": {"message":str(exc)[:1200], "kind":type(exc).__name__}})
