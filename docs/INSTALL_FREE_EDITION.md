# Install ShopiBricks on Databricks Free Edition

This guide deploys the app, synthetic data, analytics and a ChatGPT connection into **your own workspace**. It follows the Free Edition deployment verified on November 19, 2026. Resource availability and quotas can change. Complete the preflight before creating resources.

You choose the CLI profile explicitly. The examples use `shopibricks-personal`, which is also the bundle target name. You may choose another profile, provided the JSON configuration, bundle configuration and CLI commands all use that profile. The target name remains `shopibricks-personal`.

## Before you start

| Requirement | Why it is needed |
|---|---|
| Databricks Free Edition workspace and its URL | Hosts the application, data and models |
| Workspace administrator or equivalent resource permissions | Creates the app, Lakebase, pipelines, Genie and grants |
| Node.js 22+, Python 3.12+, `uv`, current Databricks CLI 1.x | Builds and deploys the application |
| Serverless SQL warehouse | Executes analytics and Genie SQL |
| Available Lakebase project and AI Search endpoint capacity | Operational storage and semantic retrieval |
| GPT-OSS-120B and GTE embedding serving endpoints | The tested model and retrieval configuration |
| Vercel account/team and deployment token | Hosts the OAuth/MCP adapter |
| ChatGPT account with custom MCP apps enabled | Connects the shopper conversation to the tools |
| Google Chrome | Optional isolated-browser verification |

Free Edition fair-use quotas apply. This installation uses one app, one Lakebase project, one search endpoint, a SQL warehouse, a pipeline, two jobs, a dashboard, a Genie space and a trace experiment. Reuse a dedicated compatible Lakebase project or search endpoint when you have already reached a workspace limit. The commerce schema is named `shopibricks`; avoid sharing it with another installation.

The Vercel function requests a 120-second maximum duration. Check that your selected plan supports that duration. A ChatGPT subscription does not provide OpenAI API credit. This configuration invokes GPT-OSS through Databricks and does not require an OpenAI API key or a CopilotKit cloud account.

## 1. Clone, install and authenticate

```sh
git clone https://github.com/laurentfabre/shopibricks.git
cd shopibricks
npm --prefix app ci
uv sync --project app
npm --prefix tests ci

databricks auth login --host https://YOUR-WORKSPACE.cloud.databricks.com --profile shopibricks-personal
databricks current-user me --profile shopibricks-personal
databricks warehouses list --profile shopibricks-personal
```

Use your workspace URL, not the account-console URL. Native OAuth stays in the CLI/SDK. No Databricks PAT needs to be copied into an environment file.

## 2. Create your local configuration

```sh
cp deployments/free-edition.example.json deployments/shopibricks-personal.local.json
cp docs/examples/free-edition-target.yml resources/free-edition.local.yml
```

Edit both copies. They are ignored by Git. The deployment helpers prefer the complete `.local.json` file over the checked-in reference configuration, and the bundle merges the local YAML target override from `resources/`.

| Field | Set it to |
|---|---|
| `host` | Your HTTPS Databricks workspace URL |
| `profile` | The profile you explicitly authenticated above |
| `expected_user` | The exact `userName` returned by `current-user me` |
| `warehouse_id` | Your existing serverless SQL warehouse ID |
| `genie_parent_path`, `source_code_path`, YAML `root_path` | Paths under `/Workspace/Users/YOUR_USER/` |
| `app_name` | An unused app name, lowercase letters, digits and hyphens, at most 26 characters |
| `lakebase_project`, `vector_endpoint` | Your dedicated demo resource names, existing or new |
| `vercel_team_id` | Team ID from Vercel team settings, used later for the proxy |
| `vercel_project` | An available, globally unique Vercel project slug |

Match the host, profile, warehouse, catalog and schema between both files. Keep `catalog: workspace`, `schema: shopibricks`, `gateway_api: mlflow` and `cdc_enabled: false` for the tested Free Edition setup. Keep the tested model and embedding endpoints unless you have verified alternatives.

The checked-in `deployments/shopibricks-personal.json`, `app/app.yaml` and older FEVM helpers describe Laurent's reference installations. Use the local overrides and `deploy_workspace.py` for your installation. Do not run `scripts/deploy-app.sh`, `scripts/platform.py` or `scripts/demo.py` directly against a new Free Edition target.

Review the resolved configuration before provisioning:

```sh
databricks bundle validate --strict --target shopibricks-personal --profile shopibricks-personal
app/.venv/bin/python -P scripts/deploy_workspace.py audit --target shopibricks-personal
app/.venv/bin/python -P scripts/deploy_workspace.py modelcheck --target shopibricks-personal
```

`audit` checks the identity, catalog, warehouse, models and SQL access. `modelcheck` makes one real model request. Resolve any failed check before continuing. Local reports are under `.local/deploy/shopibricks-personal/`.

## 3. Provision data and services

Run these phases in order from the repository root:

```sh
app/.venv/bin/python -P scripts/deploy_workspace.py bootstrap --target shopibricks-personal
app/.venv/bin/python -P scripts/deploy_workspace.py infrastructure --target shopibricks-personal
databricks bundle deploy --target shopibricks-personal --profile shopibricks-personal
```

`bootstrap` creates the Unity Catalog schema, streaming volume, 12 descriptive products and 2,500 fictional customers. `infrastructure` creates or reuses Lakebase, the search endpoint and the Databricks App identity. The bundle deploys the pipeline, jobs and dashboard definition. Wait for the Lakebase production branch and search endpoint to become ready in the workspace UI, then continue:

```sh
app/.venv/bin/python -P scripts/deploy_workspace.py bindings --target shopibricks-personal
app/.venv/bin/python -P scripts/deploy_workspace.py vector --target shopibricks-personal
app/.venv/bin/python -P scripts/deploy_workspace.py traces --target shopibricks-personal
```

`bindings` records the created resources in ignored `docs/deployment.shopibricks-personal.json`. It contains identifiers and deployment metadata, not reusable credential values. `vector` creates the descriptive product index. `traces` creates the MLflow experiment and Unity Catalog trace tables. Wait until the index is ready before testing semantic search.

## 4. Materialize the analytics and create Genie

Seed a short bounded run, including historical synthetic events. This does not create orders or decrement operational stock:

```sh
databricks bundle run stream --target shopibricks-personal --profile shopibricks-personal --params minutes=1,history_rows=20000
```

Wait for the job and its final pipeline update to finish successfully. Then run:

```sh
app/.venv/bin/python -P scripts/deploy_workspace.py analytics --target shopibricks-personal
app/.venv/bin/python -P scripts/deploy_workspace.py verify_data --target shopibricks-personal
```

`analytics` creates metric definitions, validates dashboard queries and the example Genie SQL, then creates or updates the Genie space. `verify_data` reconciles bronze, silver, quarantine and gold counts. Open the deployed dashboard in Databricks and publish it with viewer permissions if you want a shareable dashboard; do not embed your credentials.

Free Edition does **not** support the Lakebase CDC path used by the other reference targets. Do not run the `cdc` or `finish` phases here. Operational orders remain in Lakebase. The independent synthetic campaign pipeline supplies Delta analytics.

## 5. Bind, validate and deploy the app

```sh
app/.venv/bin/python -P scripts/deploy_workspace.py configure --target shopibricks-personal
npm --prefix app test
npm --prefix app run build
cd app
databricks apps validate --profile shopibricks-personal
cd ..
app/.venv/bin/python -P scripts/deploy_workspace.py deploy --target shopibricks-personal
```

`configure` grants the app principal access to its declared resources. `deploy` builds and stages a target-specific manifest, synchronizes the allowlisted application files and requests a snapshot deployment. It prints a deployment ID. It does not wait for the final application startup.

```sh
databricks apps get-deployment YOUR_APP_NAME YOUR_DEPLOYMENT_ID --profile shopibricks-personal
```

Wait for `SUCCEEDED`, then open `app_url` from the local inventory and verify:

```sh
app/.venv/bin/python -P scripts/verify_workspace.py app --target shopibricks-personal
```

The app initializes and owns its operational PostgreSQL schemas on first use, including the 12-product catalog. The hosted app check verifies resource bindings, deployed assets, catalog facts, analytics and MCP retrieval. The optional `agent` and `genie` phases make real model requests. The optional `checkout` phase creates a fictional order and consumes demo stock; it is not needed for installation.

## 6. Deploy the Vercel OAuth/MCP adapter

The adapter gives ChatGPT a separate OAuth issuer. Databricks continues to own consent, commerce logic and data. The November 19 direct ChatGPT registration against Free Edition failed at the account OAuth layer; the adapter is the tested connection path. See the [protocol flow and boundaries](VERCEL_BRIDGE.md).

Create an ignored root `.env` in your editor and add your Vercel deployment token as `VERCEL_TOKEN`. Do not put it in a command, a screenshot, a commit or `bridge/.env.example`. Configure `vercel_team_id` and `vercel_project` in your local JSON first.

Run sequentially:

```sh
app/.venv/bin/python -P scripts/deploy_bridge.py audit --vercel-env-file .env
app/.venv/bin/python -P scripts/deploy_bridge.py project --vercel-env-file .env
app/.venv/bin/python -P scripts/deploy_bridge.py principal --vercel-env-file .env
app/.venv/bin/python -P scripts/deploy_bridge.py environment --vercel-env-file .env
```

These commands create the Vercel project and a dedicated Databricks service principal with `CAN_USE` on your App. The environment phase creates a seven-day machine OAuth client secret and sends it directly to a **sensitive production variable in Vercel**, without printing or saving its value locally. The bridge SDK handles machine access tokens. You need permission to create a service principal and its OAuth secret; do not substitute a broad personal PAT if this step is denied.

Redeploy the App to load the bridge URL, approved principal IDs and your owner allowlist from the updated inventory:

```sh
app/.venv/bin/python -P scripts/deploy_workspace.py deploy --target shopibricks-personal
# Wait for this App deployment to SUCCEED before continuing.
app/.venv/bin/python -P scripts/deploy_bridge.py deploy --vercel-env-file .env
app/.venv/bin/python -P scripts/deploy_bridge.py status --vercel-env-file .env
```

Wait for the Vercel deployment to be `READY`. The OAuth discovery endpoints and `/mcp` must be publicly reachable. Disable Vercel Deployment Protection for this production adapter if your team enforces it; OAuth protects the commerce tools. The helper uses file deployments, so pushing to GitHub does not redeploy Vercel automatically.

```sh
app/.venv/bin/python -P scripts/verify_bridge.py --profile shopibricks-personal --browser
```

This verification exercises registration, browser consent, PKCE, the five tools, quote restoration, refresh and revocation. It temporarily creates its own client/grant and saved quote, then revokes the grant. It does not confirm a checkout or drive the actual ChatGPT UI. Browser mode requires Chrome and the dependencies installed in `tests/`.

## 7. Connect ChatGPT and rehearse

Follow [Connect ChatGPT](../README.md#connect-chatgpt), using your own `https://YOUR-UNIQUE-BRIDGE-PROJECT.vercel.app/mcp` URL. Use the exact Databricks account in `expected_user` during consent and when opening ShopiBricks.

A saved app entry alone is not a passed connection. Ask for products and stock, check that ChatGPT calls ShopiBricks, then match the tool call in **Merchant → Live journeys**. Use the [demo script](../README.md#demo-script) to show the shopper handoff, intent atlas and merchant Genie evidence.

## Maintenance and local development

Before a demo, start the Databricks App if Free Edition has stopped it. The tested Free Edition behavior was an automatic stop after 24 hours. Check the current [Free Edition limitations](https://docs.databricks.com/aws/en/getting-started/free-edition-limitations).

The machine secret lasts seven days. Rotate and deploy before expiry:

```sh
app/.venv/bin/python -P scripts/deploy_bridge.py environment --rotate-secret --vercel-env-file .env
app/.venv/bin/python -P scripts/deploy_bridge.py deploy --vercel-env-file .env
app/.venv/bin/python -P scripts/deploy_bridge.py status --vercel-env-file .env
# Wait for READY, then run verify_bridge.py again.
```

Bridge access credentials last up to 10 minutes and refresh within an eight-hour grant. After the grant expires, reconnect from ChatGPT. Rotation updates the server's machine identity; it does not extend a shopper grant.

For local app development, copy `app/.env.example` to `app/.env`, fill in your profile and resource metadata from the inventory, then run `npm run build` and `npm run dev` from `app/`. Open `http://localhost:8000`. Local execution uses your OAuth identity, which may not own tables already created by the hosted app principal. Use a separate dedicated development database or explicitly grant the required schema access; do not change hosted schema ownership for a local preview. The local server is intended for localhost development, with hosted authentication supplied by Databricks Apps.

Start optional synthetic traffic for a bounded presentation window, then stop it:

```sh
app/.venv/bin/python -P scripts/deploy_workspace.py start --target shopibricks-personal --minutes 10
app/.venv/bin/python -P scripts/deploy_workspace.py stop --target shopibricks-personal
app/.venv/bin/python -P scripts/deploy_workspace.py status --target shopibricks-personal
```

An in-flight pipeline update can finish after the emitter is stopped. Confirm no active emitter remains. Stopping traffic does not delete the app, data or other resources. Remove those explicitly in the workspace when you are finished experimenting.
