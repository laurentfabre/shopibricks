# ShopiBricks on emerging-hackathon

ShopiBricks is deployed to `https://emerging-emea-hackathons.cloud.databricks.com` with the `emerging-hackathon` OAuth profile and Unity Catalog namespace **`openai.shopibricks`**. The FEVM deployment remains separate and unchanged. Both Laurent and Hatim Binani have app `CAN_MANAGE` access.

## Open the demo

| Surface | Target resource |
|---|---|
| App | [ShopiBricks](https://shopibricks-paris-955682294748605.aws.databricksapps.com) |
| Unity Catalog | [openai.shopibricks](https://emerging-emea-hackathons.cloud.databricks.com/explore/data/openai/shopibricks) |
| Dashboard | [Commerce intelligence](https://emerging-emea-hackathons.cloud.databricks.com/dashboardsv3/01f1e2d62f6313ee8ac704d23036ea9d/published) |
| Genie | [Commerce analyst](https://emerging-emea-hackathons.cloud.databricks.com/genie/rooms/01f1e2d62292112eb5f022cbe77d1ffa) |
| Lakeflow pipeline | [Commerce streaming](https://emerging-emea-hackathons.cloud.databricks.com/pipelines/9a927c54-eb47-4c23-9a44-4a76c6f6d027) |
| Bounded emitter | [Stream job](https://emerging-emea-hackathons.cloud.databricks.com/jobs/665929008083639) |
| Trace evidence | [Verified hosted model span](https://emerging-emea-hackathons.cloud.databricks.com/ml/experiments/1793670093013264/traces/dd84f2d77f4c9071da2a049c554e0ff7) |

Select **Present → Start guided demo** for the existing 13-stop Driver.js tour. The persona journeys, intent clusters, speaker notes and talking-points export are included. Use [presenter cues](PRESENTER_CUES.md) for narration; use the links above instead of the FEVM links in older rehearsal records.

## Verified target behavior

The deployment `01f1e2d6d31d14dcae792f5b82733639` passed these checks on 17 November 2026 (UTC):

- TypeScript/Vite production build and all 27 application tests.
- 20 hosted app checks: Lakebase connectivity, exact production asset hashes, target resource bindings, presenter content, catalog readiness, 72 fictional atlas questions, clustering/filter controls, gold analytics, MCP discovery and hybrid vector search through the app principal.
- Eight hosted shopper checks: Noor's €300 budget, real model and inventory calls, product cards, context propagation, intent metrics and recorded activity.
- Four hosted merchant checks: the analyst invoked `ask_genie`, and Genie returned generated SQL and an executed result from the target gold tables.
- Five sandbox checkout checks: authoritative €19 pricing, explicit confirmation, persistent receipt, idempotent completion and exactly one inventory decrement.
- All seven Lakebase source tables reached `CDF_STATE_STREAMING`. The test order `ord_f6f73d1d-5405-476c-8e1d-5f072aaf6648` appeared in `openai.shopibricks.current_orders` for 1,900 EUR cents, with replication timestamp `2026-11-17T22:53:12.448`.
- A persisted `DatabricksResponses` span was read back within the bounded trace verification process. It contains model `system.ai.gpt-6-luna` and response `resp_09e34fcca9c54454016afcd9052ff487d1a811596454b8f278`, from hosted shopper run `b0af563d-a6cd-4c67-bd55-596682a9521a`.

The first bounded emitter run `251276599795667` completed successfully with 20,000 historical synthetic rows and four live microbatches. Data reconciliation found **20,960 bronze = 20,741 silver + 219 quarantine**, with **20,741 gold events**, zero invalid silver rows, 12 products and 2,500 fictional customers. The latest event in that seed snapshot is `2026-11-17T20:18:36.867Z`; start a bounded stream before presenting fresh metrics.

The dashboard's three dataset queries and all checked-in Genie example SQL were executed successfully before publication. The dashboard uses viewer permissions, without embedded publisher credentials. Application data queries execute as the app service principal; they do not impersonate the viewer.

These target checks exercise hosted APIs and production asset identity. The previously recorded browser regression checks apply to the unchanged UI build; they were not rerun as a signed-in browser session on this workspace.

## Repeatable deployment

Run commands from the repository root. Authenticate through native CLI/SDK OAuth. Generated inventory and evidence live in ignored `docs/deployment.emerging-hackathon.json` and `.local/deploy/emerging-hackathon/`; no credentials are copied or exported.

```sh
databricks bundle validate --strict --target emerging-hackathon --profile emerging-hackathon
app/.venv/bin/python -P scripts/deploy_workspace.py audit --target emerging-hackathon
```

For an existing target, update bundle resources, refresh the local inventory, and deploy the app:

```sh
databricks bundle deploy --target emerging-hackathon --profile emerging-hackathon
app/.venv/bin/python -P scripts/deploy_workspace.py bindings --target emerging-hackathon
app/.venv/bin/python -P scripts/deploy_workspace.py traces --target emerging-hackathon
app/.venv/bin/python -P scripts/deploy_workspace.py analytics --target emerging-hackathon
app/.venv/bin/python -P scripts/deploy_workspace.py configure --target emerging-hackathon
app/.venv/bin/python -P scripts/deploy_workspace.py deploy --target emerging-hackathon
```

`deploy` builds the app, creates a target manifest, uploads only the staged source, waits for app compute, and requests a snapshot deployment. Check the app deployment status before running hosted verification. The app manifest sets `NPM_CONFIG_INCLUDE=dev` so the hosted TypeScript/Vite build has its build dependencies. The staging sync explicitly includes its allowlisted files because `.local/` is intentionally ignored by Git.

For initial provisioning, the helper also provides `infrastructure`, `bootstrap`, `vector`, `modelcheck`, `cdc` and `finish`. Run `bootstrap` only after `audit` succeeds; it creates the namespace, streaming volume and synthetic product/customer tables. Deploy the pipeline and jobs before `bindings`. Run a bounded seed before `analytics`, validate its queries, and then deploy/publish the dashboard. Allow the app to initialize and own its PostgreSQL schema before `cdc`; `finish` creates the current-orders view after the history tables exist. The catalog and dedicated warehouse are already provisioned and described in the target configuration.

The dedicated SQL warehouse is `009278ac015663b9` (`shopibricks-openai`): serverless, 2X-Small, one cluster, five-minute idle timeout. The initial workspace compute outage cleared on retry; a live query passed before data provisioning. A future audit failure is a blocker to claiming analytics readiness.

## Rehearse and stop

```sh
app/.venv/bin/python -P scripts/deploy_workspace.py status --target emerging-hackathon
app/.venv/bin/python -P scripts/deploy_workspace.py start --target emerging-hackathon --minutes 60
```

The command avoids starting a second active emitter. Runs are limited to 1–70 minutes, and the emitter refreshes the pipeline. Confirm new events and a completed update before describing the analytics as fresh.

```sh
app/.venv/bin/python -P scripts/verify_workspace.py app --target emerging-hackathon
app/.venv/bin/python -P scripts/verify_workspace.py agent --target emerging-hackathon
app/.venv/bin/python -P scripts/verify_workspace.py genie --target emerging-hackathon
app/.venv/bin/python -P scripts/verify_workspace.py checkout --target emerging-hackathon
app/.venv/bin/python -P scripts/deploy_workspace.py cdc --target emerging-hackathon
app/.venv/bin/python -P scripts/deploy_workspace.py verify_data --target emerging-hackathon
```

The `agent` and `genie` checks call the real model. `checkout` creates one fictional notebook order and consumes one unit of demo inventory. Wait for CDC before `verify_data`; the check reconciles that order with its target history. All evidence files stay local and ignored by Git.

For a new trace, capture the emitted trace ID in app logs and the run timestamps in `verification-agent.json`, then run one bounded readback:

```sh
app/.venv/bin/python -P scripts/verify_trace.py TRACE_ID START_MS END_MS --target emerging-hackathon
```

After presenting:

```sh
app/.venv/bin/python -P scripts/deploy_workspace.py stop --target emerging-hackathon
app/.venv/bin/python -P scripts/deploy_workspace.py status --target emerging-hackathon
```

Confirm no active emitter and that any in-flight pipeline update has finished. Native Lakebase CDC remains configured. No payment is charged, no shipment is created, and external AI shopping channels remain explicitly unconnected.
