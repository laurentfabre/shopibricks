# ShopiBricks app

React storefront and merchant console, Express commerce API, AG-UI multi-agent orchestration, Streamable HTTP MCP, and a sandbox ACP checkout. OpenAI runs through the native Unity Gateway Responses API. The official Databricks Python client and Lakebase JavaScript driver manage OAuth internally.

## Local development

Use Node.js 22+ and Python 3.12+. The configured workspace is FEVM serverless stable.

```sh
databricks auth login --host https://fevm-serverless-stable-vwywqi.cloud.databricks.com --profile fevm
cp .env.example .env
npm ci
uv sync
npm run seed
npm run dev
```

Open http://localhost:8000. `.env.example` contains only nonsecret resource metadata. Do not add personal access tokens. For restricted local environments, a writable UV cache can be selected with `uv --cache-dir /private/tmp/shopibricks-uv-cache sync`.

`npm run build` checks TypeScript and builds the React client. `npm test` checks authoritative pricing, VAT, fulfillment, stock, and input constraints. Independent live protocol, concurrency, and browser tests live in the parent `../tests` directory.

## Runtime

Databricks Apps starts `npm start` and serves the built `dist` directory. Python dependencies are pinned in `requirements.txt`, generated from `uv.lock`. Gateway calls use a small pool of persistent Python workers so official SDK initialization and MLflow instrumentation are reused. Set `SHOPIBRICKS_PYTHON` only when a custom Python path is needed. In local development `.venv/bin/python` is selected automatically; hosted startup uses `python3`.

The manifest sets `NPM_CONFIG_INCLUDE=dev` so the hosted build can run TypeScript and Vite while `NODE_ENV` remains `production`. This build setting is explicit and does not depend on a local `.npmrc`.

Bind the resources listed in `app.yaml`. Cloud app resources and deployment are owned by the parent project. App service principal privileges are scoped to the dedicated `shopibricks` Lakebase schema and declared Databricks resources.

## Interfaces

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
