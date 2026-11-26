# ACP and ChatGPT readiness

ShopiBricks demonstrates merchant-side commerce using the [OpenAI Agentic Checkout specification](https://developers.openai.com/commerce/specs/checkout). It is a sandbox: product prices and stock are real records in the demo database; payment authorization and fulfillment do not occur.

The checkout API and a ChatGPT merchant listing are separate deliverables. A reachable endpoint or successful local test does not establish merchant onboarding, OpenAI certification, or availability to ChatGPT shoppers.

The personal ChatGPT MCP connection through the [Vercel bridge](VERCEL_BRIDGE.md) was verified on November 19, 2026, including product retrieval. Use the [current setup guide](INSTALL_FREE_EDITION.md) and [demo script](../README.md#demo-script) for a new installation. The connection exposes bounded commerce tools and temporary saved quotes. It does not establish native ACP checkout, payment processing or merchant approval.

## Protocol boundaries

| Surface | Purpose in this demo |
|---|---|
| OpenAI Responses via Unity Gateway | Model reasoning, streaming output and typed function requests using Databricks-governed access. |
| AG-UI | Agent run, text, tool and structured UI events between the application backend and browser. |
| MCP | Discoverable commerce tools with typed inputs and results. It is separate from the checkout REST contract. |
| ACP checkout REST endpoints | Create, update, fetch, complete and cancel authoritative merchant checkout sessions. |
| Lakebase commerce events | Persisted operational evidence. An event stored here is **not** evidence that OpenAI received an authenticated webhook. |

This implementation keeps MCP commerce tools and the ACP-shaped checkout REST API separate. It does not claim native ACP-over-MCP support.

## What the sandbox must prove

- Item quantities are positive integers. Unknown or duplicate products cannot bypass the authoritative catalog.
- Prices, VAT, delivery and totals are calculated by the merchant backend in integer EUR cents.
- Missing delivery information and insufficient stock produce an unready cart with explicit messages.
- A human confirmation is required before a sandbox order is created.
- Completion locks the checkout and product records, validates the current quote and availability, and decrements stock once.
- Idempotency keys are bound to a caller, operation and request body. Repeating an accepted request returns the same outcome; changing its body is rejected.
- Completed and canceled sessions cannot be reopened or edited. Canceling a terminal session returns HTTP 405 per the checkout specification.
- Checkout and conversation access are scoped to the application caller. The hosted Databricks authentication boundary is documented accurately.
- Responses and UI explicitly disclose the sandbox payment rail. A `stripe` protocol fixture is not a live Stripe integration.

Execution results belong in [the validation record](VALIDATION.md); this checklist is not a conformance certificate.

## What native ChatGPT commerce still requires

1. OpenAI merchant onboarding and any required approval for the intended market and use case.
2. A merchant endpoint that ChatGPT can reach with the agreed authentication contract. The Databricks App's interactive presenter sign-in is not automatically a ChatGPT merchant credential.
3. Production payment processing and, if applicable, delegated payment-token handling with the selected PSP. The current sandbox never calls a PSP.
4. Exact API version, request signature and timestamp verification, error semantics, rate limits and retry behavior agreed with the integration contract.
5. Signed order lifecycle webhooks to OpenAI, including delivery retry, deduplication and reconciliation. Local event persistence alone is insufficient.
6. Product-feed, policy, customer-support, tax, shipping and refund requirements for the real merchant.
7. Official conformance tests and an end-to-end rehearsal **inside ChatGPT**, recorded separately from the ShopiBricks browser flow.

Until those steps are verified, say: **“ShopiBricks has a merchant-side ACP sandbox; native ChatGPT merchant activation is pending.”**
