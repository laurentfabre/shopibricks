#!/usr/bin/env bash
# Launch Codex through a workspace's Unity Gateway without touching ~/.codex or ug state.
# The OAuth token is read from the Databricks CLI into an env var and never printed.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f scripts/showcase.local.env ] && . scripts/showcase.local.env
: "${PROFILE:?Set PROFILE (Databricks CLI profile)}"
HOST=${HOST:-$(databricks auth env --profile "$PROFILE" -o json | python3 -c "import sys,json;print(json.load(sys.stdin)['env']['DATABRICKS_HOST'])")}
MODEL=${MODEL:-system.ai.gpt-6-1-sol}
export CODEX_HOME=${CODEX_HOME:-$HOME/.codex-unity-gateway}
mkdir -p "$CODEX_HOME"
cat > "$CODEX_HOME/config.toml" <<TOML
model = "$MODEL"
model_provider = "databricks"
model_reasoning_effort = "low"

[model_providers.databricks]
name = "Databricks Unity Gateway"
base_url = "${HOST%/}/ai-gateway/codex/v1"
wire_api = "responses"
env_key = "DATABRICKS_UG_TOKEN"
requires_openai_auth = false
supports_websockets = false
TOML
DATABRICKS_UG_TOKEN=$(databricks auth token --profile "$PROFILE" -o json | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
export DATABRICKS_UG_TOKEN
exec codex "$@"
