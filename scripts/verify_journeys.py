"""Verify CopilotKit, MCP event replay and quote continuation on the personal app.

Uses native SDK OAuth; creates a temporary quote and a sandbox checkout draft,
but never confirms an order. Model runs use the selected target's existing gateway.
"""
import argparse
import json
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from databricks.sdk import WorkspaceClient
from databricks.sdk.core import Config

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--profile", required=True, choices=["shopibricks-personal"])
args = parser.parse_args()
inventory = json.loads((ROOT / "docs/deployment.shopibricks-personal.json").read_text())
url = inventory["app_url"].rstrip("/")
client = WorkspaceClient(config=Config(profile=args.profile, http_timeout_seconds=180, retry_timeout_seconds=1))
report = {"checked_at": datetime.now(timezone.utc).isoformat(), "checks": [], "passed": False}
out = ROOT / ".local/deploy/shopibricks-personal/journeys-verification.json"


def check(condition, label):
    if not condition:
        raise AssertionError(label)
    report["checks"].append(label)
    print(label, flush=True)


def request(path, method="GET", body=None, headers=None, raw=False):
    return client.api_client.do(method, url=url + path, body=body, headers=headers, raw=raw)


def tool(name, arguments):
    response = request("/mcp", "POST", {"jsonrpc": "2.0", "id": str(uuid.uuid4()), "method": "tools/call", "params": {"name": name, "arguments": arguments}}, {"Accept": "application/json, text/event-stream"})["result"]
    check(not response.get("isError"), f"Hosted MCP {name} succeeds")
    return json.loads(next(c["text"] for c in response["content"] if c["type"] == "text"))


def agent(message, persona):
    run_id, thread_id = str(uuid.uuid4()), str(uuid.uuid4())
    body = {"threadId": thread_id, "runId": run_id, "messages": [{"id": str(uuid.uuid4()), "role": "user", "content": message}], "state": {"experience": {"persona": persona, "profile": "camille", "channel": "storefront", "voice": "concise"}, "workspace": {"view": "atlas" if persona == "merchant" else "Shop", "bag": []}}, "tools": [], "context": [], "forwardedProps": {}}
    stream = request("/api/copilotkit/agent/default/run", "POST", body, {"Accept": "text/event-stream"}, raw=True)["contents"]
    try:
        text = stream.read().decode()
    finally:
        stream.close()
    events = [json.loads(line[6:]) for line in text.splitlines() if line.startswith("data: ")]
    report[persona + "_events"] = events
    failures = [e.get("message") for e in events if e["type"] == "RUN_ERROR"]
    check(not failures and any(e["type"] == "RUN_FINISHED" for e in events), f"Hosted {persona} CopilotKit run completes: {failures}")
    check(any(e["type"] == "RUN_STARTED" and e["runId"] == run_id and e["threadId"] == thread_id for e in events), f"{persona} stream preserves CopilotKit run and thread IDs")
    return events


try:
    info = request("/api/copilotkit/info")
    check(info["agents"]["default"]["className"] == "ShopiBricksAgent" and info["telemetryDisabled"], "Hosted runtime discovers the custom agent with telemetry disabled")
    before = request("/api/events")["events"]
    cursor = max([e["id"] for e in before] or [0])
    products = tool("search_products", {"query": "headphones"})["products"]
    product = next(p for p in products if p["stock"] > 0)
    quote = tool("quote_cart", {"items": [{"id": product["id"], "quantity": 1}]})
    check(quote["continuation_url"] == url + "/?quote=" + quote["quote_id"], "Saved quote has the authenticated personal-app continuation URL")
    restored = request("/api/quotes/" + quote["quote_id"])
    check(restored["available"] and restored["items"] == quote["items"] and not restored["price_changed"], "Quote restoration checks current prices and stock")
    key = str(uuid.uuid4())
    draft = request("/api/quotes/" + quote["quote_id"] + "/continue", "POST", {"reviewed": True}, {"Idempotency-Key": key})
    replay = request("/api/quotes/" + quote["quote_id"] + "/continue", "POST", {"reviewed": True}, {"Idempotency-Key": key})
    check(draft["id"] == replay["id"] and not draft.get("order") and draft["status"] == "not_ready_for_payment", "Continuation is idempotent and creates only an incomplete checkout draft")
    events = request("/api/events?after=" + str(cursor))["events"]
    calls = [e for e in events if e.get("name") == "shopibricks.mcp"]
    check(any(e["value"].get("quote_id") == quote["quote_id"] for e in calls), "MCP outcome records the exact saved quote ID")
    for name in ["search_products", "quote_cart"]:
        pair = [e["value"] for e in calls if e["value"]["tool"] == name]
        check({e["phase"] for e in pair} == {"started", "completed"} and len({e["call_id"] for e in pair}) == 1, f"{name} start and outcome share one call ID")
    check(any(e.get("name") == "shopibricks.quote" and e["value"]["checkout_id"] == draft["id"] for e in events), "Quote-to-checkout handoff is recorded for the same owner")
    stream = request("/api/events/stream?after=" + str(cursor), raw=True)["contents"]
    captured = b""
    try:
        deadline = time.monotonic() + 15
        while b"data: " not in captured or not captured.endswith(b"\n\n"):
            chunk = stream.read(1)
            if not chunk or time.monotonic() > deadline or len(captured) > 20000:
                break
            captured += chunk
    finally:
        stream.close()
    check(b"id: " in captured and b"data: " in captured, "Hosted SSE feed replays persisted owner-scoped events after a cursor")
    atlas = request("/api/intelligence?source=activity&channel=mcp")
    check(any(q["text"] == "headphones" and q["provenance"] == "tool_search" and not q.get("profile") for q in atlas["queries"]), "MCP search signals feed the atlas without fabricated shopper profiles")
    shopper = agent("Show the Forma Headphones as a product card and check current stock. Do not create checkout.", "shopper")
    check(any(e.get("name") == "shopibricks.ui" and e["value"].get("kind") == "products" for e in shopper), "CopilotKit shopper returns authoritative product cards")
    merchant = agent("Use the discovery activity tool to summarize my recent MCP calls, then open the Live journeys view. Do not query order metrics or create checkout.", "merchant")
    check(any(e.get("toolCallName") == "get_discovery_activity" for e in merchant), "Merchant copilot reads actual account-scoped discovery evidence")
    check(any(e["type"] == "STATE_SNAPSHOT" and e["snapshot"].get("navigation", {}).get("view") == "activity" for e in merchant), "Merchant copilot updates workspace navigation through AG-UI shared state")
    report["passed"] = True
finally:
    out.write_text(json.dumps(report, indent=2))
    print(json.dumps({"passed": report["passed"], "checks": len(report["checks"]), "report": str(out)}), flush=True)
