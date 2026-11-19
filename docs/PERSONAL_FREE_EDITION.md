# ShopiBricks on personal Free Edition

Target: `shopibricks-personal`, authenticated as `laurent.fabre@gmail.com` through native Databricks CLI OAuth. The workspace is `https://dbc-c3e48176-204b.cloud.databricks.com` and the Unity Catalog namespace is `workspace.shopibricks`.

## Demo links

| Surface | URL |
|---|---|
| App | https://shopibricks-personal-7474650310803801.aws.databricksapps.com |
| ChatGPT MCP bridge | https://shopibricks-mcp-personal.vercel.app/mcp |
| Native Databricks MCP | https://shopibricks-personal-7474650310803801.aws.databricksapps.com/mcp |
| Catalog | https://dbc-c3e48176-204b.cloud.databricks.com/explore/data/workspace/shopibricks |
| Dashboard | https://dbc-c3e48176-204b.cloud.databricks.com/dashboardsv3/01f1e40f7bc41d07971441babc33a8f4/published |
| Genie | https://dbc-c3e48176-204b.cloud.databricks.com/genie/rooms/01f1e41066631003be685a123e2f2aa8 |
| Pipeline | https://dbc-c3e48176-204b.cloud.databricks.com/pipelines/d1272ca8-41dd-4434-8c22-34b826367e57 |
| Traces | https://dbc-c3e48176-204b.cloud.databricks.com/ml/experiments/602173724034816 |

Use **Present → Start guided demo** for the Driver.js tour and **Speaker notes** for the existing talking points. All commerce data is synthetic, checkout is a sandbox, and no payment or shipment occurs.

## Differences from emerging-hackathon

- **Model:** OpenAI GPT-OSS-120B through Databricks' unified Responses API. The Free Edition workspace does not expose the GPT-6 endpoint used by the hackathon deployment. The model and tool-call preflight succeeded.
- **Response delivery:** the unified endpoint returned empty function arguments when streaming, including in its completed event. The personal deployment therefore requests non-streaming model responses and delivers each completed text response in one chunk. Step and tool events still update during the run. The native API remains the default for the other targets.
- **Inventory:** rendering product cards performs a required live `get_inventory` MCP call. Events identify this as an application check; cards use the returned stock and freshness.
- **Lakebase CDC:** unavailable. The service rejected the request with `Lakebase CDF is not supported for catalogs using Default Storage`. Orders and activity persist in Lakebase, but they are not replicated to Delta in this target. The app displays this limitation. The independent synthetic Lakeflow event pipeline and gold analytics work.
- **Quotas:** Free Edition allows up to three apps, one Lakebase project, one AI Search endpoint and one SQL warehouse. Apps automatically stop after 24 hours and can be restarted. Fair-use compute limits still apply. Free Edition is intended for non-commercial learning and experimentation.

## ChatGPT connection status

**The [Vercel bridge](VERCEL_BRIDGE.md) is connected to ChatGPT.** On 19 November 2026, Laurent confirmed that ChatGPT called ShopiBricks and returned products. A read-only server check independently found an active ChatGPT OAuth grant and 14 recent authenticated MCP requests, separate from automated verification. Hosted registration, consent, PKCE, five live tools, persisted MCP Events, refresh and revocation also pass. The direct Databricks OAuth failure below remains relevant only to the original connection path.

The first bridge browser attempt exposed a consent-page policy bug: Chrome submitted `Origin: null`, and the approval check displayed “Approval expired.” The policy now preserves same-origin form submissions, and hosted verification has a `--browser` mode to test the deployed document with real Chrome headers and cookies. The subsequent real ChatGPT connection succeeded.

The native Databricks MCP endpoint supports OAuth and publishes the personal workspace issuer. Server-side tool discovery and a real semantic-search tool call were verified using native Databricks OAuth. That direct endpoint's client-registration limitation remains separate from the working Vercel bridge.

**Direct ChatGPT → Databricks browser linking failed on 19 November 2026.** The personal account rejected the default CIMD registration before any MCP tool could run:

```json
{
  "error": "invalid_request",
  "error_description": "OAuth application with client_id: 'https://chatgpt.com/oauth/1oVCjn0ai9gl/client.json' not available in Databricks account '4aadbbee-4e9c-4850-abe3-2923ca830a5a'."
}
```

This is an OAuth client-registration blocker, not a missing ShopiBricks permission. Deploying to Free Edition did not resolve the direct connection. The Vercel bridge uses a separate issuer; do not conflate its verification with direct ChatGPT → Databricks OAuth.

The personal authorization server advertises CIMD and PKCE, but does not advertise `authorization_response_iss_parameter_supported`. The failed ChatGPT request uses a connector-specific client metadata URL. Manually entering `https://chatgpt.com/oauth/client.json` is not a general fix: its published callback is `https://chatgpt.com/connector_platform_oauth_redirect`, which differs from connector-specific callbacks and already caused a redirect mismatch on the earlier workspace.

The [public metadata for this failed connection](https://chatgpt.com/oauth/1oVCjn0ai9gl/client.json) was retrieved successfully and lists `https://chatgpt.com/connector/oauth/1oVCjn0ai9gl` as its redirect URI. This confirms the metadata exists, but does not make that client available in the Databricks account.

Databricks documents AI-assistant OAuth controls and custom client registration at the **account** level. Free Edition has no account console or account-level APIs, so there is no supported self-service registration fix here. Resolving the direct browser connector requires Databricks/OpenAI compatibility changes or a standard Databricks account whose account administrator can register a client with the exact callback shown by ChatGPT. The Vercel bridge is an alternative connection path. The native ShopiBricks storefront, sandbox ACP checkout and authenticated MCP tool discovery remain usable.

For a rehearsal now, open **Protocol studio → Discover live MCP tools**, then run the shopper prompt and inspect its actual tool events. This demonstrates the real MCP implementation inside the app; it does not demonstrate a ChatGPT connection. ChatGPT's native checkout is also a separate merchant-onboarding integration.

References: [Databricks OAuth application controls](https://docs.databricks.com/aws/en/integrations/enable-disable-oauth) and [Free Edition administrative limitations](https://docs.databricks.com/aws/en/getting-started/free-edition-limitations#administrative-limitations).

## Verification

Generated evidence is stored locally in `.local/deploy/shopibricks-personal/`. Resource inventory is `docs/deployment.shopibricks-personal.json`; both are ignored by Git.

- Production build, 27 TypeScript application tests and 13 Python tests passed. Gateway regressions cover preserved unified-route tool arguments, complete text delivery, unchanged native streaming and incomplete-response failure handling.
- Original personal deployment `01f1e41416911465a4f01161fb6b8e2e` succeeded. Hosted app verification passed 21 checks, covering Lakebase, target bindings, CDC disclosure, production assets, presenter content, the 12-product catalog, 72 fictional atlas questions, clustering and filters, gold analytics, MCP discovery and hybrid search.
- The Vercel bridge update adds a dedicated commerce relay, owner consent and persisted OAuth grants. Its browser-consent fix deployed as `01f1e4241ab116038b6592e5eab688e8`; all 30 hosted checks pass with real Chrome form headers and cookies. The expanded suite has 38 TypeScript tests and eight Python bridge tests; see the [bridge runbook](VERCEL_BRIDGE.md) for hosted evidence and connection steps.
- Shopper verification passed all eight checks: Noor's profile budget reached every specialist, a €227 camera/notebook/bottle kit rendered within €300, live stock was checked, and both intent insights and the activity atlas recorded the exact request and recommendation.
- Sandbox checkout passed five checks: authoritative totals, address validation, idempotent confirmation, persisted receipt and exactly one inventory decrement.
- Genie passed four checks: the merchant analyst invoked the personal space and returned generated SQL plus an executed query result.
- MLflow readback verified a persisted `OK` model/tool-call span in `workspace.shopibricks.agent_traces` for the successful shopper run.
- Analytics reconciliation: 20,960 bronze events = 20,741 silver + 219 quarantine; gold has 20,741 events; zero invalid silver rows; 12 products and 2,500 fictional customers.
- The bounded seed job completed and the pipeline returned to idle.
- ChatGPT browser linking and product retrieval through the Vercel bridge are confirmed by the user and active server-side grant/request records. Direct Databricks linking still fails with the registration error above. Lakebase-to-Delta CDC remains unavailable.

## Operate this target

From the repository root:

```sh
databricks bundle validate --strict --target shopibricks-personal --profile shopibricks-personal
app/.venv/bin/python -P scripts/deploy_workspace.py status --target shopibricks-personal
app/.venv/bin/python -P scripts/deploy_workspace.py deploy --target shopibricks-personal
```

Start a short, bounded stream before demonstrating fresh analytics, then stop it:

```sh
app/.venv/bin/python -P scripts/deploy_workspace.py start --target shopibricks-personal --minutes 3
app/.venv/bin/python -P scripts/deploy_workspace.py stop --target shopibricks-personal
```

Hosted verification:

```sh
app/.venv/bin/python -P scripts/verify_workspace.py app --target shopibricks-personal
app/.venv/bin/python -P scripts/verify_workspace.py agent --target shopibricks-personal
app/.venv/bin/python -P scripts/verify_workspace.py genie --target shopibricks-personal
app/.venv/bin/python -P scripts/verify_workspace.py checkout --target shopibricks-personal
app/.venv/bin/python -P scripts/deploy_workspace.py verify_data --target shopibricks-personal
```

Agent and Genie checks invoke the real model. Checkout creates one fictional notebook order and decrements demo inventory once. `verify_data` reports `analytics_only` for this target and never claims CDC or Delta order replication.

References: [Free Edition limitations](https://docs.databricks.com/aws/en/getting-started/free-edition-limitations), [OpenAI OAuth requirements](https://developers.openai.com/apps-sdk/build/auth), [Databricks AI-agent clients](https://docs.databricks.com/aws/en/partner-connect/ai-agents).

## CopilotKit and saved quote handoff

The personal app now includes the [shopper and merchant journey](COPILOT_JOURNEYS.md): CopilotKit shared state/tool rendering, live MCP outcomes, external tool-search signals in the atlas, and authenticated 30-minute quote continuations. No new Vercel deployment or Databricks account OAuth registration is required. The November 19 update passed 24 hosted application, 19 hosted journey and 32 hosted bridge checks; see the [current validation record](VALIDATION.md).
