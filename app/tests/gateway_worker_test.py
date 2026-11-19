"""Gateway regressions use fake clients; they never read credentials or call a model."""
import importlib
import os
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

with patch.object(sys, "path", [str(Path(__file__).parents[1] / "server"), *sys.path]):
    worker = importlib.import_module("gateway_worker")


class GatewayWorkerTests(unittest.TestCase):
    def invoke(self, response, api=None):
        client = SimpleNamespace(responses=SimpleNamespace(create=Mock(return_value=response)))
        factory = Mock(return_value=client)
        events = []
        environment = {"SHOPIBRICKS_GATEWAY_API": api} if api else {}
        with patch.dict(os.environ, environment, clear=True), \
                patch.dict(sys.modules, {"databricks_openai": SimpleNamespace(DatabricksOpenAI=factory)}), \
                patch.object(worker, "_client", None), patch.object(worker, "_tracing", None), \
                patch.object(worker, "emit", events.append):
            worker.main({"model": "test-model", "input": "test request"})
        return events, client.responses.create, factory

    def test_unified_tool_arguments_survive_completion_without_text(self):
        payload = {"status": "completed", "output": [{"type": "function_call", "name": "get_inventory", "arguments": '{"product_ids":["sb-camera"]}'}]}
        response = SimpleNamespace(status="completed", output_text="", model_dump=lambda: payload)
        events, create, factory = self.invoke(response, "mlflow")
        self.assertEqual(events, [{"type": "completed", "response": payload}])
        self.assertFalse(create.call_args.kwargs["stream"])
        self.assertTrue(factory.call_args.kwargs["use_ai_gateway"])
        self.assertFalse(factory.call_args.kwargs["use_ai_gateway_native_api"])

    def test_unified_text_is_delivered_once_without_simulating_token_stream(self):
        payload = {"status": "completed", "output": []}
        response = SimpleNamespace(status="completed", output_text="Your kit costs €198.", model_dump=lambda: payload)
        events, _, _ = self.invoke(response, "mlflow")
        self.assertEqual(events, [{"type": "delta", "delta": "Your kit costs €198."}, {"type": "completed", "response": payload}])

    def test_default_native_route_preserves_streaming(self):
        payload = {"status": "completed", "output": []}
        response = iter([
            SimpleNamespace(type="response.output_text.delta", delta="Your "),
            SimpleNamespace(type="response.output_text.delta", delta="kit."),
            SimpleNamespace(type="response.completed", response=SimpleNamespace(model_dump=lambda: payload)),
        ])
        events, create, factory = self.invoke(response)
        self.assertEqual([event["delta"] for event in events if event["type"] == "delta"], ["Your ", "kit."])
        self.assertEqual(events[-1], {"type": "completed", "response": payload})
        self.assertTrue(create.call_args.kwargs["stream"])
        self.assertTrue(factory.call_args.kwargs["use_ai_gateway_native_api"])
        self.assertFalse(factory.call_args.kwargs["use_ai_gateway"])

    def test_incomplete_unified_response_does_not_emit_partial_success(self):
        payload = {"status": "incomplete", "incomplete_details": {"reason": "max_output_tokens"}}
        response = SimpleNamespace(status="incomplete", output_text="partial answer", model_dump=lambda: payload)
        events, _, _ = self.invoke(response, "mlflow")
        self.assertEqual(events, [{"type": "error", "error": payload}])


if __name__ == "__main__":
    unittest.main()
