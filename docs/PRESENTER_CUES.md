# ShopiBricks — presenter talking points

13 highlights · approximately 13 minutes of guided narration, plus live interactions.

Open **Present → Start guided demo**. Choose any agenda stop to spotlight it or open its view. Speaker notes are optional and visible on a shared screen when enabled. The tour only navigates and highlights; submit prompts, change inventory and confirm sandbox orders yourself.

## 01. One journey. Three perspectives.

01 / SET THE SCENE · 0:40

**Say:** “We are following one question from shopper intent to a merchant decision. These three perspectives share the same catalog and operational data.”

**Show:** Point to Shopper, Merchant and Developer. Introduce the fictional retail scenario.

**Evidence:** The perspective selector changes the workspace; it does not change signed-in permissions.

**If unavailable:** Stay in Merchant and explain the other perspectives verbally.

## 02. See intent take shape.

02 / UNDERSTAND DEMAND · 1:10

**Say:** “Instead of reading a long list of queries, I can see the language shoppers share. The example corpus is fictional; My live activity contains questions captured for this account.”

**Show:** After leaving the spotlight, select a cluster, zoom in, and select a point. Point out the dataset label.

**Evidence:** Clusters use TF-IDF keyword similarity and spherical k-means. Graph position illustrates membership, not semantic distance or conversion.

**If unavailable:** If the map is unavailable, show the visible error or empty state and explain the method. Do not describe an unloaded graph as live.

## 03. Turn a question into a next move.

02 / UNDERSTAND DEMAND · 1:00

**Say:** “The useful output is a decision: which products answer this need, and where does the catalog fall short? A gap is a review opportunity, not measured lost revenue.”

**Show:** Open this view, select a question with a match or gap, then inspect its products. “Try in the storefront” prefills that question for the selected profile.

**Evidence:** Product price and availability come from the current catalog. Relevance scores are lexical estimates, not probabilities.

**If unavailable:** If there are no questions, switch to the labeled examples or create a real shopper question. No example traffic is counted as live activity.

## 04. Better answers start with product facts.

03 / PREPARE THE EXPERIENCE · 0:45

**Say:** “The agent needs usable product facts: identity, description, discovery tags, price, inventory and a visual. Completeness and availability are separate checks.”

**Show:** Open a product dossier and show its checks. Export the internal JSON preview if useful.

**Evidence:** Passing these six checks does not mean an external commerce platform has accepted the catalog.

**If unavailable:** If the catalog cannot load, show the error and avoid quoting stale stock or prices.

## 05. Change the voice. Keep the facts.

03 / PREPARE THE EXPERIENCE · 0:45

**Say:** “A brand can sound like itself without changing the truth. Voice changes the wording; prices, stock and checkout rules remain authoritative.”

**Show:** Open this view and switch between two voices. Show the template label, then try the chosen voice with the concierge.

**Evidence:** This preview is a template with live product facts. The selected voice guides separate live conversations in this browser session.

**If unavailable:** Use the visible preview as a template demonstration. Do not present it as a model-generated response.

## 06. The same collection, a different person.

04 / MAKE IT PERSONAL · 1:00

**Say:** “Camille, Alex, Léa and Noor have different interests and budgets. Their profiles guide discovery, but an explicit shopper request takes priority.”

**Show:** Open this view and switch from Camille to Alex or Noor. Show the interests, default budget, and travel or gifting experience.

**Evidence:** The profiles and their history are seeded demo context. Each profile has its own bag; conversations are also separated by experience and voice.

**If unavailable:** Use the profile descriptions if the catalog is loading. Do not describe seeded history as observed customer behavior.

## 07. Specialists work from current facts.

05 / SHOW THE AGENTS · 0:45

**Say:** “The model chooses tools and delegates work. The specialists retrieve data rather than inventing availability or a final checkout amount.”

**Show:** Point out the five specialists. During a real request, watch activity change, then inspect the recorded calls in Developer studio.

**Evidence:** The roster is a status display. Actual tool and handoff events in the protocol timeline are the execution evidence.

**If unavailable:** If no run is active, explain the roles without claiming that a tool has just executed.

## 08. Ask for a complete, constrained selection.

05 / SHOW THE AGENTS · 1:30

**Say:** “I will ask for a complete weekend kit under €250. The important test is whether the entire selection respects that budget and current availability.”

**Show:** Choose “Use demo prompt” in the guide to prefill the composer. Submit it yourself, then read the actual product cards and total.

**Evidence:** A prefilled prompt is not a model run. Model output is AI-generated; verify it against the live product cards.

**If unavailable:** Show a real error and retry once, or use a clearly dated rehearsal. Do not promise a specific product combination.

**Demo prompt:**

> Choose a Paris weekend kit with wireless audio and a bag, maximum €250 total. Check current stock and show product cards. Do not prepare checkout.

## 09. The final decision belongs to the shopper.

06 / KEEP THE SHOPPER IN CONTROL · 1:00

**Say:** “The assistant can prepare a draft, but it does not decide to purchase. The shopper reviews the current total and explicitly approves a sandbox order.”

**Show:** Open the bag manually. Use its “Guide me” tour to show the quantity, fictional delivery details and unchecked approval box. Only confirm if you intend to place a sandbox order.

**Evidence:** Confirmation persists a sandbox order and changes demo stock. No payment is charged and no goods are shipped.

**If unavailable:** An empty bag is a valid starting point. Add a product manually; do not claim an order exists before confirmation.

## 10. Connect the action to operational truth.

07 / FOLLOW THE DATA · 1:00

**Say:** “The same commerce state is visible to the merchant. These figures describe sandbox orders and current stock, with their period and source shown on screen.”

**Show:** Read the current period and source. If an order was placed, find its exact ID in the order list and open its saved receipt.

**Evidence:** Recorded order totals are distinct from synthetic campaign analytics. A saved receipt keeps the amounts captured at checkout.

**If unavailable:** If there is no new order, use the inventory view. Do not attribute historical totals to this demo run.

## 11. Know which signals are synthetic.

07 / FOLLOW THE DATA · 1:00

**Say:** “This panel is a separate synthetic campaign stream. Freshness and the inspectable query tell us what the chart actually represents.”

**Show:** Show the query, latest event time and data source. Start a bounded stream separately only when it is part of your rehearsed demo.

**Evidence:** Synthetic traffic amounts and stockout exposure are not confirmed order revenue or measured lost revenue.

**If unavailable:** If the emitter is stopped, read the displayed timestamp and call this the last processed dataset, not a live stream.

## 12. Show the actual execution.

08 / MAKE IT INSPECTABLE · 1:10

**Say:** “This is the evidence behind the interface. I can inspect which calls occurred and what they returned. The protocol timeline and MLflow traces make the execution reviewable.”

**Show:** Open this view and select an event from the real shopper run. Show its payload and correlate it with the conversation.

**Evidence:** MCP exposes tools, AG-UI streams interface events, and the gateway governs model access. They serve different roles.

**If unavailable:** An empty timeline means no visible activity is available. Run a shopper question or label a previously recorded trace with its date.

## 13. Be precise about channel readiness.

09 / CLOSE THE LOOP · 0:45

**Say:** “The result is a connected native commerce journey—from intent to a reviewed decision. External distribution is a separate integration and onboarding step.”

**Show:** Show ShopiBricks as available, then select ChatGPT and read its outstanding prerequisites. Close on the full shopper-to-merchant story.

**Evidence:** The ACP-shaped sandbox is not merchant approval. External platforms are not connected, and exporting a feed does not publish it.

**If unavailable:** Keep the native storefront as the demonstrated outcome. Do not imply that a product is purchasable inside an external assistant.

## Rehearsal checklist

- Sign in to the demo, check catalog availability, and run one shopper question before presenting.
- Use fictional buyer details. A confirmed sandbox order changes stock and persists data.
- Check timestamps before describing analytics as live. Stop any bounded emitter after the session.
- Keep a dated rehearsal available, and name it as such if a dependency is unavailable.
- Use the [full runbook](RUNBOOK.md) for the extended Laurent / Hatim session.
