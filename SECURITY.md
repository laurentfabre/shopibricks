# Credentials and demo boundaries

The public source does not require reusable credentials in tracked files. Environment examples use placeholders. Workspace URLs, resource IDs, OAuth client IDs and the reference deployment owner's email are configuration metadata, not secrets and not proof of access.

## Where credentials belong

| Credential | Storage / owner |
|---|---|
| Databricks developer OAuth session | Native Databricks CLI/SDK credential management |
| Hosted app identity | Databricks Apps resource bindings and injected identity |
| Vercel deployment token | Your ignored local `.env`, selected explicitly with `--vercel-env-file` |
| Bridge machine OAuth client secret | Sensitive production environment variable in Vercel |
| Bridge authorization codes and access/refresh credentials | Short-lived protocol values; only their hashes persist in Lakebase |

`.gitignore` excludes `.env` files except examples, local deployment overrides, generated inventories, local reports, private-key files, `.vercel`, caches and browser artifacts. These exclusions do not remove files already tracked by Git. Review the staged diff before publishing. Never copy live browser cookies, tokens, consent pages or unredacted traces into documentation.

`shopibricks_sandbox` is an intentionally fixed payment fixture accepted only by the sandbox checkout. It is not a payment-provider credential. The Stripe provider enum is also a schema fixture; the app does not call Stripe.

## Publication checks

On November 26, 2026, Gitleaks scanned the 10 reachable commits preceding the installation-documentation update with no findings. The proposed publication files were also scanned separately. This is a bounded scanner result, not a guarantee that arbitrary local files or future commits are safe.

To repeat a history check with Gitleaks installed:

```sh
gitleaks detect --source . --log-opts=--all --redact
git ls-files '.env' '*/.env' '*.pem' '*.key' 'docs/deployment*.json'
git diff --cached --check
```

`docs/deployment.example.json` is an intentional placeholder-only example. Inspect any other credential or generated-inventory path returned by the file listing. Run a file scan against a separate copy of the tracked publication files to avoid scanning or printing your ignored local credentials. Redact scanner output and keep reports outside version control.

If a real credential is ever committed, revoke or rotate it at its provider first. Removing it from the latest file does not remove it from Git history. Coordinate any history rewrite with collaborators and check existing clones, tags and forks. Do not paste the credential into a public issue.

## Scope of the demo

The hosted app relies on Databricks Apps authentication. The local server is for localhost development. The bridge is an explicitly consented, owner-allowlisted demo relay, not a general-purpose proxy or a production multi-tenant authorization system.

The bridge exposes catalog, inventory, semantic search, merchant metrics and temporary quotes. It cannot confirm an order. The browser must explicitly confirm sandbox checkout, and checkout rechecks authoritative price and stock. No real payment or shipment occurs.

The bridge principal has App `CAN_USE`; the app principal owns the governed-resource execution. Application-level account scoping is not Databricks on-behalf-of execution. Merchant aggregates are shared synthetic commerce data. External ChatGPT searches contribute captured tool arguments and outcomes, not the shopper's complete conversation.

The model and CopilotKit can request supported tools and UI actions. Product facts, budgets and checkout decisions are validated by application code. This demo has not been certified for production commerce, regulated data or native ChatGPT merchant checkout.
