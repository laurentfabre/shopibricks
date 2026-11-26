"""Offline checks for fresh-install configuration; no real credentials or APIs."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]


def module(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / f"{name}.py")
    loaded = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(loaded)
    return loaded


class DeploymentConfiguration(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        (self.root / "deployments").mkdir()
        (self.root / "docs").mkdir()
        self.config = json.loads((ROOT / "deployments/free-edition.example.json").read_text())
        self.config.update(profile="test-selected-profile", host="https://test.cloud.databricks.com", expected_user="demo@example.com", vercel_team_id="team_fixture", vercel_project="fixture-bridge")
        (self.root / "deployments/shopibricks-personal.json").write_text(json.dumps(self.config))
        self.inventory = self.root / "docs/deployment.shopibricks-personal.json"
        self.inventory.write_text(json.dumps({**self.config, "app_url": "https://fixture.databricksapps.com"}))

    def deployment(self):
        deployment = module("deploy_workspace")
        with patch.object(deployment, "ROOT", self.root):
            return deployment.Deployment("shopibricks-personal")

    def bridge(self):
        bridge = module("deploy_bridge")
        with patch.object(bridge, "ROOT", self.root), patch.object(bridge, "INVENTORY", self.inventory), patch("dotenv.dotenv_values", return_value={"VERCEL_TOKEN": "fixture-only"}):
            return bridge.BridgeDeployment(self.root / ".env")

    def test_reference_configuration_still_works(self):
        self.assertEqual(self.deployment().profile, "test-selected-profile")

    def test_local_configuration_selects_another_explicit_profile(self):
        local = {**self.config, "profile": "my-local-profile", "vercel_project": "my-local-bridge"}
        (self.root / "deployments/shopibricks-personal.local.json").write_text(json.dumps(local))
        self.assertEqual(self.deployment().profile, "my-local-profile")
        bridge = self.bridge()
        self.assertEqual((bridge.profile, bridge.project_name, bridge.team), ("my-local-profile", "my-local-bridge", "team_fixture"))

    def test_inventory_from_another_workspace_is_rejected(self):
        local = {**self.config, "host": "https://other.cloud.databricks.com"}
        (self.root / "deployments/shopibricks-personal.local.json").write_text(json.dumps(local))
        with self.assertRaisesRegex(ValueError, "different host"):
            self.deployment()
        with self.assertRaisesRegex(ValueError, "does not match"):
            self.bridge()

    def test_bridge_audit_accepts_the_configured_owner(self):
        bridge = self.bridge()
        with patch.object(bridge, "api", side_effect=[{"teams": [{"id": "team_fixture", "slug": "fixture"}]}, None]), patch.object(bridge, "cli", return_value={"userName": "demo@example.com"}), patch("builtins.print"):
            bridge.audit()

    def test_bridge_audit_rejects_an_unexpected_owner(self):
        bridge = self.bridge()
        with patch.object(bridge, "api", return_value={"teams": [{"id": "team_fixture", "slug": "fixture"}]}), patch.object(bridge, "cli", return_value={"userName": "other@example.com"}):
            with self.assertRaisesRegex(ValueError, "Unexpected"):
                bridge.audit()

    def test_bridge_uses_selected_profile_and_team(self):
        bridge = self.bridge()
        with patch("subprocess.run") as run:
            run.return_value.returncode = 0
            run.return_value.stdout = "{}"
            bridge.cli("current-user", "me")
            self.assertEqual(run.call_args.args[0][-4:], ["--profile", "test-selected-profile", "-o", "json"])
        with patch.object(bridge.session, "request") as request:
            request.return_value.ok = True
            request.return_value.status_code = 200
            request.return_value.content = b"{}"
            request.return_value.json.return_value = {}
            bridge.api("GET", "/v2/teams")
            self.assertEqual(request.call_args.args[1], "https://api.vercel.com/v2/teams?teamId=team_fixture")


if __name__ == "__main__":
    unittest.main()
