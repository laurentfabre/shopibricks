# ShopiBricks

A multi-persona agentic commerce demo built with **React, D3, OpenAI and Databricks**. Explore shopper intent, curate products, inspect real agent handoffs, and complete a human-confirmed sandbox checkout.

[Personal demo](https://shopibricks-personal-7474650310803801.aws.databricksapps.com) · [Hackathon demo](https://shopibricks-paris-955682294748605.aws.databricksapps.com) · [FEVM demo](https://shopibricks-paris-7474645565734606.aws.databricksapps.com) · [Architecture](docs/ARCHITECTURE.md) · [Intent atlas](docs/INTENT_ATLAS.md) · [Presentation runbook](docs/RUNBOOK.md)

The hosted demo requires access to its Databricks workspace. This public repository contains the source, synthetic catalog, configuration, documentation and reproducible tests. Local credentials, account-scoped traces and generated deployment reports are excluded.

![ShopiBricks interactive intent atlas, with explicitly fictional example queries](docs/images/atlas-desktop.png)

## Explore

- **Merchant:** an interactive intent atlas with query clusters, product matches, stock/budget/assortment gaps, filters, zoom and export. Inspect a question and try it in the storefront.
- **Shopper:** four fictional profiles—Camille, Alex, Léa and Noor—with separate bags and conversations, profile-aware discovery, travel and gifting specialists, and explicit checkout approval.
- **Brand and catalog:** live product dossiers, completeness checks, an internal catalog feed, and editorial, concise and playful brand voices.
- **Developer:** inspect AG-UI events, MCP tools, agent handoffs, gateway status and ACP-shaped sandbox checkout.
- **ChatGPT bridge:** a Vercel OAuth/MCP endpoint connects to the personal demo with owner consent and five read-only tools. The live ChatGPT connection and product retrieval were confirmed on 19 November 2026. See the [connection steps, verification and demo talking points](docs/VERCEL_BRIDGE.md).
- **Operations:** live inventory and sandbox orders, plus clearly labeled synthetic streaming analytics.

The copilot is toggleable, the workspace adapts to mobile, and Driver.js tours connect the shopper, merchant and developer journeys.

## Present the demo

Select **Present → Start guided demo** for a 13-stop walkthrough: intent clusters, catalog gaps, brand voice, personas, specialist agents, shopper approval, operations, traces and channel readiness. Allow about 13 minutes for narration, plus live interactions. Select any agenda stop to **Spotlight this step** or **Open this view** for hands-on demonstration.

Each stop includes a talk track, an action to show, evidence to point to, and a fallback. **Download talking points** saves the full script; [presenter cues](docs/PRESENTER_CUES.md) contain the same notes. Optional speaker notes appear inside the spotlight and are visible to the audience when screen sharing. **Use demo prompt** prefills the composer for you to submit. Tours navigate and highlight without submitting prompts or confirming orders. The original **Take a tour**, bag and receipt guides remain available.

## What is real, and what is simulated?

Products, shopper profiles, orders and stream events are fictional. Lakebase reads and writes, model calls, MCP tools and Databricks integrations are real when configured. No payment processor is called.

The atlas offers 72 labeled fictional example questions and a separate view of the current account's recorded shopper activity. Clusters use deterministic TF-IDF and spherical k-means, with D3 for layout. Catalog match scores are lexical relevance estimates—not probabilities, purchases or conversion rates. The live concierge checks prices, inventory and the complete selection budget.

ShopiBricks is the available native storefront. ChatGPT, Perplexity, Gemini, Mistral AI and DeepSeek are shown as **not connected**. Feed export does not publish products or complete merchant onboarding. See [ACP readiness](docs/ACP_READINESS.md).

The public discovery, personalization and clustering themes on [Lemrock](https://www.lemrock.com/) informed the demo's experience. ShopiBricks is independent and does not claim affiliation, algorithm equivalence or commercial performance parity.

## Stack

| Layer | Implementation |
|---|---|
| Interface | React 19, TypeScript, Vite, D3 force layout, Lucide, Driver.js |
| Server | Express, Zod, AG-UI SSE, official MCP SDK |
| Agents | Concierge, Catalog, Inventory, Checkout and Merchant analyst |
| Inference | OpenAI Responses through Databricks Unity AI Gateway |
| Operational data | Lakebase PostgreSQL; transactional stock and idempotent checkout |
| Analytics | Lakeflow, Delta, Unity Catalog, SQL warehouse, AI/BI and Genie |
| Retrieval and observability | Hybrid Vector Search and MLflow tracing |
| Hosting | Databricks Apps |

## Run locally

Use Node.js 22+, Python 3.12+, `uv`, and the Databricks CLI. Authenticate using native OAuth; do not put API tokens in the repository.

```sh
databricks auth login --host https://<your-workspace> --profile <your-profile>
cd app
cp .env.example .env
# Edit .env to use your profile and provisioned resource identifiers.
npm ci
uv sync
npm run build
npm run dev
```

Open `http://localhost:8000`. Run `npm run seed` once against your dedicated demo database to load the fictional product catalog. See [app/README.md](app/README.md) for resource bindings and runtime details.

The bundle has separate `fevm`, `emerging-hackathon` and `shopibricks-personal` targets. The hackathon deployment uses **`openai.shopibricks`** and an isolated Lakebase project, product index, warehouse, pipeline, jobs, dashboard, Genie space and trace experiment. See the [hackathon deployment and verification runbook](docs/EMERGING_HACKATHON.md) for its resource links, repeatable deployment commands and rehearsal checks. The [personal Free Edition runbook](docs/PERSONAL_FREE_EDITION.md) covers **`workspace.shopibricks`**, GPT-OSS-120B compatibility, unavailable Lakebase CDC, and the separate ChatGPT OAuth linking check.

The original helpers and `app/app.yaml` remain FEVM-specific. The workspace helper stages a separate manifest from each explicit configuration in `deployments/`. The example environment file contains nonsecret reference metadata; it does not grant access. Always pass the intended target and profile.

```sh
databricks bundle validate --strict --target fevm --profile fevm
databricks bundle deploy --target fevm --profile fevm
bash scripts/deploy-app.sh
```

Local presentation controls use `docs/deployment.json`, which is ignored by Git. Copy [deployment.example.json](docs/deployment.example.json) and fill in the provisioned IDs. Stream helpers start only bounded demo runs; stop them after presenting.

## Verify

```sh
npm --prefix app test
npm --prefix app run build
cd tests
npm ci
SHOPIBRICKS_TEST_URL=http://localhost:8000 npm run verify:atlas
SHOPIBRICKS_TEST_URL=http://localhost:8000 npm run verify:funnel
SHOPIBRICKS_TEST_URL=http://localhost:8000 npm run verify:tour
SHOPIBRICKS_TEST_URL=http://localhost:8000 npm run verify:presenter
```

Browser tests use isolated Chrome with explicit API fixtures. Run the application tests first to generate the atlas fixture. Real integration checks are separate and require the configured workspace.

The November 2026 redesign passed 27 TypeScript tests, 61 atlas/persona browser checks, seven checkout recovery scenarios, desktop/mobile tours, and 21 hosted checks. The hosted run verified production asset hashes and captured a real concierge question in the live atlas. The presenter update additionally passed 23 browser checks and nine read-only hosted checks, with the application, atlas/persona and existing tour regressions passing again. See [validation details](docs/VALIDATION.md).

## Repository

- `app/`: frontend, server, shared contracts, product seed and unit tests.
- `data/`: synthetic stream generation, Lakeflow pipeline and SQL definitions.
- `resources/`: Databricks bundle resources and reference API payloads.
- `scripts/`: provisioning, bounded presentation controls and hosted verification.
- `tests/`: browser and integration regression scripts.
- `docs/`: architecture, walkthroughs, integration boundaries and selected fixture screenshots.

Brand artwork remains the property of its respective owners; see [asset sources](app/client/public/brand/SOURCES.json). This is a demonstration implementation, with synthetic data and sandbox checkout.
