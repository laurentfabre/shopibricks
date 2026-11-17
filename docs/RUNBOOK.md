# ShopiBricks — OpenAI Office Paris

**50 minutes. Laurent: 00:00–25:00. Hatim: 25:00–50:00.**

For a shorter walkthrough, open **Present → Start guided demo** in the app: 13 Driver.js highlights, about 13 minutes of narration plus live interactions. Start at any agenda stop, spotlight its UI, or open its view to interact. **Download talking points** saves the full script. Speaker notes inside the tour are optional and visible on a shared screen; keep [the presenter cues](PRESENTER_CUES.md) on a second screen if you prefer. This document contains the extended Laurent / Hatim session and rehearsal instructions.

The through-line: a shopper wants a Paris weekend kit below €250. Demand changes while the shopper is deciding. Governed data and specialist agents find an available option, the interface adapts, and the shopper explicitly confirms a sandbox order. Follow the resulting order and its events into the merchant view.

This is a synthetic retail demo. A completed sandbox order persists in Lakebase and changes demo inventory; it never charges a card or ships goods. Native checkout inside ChatGPT is a separate merchant-onboarding dependency. Do not describe an ACP-shaped sandbox implementation as OpenAI merchant approval or certification.

## Recorded rehearsal checkpoint — 7 November 2026

The [hosted app](https://shopibricks-paris-7474645565734606.aws.databricksapps.com) used deployment `01f1da4b5185131aaedb46647f556b20` for this historical rehearsal at **01:34:45 UTC**. Its agent rerun passed **11/11** checks with six real model calls, recommending available headphones and a tote for **€168**. Its checkout rerun passed **27/27** checks and created a €19 notebook order, decrementing stock **114 → 113 exactly once**. These are dated results; see [current validation](VALIDATION.md) and verify the active deployment before presenting.

Separate dated rehearsals proved the server-computed **€237** UI total and visible human-confirmed order `ord_ca95c270-66fd-4006-a17a-2fbb9f0befc1`, which survived permalink reload and appeared in Unity Catalog `current_orders` through native CDC. [The hosted order screenshot](hosted-order.png) and [€237 recommendation screenshot](hosted-agent.png) retain those earlier rehearsals; do not describe them as the final €168 run.

The app's analyst has a verified **`ask_genie`** execution, generated SQL, service-principal identity and returned result: Forma Headphones had **€184,212 synthetic stockout exposure across all cities and channels**, using events through **00:28:41 UTC**. This figure is neither Paris-only nor actual lost revenue. The **00:40 UTC stockout rehearsal** selected the daypack and earbuds for **€158** in **8.38 seconds**, without checkout; headphones were restored to 42 afterward.

The final hosted run's **MLflow trace body was downloaded, inspected and matched to its actual OpenAI response ID**. Use [the verified hosted trace](https://fevm-serverless-stable-vwywqi.cloud.databricks.com/ml/experiments/588811517474050/traces/a24563724d88895df4dc1fc2ba6c36f9) in experiment **`588811517474050`**, backed by Unity Catalog prefix `agent_traces`. The old experiment is historical. All delivered demo verification gates are complete; [the verification record](../tests/VERIFICATION.md) contains the exact evidence. ChatGPT connection remains deferred and native ACP merchant activation is external setup.

## Rehearsal and room setup

- Use the deployed Databricks App from the current deployment record, signed in with a presenter account. Its navigation includes **Discovery intelligence**, **Storefront**, **Commerce operations** and **Developer studio**. Keep separate browser tabs for each if helpful.
- Open the dedicated Lakeflow pipeline, source volume, Unity Catalog schema, MLflow experiment, Genie agent and AI/BI dashboard from the deployment record. Only include a surface in the live script after its verification is recorded.
- Use 1440×900 or larger resolution with browser zoom large enough to read product prices and tool names from the back of the room. Collapse the browser bookmarks bar. Turn off notifications.
- Confirm the app health and integrations panel reports the actual available model, Lakebase and analytics status. Run one short prompt. Verify a fresh event timestamp and inspect a successful trace rather than relying on a green badge alone.
- Start a **bounded** synthetic stream early enough to warm serverless compute. Verify two successive event counts or file arrival timestamps increase. A running job by itself does not prove the pipeline or dashboard is fresh.
- Check the current inventory of the featured products. Rehearsals consume demo stock when checkout completes. Use only the app's documented demo reset/replenishment control; do not reset the shared workspace or delete production resources.
- Keep the pretested prompt and a spare prompt in a local text file. Do not paste credentials, real customer information or payment details into the UI.
- Use a fictional delivery address and email such as `demo@example.com`. The demo supports French delivery only.
- Save a screenshot or short recording of the **verified deployment's** happy path before the talk. Label any playback explicitly as a rehearsal recording with its date. The retained hosted agent screenshot shows the corrected server-computed card total.
- Agree on a hard handoff at 25:00. Laurent leaves the selected shopper/cart state visible; Hatim continues in the same app, with a prepared clean tab as a spare.

From the `shopibricks/` project directory, check the current app and streaming state:

```sh
python3 scripts/demo.py status
```

Start a 60-minute synthetic stream for the rehearsal or talk. This command uses the explicit `fevm` profile internally, avoids creating a second active emitter and appends fresh events without regenerating historical data:

```sh
python3 scripts/demo.py start --minutes 60
```

The job also refreshes the medallion pipeline. Wait for actual new events and a completed update before calling the analytical view fresh. The API checks that passed during development do not replace this day-of warmup.

## Laurent — 00:00 to 25:00

| Time | Screen and action | Talk track / proof |
|---|---|---|
| 00:00–02:00 | Storefront. Show the ShopiBricks name, product collection and sandbox/synthetic labels. | “We are following one decision from data to a customer-approved action. The store, inventory, agent tools and analytics are connected.” State the €250 Paris weekend objective. |
| 02:00–05:00 | Browse a product, inspect its price and availability. Briefly show the concierge. | Establish the customer problem before the architecture. “The price and stock are merchant facts. The model can recommend; it cannot invent a price or authorize a purchase.” |
| 05:00–09:00 | Operations, then the synthetic generator job and source volume. Show two batches with different timestamps. | Explain bounded synthetic streaming and event types: view, cart, purchase and stockout. Show the demand skew and the Paris campaign. State the period and freshness of every metric shown. |
| 09:00–13:00 | Lakeflow medallion pipeline, then the quality/quarantine table. | Trace one dataset: raw events → validated, deduplicated events → daily/product aggregates. Show actual quality expectation results. “Bad events stay inspectable without inflating trusted commerce metrics.” |
| 13:00–16:00 | Unity Catalog schema/lineage; show products and a gold table. | Governance follows the data. Describe the app's execution identity accurately: service principal for shared demo operations, presenter login at the application boundary. Do not claim per-user OBO execution unless verified. |
| 16:00–20:00 | Operations or AI/BI dashboard. Compare stockouts and demand by product/city/channel. | Identify the hero product's risk from the actual numbers. Revenue at risk is a synthetic diagnostic estimate (`stockout events × product price`), not booked sales or a forecast. Separate this from confirmed sandbox orders. |
| 20:00–23:00 | Run the app's **stockout** presenter scenario for Forma Headphones once; return to product availability. If available, show Lakebase → Delta CDC status. | Explain that this button deliberately changes demo inventory to zero. The synthetic streaming campaign provides the analytical context; it does not automatically perform this stock update. Read the observed timestamp and status. CDC is asynchronous; show measured freshness and do not call a stale aggregate “instant.” |
| 23:00–25:00 | Return to the shopper view with the weekend objective ready. | Recap only the evidence needed for the next step: trusted products, current stock, governed demand signals. Handoff: “Hatim, the data now says the original choice is constrained. Show us how the agents change the experience and complete the order safely.” |

**Laurent's merchant question, using the verified app analyst → Genie path:**

> Use Genie to find the product with the highest total stockout exposure across all cities and channels. Show the generated SQL, latest event timestamp and definition. Does this represent actual lost revenue?

Inspect the generated SQL and returned rows. Confirm the timeline contains `ask_genie`; `get_merchant_metrics` reads the operational/analytical metrics directly and is a different data path. The query runs as the app service principal, not the presenter's delegated identity. If the answer is ambiguous, use it to demonstrate clarification rather than correcting the number verbally without evidence.

## Hatim — 25:00 to 50:00

| Time | Screen and action | Talk track / proof |
|---|---|---|
| 25:00–28:00 | Concierge. Submit the prepared shopper prompt below. | Define the user's intent, constraints and explicit budget. Show the response beginning and actual run status. |
| 28:00–32:00 | Follow the agent activity as recommendations appear. Inspect the generated shortlist, individual prices and server-computed total on the verified final build. | Explain specialist responsibilities from observed calls: catalog retrieval, live stock/price checks, planning and checkout. “These are typed tools and validated UI payloads. We render known components; the model is not executing arbitrary browser code.” |
| 32:00–35:00 | Ask for an alternative if the first choice is unavailable. Inspect the updated product set and total. | Show that the result is grounded in current merchant data. Keep the budget visible. If the model overlooks a constraint, ask it to correct the result and discuss the validation boundary. |
| 35:00–39:00 | Review the sandbox checkout card, provide the fictional address, then explicitly confirm. | Read the line items, VAT and delivery total. Pause before confirmation. “The customer controls this transition.” After confirming, show the persistent order ID and completed state. |
| 39:00–43:00 | Protocol Studio. Inspect the correlated run/tool/event trail and checkout request/response. | Distinguish AG-UI streaming events, MCP tools, OpenAI Responses through Unity Gateway and ACP merchant REST endpoints. Show one actual example of each implemented integration. Point out idempotency and authoritative cart responses. |
| 43:00–46:00 | Operations and the persisted protocol timeline. Inspect `current_orders` for the same order when CDC has caught up. Open the verified hosted MLflow trace in experiment `588811517474050`; inspect the `DatabricksResponses` span's request and `delegate_catalog` response. | Match response ID `resp_03ea1df619f7deb5016aee8081790887d18d91697c69922c8c` to agent run `c7f44cbb-8be3-440c-9326-fdb8c9a3faf4`. Explain that this is a dated, verified hosted model span; it is separate from today's new order unless that new run has its own recorded link. Use the matching order ID to show asynchronous CDC. |
| 46:00–48:00 | Stay in Protocol studio. Show live MCP discovery, then the ACP readiness notes. The ChatGPT account connection is deferred. | Explain the next integration boundary: “The merchant API is a sandbox. Native ChatGPT checkout additionally needs merchant onboarding, the agreed signature contract, production payment rails and conformance testing.” A discoverable MCP endpoint does not prove a connection from ChatGPT. |
| 48:00–50:00 | Return to the completed shopper journey; leave 1–2 minutes for questions. | Ask the audience to evaluate the connected outcome: fresh data → governed tool use → useful UI → human-approved transaction → inspectable evidence. Avoid reciting every platform service. |

**Primary shopper prompt:**

> Choose a Paris weekend kit with wireless audio and a bag, maximum €250 total. Check current stock and show product cards. Do not checkout.

**Follow-up for the stock constraint:**

> Check the stock again. If the headphones are unavailable, suggest the best available alternative and keep the whole kit under €250.

**Alternative prompt if the first session has too much history:**

> Start a new recommendation: choose wireless audio, a travel bag and one useful accessory for Paris. My maximum total is €250. Use current prices and stock, and ask me before checkout.

## Failure handling without losing the story

| Observation | Action on stage | Honest wording |
|---|---|---|
| Model call errors or times out | Show the inline error and actual event/trace. Retry once with the shorter prompt. If still unavailable, browse products manually and demonstrate the working sandbox checkout. | “The model path is unavailable. The merchant's pricing, stock validation and transaction boundary remain independently inspectable.” |
| Streaming job is running but gold timestamp is old | Show the last successful timestamp, raw file arrival and pipeline state. Continue with the last materialized slice. | “This view is a materialized snapshot from [time]; it has not caught up yet.” |
| No new generator events | Inspect the bounded session end time. Restart only through the prepared documented command. | “The demo stream is deliberately time-bounded; this session has finished.” |
| Lakebase unavailable | Do not attempt to fabricate a successful order. Show the failure state, architecture and a labelled rehearsal recording. | “The transaction store is unavailable, so checkout is blocked.” |
| Product is sold out after rehearsal | Ask for an available alternative or replenish using the documented demo control before a new attempt. | “Availability is checked at purchase time; the app rejects a stale promise.” |
| Genie/Vector Search/MLflow is not verified | Skip that surface, retain the deployed app's status disclosure, and use the direct working path only if implemented. | “This integration is not active in this environment.” |
| Native ChatGPT merchant onboarding is incomplete | Show the implemented ACP request/response and readiness document. | “This is the merchant-side sandbox contract; it is not a live ChatGPT merchant integration.” |
| Authentication redirect appears | Use the prepared authenticated tab. Never expose cookies or credentials in DevTools. | “This demo workspace requires presenter sign-in.” |

## After the presentation

Stop the bounded generator and any continuous pipeline session using the prepared shutdown command. Confirm both are stopped/completed. Retain the app, synthetic data, traces and screenshots for review. Do not destroy resources automatically: cleanup is a separate deliberate action.

```sh
python3 scripts/demo.py stop
python3 scripts/demo.py status
```

An already-triggered Lakeflow update can finish independently after the emitter is canceled. `status` must show no active emitter and a completed/stopped pipeline update before leaving the demo unattended.

## Deferred: personal ChatGPT Pro connection

The ChatGPT connection is explicitly deferred for this build. These instructions are a future rehearsal reference, not part of the current live script or a completed integration.

The current [official connection guide](https://developers.openai.com/apps-sdk/deploy/connect-chatgpt) uses **ChatGPT Plugins → plus → Add custom MCP server**. Account and workspace policies still apply.

1. Before the talk, prove the public HTTPS `/mcp` endpoint can initialize, list tools and call a read-only product search. Authentication discovery must work through the hosted endpoint.
2. In [ChatGPT Plugins](https://chatgpt.com/plugins), choose **Add custom MCP server**, set the name to **ShopiBricks**, and enter the deployed `/mcp` URL. Complete the configured authentication flow. Review the displayed tools before installing it.
3. Start a new ChatGPT conversation, type `@`, select ShopiBricks, and ask: “Find available wireless audio products below €150 in ShopiBricks. Show the current price and stock.”
4. Inspect the actual tool result and compare a product's price and stock with the Databricks App. Record whether this invocation succeeded. A saved plugin entry without a successful tool call is not a passed integration.
5. After changing tools or metadata, use **Refresh** in the ChatGPT connection and start a fresh conversation.

If direct authentication is not compatible, [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels) is a possible private connection path. It requires a Platform tunnel, appropriate permissions and a separate runtime API key. A ChatGPT Pro subscription alone does not supply or authorize use of that credential. Do not introduce an untested tunnel during the presentation.

**Initial data baseline:** the first successful pipeline validation reported 121,920 bronze events, 120,658 accepted silver events and 1,262 quarantined events. These are a build-time snapshot; show current counts during the talk. The curated Genie space is `01f1da3bc13e13deb495675656b7255f` in the selected FEVM workspace.

A later bounded rehearsal added three microbatches: **122,640 bronze / 121,369 silver / 1,271 quarantine** after a successful pipeline update. Job `701452676363557` is the bounded emitter; `143488153877632` was a completed rehearsal **run ID**, not a job ID. The stream is not left running between rehearsals.

## Verification record

See `tests/VERIFICATION.md` for observed local/hosted checks and remaining gaps. A planned click path in this runbook is not evidence that an integration passed.
