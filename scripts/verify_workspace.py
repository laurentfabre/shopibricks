"""Verify an explicitly selected deployment using native SDK OAuth.

The agent and Genie phases invoke the model. Checkout places one fictional
sandbox order and checks idempotency; no payment or shipment is possible.
Evidence is written to ignored local files, including on failure.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import time
import uuid
from urllib.parse import urlsplit

from databricks.sdk import WorkspaceClient
from databricks.sdk.core import Config

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("phase", choices=["app", "agent", "genie", "checkout"])
parser.add_argument("--target", required=True, choices=["emerging-hackathon"])
args = parser.parse_args()
config = json.loads((ROOT / "deployments" / f"{args.target}.json").read_text())
inventory = json.loads((ROOT / "docs" / f"deployment.{args.target}.json").read_text())
app_url = inventory["app_url"].rstrip("/")
client = WorkspaceClient(config=Config(profile=config["profile"], http_timeout_seconds=180, retry_timeout_seconds=10))
out = ROOT / ".local/deploy" / args.target
out.mkdir(parents=True, exist_ok=True)
report = {"target": args.target, "app_url": app_url, "checked_at": datetime.now(timezone.utc).isoformat(), "checks": []}


def check(condition, description):
    if not condition:
        raise AssertionError(description)
    report["checks"].append(description)
    print(description, flush=True)


def request(path, method="GET", body=None, headers=None, raw=False):
    value = client.api_client.do(method, url=app_url + path, body=body, headers=headers, raw=raw)
    if not raw:
        return value
    stream = value["contents"]
    try:
        return stream.read()
    finally:
        stream.close()


def mcp(method, params=None):
    response = request("/mcp", "POST", {"jsonrpc": "2.0", "id": str(uuid.uuid4()), "method": method, "params": params or {}}, {"Accept": "application/json, text/event-stream"})
    if "error" in response:
        raise AssertionError(response["error"])
    return response["result"]


def run_agent(message, experience):
    report["start_ms"] = int(time.time() * 1000)
    body = {"message": message, "experience": experience}
    events = request("/api/agent/run", "POST", body, raw=True).decode()
    events = [json.loads(line[6:]) for line in events.splitlines() if line.startswith("data: ")]
    report.update(request=body, events=events, end_ms=int(time.time() * 1000))
    check(not any(e["type"] == "RUN_ERROR" for e in events), "Hosted agent completes without a run error")
    check(any(e["type"] == "RUN_FINISHED" for e in events), "Hosted agent emits RUN_FINISHED")
    return events


try:
    if args.phase == "app":
        app = client.apps.get(config["app_name"]).as_dict()
        report["deployment_id"] = app.get("active_deployment", {}).get("deployment_id")
        check(app.get("app_status", {}).get("state") == "RUNNING", "Hosted app is running")
        health = request("/api/health")
        report["health"] = health
        check(health["database"] == "connected", "App-owned Lakebase schema is connected")
        workspace = health["workspace"] if "://" in health["workspace"] else "https://" + health["workspace"]
        check(urlsplit(workspace).hostname == urlsplit(config["host"]).hostname, "App uses the hackathon workspace")
        check(health["vector_index"] == "openai.shopibricks.products_index", "App uses the openai product index")
        check(health["genie_space_id"] == inventory["genie_space_id"], "App uses the target Genie space")
        check(str(health["experiment_id"]) == inventory["experiment_id"], "App uses the target MLflow experiment")
        html = request("/", raw=True).decode()
        assets = re.findall(r'(?:src|href)="(/assets/[^\"]+)"', html)
        check(bool(assets), "Production page contains built assets")
        javascript = b""
        for asset in assets:
            data = request(asset, raw=True)
            local = ROOT / "app/dist" / asset.lstrip("/")
            check(local.exists() and hashlib.sha256(data).digest() == hashlib.sha256(local.read_bytes()).digest(), f"Hosted build matches local asset {asset}")
            if asset.endswith(".js"):
                javascript += data
        check(all(label in javascript for label in [b"Start guided demo", b"Speaker notes", b"Download talking points"]), "Driver.js presenter guide and talking points are deployed")
        readiness = request("/api/catalog/readiness")
        check(readiness["total"] == readiness["ready"] == 12, "All 12 catalog products pass completeness checks")
        feed = request("/api/catalog/feed")
        check(feed["sandbox"] and len(feed["products"]) == 12, "Catalog feed retains sandbox labeling")
        atlas = request("/api/intelligence?source=examples")
        check(atlas["source"] == "examples" and atlas["summary"]["queries"] == 72, "Atlas contains 72 labeled fictional questions")
        check(len(atlas["clusters"]) == 6 and sum(c["count"] for c in atlas["clusters"]) == 72, "Atlas clustering accounts for every question exactly once")
        filtered = request("/api/intelligence?source=examples&clusters=4&profile=noor&channel=travel")
        check(filtered["summary"]["queries"] == 12 and len(filtered["clusters"]) <= 4, "Persona, experience, and clustering controls work")
        lakehouse = request("/api/lakehouse?refresh=1")
        report["lakehouse"] = lakehouse
        check(lakehouse["source"] == "openai.shopibricks.gold_commerce_daily" and len(lakehouse["demand"]) == 12, "App principal reads target gold metrics and demand")
        check(sum(int(row["events"]) for row in lakehouse["daily"]) > 20000, "Gold analytics includes seeded history and live microbatches")
        tools = mcp("tools/list")
        check("semantic_search" in {tool["name"] for tool in tools["tools"]}, "Hosted MCP tool discovery works")
        vector = mcp("tools/call", {"name": "semantic_search", "arguments": {"query": "wireless audio for a Paris weekend"}})
        report["vector"] = vector
        check(not vector.get("isError"), "App principal executes governed hybrid vector retrieval")
        search = json.loads(next(c["text"] for c in vector["content"] if c["type"] == "text"))
        check(bool(search["result"]["data_array"]), "Target vector retrieval returns actual product rows")
    elif args.phase == "agent":
        experience = {"persona": "shopper", "profile": "noor", "channel": "travel", "voice": "playful"}
        message = "Curate a city photography kit with a compact camera and something for capturing ideas. Use my profile budget, check current stock and render the complete kit. Do not prepare checkout."
        before = request("/api/insights?profile=noor&channel=travel")
        events = run_agent(message, experience)
        cards = [e["value"] for e in events if e.get("name") == "shopibricks.ui" and e.get("value", {}).get("kind") == "products"]
        check(bool(cards) and all(card["total_cents"] <= 30000 for card in cards), "Noor receives product cards within the €300 profile budget")
        check(any(e.get("toolCallName") == "get_inventory" for e in events), "Recommendation checks live inventory")
        check(any(e.get("name") == "shopibricks.context" and e["value"]["experience"] == experience and e["value"]["budget_cents"] == 30000 for e in events), "Persona, experience, voice and budget reach the hosted agent")
        after = request("/api/insights?profile=noor&channel=travel")
        check(after["requests"] == before["requests"] + 1 and after["recommended"] == before["recommended"] + 1, "Intent insights reflect the new recommendation")
        run_id = next(e["runId"] for e in events if e["type"] == "RUN_STARTED")
        activity = request("/api/intelligence?source=activity&profile=noor&channel=travel")
        captured = next((q for q in activity["queries"] if q["id"] == run_id), None)
        check(captured and captured["text"] == message and captured["observed"]["recommended"], "Live atlas records the exact new question and observed outcome")
        check(all(not q["id"].startswith("example-") for q in activity["queries"]), "Fictional examples remain separate from observed activity")
        report["run_id"] = run_id
    elif args.phase == "genie":
        events = run_agent("Use Genie to find the product with the highest total stockout exposure across all cities and channels. Show the generated SQL, latest event timestamp and definition. Does this represent actual lost revenue?", {"persona": "merchant", "profile": "camille", "channel": "storefront", "voice": "concise"})
        check(any(e.get("toolCallName") == "ask_genie" for e in events), "Merchant analyst calls the target Genie space")
        results = [e for e in events if e.get("type") == "TOOL_CALL_RESULT"]
        text = json.dumps(results)
        check("query_results" in text and "statement_id" in text and "gold_product_demand" in text, "Genie returns generated SQL and an executed query result")
    else:
        sku = "sb-notebook"
        before = next(p for p in request("/api/products")["products"] if p["id"] == sku)
        body = {"items": [{"id": sku, "quantity": 1}], "buyer": {"name": "Synthetic Demo", "email": "demo@example.com"}, "fulfillment_address": {"name": "Synthetic Demo", "line_one": "1 Rue de Demo", "city": "Paris", "country": "FR", "postal_code": "75001"}}
        checkout = request("/api/checkout", "POST", body, {"Idempotency-Key": str(uuid.uuid4())})
        check(checkout["status"] == "ready_for_payment", "Synthetic checkout is ready after address validation")
        check(next(total["amount"] for total in checkout["totals"] if total["type"] == "total") == before["price_cents"], "Checkout total uses the authoritative price")
        completion = {"confirmed": True, "payment_data": {"provider": "stripe", "token": "shopibricks_sandbox"}}
        headers = {"Idempotency-Key": str(uuid.uuid4())}
        order = request(f'/api/checkout/{checkout["id"]}/complete', "POST", completion, headers)
        duplicate = request(f'/api/checkout/{checkout["id"]}/complete', "POST", completion, headers)
        report["order"] = order
        check(order["status"] == "completed" and order["order"]["id"] == duplicate["order"]["id"], "Explicit sandbox confirmation is idempotent")
        check(request(f'/api/orders/{order["order"]["id"]}')["order"]["id"] == order["order"]["id"], "Completed receipt persists across requests")
        after = next(p for p in request("/api/products")["products"] if p["id"] == sku)
        check(after["stock"] == before["stock"] - 1, "Duplicate confirmation decrements inventory exactly once")
    report["passed"] = True
except Exception as error:
    report.update(passed=False, error=str(error))
    raise
finally:
    (out / f"verification-{args.phase}.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"phase": args.phase, "passed": report["passed"], "checks": len(report["checks"]), "error": report.get("error")}), flush=True)
