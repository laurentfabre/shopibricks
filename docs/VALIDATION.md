# Validation

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
