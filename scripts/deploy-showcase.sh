#!/usr/bin/env bash
# Deploy ShopiBricks x Unity Gateway as a second app. The fevm reference deployment (scripts/deploy-app.sh) is untouched.
# Set PROFILE, APP and DEST in the environment or in scripts/showcase.local.env (git-ignored).
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f scripts/showcase.local.env ] && . scripts/showcase.local.env
: "${PROFILE:?Set PROFILE (Databricks CLI profile)}" "${APP:?Set APP (app name)}" "${DEST:?Set DEST (workspace source path)}"
[ -f app/app.showcase.yaml ] || { echo "Create app/app.showcase.yaml from app/app.showcase.example.yaml" >&2; exit 1; }
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT

cp bench/results/latest.json app/server/bench-latest.json
npm --prefix app run build
rsync -a --exclude node_modules --exclude .venv --exclude '.env*' --exclude tests --exclude '__pycache__' --exclude '*.log' --exclude 'app.showcase*.yaml' app/ "$STAGE/"
cp app/app.showcase.yaml "$STAGE/app.yaml"
# dist/ is prebuilt above; the platform installs production deps only, so skip its build step.
node -e 'const f=process.argv[1],p=require(f);delete p.scripts.build;require("fs").writeFileSync(f,JSON.stringify(p,null,2))' "$STAGE/package.json"
databricks sync "$STAGE" "$DEST" --include 'dist/**' --full --profile "$PROFILE"
databricks apps deploy "$APP" --source-code-path "$DEST" --mode SNAPSHOT --profile "$PROFILE" -o json
