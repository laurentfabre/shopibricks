import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Express, NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { gateway } from './gateway.js';

/*
 Unity Gateway studio: read the governance configuration of the model service this app calls,
 aggregate system.ai_gateway.usage for this workspace, compare models on the ShopiBricks agent task,
 and (optionally) switch the concierge's primary model without redeploying the app.
*/
type Wrap=(fn:(req:Request,res:Response)=>Promise<unknown>)=>(req:Request,res:Response,next:NextFunction)=>void;

export const modelService=()=>process.env.SHOPIBRICKS_MODEL||'system.ai.gpt-6-luna';
// OpenAI models the presenter may promote to the concierge's primary route.
export const ROUTABLE=['gpt-6-luna','gpt-6-1-terra','gpt-6-1-sol','gpt-6-astra'] as const;
export const LAB_MODELS=['gpt-6-luna','gpt-6-1-terra','gpt-6-1-sol','gpt-6-astra','gpt-oss-120b','claude-opus-5-5','claude-sonnet-5-5','gemini-3-8-flash','glm-5-3'] as const;
export const LAB_SCENARIOS=['weekend','weekend_stockout','tight_three','infeasible','gift_oos','work_trip','quote','injection','fr_teen','sustainable','bulk','cheapest'] as const;

// Public Databricks pay-per-token list prices (DBU per 1M tokens: input, output), $0.07/DBU. Same table as ug_bench.py.
const PRICES:Record<string,[number,number]>={'gpt-6-luna':[1.429,7.143],'gpt-6-astra':[142.857,714.286],'gpt-6-1-sol':[28.571,142.857],'gpt-6-sol':[28.571,142.857],'gpt-6-1-terra':[14.286,71.429],'gpt-oss-120b':[2.143,8.571],'claude-opus-5-5':[57.143,285.714],'claude-sonnet-5-5':[28.571,142.857],'gemini-3-8-flash':[10.714,53.571],'glm-5-3':[20,62.857]};
const normalize=(m:string)=>String(m||'').replace(/^models\//,'').replace(/^system\.ai\./,'').replace(/^databricks-/,'').replace(/\./g,'-');
export function estimateCost(model:string,input:number,output:number){const p=PRICES[normalize(model)];return p?((input*p[0]+output*p[1])/1e6)*0.07:null;}

const WINDOWS={'1h':'1 HOUR','24h':'24 HOURS','7d':'7 DAYS'} as const;
// A workspace-scoped view owned by an admin avoids granting account-wide system tables to the app.
const usageTable=()=>{const t=process.env.SHOPIBRICKS_UG_USAGE_TABLE||'system.ai_gateway.usage';if(!/^[\w.`-]+$/.test(t))throw new Error('Invalid usage table.');return t;};
// Never project full principal names on stage: keep the domain, hide the person.
export function maskPrincipal(value:unknown){const v=String(value||'');if(!v)return'unknown';if(v.includes('@')){const [user,domain]=v.split('@');return `${user.slice(0,1)}•••@${domain}`;}return /^[0-9a-f-]{36}$/i.test(v)?`service principal ${v.slice(0,8)}`:v;}

let overviewCache:{value:Record<string,unknown>;at:number}|undefined;
async function overview(force=false){
 if(overviewCache&&!force&&Date.now()-overviewCache.at<60000)return overviewCache.value;
 const value=await gateway({action:'ug_overview',service:modelService()}) as Record<string,unknown>;
 overviewCache={value,at:Date.now()};return value;
}
const usageCache=new Map<string,{value:unknown;at:number}>();
async function sql(statement:string){const result=await gateway({action:'sql',statement}) as {rows?:Record<string,unknown>[];statement_id?:string};return result.rows||[];}

export async function usage(window:keyof typeof WINDOWS,force=false){
 const hit=usageCache.get(window);if(hit&&!force&&Date.now()-hit.at<30000)return hit.value;
 const info=await overview();const workspace=String(info.workspace_id||'');if(!/^\d+$/.test(workspace))throw new Error('Workspace ID unavailable.');
 // A scoped view already filters its workspace; only the raw system table needs it here.
 const scope=`${usageTable()==='system.ai_gateway.usage'?`workspace_id='${workspace}' AND `:''}event_time >= current_timestamp() - INTERVAL ${WINDOWS[window]}`;
 const service=modelService().replace(/'/g,'');
 const consumer=`CASE WHEN session_metadata.coding_agent IS NOT NULL THEN concat('Coding agent · ', session_metadata.coding_agent) WHEN upper(requester_type) LIKE '%SERVICE_PRINCIPAL%' THEN 'Apps & agents (service principals)' ELSE 'People (users)' END`;
 const queries={
  services:`SELECT service_name, destination_model, count(*) AS requests, sum(input_tokens) AS input_tokens, sum(output_tokens) AS output_tokens, percentile_approx(latency_ms,0.5) AS p50_ms, percentile_approx(latency_ms,0.95) AS p95_ms, sum(CASE WHEN status_code>=400 THEN 1 ELSE 0 END) AS errors, sum(CASE WHEN status_code=429 THEN 1 ELSE 0 END) AS throttled, sum(CASE WHEN size(routing_information.attempts)>1 THEN 1 ELSE 0 END) AS rerouted, max(event_time) AS last_event FROM ${usageTable()} WHERE ${scope} AND service_type='MODEL_SERVICE' GROUP BY 1,2 ORDER BY requests DESC LIMIT 25`,
  consumers:`SELECT ${consumer} AS consumer, count(*) AS requests, count(DISTINCT requester) AS principals, sum(total_tokens) AS tokens, count(DISTINCT session_metadata.client_session_id) AS sessions FROM ${usageTable()} WHERE ${scope} GROUP BY 1 ORDER BY requests DESC`,
  concierge:`SELECT event_time, destination_model, status_code, latency_ms, input_tokens, output_tokens, size(routing_information.attempts) AS attempts, api_type FROM ${usageTable()} WHERE ${scope} AND service_name='${service}' ORDER BY event_time DESC LIMIT 15`,
  coding:`SELECT requester, session_metadata.coding_agent AS agent, session_metadata.agent_version AS version, session_metadata.client_session_id AS session_id, destination_model, count(*) AS requests, sum(input_tokens) AS input_tokens, sum(output_tokens) AS output_tokens, min(event_time) AS started, max(event_time) AS last_event FROM ${usageTable()} WHERE ${scope} AND session_metadata.coding_agent IS NOT NULL GROUP BY 1,2,3,4,5 ORDER BY last_event DESC LIMIT 20`,
 };
 const entries=await Promise.all(Object.entries(queries).map(async([k,q])=>{try{return[k,await sql(q)] as const;}catch(e){return[k,{error:e instanceof Error?e.message:'Query failed'}] as const;}}));
 const data=Object.fromEntries(entries) as Record<string,Record<string,unknown>[]|{error:string}>;
 const num=(v:unknown)=>Number(v||0);
 if(Array.isArray(data.services))data.services=data.services.map(r=>({...r,cost_usd:estimateCost(String(r.destination_model),num(r.input_tokens),num(r.output_tokens))}));
 if(Array.isArray(data.coding))data.coding=data.coding.map(r=>({...r,requester:maskPrincipal(r.requester),cost_usd:estimateCost(String(r.destination_model),num(r.input_tokens),num(r.output_tokens))}));
 const value={window,source:usageTable(),workspace_id:workspace,service:modelService(),queried_at:new Date().toISOString(),sql:queries,...data};
 usageCache.set(window,{value,at:Date.now()});return value;
}

function benchSummary(){
 for(const file of [path.resolve('server/bench-latest.json'),path.resolve('../bench/results/latest.json')])if(existsSync(file))return JSON.parse(readFileSync(file,'utf8'));
 return null;
}

let labBusy=false;
export function registerUnityGateway(app:Express,wrap:Wrap){
 app.get('/api/ug/overview',wrap(async(req,res)=>{
  const value=await overview(req.query.refresh==='1');
  const ms=value.model_service as {config?:Record<string,unknown>;error?:string}|undefined;
  res.json({...value,service:modelService(),routable:ROUTABLE,routing_enabled:process.env.SHOPIBRICKS_UG_ALLOW_ROUTING==='1'&&!modelService().startsWith('system.ai.'),config:ms?.config,queried_at:new Date().toISOString()});
 }));
 app.get('/api/ug/usage',wrap(async(req,res)=>{const window=z.enum(['1h','24h','7d']).default('24h').parse(req.query.window);res.json(await usage(window,req.query.refresh==='1'));}));
 app.get('/api/ug/bench',(_req,res)=>{const summary=benchSummary();if(!summary)return res.status(404).json({error:{code:'not_found',message:'No benchmark results are bundled with this build.'}});res.json(summary);});
 app.post('/api/ug/lab',wrap(async(req,res)=>{
  const input=z.object({scenario:z.enum(LAB_SCENARIOS),models:z.array(z.enum(LAB_MODELS)).min(1).max(4)}).parse(req.body);
  if(labBusy)return res.status(409).json({error:{code:'busy',message:'A comparison is already running.'}});
  labBusy=true;try{res.json({...(await gateway({action:'ug_lab',scenario:input.scenario,models:input.models})),ran_at:new Date().toISOString(),via:'Unity Gateway · app service principal'});}finally{labBusy=false;}
 }));
 app.post('/api/ug/route',wrap(async(req,res)=>{
  if(process.env.SHOPIBRICKS_UG_ALLOW_ROUTING!=='1'||modelService().startsWith('system.ai.'))return res.status(403).json({error:{code:'routing_disabled',message:'Live routing changes are disabled for this deployment.'}});
  const input=z.object({primary:z.enum(ROUTABLE)}).parse(req.body);
  await gateway({action:'ug_route',service:modelService(),primary:input.primary});
  overviewCache=undefined;
  res.json({service:modelService(),primary:input.primary,changed_at:new Date().toISOString(),changed_by:res.locals.identity?.label});
 }));
}
