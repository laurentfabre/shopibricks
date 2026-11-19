"""Vercel MCP entry point. Native Databricks SDK owns all backend OAuth material."""
import json
import os
from functools import lru_cache
from urllib.parse import parse_qs, urlsplit

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, RedirectResponse, Response
from starlette.concurrency import run_in_threadpool

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
SCOPE = "shopibricks:read"
MAX_BODY = 100_000


def origin(name):
    value = os.environ[name].rstrip("/")
    parsed = urlsplit(value)
    if parsed.scheme != "https" or not parsed.hostname or parsed.path or parsed.query or parsed.fragment or parsed.username or parsed.password:
        raise ValueError("Expected a configured HTTPS origin")
    return value


@lru_cache(maxsize=1)
def backend():
    from databricks.sdk import WorkspaceClient
    from databricks.sdk.core import Config
    # Native SDK reads injected M2M settings and refreshes credentials internally.
    return WorkspaceClient(config=Config(auth_type="oauth-m2m", http_timeout_seconds=90, retry_timeout_seconds=1))


def forward(operation, payload, access_token=None):
    return backend().api_client.do(
        "POST", url=origin("SHOPIBRICKS_APP_URL") + "/bridge/relay",
        body={"operation": operation, "payload": payload, **({"access_token": access_token} if access_token else {})},
    )


def challenge():
    return 'Bearer resource_metadata="' + origin("BRIDGE_PUBLIC_URL") + '/.well-known/oauth-protected-resource/mcp", scope="' + SCOPE + '"'


@app.middleware("http")
async def headers(request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


@app.get("/")
async def home():
    return {"name": "ShopiBricks Personal MCP", "mcp_url": origin("BRIDGE_PUBLIC_URL") + "/mcp", "authentication": "OAuth with PKCE; approve in the Databricks App", "access": "Read-only synthetic commerce tools", "storefront": origin("SHOPIBRICKS_APP_URL")}


@app.get("/health")
async def health():
    return {"status": "configured", "service": "shopibricks-vercel-bridge", "read_only": True}


@app.get("/.well-known/oauth-protected-resource")
@app.get("/.well-known/oauth-protected-resource/mcp")
async def resource_metadata():
    base = origin("BRIDGE_PUBLIC_URL")
    return {"resource": base + "/mcp", "authorization_servers": [base], "scopes_supported": [SCOPE], "bearer_methods_supported": ["header"], "resource_name": "ShopiBricks Personal — read-only demo"}


@app.get("/.well-known/oauth-authorization-server")
async def authorization_metadata():
    base = origin("BRIDGE_PUBLIC_URL")
    return {"issuer": base, "authorization_endpoint": base + "/authorize", "token_endpoint": base + "/token", "registration_endpoint": base + "/register", "revocation_endpoint": base + "/revoke", "response_types_supported": ["code"], "grant_types_supported": ["authorization_code", "refresh_token"], "code_challenge_methods_supported": ["S256"], "token_endpoint_auth_methods_supported": ["none"], "revocation_endpoint_auth_methods_supported": ["none"], "scopes_supported": [SCOPE], "authorization_response_iss_parameter_supported": True}


@app.get("/authorize")
async def authorize(request: Request):
    if len(request.url.query) > 8192:
        return JSONResponse({"error": "invalid_request"}, status_code=400)
    # Browser login uses the App's existing, registered Databricks OAuth client.
    # ChatGPT's client registration and grants belong to this bridge's issuer.
    return RedirectResponse(origin("SHOPIBRICKS_APP_URL") + "/bridge/authorize?" + request.url.query, status_code=302)


@app.api_route("/mcp", methods=["GET", "DELETE"])
async def no_stream():
    # This transport is stateless JSON. MCP clients treat 405 as no SSE/session
    # support; a spurious 401 here would trigger unnecessary OAuth refreshes.
    return JSONResponse({"error": "method_not_allowed"}, status_code=405, headers={"Allow": "POST"})


@app.post("/mcp")
@app.post("/register")
@app.post("/token")
@app.post("/revoke")
async def relay(request: Request):
    operation = request.url.path.lstrip("/")
    access_token = None
    if operation == "mcp":
        auth = request.headers.get("authorization", "")
        if not auth.startswith("Bearer sb_access_") or len(auth) > 200:
            return JSONResponse({"error": "unauthorized"}, status_code=401, headers={"WWW-Authenticate": challenge()})
        access_token = auth[7:]
    raw = bytearray()
    async for chunk in request.stream():
        raw.extend(chunk)
        if len(raw) > MAX_BODY:
            return JSONResponse({"error": "invalid_request"}, status_code=413)
    try:
        if operation in ("token", "revoke"):
            if request.headers.get("content-type", "").split(";", 1)[0] != "application/x-www-form-urlencoded":
                return JSONResponse({"error": "invalid_request"}, status_code=415)
            fields = parse_qs(raw.decode(), keep_blank_values=True, max_num_fields=16)
            if any(len(values) != 1 for values in fields.values()):
                raise ValueError("Duplicate fields")
            payload = {key: values[0] for key, values in fields.items()}
        else:
            payload = json.loads(raw)
        if not isinstance(payload, dict):
            raise ValueError("Expected an object")
    except (ValueError, UnicodeDecodeError):
        return JSONResponse({"error": "invalid_request"}, status_code=400)
    try:
        result = await run_in_threadpool(forward, operation, payload, access_token)
        status = int(result["status"])
        if status not in (200, 201, 202, 400, 401, 403, 405, 429, 503):
            raise ValueError("Unexpected upstream status")
        response_headers = {"WWW-Authenticate": challenge()} if status == 401 else {}
        if status == 202:
            return Response(status_code=202)
        return JSONResponse(result["body"], status_code=status, headers=response_headers)
    except Exception:
        # Never forward SDK exceptions: they can include private host/config context.
        return JSONResponse({"error": "temporarily_unavailable", "error_description": "The ShopiBricks backend is unavailable. Try again shortly."}, status_code=503)


@app.options("/{path:path}")
async def options(path: str):
    return Response(status_code=204, headers={"Access-Control-Allow-Origin": "https://chatgpt.com", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Authorization,Content-Type,MCP-Protocol-Version"})
