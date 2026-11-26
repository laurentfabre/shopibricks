# ShopiBricks app

React storefront and merchant console, Express commerce API, CopilotKit + AG-UI multi-agent orchestration, Streamable HTTP MCP, and a sandbox ACP checkout. OpenAI runs through the native Unity Gateway Responses API. The official Databricks Python client and Lakebase JavaScript driver manage OAuth internally.

## Local development

Use Node.js 22+ and Python 3.12+. Provision your workspace with the [Free Edition installation guide](../docs/INSTALL_FREE_EDITION.md), then fill in the placeholder values in `.env.example` using your own resource metadata.

```sh
databricks auth login --host https://YOUR-WORKSPACE.cloud.databricks.com --profile shopibricks-personal
cp .env.example .env
# Edit .env with your profile and provisioned resource identifiers.
npm ci
uv sync
npm run build
npm run dev
```

Open http://localhost:8000. `.env.example` contains only nonsecret resource metadata. Do not add personal access tokens. For restricted local environments, a writable UV cache can be selected with `uv --cache-dir /private/tmp/shopibricks-uv-cache sync`.

`npm run build` checks TypeScript and builds the React client. `npm test` checks authoritative pricing, VAT, fulfillment, stock, and input constraints. Independent live protocol, concurrency, and browser tests live in the parent `../tests` directory.

## Runtime

Databricks Apps starts `npm start` and serves the built `dist` directory. Python dependencies are pinned in `requirements.txt`, generated from `uv.lock`. Gateway calls use a small pool of persistent Python workers so official SDK initialization and MLflow instrumentation are reused. Set `SHOPIBRICKS_PYTHON` only when a custom Python path is needed. In local development `.venv/bin/python` is selected automatically; hosted startup uses `python3`.

The manifest sets `NPM_CONFIG_INCLUDE=dev` so the hosted build can run TypeScript and Vite while `NODE_ENV` remains `production`. This build setting is explicit and does not depend on a local `.npmrc`.

Bind the resources listed in `app.yaml`. Cloud app resources and deployment are owned by the parent project. The service principal uses declared Databricks resources and app-owned Lakebase schemas: `shopibricks` for commerce, `shopibricks_bridge` for OAuth records, and `shopibricks_journeys` for saved quotes.

## Interfaces

- `/api/copilotkit`: owner-scoped CopilotKit runtime discovery and AG-UI runs, with shared UI state and typed tool renderers.
- `/api/events/stream`: owner-scoped SSE with database cursors and reconnect replay.
- `/api/quotes/:id` and `/:id/continue`: authenticated quote restoration and idempotent draft checkout, never order confirmation.
- `/api/agent/run`: SSE AG-UI events, specialist handoffs, generated product cards; owner-scoped history and cancellation.
- `/mcp`: official MCP SDK, stateless Streamable HTTP. Catalog search, inventory, quotes, metrics, hybrid semantic search, a policies resource, and a shopping prompt.
- `/checkout_sessions`: ACP-shaped sandbox create/update/get/complete/cancel, authoritative totals and idempotent mutations. Sandbox completion accepts only the fixed demonstration token `shopibricks_sandbox`. This is a test fixture, never a payment credential.
- `/api/checkout`: browser wrapper requiring explicit `confirmed: true` for completion.
- `/api/operations` and `/api/lakehouse`: real Lakebase state and governed Unity Catalog aggregates with freshness.
- `/api/catalog/readiness` and `/api/catalog/feed`: current catalog completeness checks and internal JSON feed preview; no external publication.
- `/api/intelligence`: fictional-example or caller-scoped live query clustering, product coverage, budget/stock gaps, profile/experience filters and configurable cluster detail.
- `/api/insights`: caller-scoped shopper intent and recommendation/draft/gap milestones for the last 24 hours, with optional `profile` and `channel` filters.

The agent accepts an optional validated `experience` object with `persona`, `profile`, `channel`, and `voice`. Profiles and channels are fictional demo context; caller authorization is unchanged. Threads are isolated by the full context, while browser carts and checkout drafts are isolated by shopper profile. See [Personas and growth](../docs/PERSONAS_AND_GROWTH.md) for scope and integration boundaries.

All products, buyers, orders and events are fictional. No payment processor is called and no goods or messages are sent. The Stripe provider enum in ACP payloads is a schema fixture, not a provisioned Stripe integration. The demo does not claim merchant certification, ChatGPT checkout onboarding, or configured external order webhooks.

See [CopilotKit and MCP journeys](../docs/COPILOT_JOURNEYS.md) for event semantics, dependency pins and the cross-channel demo.
