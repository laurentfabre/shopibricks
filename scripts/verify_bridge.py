"""Verify the hosted personal bridge without exposing OAuth codes or credentials.

Databricks user authentication remains inside the native SDK. Only this bridge's
own short-lived test grant is held in memory; it is revoked before exiting.
No checkout is created. The synthetic ChatGPT callback is never visited.
"""
import argparse
import base64
from datetime import datetime, timezone
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import secrets
from unittest.mock import patch
from urllib.parse import parse_qs, urlencode, urlsplit

import requests
from databricks.sdk import WorkspaceClient
from databricks.sdk.core import Config


class ConsentForm(HTMLParser):
    def __init__(self):
        super().__init__()
        self.fields = {}

    def handle_starttag(self, tag, attrs):
        fields = dict(attrs)
        if tag == "input" and fields.get("name") in ("request", "csrf"):
            self.fields[fields["name"]] = fields.get("value", "")


def verify(profile):
    root = Path(__file__).resolve().parents[1]
    inventory = json.loads((root / "docs/deployment.shopibricks-personal.json").read_text())
    app_url, bridge = inventory["app_url"].rstrip("/"), inventory["bridge_url"]
    resource = bridge + "/mcp"
    client = WorkspaceClient(config=Config(profile=profile, http_timeout_seconds=100, retry_timeout_seconds=1))
    report = {"bridge_url": bridge, "checked_at": datetime.now(timezone.utc).isoformat(), "checks": [], "passed": False}
    session = requests.Session()
    credentials, client_id = None, None

    def check(ok, description):
        if not ok:
            raise AssertionError(description)
        report["checks"].append(description)
        print(description, flush=True)

    def external(path, *, method="GET", expected=200, **kwargs):
        response = session.request(method, bridge + path, timeout=115, allow_redirects=False, **kwargs)
        if response.status_code != expected:
            raise AssertionError(f"Bridge {path} expected {expected}, received {response.status_code}")
        return response

    def native(path, method="GET", **kwargs):
        # The SDK owns native OAuth. Disable only HTTP redirect following so a
        # test grant never travels to ChatGPT's real callback.
        original = requests.Session.request

        def no_redirect(instance, *args, **options):
            options["allow_redirects"] = False
            return original(instance, *args, **options)

        with patch.object(requests.Session, "request", no_redirect):
            result = client.api_client.do(method, url=app_url + path, **kwargs)
        if kwargs.get("raw"):
            stream = result.pop("contents")
            try:
                result["text"] = stream.read().decode()
            finally:
                stream.close()
        return result

    def rpc(method, params=None):
        response = external("/mcp", method="POST", json={"jsonrpc": "2.0", "id": secrets.token_hex(8), "method": method, "params": params or {}}, headers={"Authorization": "Bearer " + credentials["access_token"], "Accept": "application/json, text/event-stream", "MCP-Protocol-Version": "2025-03-26"}).json()
        if "error" in response:
            raise AssertionError(f"MCP {method} failed")
        return response["result"]

    def tool(name, args):
        result = rpc("tools/call", {"name": name, "arguments": args})
        check(not result.get("isError"), f"Hosted {name} tool succeeds")
        return json.loads(next(item["text"] for item in result["content"] if item["type"] == "text"))

    try:
        check(client.current_user.me().user_name == "laurent.fabre@gmail.com", "Native SDK uses the selected personal identity")
        metadata = external("/.well-known/oauth-authorization-server").json()
        check(metadata["issuer"] == bridge and metadata["registration_endpoint"] == bridge + "/register" and metadata["code_challenge_methods_supported"] == ["S256"], "OAuth discovery uses the Vercel issuer, dynamic registration and PKCE")
        check(external("/.well-known/oauth-protected-resource/mcp").json()["resource"] == resource, "Protected-resource discovery matches the MCP endpoint")
        denied = external("/mcp", method="POST", expected=401, json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"})
        check("resource_metadata" in denied.headers.get("www-authenticate", ""), "Unauthenticated requests receive the OAuth challenge")
        callback = "https://chatgpt.com/connector/oauth/shopibricks-hosted-check"
        registration = external("/register", method="POST", expected=201, json={"redirect_uris": [callback], "token_endpoint_auth_method": "none", "grant_types": ["authorization_code", "refresh_token"], "response_types": ["code"], "scope": "shopibricks:read"}).json()
        client_id = registration["client_id"]
        check(bool(client_id), "Dynamic registration persists through the Databricks relay")
        verifier, state = secrets.token_urlsafe(48), secrets.token_urlsafe(24)
        challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
        query = {"client_id": client_id, "redirect_uri": callback, "response_type": "code", "code_challenge": challenge, "code_challenge_method": "S256", "state": state, "resource": resource, "scope": "shopibricks:read"}
        redirect = external("/authorize", expected=302, params=query)
        check(redirect.headers["location"] == app_url + "/bridge/authorize?" + urlencode(query), "Authorization redirects only to the personal Databricks App")
        consent = native("/bridge/authorize", query=query, raw=True, response_headers=["set-cookie", "content-security-policy"])
        form = ConsentForm()
        form.feed(consent["text"])
        check(set(form.fields) == {"request", "csrf"} and "laurent.fabre@gmail.com" in consent["text"], "Authenticated owner receives consent with a browser-bound CSRF challenge")
        check("form-action 'self' https://chatgpt.com;" in consent.get("content-security-policy", ""), "Consent policy permits the approved browser callback to ChatGPT")
        cookie = "__Secure-shopibricks_bridge=" + form.fields["csrf"]
        check(cookie in consent.get("set-cookie", ""), "Approval cookie matches the consent session")
        approved = native("/bridge/approve", "POST", data=urlencode({**form.fields, "decision": "allow"}), headers={"Content-Type": "application/x-www-form-urlencoded", "Origin": app_url, "Cookie": cookie}, raw=True, response_headers=["location"])
        location = approved.get("location") or ""
        parsed = urlsplit(location)
        values = parse_qs(parsed.query)
        check(location.split("?", 1)[0] == callback and values.get("state") == [state] and values.get("iss") == [bridge], "Approval returns the registered callback, original state and bridge issuer")
        code = values["code"][0]
        exchange = {"client_id": client_id, "grant_type": "authorization_code", "code": code, "code_verifier": verifier, "redirect_uri": callback, "resource": resource}
        credentials = external("/token", method="POST", data=exchange).json()
        check(credentials["scope"] == "shopibricks:read" and 0 < credentials["expires_in"] <= 600, "Code exchange grants only short-lived read access")
        check(external("/token", method="POST", data=exchange, expected=400).json()["error"] == "invalid_grant", "Authorization code cannot be reused")
        init = rpc("initialize", {"protocolVersion": "2025-03-26", "capabilities": {}, "clientInfo": {"name": "shopibricks-hosted-check", "version": "1.0.0"}})
        check(init["protocolVersion"] == "2025-03-26", "MCP initialization negotiates a supported protocol")
        external("/mcp", method="POST", expected=202, json={"jsonrpc": "2.0", "method": "notifications/initialized"}, headers={"Authorization": "Bearer " + credentials["access_token"]})
        check(external("/mcp", expected=405).headers["allow"] == "POST", "Stateless transport correctly declines an SSE connection")
        tools = rpc("tools/list")["tools"]
        names = {t["name"] for t in tools}
        check(names == {"search_products", "get_inventory", "quote_cart", "get_merchant_metrics", "semantic_search"} and all(t["annotations"]["readOnlyHint"] for t in tools), "Discovery exposes exactly five read-only tools")
        products = tool("search_products", {"query": ""})["products"]
        check(len(products) == 12, "Bridge returns the real 12-product demo catalog")
        sku = products[0]["id"]
        stock = tool("get_inventory", {"product_ids": [sku]})["inventory"]
        check(stock[0]["id"] == sku and isinstance(stock[0]["stock"], int), "Inventory comes from the current Lakebase product row")
        quote = tool("quote_cart", {"items": [{"id": sku, "quantity": 1}]})
        check(any(total["type"] == "total" and total["amount"] == products[0]["price_cents"] for total in quote["totals"]), "Quote uses the authoritative price without creating an order")
        vector = tool("semantic_search", {"query": "wireless audio for a Paris weekend"})
        check(bool(vector["result"]["data_array"]), "Semantic retrieval returns actual governed index rows")
        metrics = tool("get_merchant_metrics", {})
        check(bool(metrics["operational"]["metrics"]) and not metrics["lakehouse"].get("unavailable"), "Merchant metrics include live Lakebase and Lakehouse results")
        events = native("/api/events")["events"]
        bridge_events = [e for e in events if e.get("name") == "shopibricks.mcp" and e.get("value", {}).get("transport") == "ChatGPT → Vercel → Databricks App"]
        check(names.issubset({e["value"]["tool"] for e in bridge_events}), "All five bridged tool calls persist in the owner's MCP Events feed")
        credentials = external("/token", method="POST", data={"client_id": client_id, "grant_type": "refresh_token", "refresh_token": credentials["refresh_token"], "resource": resource}).json()
        check(rpc("ping") == {}, "Rotated credentials continue to authorize MCP requests")
        external("/revoke", method="POST", data={"client_id": client_id, "token": credentials["refresh_token"]})
        revoked = external("/mcp", method="POST", expected=401, json={"jsonrpc": "2.0", "id": 1, "method": "ping"}, headers={"Authorization": "Bearer " + credentials["access_token"]})
        check(revoked.json()["error"] == "invalid_token", "Revocation immediately blocks the test grant")
        credentials = None
        report["passed"] = True
    except Exception as error:
        # Exception messages from network clients can contain code-bearing URLs.
        report["error_type"] = type(error).__name__
        if isinstance(error, AssertionError):
            report["failed_check"] = str(error)
        print(json.dumps({"failed": report.get("failed_check", "Hosted request failed"), "error_type": report["error_type"]}), flush=True)
    finally:
        if credentials and client_id:
            try:
                external("/revoke", method="POST", data={"client_id": client_id, "token": credentials["refresh_token"]})
            except Exception:
                report["cleanup"] = "Revocation could not be confirmed; test grant expires within eight hours"
        output = root / ".local/deploy/shopibricks-personal/verification-bridge.json"
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps({"passed": report["passed"], "checks": len(report["checks"])}), flush=True)
    return report["passed"]


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile", required=True, choices=["shopibricks-personal"])
    args = parser.parse_args()
    raise SystemExit(0 if verify(args.profile) else 1)
