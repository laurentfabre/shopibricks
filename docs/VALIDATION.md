# Validation

## Public installation guide — November 26, 2026

The README now covers a new Free Edition installation, the Vercel OAuth/MCP adapter, ChatGPT connection, a timed shopper/merchant demo and credential maintenance. Placeholder templates and ignored local overrides let installers use their own profile, identity and Vercel project. The helpers reject inventory belonging to a different workspace/app instead of reusing its resource bindings.

- Gitleaks reported no findings across the 10 reachable preceding commits and a separate copy of the proposed publication files. Environment examples use placeholders; local credentials and generated inventory remain ignored.
- Six offline deployment-configuration checks passed, including explicit-profile selection, local overrides, owner checks and rejection of a mismatched inventory.
- All 47 TypeScript application tests and eight Python bridge tests passed.
- Documentation links, Python syntax and matching JSON/YAML template fields were checked. GitHub's Markdown renderer produced the README preview.
- A resource-free bundle check resolved the local host/profile/variable overrides correctly, then stopped because the saved personal OAuth refresh token had expired. No new hosted validation or fresh-workspace deployment is claimed for this documentation update. No deployment or credential rotation was performed.

The November 19 records below remain the latest recorded hosted evidence. Reauthenticate, check the bridge machine-secret expiry and run the hosted verifiers before the next live demo.

## Architecture workspace and official artwork — November 19, 2026

The Architecture tab provides two logical views: **App & Databricks** and **ChatGPT & Databricks**, now using Databricks reference styling and official product artwork. Model labels and resource links derive from the current deployment. The ChatGPT view abstracts authentication transport and omits the proxy provider; backend connection behavior is unchanged.

- 35 architecture browser checks passed: workspace navigation, keyboard tabs/components, runtime model and Genie links, CDC disclosure, valid standalone SVG exports, direct presentation links, unavailable metadata, and 768/390/320px layouts. The new checks cover embedded branding, card label bounds, offline logo decoding in both exports and bounded mobile images. Inspection and export issued no POST requests.
- All 13 original product/concept asset SHA-256 hashes match the recorded provenance. SVGs parse successfully and contain no script or foreign-object elements.
- Databricks Apps validation passed using `shopibricks-personal`, including lint, type checks, the production build and application tests. The existing large-bundle warning remains.
- Personal deployment `01f1e43967d317bb8679dafb25ffd2ff` succeeded. All 26 hosted checks passed, including byte-for-byte production asset hashes, both diagram/export features in the deployed bundle, and the direct ChatGPT diagram link serving that build. FEVM and emerging-hackathon were not redeployed for this presentation update.
- The initial addition of the Architecture tab had also passed the 61 atlas/persona checks and 23 presenter checks; those wider navigation suites were not repeated for this isolated styling update.

Browser checks use explicit fixtures; desktop, mobile and offline-export screenshots were visually reviewed. See [architecture details, artwork provenance and presentation links](ARCHITECTURE.md).

## CopilotKit and MCP journeys — November 19, 2026

Verified on the **personal Free Edition** deployment, using the explicitly selected `shopibricks-personal` profile. Deployment `01f1e42d9c0b1a0997d85b3f6d06ff2c` started successfully. FEVM and emerging-hackathon were not redeployed for this update.

| Check | Result |
|---|---|
| TypeScript application tests | 47 passed |
| Python bridge tests | 8 passed |
| CopilotKit and journey browser checks | 19 passed |
| Atlas/persona browser regression | 61 passed |
| Checkout recovery scenarios | 7 passed |
| Presenter browser checks | 23 passed; all 14 stops on desktop and 320px mobile |
| Guided tours | All 17 main steps on desktop and 320px mobile; checkout and receipt guides passed |
| Production build and Databricks Apps validation | Passed |
| Dependency audit | 0 reported vulnerabilities |
| Hosted application checks | 24 passed, including matching production asset hashes |
| Hosted CopilotKit and journey checks | 19 passed |
| Hosted OAuth/MCP bridge checks | 32 passed, including isolated-browser consent |

The hosted journey test used real GPT-OSS-120B responses: the shopper rendered product cards with a required inventory check; the merchant read account-scoped MCP evidence and opened Live journeys through AG-UI shared state. It also verified persisted event replay, correlated call outcomes, external search signals in the atlas, quote restoration, and idempotent continuation into an incomplete checkout draft. No order was confirmed and no product stock was changed.

Browser tests use explicit fixtures and verify actual CopilotKit inventory/quote renderers, persona context and thread separation, merchant navigation, mobile layouts, changed prices, unavailable stock and expired quotes. The bridge integration test exercised the existing Vercel endpoint against the updated app, including a saved quote and authenticated continuation link; it revoked its temporary grant. These checks do not represent an automated ChatGPT UI session.

CopilotKit `2.0.0-rc.44` is a pinned prerelease. The production build passes with a large-chunk warning (main JavaScript approximately 456 KB gzipped). See [implementation, demo steps and limitations](COPILOT_JOURNEYS.md). Reports and raw hosted events remain in ignored local paths.

## Presenter guide — November 17, 2026

- 23 presenter browser checks passed: all 13 Driver.js highlights on desktop and 320px mobile, keyboard-operated speaker notes, copy/export, individual-step entry, loading cancellation, atlas error/empty fallbacks, and original view/focus/draft/bag restoration.
- Rehearsing the presenter tour and preparing its prompt issued no POST requests. The checked-in presenter cues match the downloadable script.
- The existing 16-step tour passed on desktop, mobile and with animations; checkout and receipt guides preserved explicit approval.
- All 61 atlas/persona browser checks and 27 application tests passed. Databricks Apps validation passed with the selected `fevm` profile.

Browser checks use explicit API fixtures. All nine read-only hosted checks passed against deployment `01f1e299f77f1f23a74c9758f46d7a84`: running app, connected Lakebase, production page, matching JavaScript/CSS hashes, presenter features, catalog readiness, 72 labeled example questions in six clusters, and operational data. This verification submitted no model requests and created no orders.

The initial deployment exposed an omitted build dependency setting. The manifest now sets `NPM_CONFIG_INCLUDE=dev`; the hosted TypeScript/Vite build and app startup then succeeded without relying on an ignored local `.npmrc`.

## Intent atlas — November 11, 2026

The intent-atlas redesign was verified on November 11, 2026.

| Check | Result |
|---|---|
| TypeScript unit tests | 27 passed |
| Atlas/persona browser checks | 61 passed |
| Checkout recovery scenarios | 7 passed |
| Guided tour | 16 steps passed on desktop and 320px mobile; checkout and receipt guides also passed |
| Databricks Apps validation | Passed |
| Hosted checks | 21 passed |

Browser checks cover 1440, 1024, 768, 390 and 320px layouts, keyboard selection, map controls, filters, exports, error recovery, query handoff, and profile/thread/cart isolation. Their API fixtures are explicitly synthetic. Selected screenshots are in [images](images/).

The hosted verification checked byte-for-byte production asset hashes, live catalog facts, clustering assignments and server filters. A real Noor / Travel planner / Playful agent run recommended the Memo Pocket Camera and Atelier Notebook for €198, within the €300 profile budget. The exact question and its actual recommendation outcome then appeared in the same account's live atlas. No order was created by that verification.

These are dated verification results, not live metrics. Test commands are in the root README and [tests/README.md](../tests/README.md). Generated results, raw hosted events and deployment reports remain local under ignored paths. The scripts regenerate the evidence for an authorized deployment.
