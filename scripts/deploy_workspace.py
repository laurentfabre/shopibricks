"""Explicit-target deployment helpers. Credentials stay inside native CLI/SDK OAuth.

Generated inventory and staged source are local and ignored by Git. This never
copies the source workspace's customer activity, orders, credentials or traces.
"""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import time

ROOT = Path(__file__).resolve().parents[1]


class Deployment:
    def __init__(self, target):
        self.target = target
        self.config = json.loads((ROOT / "deployments" / f"{target}.json").read_text())
        self.profile = self.config["profile"]
        self.out = ROOT / ".local" / "deploy" / target
        self.out.mkdir(parents=True, exist_ok=True)
        self.inventory_path = ROOT / "docs" / f"deployment.{target}.json"
        self.inventory = json.loads(self.inventory_path.read_text()) if self.inventory_path.exists() else {}
        self.inventory.update(self.config)
        self.ns = f'{self.config["catalog"]}.{self.config["schema"]}'

    def cli(self, *args, payload=None):
        command = ["databricks", *args, "--profile", self.profile, "-o", "json"]
        if payload is not None:
            command += ["--json", json.dumps(payload)]
        readonly = (args[0] == "api" and args[1] == "get") or (len(args) > 1 and (args[1].startswith(("get", "list")) or args[:2] == ("current-user", "me")))
        for attempt in range(3 if readonly else 1):
            result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, timeout=120)
            if not result.returncode or not any(word in result.stderr.lower() for word in ("i/o timeout", "temporary failure", "connection reset", "timed out")):
                break
            if attempt < 2:
                time.sleep(2)
        if result.returncode:
            raise RuntimeError(f'{" ".join(args[:3])}: {result.stderr[-2500:]}')
        return json.loads(result.stdout) if result.stdout.strip() else {}

    def api(self, method, path, payload=None):
        return self.cli("api", method, path, payload=payload)

    def save(self):
        self.inventory_path.write_text(json.dumps(self.inventory, indent=2) + "\n")

    def sql(self, statement):
        result = self.api("post", "/api/2.0/sql/statements", {
            "warehouse_id": self.config["warehouse_id"], "statement": statement,
            "wait_timeout": "10s", "row_limit": 100,
        })
        deadline = time.monotonic() + 180
        while result["status"]["state"] in ("PENDING", "RUNNING"):
            if time.monotonic() > deadline:
                self.api("post", f'/api/2.0/sql/statements/{result["statement_id"]}/cancel')
                raise TimeoutError("SQL readiness check exceeded three minutes")
            time.sleep(2)
            result = self.api("get", f'/api/2.0/sql/statements/{result["statement_id"]}')
        if result["status"]["state"] != "SUCCEEDED":
            raise RuntimeError(json.dumps(result["status"]))
        return result

    def audit(self):
        report = {"profile": self.profile, "host": self.config["host"], "catalog": self.config["catalog"]}
        report["identity"] = self.cli("current-user", "me")["userName"]
        if self.config.get("expected_user") and report["identity"] != self.config["expected_user"]:
            raise ValueError("The selected profile is signed in as a different user")
        report["catalog_info"] = self.cli("catalogs", "get", self.config["catalog"])
        report["catalog_grants"] = self.cli("grants", "get", "catalog", self.config["catalog"])
        report["schemas"] = [x["name"] for x in self.cli("schemas", "list", self.config["catalog"])]
        report["warehouse"] = self.cli("warehouses", "get", self.config["warehouse_id"])
        report["existing_apps"] = [x["name"] for x in self.cli("apps", "list") if x["name"] == self.config["app_name"]]
        report["existing_projects"] = [x["name"] for x in self.cli("postgres", "list-projects") if x["name"] == f'projects/{self.config["lakebase_project"]}']
        report["vector_endpoints"] = self.cli("vector-search-endpoints", "list-endpoints")
        report["model"] = self.cli("serving-endpoints", "get", self.config["model_endpoint"])
        report["embeddings"] = self.cli("serving-endpoints", "get", self.config["embedding_endpoint"])
        report["sql"] = self.sql("SELECT current_user() AS identity, current_metastore() AS metastore, 1 AS ready")["result"]
        (self.out / "preflight.json").write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps({"preflight": "passed", "profile": self.profile, "catalog": self.config["catalog"], "schemas": report["schemas"], "warehouse": report["warehouse"]["name"], "existing_apps": report["existing_apps"], "existing_projects": report["existing_projects"]}), flush=True)

    def bootstrap(self):
        # Reuse the existing synthetic UC seed with explicit target bindings.
        spec = importlib.util.spec_from_file_location("shopibricks_platform", ROOT / "scripts/platform.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        module.CATALOG, module.SCHEMA = self.config["catalog"], self.config["schema"]
        module.sql = self.sql
        module.bootstrap()
        self.inventory["uc_seed"] = {"namespace": self.ns, "products": 12, "synthetic_customers": 2500}
        self.save()

    def infrastructure(self):
        projects = self.cli("postgres", "list-projects")
        if not any(p["name"] == f'projects/{self.config["lakebase_project"]}' for p in projects):
            self.inventory["lakebase_operation"] = self.cli("postgres", "create-project", self.config["lakebase_project"], "--no-wait", payload={"spec": {"display_name": "ShopiBricks · OpenAI", "pg_version": 17}})
            self.save()
            print("Lakebase project creation requested", flush=True)
        endpoints = self.cli("vector-search-endpoints", "list-endpoints")
        if not any(e["name"] == self.config["vector_endpoint"] for e in endpoints):
            self.cli("vector-search-endpoints", "create-endpoint", self.config["vector_endpoint"], "STANDARD", "--no-wait")
            print("Vector-search endpoint creation requested", flush=True)
        apps = self.cli("apps", "list")
        if not any(a["name"] == self.config["app_name"] for a in apps):
            self.cli("apps", "create", "--no-compute", "--no-wait", payload={"name": self.config["app_name"], "description": "ShopiBricks · OpenAI · synthetic multi-persona commerce and intent atlas"})
            print("App identity created without starting compute", flush=True)
        app = self.cli("apps", "get", self.config["app_name"])
        deadline = time.monotonic() + 120
        while not app.get("service_principal_client_id") or not app.get("url"):
            if time.monotonic() > deadline:
                raise TimeoutError("App identity provisioning exceeded two minutes")
            time.sleep(3)
            app = self.cli("apps", "get", self.config["app_name"])
        self.inventory.update(app_service_principal=app["service_principal_client_id"], app_url=app["url"])
        self.save()

    def bindings(self):
        branch = f'projects/{self.config["lakebase_project"]}/branches/production'
        self.cli("postgres", "get-branch", branch)
        databases = self.cli("postgres", "list-databases", branch)
        database = next(d for d in databases if d["status"]["postgres_database"] == "databricks_postgres")
        endpoints = self.cli("postgres", "list-endpoints", branch)
        endpoint = next(e for e in endpoints if e["name"].endswith("/primary"))
        self.inventory.update(lakebase_branch=branch, lakebase_database=database["name"], lakebase_endpoint=endpoint["name"], lakebase_host=endpoint["status"]["hosts"]["host"])
        bundle = self.cli("bundle", "summary", "--target", self.target)["resources"]
        self.inventory.update(pipeline_id=bundle["pipelines"]["commerce"]["id"], stream_job_id=bundle["jobs"]["stream"]["id"], refresh_job_id=bundle["jobs"]["refresh"]["id"])
        dashboard = bundle.get("dashboards", {}).get("commerce_dashboard", {})
        if dashboard.get("id"):
            self.inventory["dashboard_id"] = dashboard["id"]
        app = self.cli("apps", "get", self.config["app_name"])
        self.inventory.update(app_service_principal=app["service_principal_client_id"], app_url=app["url"])
        self.save()
        print(json.dumps({key: self.inventory[key] for key in ("app_url", "app_service_principal", "lakebase_database", "pipeline_id", "stream_job_id", "refresh_job_id")}), flush=True)

    def vector(self):
        name = f"{self.ns}.products_index"
        try:
            existing = self.cli("vector-search-indexes", "get-index", name)
            print(json.dumps({"index": name, "status": existing.get("status")}), flush=True)
            return
        except RuntimeError as error:
            if not any(term in str(error).lower() for term in ("does not exist", "not found", "resource_does_not_exist")):
                raise
        payload = json.loads((ROOT / "resources/product-index.json").read_text())
        payload.update(name=name, endpoint_name=self.config["vector_endpoint"])
        payload["delta_sync_index_spec"].update(source_table=f"{self.ns}.products")
        payload["delta_sync_index_spec"]["embedding_source_columns"][0]["embedding_model_endpoint_name"] = self.config["embedding_endpoint"]
        result = self.api("post", "/api/2.0/vector-search/indexes", payload)
        self.inventory["vector_index"] = name
        self.save()
        print(json.dumps({"index": name, "status": result.get("status")}), flush=True)

    def traces(self):
        os.environ["DATABRICKS_CONFIG_PROFILE"] = self.profile
        os.environ["DATABRICKS_HOST"] = self.config["host"]
        os.environ["MLFLOW_TRACING_SQL_WAREHOUSE_ID"] = self.config["warehouse_id"]
        import mlflow
        from mlflow.entities import UnityCatalog
        mlflow.set_tracking_uri(f"databricks://{self.profile}")
        experiment = mlflow.set_experiment(experiment_name=self.config["experiment_name"], trace_location=UnityCatalog(catalog_name=self.config["catalog"], schema_name=self.config["schema"], table_prefix="agent_traces"))
        self.inventory.update(experiment_id=experiment.experiment_id, trace_table_prefix=f"{self.ns}.agent_traces", trace_location=experiment.trace_location.to_dict())
        self.save()
        print(json.dumps({"experiment_id": experiment.experiment_id, "trace_location": self.inventory["trace_location"]}), flush=True)

    def modelcheck(self):
        os.environ["DATABRICKS_CONFIG_PROFILE"] = self.profile
        os.environ["DATABRICKS_HOST"] = self.config["host"]
        from databricks_openai import DatabricksOpenAI
        unified = self.config.get("gateway_api", "native") == "mlflow"
        client = DatabricksOpenAI(use_ai_gateway=unified, use_ai_gateway_native_api=not unified, timeout=60, max_retries=1)
        response = client.responses.create(model=self.config["model"], input="Reply only with: ShopiBricks target ready.", max_output_tokens=128)
        if response.status != "completed" or not response.output_text:
            raise RuntimeError(f"Target Responses API did not complete: {response.status}")
        print(json.dumps({"profile": self.profile, "model": self.config["model"], "status": response.status, "response_id": response.id, "text": response.output_text}), flush=True)

    def analytics(self):
        source_ns = "serverless_stable_vwywqi_catalog.shopibricks_laurent"
        self.sql((ROOT / "data/commerce_metrics.sql").read_text().replace(source_ns, self.ns))
        dashboard = json.loads((ROOT / "resources/commerce.lvdash.json").read_text())
        proof = {}
        for dataset in dashboard["datasets"]:
            query = "\n".join(dataset["queryLines"]).replace("FROM gold_", f"FROM {self.ns}.gold_")
            result = self.sql(query)
            proof[dataset["name"]] = {"statement_id": result["statement_id"], "rows": result.get("manifest", {}).get("total_row_count")}
        payload = json.loads((ROOT / "resources/genie.json").read_text().replace(source_ns, self.ns))
        payload["warehouse_id"] = self.config["warehouse_id"]
        payload["parent_path"] = self.config.get("genie_parent_path", payload["parent_path"])
        self.cli("workspace", "mkdirs", payload["parent_path"])
        space = json.loads(payload["serialized_space"])
        for example in space.get("instructions", {}).get("example_question_sqls", []):
            self.sql("\n".join(example["sql"]))
        if self.inventory.get("genie_space_id"):
            result = self.cli("genie", "update-space", self.inventory["genie_space_id"], payload=payload)
        else:
            result = self.cli("genie", "create-space", payload=payload)
            self.inventory["genie_space_id"] = result.get("space_id") or result["id"]
        self.inventory["analytics_validation"] = proof
        self.save()
        print(json.dumps({"queries": proof, "genie_space_id": self.inventory["genie_space_id"]}), flush=True)

    def configure(self):
        inv = self.inventory
        principal = inv["app_service_principal"]
        for kind, name, privileges in [("catalog", self.config["catalog"], ["USE_CATALOG"]), ("schema", self.ns, ["USE_SCHEMA", "SELECT"])]:
            self.cli("grants", "update", kind, name, payload={"changes": [{"principal": principal, "add": privileges}]})
        for suffix in ("otel_spans", "otel_logs", "otel_annotations"):
            self.cli("grants", "update", "table", f"{self.ns}.agent_traces_{suffix}", payload={"changes": [{"principal": principal, "add": ["MODIFY", "SELECT"]}]})
        resources = [
            {"name": "postgres", "postgres": {"branch": inv["lakebase_branch"], "database": inv["lakebase_database"], "permission": "CAN_CONNECT_AND_CREATE"}},
            {"name": "sql-warehouse", "sql_warehouse": {"id": self.config["warehouse_id"], "permission": "CAN_USE"}},
            {"name": "openai-model", "serving_endpoint": {"name": self.config["model_endpoint"], "permission": "CAN_QUERY"}},
            {"name": "mlflow", "experiment": {"experiment_id": inv["experiment_id"], "permission": "CAN_EDIT"}},
            {"name": "products-index", "uc_securable": {"securable_full_name": f"{self.ns}.products_index", "securable_type": "TABLE", "permission": "SELECT"}},
            {"name": "stream-job", "job": {"id": inv["stream_job_id"], "permission": "CAN_MANAGE_RUN"}},
            {"name": "refresh-job", "job": {"id": inv["refresh_job_id"], "permission": "CAN_MANAGE_RUN"}},
            {"name": "genie-space", "genie_space": {"space_id": inv["genie_space_id"], "permission": "CAN_RUN"}},
        ]
        existing = self.cli("apps", "get", self.config["app_name"]).get("resources", [])
        names = {resource["name"] for resource in resources}
        resources += [resource for resource in existing if resource["name"] not in names]
        result = self.cli("apps", "create-update", self.config["app_name"], "--no-wait", payload={"update_mask": "resources", "app": {"resources": resources}})
        (self.out / "app-update.json").write_text(json.dumps(result, indent=2))
        print(json.dumps(result), flush=True)

    def stage(self):
        import yaml
        inv = self.inventory
        dest = self.out / "app"
        dest.mkdir(exist_ok=True)
        for folder in ("client", "server", "shared", "dist"):
            if (dest / folder).exists():
                shutil.rmtree(dest / folder)
            shutil.copytree(ROOT / "app" / folder, dest / folder, dirs_exist_ok=True, ignore=shutil.ignore_patterns("__pycache__", "*.pyc", "*.log"))
        for filename in ("package.json", "package-lock.json", "requirements.txt", "server-products.json", "tsconfig.json", "vite.config.ts", "pyproject.toml", "uv.lock", "README.md"):
            if (ROOT / "app" / filename).exists():
                shutil.copy2(ROOT / "app" / filename, dest / filename)
        manifest = yaml.safe_load((ROOT / "app/app.yaml").read_text())
        replacements = {"SHOPIBRICKS_MODEL": self.config["model"], "SHOPIBRICKS_CATALOG": self.config["catalog"], "SHOPIBRICKS_SCHEMA": self.config["schema"], "MLFLOW_EXPERIMENT_ID": inv["experiment_id"], "SHOPIBRICKS_TRACE_TABLE_PREFIX": f"{self.ns}.agent_traces", "MLFLOW_TRACING_SQL_WAREHOUSE_ID": self.config["warehouse_id"], "SHOPIBRICKS_PUBLIC_URL": inv["app_url"], "SHOPIBRICKS_VECTOR_INDEX": f"{self.ns}.products_index", "SHOPIBRICKS_GENIE_SPACE_ID": inv["genie_space_id"], "SHOPIBRICKS_PIPELINE_ID": inv["pipeline_id"]}
        for item in manifest["env"]:
            if item["name"] in replacements:
                item.pop("valueFrom", None)
                item["value"] = str(replacements[item["name"]])
        manifest["env"].append({"name": "SHOPIBRICKS_GATEWAY_API", "value": self.config.get("gateway_api", "native")})
        manifest["env"].append({"name": "SHOPIBRICKS_CDC_ENABLED", "value": str(self.config.get("cdc_enabled", True)).lower()})
        serialized = yaml.safe_dump(manifest, sort_keys=False)
        if "serverless_stable_vwywqi_catalog" in serialized or "7474645565734606" in serialized:
            raise ValueError("Source-workspace binding remains in target manifest")
        (dest / "app.yaml").write_text(serialized)
        print(json.dumps({"staged_app": str(dest), "host": self.config["host"], "namespace": self.ns}), flush=True)

    def cdc(self):
        if not self.config.get("cdc_enabled", True):
            raise RuntimeError("Lakebase CDC is unavailable for this target's Default Storage catalog")
        database = self.inventory["lakebase_database"]
        try:
            configs = self.cli("postgres", "list-cdf-configs", database)
        except RuntimeError as error:
            if not any(term in str(error).lower() for term in ("not found", "not_found", "does not exist")):
                raise
            configs = []
        if not configs:
            self.cli("postgres", "create-cdf-config", database, self.config["catalog"], self.config["schema"], "shopibricks", "--cdf-config-id", "shopibricks", "--no-wait")
            configs = self.cli("postgres", "list-cdf-configs", database)
        config = next(item for item in configs if item["postgres_schema"] == "shopibricks")
        if config["catalog"] != self.config["catalog"] or config["schema"] != self.config["schema"]:
            raise ValueError("Existing CDC configuration targets a different namespace")
        self.inventory["cdf_config"] = config["name"]
        self.save()
        print(json.dumps(self.cli("postgres", "list-cdf-statuses", config["name"])), flush=True)

    def deploy(self):
        subprocess.run(["npm", "run", "build"], cwd=ROOT / "app", check=True, timeout=120)
        self.stage()
        # The staging folder is intentionally ignored by Git. Explicitly include
        # its allowlisted files, while excluding the CLI's own sync metadata.
        subprocess.run(["databricks", "sync", str(self.out / "app"), self.config["source_code_path"],
                        "--include", "**", "--exclude", ".databricks/**", "--profile", self.profile],
                       cwd=ROOT, check=True, timeout=180)
        app = self.cli("apps", "get", self.config["app_name"])
        if app.get("compute_status", {}).get("state") == "STOPPED":
            self.cli("apps", "start", self.config["app_name"], "--no-wait")
        deadline = time.monotonic() + 300
        while app.get("compute_status", {}).get("state") != "ACTIVE":
            if time.monotonic() > deadline:
                raise TimeoutError("Target app compute did not become active within five minutes")
            time.sleep(3)
            app = self.cli("apps", "get", self.config["app_name"])
            if app.get("compute_status", {}).get("state") == "ERROR":
                raise RuntimeError(json.dumps(app["compute_status"]))
        result = self.cli("apps", "deploy", self.config["app_name"], "--source-code-path", self.config["source_code_path"], "--mode", "SNAPSHOT", "--no-wait")
        self.inventory["deployment_id"] = result["deployment_id"]
        self.save()
        print(json.dumps(result), flush=True)

    def finish(self):
        source_ns = "serverless_stable_vwywqi_catalog.shopibricks_laurent"
        self.sql((ROOT / "data/lakebase_views.sql").read_text().replace(source_ns, self.ns))
        self.inventory["cdc_current_orders_view"] = f"{self.ns}.current_orders"
        self.save()
        print(json.dumps({"current_orders": self.inventory["cdc_current_orders_view"]}), flush=True)

    def verify_data(self):
        result = self.sql(f"""SELECT
            (SELECT count(*) FROM {self.ns}.bronze_events) bronze,
            (SELECT count(*) FROM {self.ns}.silver_events) silver,
            (SELECT count(*) FROM {self.ns}.quarantine_events) quarantine,
            (SELECT sum(events) FROM {self.ns}.gold_commerce_daily) gold,
            (SELECT count(*) FROM {self.ns}.silver_events WHERE quantity <= 0 OR revenue_cents < 0 OR NOT is_synthetic) invalid_silver,
            (SELECT count(*) FROM {self.ns}.products) products,
            (SELECT count(*) FROM {self.ns}.customers WHERE is_synthetic) customers,
            (SELECT count(DISTINCT run_id) FROM {self.ns}.bronze_events) stream_runs,
            (SELECT max(event_time) FROM {self.ns}.silver_events) latest_event_at""")
        columns = [column["name"] for column in result["manifest"]["schema"]["columns"]]
        counts = dict(zip(columns, result["result"]["data_array"][0]))
        assert int(counts["bronze"]) == int(counts["silver"]) + int(counts["quarantine"]), counts
        assert int(counts["silver"]) == int(counts["gold"]), counts
        assert int(counts["invalid_silver"]) == 0 and int(counts["products"]) == 12 and int(counts["customers"]) == 2500, counts
        assert int(counts["bronze"]) > 20000 and int(counts["quarantine"]) > 0, counts
        cdc_enabled = self.config.get("cdc_enabled", True)
        statuses = self.cli("postgres", "list-cdf-statuses", self.inventory["cdf_config"]) if cdc_enabled else []
        if cdc_enabled:
            assert len(statuses) == 7 and all(item["state"] == "CDF_STATE_STREAMING" for item in statuses), statuses
        report = {"passed": True, "scope": "analytics_and_cdc" if cdc_enabled else "analytics_only", "counts": counts, "statement_id": result["statement_id"], "cdc": statuses, "cdc_enabled": cdc_enabled}
        if not cdc_enabled:
            report["limitation"] = "Lakebase CDC is not supported with this workspace's Default Storage; no Delta order replication was verified."
        checkout_file = self.out / "verification-checkout.json"
        if checkout_file.exists() and cdc_enabled:
            order = json.loads(checkout_file.read_text())["order"]
            order_id = order["order"]["id"]
            assert all(character.isalnum() or character in "_-" for character in order_id)
            row = self.sql(f"SELECT id,total_cents,status,replicated_at FROM {self.ns}.current_orders WHERE id='{order_id}'")["result"].get("data_array", [])
            assert len(row) == 1 and int(row[0][1]) == next(total["amount"] for total in order["totals"] if total["type"] == "total"), row
            report["replicated_order"] = row[0]
        (self.out / "verification-data.json").write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps(report), flush=True)

    def stream(self, action, minutes):
        job = str(self.inventory["stream_job_id"])
        active = self.cli("jobs", "list-runs", "--job-id", job, "--active-only")
        active = active if isinstance(active, list) else active.get("runs", [])
        if action == "start":
            if active:
                result = {"already_running": [run["run_id"] for run in active]}
            else:
                result = self.cli("jobs", "run-now", "--no-wait", payload={"job_id": int(job), "job_parameters": {"minutes": str(minutes), "history_rows": "0"}})
        else:
            for run in active:
                self.cli("jobs", "cancel-run", str(run["run_id"]), "--no-wait")
            result = {"cancel_requested": [run["run_id"] for run in active], "note": "An in-flight Lakeflow update may finish independently; check status."}
        print(json.dumps(result), flush=True)

    def status(self):
        for label, args in [("lakebase", ("postgres", "get-project", f'projects/{self.config["lakebase_project"]}')),
                            ("vector", ("vector-search-endpoints", "get-endpoint", self.config["vector_endpoint"])),
                            ("app", ("apps", "get", self.config["app_name"]))]:
            try:
                value = self.cli(*args)
                print(json.dumps({"resource": label, "status": value.get("status") or value.get("endpoint_status") or value.get("app_status"), "name": value.get("name"), "compute": value.get("compute_status")}), flush=True)
            except RuntimeError as error:
                print(json.dumps({"resource": label, "error": str(error)}), flush=True)
        if self.inventory.get("pipeline_id"):
            pipeline = self.cli("pipelines", "get", self.inventory["pipeline_id"])
            print(json.dumps({"resource": "pipeline", "state": pipeline.get("state"), "latest_updates": pipeline.get("latest_updates", [])[:2]}), flush=True)
        if self.inventory.get("stream_job_id"):
            runs = self.cli("jobs", "list-runs", "--job-id", str(self.inventory["stream_job_id"]), "--active-only")
            runs = runs if isinstance(runs, list) else runs.get("runs", [])
            print(json.dumps({"resource": "stream", "active_runs": [{"run_id": run["run_id"], "state": run.get("state")} for run in runs]}), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("phase", choices=["audit", "bootstrap", "infrastructure", "status", "bindings", "vector", "traces", "modelcheck", "analytics", "configure", "stage", "deploy", "cdc", "finish", "verify_data", "start", "stop"])
    parser.add_argument("--target", required=True, choices=["emerging-hackathon", "shopibricks-personal"])
    parser.add_argument("--minutes", type=int, default=60)
    options = parser.parse_args()
    deployment = Deployment(options.target)
    if options.phase in ("start", "stop"):
        if not 1 <= options.minutes <= 70:
            parser.error("--minutes must be between 1 and 70")
        deployment.stream(options.phase, options.minutes)
    else:
        getattr(deployment, options.phase)()
