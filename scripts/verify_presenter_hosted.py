"""Read-only checks of the FEVM presenter build and its live data dependencies.

Uses native SDK OAuth. Browser interactions are covered by verify-presenter.mjs.
"""
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
import re

from databricks.sdk import WorkspaceClient
from databricks.sdk.core import Config

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "tests/artifacts/presenter"
OUT.mkdir(parents=True, exist_ok=True)
APP = "https://shopibricks-paris-7474645565734606.aws.databricksapps.com"
client = WorkspaceClient(config=Config(profile="fevm", http_timeout_seconds=60, retry_timeout_seconds=15))
result = {"url": APP, "checked_at": datetime.now(timezone.utc).isoformat(), "checks": []}


def check(value, description):
    if not value:
        raise AssertionError(description)
    result["checks"].append(description)


def get(path):
    return client.api_client.do("GET", url=APP + path)


def raw(path):
    stream = client.api_client.do("GET", url=APP + path, raw=True)["contents"]
    try:
        return stream.read()
    finally:
        stream.close()


try:
    app = client.apps.get("shopibricks-paris").as_dict()
    result["deployment_id"] = app.get("active_deployment", {}).get("deployment_id")
    check(app.get("app_status", {}).get("state") == "RUNNING", "Hosted app is running")
    check(get("/api/health")["database"] == "connected", "Hosted Lakebase is connected")
    html = raw("/").decode()
    assets = re.findall(r'(?:src|href)="(/assets/[^\"]+)"', html)
    check(bool(assets), "Hosted page includes production assets")
    javascript = b""
    for asset in assets:
        data = raw(asset)
        local = ROOT / "app/dist" / asset.lstrip("/")
        check(local.exists() and hashlib.sha256(data).digest() == hashlib.sha256(local.read_bytes()).digest(),
              f"Hosted asset matches validated build: {asset}")
        if asset.endswith(".js"):
            javascript += data
    check(all(label in javascript for label in [b"Start guided demo", b"Speaker notes", b"Use demo prompt", b"Download talking points"]),
          "Hosted bundle contains the presenter guide, speaker notes and export")
    readiness = get("/api/catalog/readiness")
    check(readiness["total"] > 0 and readiness["ready"] == readiness["total"], "Live catalog completeness checks pass")
    atlas = get("/api/intelligence?source=examples")
    check(atlas["source"] == "examples" and atlas["summary"]["queries"] == 72 and len(atlas["clusters"]) == 6,
          "Live atlas supplies the labeled example questions and clusters for the spotlight")
    check(get("/api/operations").get("source"), "Operational view returns its live data source")
    result["passed"] = True
except Exception as error:
    result["passed"] = False
    result["error"] = str(error)
    raise
finally:
    (OUT / "hosted-results.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({"passed": result["passed"], "checks": len(result["checks"]),
                      "deployment_id": result.get("deployment_id"), "error": result.get("error")}))
