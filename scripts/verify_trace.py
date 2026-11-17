"""One persisted hosted trace readback, with a 60-second process deadline.

Run with app/.venv/bin/python -P scripts/verify_trace.py TRACE_ID START_MS END_MS --target TARGET.
"""
import argparse
import json
import os
from pathlib import Path
import signal

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("trace_id")
parser.add_argument("start_ms", type=int)
parser.add_argument("end_ms", type=int)
parser.add_argument("--target", required=True, choices=["fevm", "emerging-hackathon"])
args = parser.parse_args()
if args.target == "fevm":
    config = {"profile": "fevm", "host": "https://fevm-serverless-stable-vwywqi.cloud.databricks.com", "warehouse_id": "05f329bec7bdb08b", "catalog": "serverless_stable_vwywqi_catalog", "schema": "shopibricks_laurent"}
    experiment_id = "588811517474050"
    output = ROOT / "docs/hosted-trace-validation.json"
else:
    config = json.loads((ROOT / "deployments" / f"{args.target}.json").read_text())
    experiment_id = json.loads((ROOT / "docs" / f"deployment.{args.target}.json").read_text())["experiment_id"]
    output = ROOT / ".local/deploy" / args.target / "verification-trace.json"

os.environ.update({
    "DATABRICKS_CONFIG_PROFILE": config["profile"],
    "DATABRICKS_HOST": config["host"],
    "MLFLOW_TRACING_SQL_WAREHOUSE_ID": config["warehouse_id"],
    "MLFLOW_SQL_WAREHOUSE_AUTO_START": "false",
    "MLFLOW_HTTP_REQUEST_MAX_RETRIES": "0",
    "MLFLOW_HTTP_REQUEST_TIMEOUT": "15",
})

def deadline(_signum, _frame):
    print(json.dumps({"passed": False, "error": "60-second readback deadline"}), flush=True)
    os._exit(1)

signal.signal(signal.SIGALRM, deadline)
signal.alarm(60)

try:
    import mlflow
    mlflow.set_tracking_uri(f'databricks://{config["profile"]}')
    trace = mlflow.MlflowClient().get_trace(args.trace_id, display=False)
    assert trace.data.spans, "No persisted spans"
    assert args.start_ms <= trace.info.request_time <= args.end_ms, "Unexpected trace timestamp"
    experiment = mlflow.get_experiment(experiment_id)
    assert experiment.trace_location.full_table_prefix == f'{config["catalog"]}.{config["schema"]}.agent_traces'
    def decoded(value):
        if isinstance(value, str):
            try:
                return json.loads(value)
            except json.JSONDecodeError:
                pass
        return value

    spans = []
    for span in trace.data.spans:
        input_value, output_value = decoded(span.inputs), decoded(span.outputs)
        inputs = input_value if isinstance(input_value, dict) else {}
        outputs = output_value if isinstance(output_value, dict) else {}
        spans.append({
            "name": span.name, "span_type": str(span.span_type), "status": str(span.status),
            "input_keys": list(inputs), "input_model": inputs.get("model", span.attributes.get("gen_ai.request.model")),
            "input_type": type(span.inputs).__name__, "output_type": type(span.outputs).__name__,
            "input_preview": json.dumps(input_value, default=str)[:1800],
            "output_keys": list(outputs), "output_preview": json.dumps(output_value, default=str)[:1800],
            "response_id": outputs.get("id"),
        })
    result = {
        "passed": True, "trace_id": trace.info.trace_id,
        "state": str(trace.info.state), "request_time_ms": trace.info.request_time,
        "experiment_id": experiment.experiment_id,
        "trace_location": experiment.trace_location.to_dict(), "spans": spans,
        "url": f'{config["host"]}/ml/experiments/{experiment_id}/traces/' + trace.info.trace_id.rsplit("/", 1)[-1],
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2), flush=True)
    signal.alarm(0)
except Exception as exc:
    print(json.dumps({"passed": False, "error_class": type(exc).__name__, "error_code": getattr(exc, "error_code", None)}), flush=True)
    os._exit(1)
