"""Provision the Free Edition Vercel bridge using native Databricks OAuth.

Uses VERCEL_TOKEN only from the explicitly selected local environment file.
Secret values stay in memory and are never printed or saved locally.
"""
import argparse
import json
from pathlib import Path
import subprocess
from urllib.parse import urlencode
import requests

ROOT = Path(__file__).resolve().parents[1]
INVENTORY = ROOT / "docs/deployment.shopibricks-personal.json"


class BridgeDeployment:
    def __init__(self, env_file):
        from dotenv import dotenv_values
        token = dotenv_values(env_file).get("VERCEL_TOKEN")
        if not token:
            raise ValueError("VERCEL_TOKEN is missing from the authorized file")
        self.session = requests.Session()
        self.session.headers["Authorization"] = "Bearer " + token
        config_path = ROOT / "deployments/shopibricks-personal.local.json"
        if not config_path.exists():
            config_path = ROOT / "deployments/shopibricks-personal.json"
        self.config = json.loads(config_path.read_text())
        self.team = self.config["vercel_team_id"]
        self.project_name = self.config["vercel_project"]
        self.profile = self.config["profile"]
        self.inventory = json.loads(INVENTORY.read_text())
        if self.inventory["host"] != self.config["host"] or self.inventory["app_name"] != self.config["app_name"]:
            raise ValueError("The local inventory does not match the selected Free Edition deployment")

    def api(self, method, path, payload=None, allow_missing=False):
        separator = "&" if "?" in path else "?"
        response = self.session.request(method, "https://api.vercel.com" + path + separator + urlencode({"teamId": self.team}), json=payload, timeout=60)
        if response.status_code == 404 and allow_missing:
            return None
        if not response.ok:
            raise RuntimeError(f"Vercel {method} {path.split('?')[0]} failed with HTTP {response.status_code}")
        return response.json() if response.content else {}

    def cli(self, *args):
        result = subprocess.run(["databricks", *args, "--profile", self.profile, "-o", "json"], capture_output=True, text=True, timeout=60)
        if result.returncode:
            raise RuntimeError(f"Databricks {' '.join(args[:2])} failed (exit {result.returncode})")
        return json.loads(result.stdout) if result.stdout.strip() else {}

    def save(self):
        latest = json.loads(INVENTORY.read_text())
        latest.update({key: value for key, value in self.inventory.items() if key.startswith("bridge_")})
        INVENTORY.write_text(json.dumps(latest, indent=2) + "\n")
        self.inventory = latest

    def audit(self):
        teams = self.api("GET", "/v2/teams")
        team = next(t for t in teams["teams"] if t["id"] == self.team)
        identity = self.cli("current-user", "me")
        if identity["userName"] != self.config["expected_user"]:
            raise ValueError("Unexpected personal workspace identity")
        project = self.api("GET", f"/v9/projects/{self.project_name}", allow_missing=True)
        print(json.dumps({"team": team["slug"], "workspace_identity": identity["userName"], "existing_project": project["id"] if project else None}))

    def project(self):
        project = self.api("GET", f"/v9/projects/{self.project_name}", allow_missing=True)
        if project is None:
            project = self.api("POST", "/v11/projects", {"name": self.project_name, "framework": None, "publicSource": False, "ssoProtection": None})
        self.inventory.update(bridge_project_id=project["id"], bridge_team_id=self.team, bridge_url=f"https://{self.project_name}.vercel.app")
        self.save()
        print(json.dumps({"project_id": project["id"], "bridge_url": self.inventory["bridge_url"]}))

    def principal(self):
        existing = self.cli("service-principals", "list", "--filter", 'displayName eq "shopibricks-vercel-bridge"')
        if len(existing) > 1:
            raise ValueError("Ambiguous bridge identity")
        principal = existing[0] if existing else self.cli("service-principals", "create", "--json", json.dumps({"displayName": "shopibricks-vercel-bridge", "active": True, "entitlements": [{"value": "workspace-access"}]}))
        self.cli("permissions", "update", "apps", self.inventory["app_name"], "--json", json.dumps({"access_control_list": [{"service_principal_name": principal["applicationId"], "permission_level": "CAN_USE"}]}))
        self.inventory.update(bridge_principal_id=str(principal["id"]), bridge_client_id=principal["applicationId"])
        self.save()
        print(json.dumps({"bridge_principal_id": self.inventory["bridge_principal_id"], "permission": "CAN_USE on personal app only"}))

    def environment(self, rotate_secret=False):
        inv = self.inventory
        values = {"BRIDGE_PUBLIC_URL": inv["bridge_url"], "SHOPIBRICKS_APP_URL": inv["app_url"], "DATABRICKS_HOST": inv["host"], "DATABRICKS_AUTH_TYPE": "oauth-m2m", "DATABRICKS_CLIENT_ID": inv["bridge_client_id"]}
        for key, value in values.items():
            self.api("POST", f'/v10/projects/{inv["bridge_project_id"]}/env?upsert=true', {"key": key, "value": value, "type": "encrypted", "target": ["production"]})
        if rotate_secret or not inv.get("bridge_secret_id"):
            # This is an OAuth client secret, not a minted Databricks bearer token.
            # The deployed native SDK performs M2M authentication and token refresh.
            secret = self.cli("service-principal-secrets-proxy", "create", inv["bridge_principal_id"], "--lifetime", "604800s")
            try:
                self.api("POST", f'/v10/projects/{inv["bridge_project_id"]}/env?upsert=true', {"key": "DATABRICKS_CLIENT_SECRET", "value": secret["secret"], "type": "sensitive", "target": ["production"]})
            except Exception:
                self.cli("service-principal-secrets-proxy", "delete", inv["bridge_principal_id"], secret["id"])
                raise
            # Previous credentials expire naturally after seven days. Keeping
            # them until expiry allows rollback of a failed Vercel deployment.
            inv["bridge_secret_id"] = secret["id"]
            inv["bridge_secret_created_at"] = secret.get("create_time")
            inv["bridge_secret_lifetime_seconds"] = 604800
            self.save()
        print(json.dumps({"environment_configured": True, "secret_lifetime_days": 7, "secret_values_printed": False}))

    def deploy(self):
        files = []
        for path in (ROOT / "bridge").rglob("*"):
            relative = path.relative_to(ROOT / "bridge")
            if not path.is_file() or any(p in {"tests", "__pycache__", ".venv", ".vercel"} for p in relative.parts) or path.name.startswith(".env"):
                continue
            files.append({"file": str(relative), "data": path.read_text(), "encoding": "utf-8"})
        result = self.api("POST", "/v13/deployments", {"name": self.project_name, "project": self.inventory["bridge_project_id"], "target": "production", "files": files, "projectSettings": {"framework": None}})
        self.inventory["bridge_deployment_id"] = result["id"]
        self.save()
        print(json.dumps({"deployment_id": result["id"], "state": result.get("readyState"), "url": result.get("url")}))

    def status(self):
        result = self.api("GET", f'/v13/deployments/{self.inventory["bridge_deployment_id"]}')
        print(json.dumps({"deployment_id": result["id"], "state": result.get("readyState"), "url": result.get("url"), "aliases": result.get("alias"), "error_code": result.get("errorCode"), "error_message": result.get("errorMessage")}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("phase", choices=["audit", "project", "principal", "environment", "deploy", "status"])
    parser.add_argument("--vercel-env-file", type=Path, required=True)
    parser.add_argument("--rotate-secret", action="store_true", help="With environment: replace the seven-day M2M client secret; deploy afterwards")
    args = parser.parse_args()
    if args.rotate_secret and args.phase != "environment":
        parser.error("--rotate-secret is only valid with the environment phase")
    deployment = BridgeDeployment(args.vercel_env_file)
    if args.phase == "environment":
        deployment.environment(rotate_secret=args.rotate_secret)
    else:
        getattr(deployment, args.phase)()
