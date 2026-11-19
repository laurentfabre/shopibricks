# ShopiBricks

Databricks demo with separate FEVM, emerging-hackathon and personal Free Edition deployments. Always pass the profile explicitly selected by the user (`fevm`, `emerging-hackathon` or `shopibricks-personal`); never infer it from CLI defaults. The hackathon deployment uses the `openai` catalog; the personal deployment uses `workspace.shopibricks`. Use Databricks core and product skills. Use MCP for SQL when available; native SDK/CLI OAuth for resources without MCP coverage. Never print or manually handle API tokens.

App developer owns `app/`; platform work owns `data/`, `resources/`, `scripts/`, `docs/` and the root bundle. Keep synthetic-data labels, real integration statuses and human checkout confirmation. Test meaningful state transitions and hosted behavior. Do not charge payments or enable continuous schedules without a bounded demo window.
