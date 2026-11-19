# ShopiBricks verification

The current validation record is [docs/VALIDATION.md](../docs/VALIDATION.md). Fixture-based UI tests and real integration tests are separate.

## Workspace, persona and checkout UI

Run the application tests first to generate the fictional atlas fixture:

```sh
npm --prefix app test
npm --prefix app run build
```

With the app running locally and Google Chrome installed:

```sh
cd tests
npm ci
SHOPIBRICKS_TEST_URL=http://localhost:8000 npm run verify
SHOPIBRICKS_TEST_URL=http://localhost:8000 npm run verify:funnel
SHOPIBRICKS_TEST_URL=http://localhost:8000 npm run verify:tour
SHOPIBRICKS_TEST_URL=http://localhost:8000 npm run verify:presenter
SHOPIBRICKS_TEST_URL=http://localhost:8000 npm run verify:journeys
SHOPIBRICKS_TEST_URL=http://localhost:8000 npm run verify:architecture
```

`verify`, `verify:atlas` and `verify:personas` run the current workspace suite with explicit API fixtures. They check clusters, query inspection and handoff, catalog/brand/channel views, data-source labeling, error recovery, downloads, profile/thread/cart isolation, and 1440/1024/768/390/320px layouts. They make no real model calls or database writes.

`verify:funnel` checks empty bags, sold-out products, quantity limits, saved draft details, edits, validation, changed prices, expired quotes and stock conflicts using fixtures.

`verify:tour` checks all 17 main tour steps on desktop and mobile, plus checkout/receipt guides, previous/next/exit behavior, focus restoration and unchanged checkout consent.

`verify:presenter` checks the 14-stop presenter agenda, individual spotlights, expanded speaker notes on desktop and 320px mobile, talking-point copy/download, atlas loading/error/empty fallbacks, cancellation, view/focus restoration, and prompt preparation. It asserts that rehearsal makes no POST requests and preserves the shopper's bag and draft.

`verify:journeys` checks correlated MCP activity, merchant shared-state navigation, CopilotKit inventory and saved-quote renderers, persona/thread separation, responsive layouts, changed prices, unavailable stock and quote expiry. Its API and model streams are fixtures.

`verify:architecture` checks the workspace entry, keyboard-operated diagram tabs and components, runtime-derived model/resource details, standalone SVG downloads, direct links, mobile layouts, and unavailable metadata. It asserts that exploring the diagrams makes no POST requests.

Artifacts go into ignored `tests/artifacts/` subdirectories. Tests use isolated headless Chrome; they do not attach to a presenter's browser or reuse its cookies.

## Real integrations

For the personal Vercel OAuth/MCP bridge:

```sh
app/.venv/bin/python -P scripts/verify_bridge.py --profile shopibricks-personal --browser
```

This uses native Databricks SDK OAuth and isolated Chrome (with the `tests/` Playwright dependency installed). It renders the hosted consent document with its actual response headers, captures the browser-generated origin/cookie/form, and forwards that request through the native SDK. It then verifies the code exchange, four read-only tools and the temporary saved-quote tool, authenticated quote restoration, persisted MCP events, refresh and revocation. It does not visit ChatGPT's callback, reuse browser credentials, or create an order. The temporary bridge grant is revoked before exiting. Sanitized results go to ignored `.local/deploy/shopibricks-personal/verification-bridge.json`. Omitting `--browser` uses a simulated form submission and does not cover browser referrer-policy behavior.

For hosted CopilotKit and journey verification:

```sh
app/.venv/bin/python -P scripts/verify_journeys.py --profile shopibricks-personal
```

This verifies runtime discovery, real shopper/merchant model calls, MCP activity correlation, SSE replay, atlas ingestion and saved-quote continuation. It creates a temporary quote and incomplete draft, never confirms an order, and writes its report under ignored `.local/deploy/shopibricks-personal/`.

`npm run verify:personas:live` targets a local app configured for the selected workspace. It makes two real profile-aware model requests, checks current catalog facts and persisted intent milestones, and does not place orders. Set `SHOPIBRICKS_TEST_URL` to the local app's origin.

For the configured hosted FEVM demo, run from the repository root:

```sh
app/.venv/bin/python -P scripts/verify_personas_hosted.py
```

This uses native SDK OAuth with the explicit `fevm` profile. It checks production asset hashes, live catalog/readiness/feed APIs, clustering/filter behavior, one real recommendation and its appearance in account-scoped live activity. It creates no order. Adapt the profile and application URL in the script for another deployment.

For a read-only hosted check after changing the presenter guide:

```sh
app/.venv/bin/python -P scripts/verify_presenter_hosted.py
```

This checks the running deployment, exact production asset hashes, presenter features in the bundle, Lakebase health, catalog readiness, atlas clusters and operational data. It submits no model requests and creates no orders; interaction coverage comes from `verify:presenter`.

The supplementary `verify:receipt` script uses saved-order fixtures. `verify:legacy` retains the earlier storefront test runner for historical workflows; its UI selectors predate the workspace redesign. Its `--agent` and `--protocol` modes make real integration calls. The protocol and full-flow modes can create sandbox orders and decrement demo inventory.

The standalone `browser_agent.js` and `browser_protocol.js` helpers can run in an authenticated same-origin hosted browser. The latter requires `{confirmSandboxWrite: true}` before creating its sandbox order.

## Transaction races

From `app/`:

```sh
node --import tsx ../tests/checkout_regressions.ts
```

This uses native Lakebase authentication, clones a temporary SKU, checks stale-price rejection and two buyers racing for one unit, then removes its temporary operational rows. CDC audit history remains. It does not change shared product stock or prices.
