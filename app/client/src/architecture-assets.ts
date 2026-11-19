// Official assets are inlined so downloaded diagrams are self-contained.
// Provenance and original-file hashes: client/public/brand/SOURCES.json.
import apps from '../public/brand/products/databricks-apps.svg?inline';
import lakebase from '../public/brand/products/lakebase.svg?inline';
import lakeflow from '../public/brand/products/lakeflow.svg?inline';
import unityCatalog from '../public/brand/products/unity-catalog.svg?inline';
import gateway from '../public/brand/products/unity-gateway.svg?inline';
import genie from '../public/brand/products/genie.svg?inline';
import vector from '../public/brand/products/vector-search.svg?inline';
import sql from '../public/brand/products/sql-warehouse.svg?inline';
import agents from '../public/brand/products/custom-agents.svg?inline';
import delta from '../public/brand/products/delta-table.svg?inline';
import mlflow from '../public/brand/products/mlflow.svg?inline';
import copilotkit from '../public/brand/products/copilotkit.svg?inline';
import authentication from '../public/brand/products/authentication.svg?inline';
import databricks from '../public/brand/databricks.svg?inline';
import openai from '../public/brand/openai-blossom.svg?inline';
import openaiWordmark from '../public/brand/openai-wordmark.svg?inline';
export const architectureAssets={apps,lakebase,lakeflow,unityCatalog,gateway,genie,vector,sql,agents,delta,mlflow,copilotkit,authentication,databricks,openai,openaiWordmark};
export type ArchitectureAsset=keyof typeof architectureAssets;
export const componentAssets:Record<string,ArchitectureAsset[]>={
 interface:['apps'],runtime:['copilotkit'],agents:['agents'],gateway:['gateway'],model:['openai'],
 tools:['apps'],lakebase:['lakebase'],genie:['genie'],traces:['mlflow'],lakeflow:['lakeflow'],delta:['delta'],vector:['vector'],sql:['sql'],
 chatgpt:['openai'],consent:['authentication'],mcp:['apps'],catalog:['lakebase'],retrieval:['vector','sql'],events:['lakebase'],merchant:['apps'],quote:['apps'],checkout:['apps'],
};
