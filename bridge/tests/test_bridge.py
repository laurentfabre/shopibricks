import importlib.util
import os
from pathlib import Path
import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient

spec = importlib.util.spec_from_file_location("vercel_bridge", Path(__file__).parents[1] / "api/index.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class BridgeTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {"BRIDGE_PUBLIC_URL": "https://bridge.example", "SHOPIBRICKS_APP_URL": "https://shop.example"})
        self.env.start()
        self.client = TestClient(module.app)

    def tearDown(self):
        self.client.close()
        self.env.stop()

    def test_discovery_advertises_bridge_issuer_dcr_and_pkce(self):
        data = self.client.get("/.well-known/oauth-authorization-server").json()
        self.assertEqual(data["issuer"], "https://bridge.example")
        self.assertEqual(data["registration_endpoint"], "https://bridge.example/register")
        self.assertEqual(data["code_challenge_methods_supported"], ["S256"])
        resource = self.client.get("/.well-known/oauth-protected-resource/mcp").json()
        self.assertEqual(resource["resource"], "https://bridge.example/mcp")

    def test_unauthenticated_mcp_never_contacts_backend(self):
        with patch.object(module, "forward") as forward:
            response = self.client.post("/mcp", json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"})
        self.assertEqual(response.status_code, 401)
        self.assertIn("resource_metadata", response.headers["www-authenticate"])
        forward.assert_not_called()

    def test_authorization_uses_only_configured_databricks_app(self):
        response = self.client.get("/authorize?client_id=test&state=example", follow_redirects=False)
        self.assertEqual(response.headers["location"], "https://shop.example/bridge/authorize?client_id=test&state=example")

    def test_stateless_transport_does_not_trigger_oauth_refresh_for_sse(self):
        with patch.object(module, "forward") as forward:
            for method in ("GET", "DELETE"):
                response = self.client.request(method, "/mcp")
                self.assertEqual(response.status_code, 405)
                self.assertEqual(response.headers["allow"], "POST")
        forward.assert_not_called()

    def test_only_bridge_credential_is_forwarded_with_allowed_operation(self):
        token = "sb_access_" + "x" * 43
        payload = {"jsonrpc": "2.0", "id": 7, "method": "tools/list"}
        with patch.object(module, "forward", return_value={"status": 200, "body": {"result": {"tools": []}}}) as forward:
            response = self.client.post("/mcp", json=payload, headers={"Authorization": "Bearer " + token})
        self.assertEqual(response.status_code, 200)
        forward.assert_called_once_with("mcp", payload, token)

    def test_oauth_errors_and_empty_notifications_preserve_status(self):
        with patch.object(module, "forward", return_value={"status": 400, "body": {"error": "invalid_grant"}}):
            response = self.client.post("/token", data={"grant_type": "authorization_code", "code": "expired"})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"], "invalid_grant")
        with patch.object(module, "forward", return_value={"status": 202, "body": None}):
            response = self.client.post("/mcp", json={"method": "notifications/initialized"}, headers={"Authorization": "Bearer sb_access_" + "x" * 43})
        self.assertEqual(response.status_code, 202)
        self.assertEqual(response.content, b"")

    def test_invalid_oversized_and_duplicate_requests_do_not_reach_backend(self):
        with patch.object(module, "forward") as forward:
            self.assertEqual(self.client.post("/register", content="x" * 100001).status_code, 413)
            self.assertEqual(self.client.post("/register", content="not-json").status_code, 400)
            self.assertEqual(self.client.post("/token", content="client_id=a&client_id=b", headers={"Content-Type": "application/x-www-form-urlencoded"}).status_code, 400)
            self.assertEqual(self.client.post("/unrelated", json={}).status_code, 405)
        forward.assert_not_called()

    def test_backend_errors_never_expose_private_configuration(self):
        with patch.object(module, "forward", side_effect=RuntimeError("private-config-value")):
            response = self.client.post("/register", json={})
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("private-config-value", response.text)


if __name__ == "__main__":
    unittest.main()
