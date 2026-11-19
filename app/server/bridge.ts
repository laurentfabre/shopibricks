import express, {type Request,type Response,type NextFunction} from 'express';
import {createHash} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {LATEST_PROTOCOL_VERSION,SUPPORTED_PROTOCOL_VERSIONS} from '@modelcontextprotocol/sdk/types.js';
import {z} from 'zod';
import {commerceMcp} from './mcp.js';
import {protocolEvent,publicUrl} from './db.js';
import {BridgeError,BridgeOAuth} from './bridge-oauth.js';
import {bridgeStore} from './bridge-store.js';

const safe=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const ids=()=>new Set((process.env.SHOPIBRICKS_BRIDGE_PRINCIPALS||'').split(',').filter(Boolean));
const isBridge=(req:Request)=>ids().has(req.get('x-forwarded-user')||'')||ids().has(req.get('x-forwarded-email')||'');
export function restrictBridgePrincipal(req:Request,res:Response,next:NextFunction){
 if(isBridge(req)&&req.path!=='/bridge/relay')return res.status(403).json({error:'Bridge identity can only call the read-only relay'});
 next();
}
const page=(body:string)=>`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect ShopiBricks</title><style>body{font:17px system-ui;color:#182522;background:#f5f3ee;max-width:560px;margin:9vh auto;padding:32px;line-height:1.6}h1{font-size:34px;line-height:1.15}button{font:inherit;padding:12px 18px;border-radius:8px;border:1px solid #193c31;cursor:pointer;margin:10px 8px 0 0}button[value=allow]{background:#193c31;color:white}small{color:#52665d}code{overflow-wrap:anywhere}</style><main>${body}</main></html>`;
const readOnlyTools=new Set(['search_products','get_inventory','quote_cart','get_merchant_metrics','semantic_search']);

export async function bridgeMcp(body:unknown,owner:string){
 const parsed=z.object({jsonrpc:z.literal('2.0'),id:z.union([z.string().max(200),z.number(),z.null()]).optional(),method:z.string(),params:z.record(z.string(),z.unknown()).optional()}).safeParse(body);
 if(!parsed.success)return{status:400,body:{jsonrpc:'2.0',id:null,error:{code:-32600,message:'Invalid JSON-RPC request'}}};
 const p=parsed.data;
 if(p.method==='notifications/initialized'&&p.id===undefined)return{status:202,body:null};
 const response=(result:unknown)=>({status:200,body:{jsonrpc:'2.0',id:p.id??null,result}});
 const failure=(code:number,message:string)=>({status:200,body:{jsonrpc:'2.0',id:p.id??null,error:{code,message}}});
 if(p.id===undefined)return{status:202,body:null};
 if(p.method==='initialize')return response({protocolVersion:SUPPORTED_PROTOCOL_VERSIONS.includes(String(p.params?.protocolVersion))?p.params?.protocolVersion:LATEST_PROTOCOL_VERSION,capabilities:{tools:{},resources:{},prompts:{}},serverInfo:{name:'shopibricks-personal',version:'1.0.0'},instructions:'Synthetic commerce demo. All tools are read-only; quotes do not place orders. Complete sandbox checkout yourself in the ShopiBricks app.'});
 if(p.method==='ping')return response({});
 if(!['tools/list','tools/call','resources/list','resources/read','prompts/list','prompts/get'].includes(p.method))return failure(-32601,'Method not available');
 if(p.method==='tools/call'&&!readOnlyTools.has(String(p.params?.name)))return failure(-32602,'Only read-only commerce tools are available');
 const server=commerceMcp(),client=new Client({name:'shopibricks-vercel-bridge',version:'1.0.0'});const[a,b]=InMemoryTransport.createLinkedPair();
 try{
  await server.connect(a);await client.connect(b);let result:unknown;
  switch(p.method){
   case'tools/list':{const listing=await client.listTools();result={...listing,tools:listing.tools.filter(tool=>readOnlyTools.has(tool.name))};break;}
   case'tools/call':{
    const args=z.object({name:z.string(),arguments:z.record(z.string(),z.unknown()).optional()}).parse(p.params);
    result=await client.callTool(args);await protocolEvent(createHash('sha256').update(owner).digest('hex'),{type:'CUSTOM',name:'shopibricks.mcp',timestamp:Date.now(),value:{method:'tools/call',tool:args.name,transport:'ChatGPT → Vercel → Databricks App',server:'shopibricks-commerce',read_only:true}});break;
   }
   case'resources/list':result=await client.listResources();break;
   case'resources/read':result=await client.readResource(z.object({uri:z.literal('shopibricks://policies')}).parse(p.params));break;
   case'prompts/list':result=await client.listPrompts();break;
   case'prompts/get':result=await client.getPrompt(z.object({name:z.literal('weekend-in-paris'),arguments:z.record(z.string(),z.string()).optional()}).parse(p.params));break;
  }return response(result);
 }catch{return failure(-32603,'Tool request could not be completed');}finally{await client.close();await server.close();}
}

export function bridgeRouter(){
 const router=express.Router(),issuer=process.env.SHOPIBRICKS_BRIDGE_URL;
 if(!issuer){router.use((_req,res)=>res.status(404).json({error:'Bridge is not configured'}));return router;}
 const oauth=new BridgeOAuth(issuer,bridgeStore);
 // A no-referrer document policy makes browser form POSTs send Origin: null.
 // same-origin retains our consent-origin check and suppresses cross-origin
 // referrers when redirecting back to ChatGPT.
 router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','same-origin');res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https://chatgpt.com; frame-ancestors 'none'; base-uri 'none'");next();});
 // Machine requests always return a JSON envelope so the native Databricks SDK can
 // preserve OAuth/JSON-RPC status without exposing native authentication material.
 router.post('/relay',async(req,res)=>{
  if(!isBridge(req))return res.status(403).json({error:'Dedicated bridge identity required'});
  try{
   const p=z.object({operation:z.enum(['register','token','revoke','mcp']),payload:z.unknown(),access_token:z.string().max(200).optional()}).parse(req.body);
   if(p.operation==='register')return res.json({status:201,body:await oauth.register(p.payload)});
   if(p.operation==='token')return res.json({status:200,body:await oauth.token(p.payload)});
   if(p.operation==='revoke')return res.json({status:200,body:await oauth.revoke(p.payload)});
   const grant=await oauth.verify(p.access_token||'');return res.json(await bridgeMcp(p.payload,grant.owner));
  }catch(e){const known=e instanceof BridgeError;return res.json({status:known?e.status:503,body:{error:known?e.code:'temporarily_unavailable',error_description:known?e.message:'Bridge service unavailable'}});}
 });
 router.use((req,res,next)=>{
  const email=req.get('x-forwarded-email')?.toLowerCase();
  const allowed=(process.env.SHOPIBRICKS_BRIDGE_USERS||'').split(',').map(x=>x.trim().toLowerCase());
  if(!email||!allowed.includes(email))return res.status(403).type('html').send(page('<h1>Access unavailable</h1><p>Sign into the Databricks App with the demo owner account.</p>'));
  res.locals.bridgeOwner=email;next();
 });
 router.get('/authorize',async(req,res)=>{
  try{
   const pending=await oauth.begin(req.query,res.locals.bridgeOwner);
   res.cookie('__Secure-shopibricks_bridge',pending.csrf,{httpOnly:true,secure:true,sameSite:'lax',path:'/bridge',maxAge:300000});
   res.type('html').send(page(`<small>SHOPIBRICKS · PERSONAL DEMO</small><h1>Connect ChatGPT to your demo</h1><p>Signed in as <strong>${safe(res.locals.bridgeOwner)}</strong>.</p><p>Allow ChatGPT to search the synthetic catalog, check stock, calculate quotes and read demo metrics for up to eight hours.</p><p>This connection cannot confirm orders or change inventory. Sandbox checkout stays in ShopiBricks.</p><form method="post" action="/bridge/approve"><input type="hidden" name="request" value="${pending.request}"><input type="hidden" name="csrf" value="${pending.csrf}"><button name="decision" value="allow">Allow read-only access</button><button name="decision" value="deny">Cancel</button></form><p><small>Return destination: ${safe(pending.redirect)}</small></p>`));
  }catch(e){res.status(e instanceof BridgeError?e.status:503).type('html').send(page('<h1>Connection unavailable</h1><p>The authorization request is invalid or expired. Return to ChatGPT and start again.</p>'));}
 });
 router.post('/approve',express.urlencoded({extended:false,limit:'8kb'}),async(req,res)=>{
  let stage:'origin'|'form'|'session'|'grant'='origin';
  try{
   if(req.get('origin')!==new URL(publicUrl()).origin)throw new BridgeError('invalid_request','Invalid approval origin');
   stage='form';
   const p=z.object({request:z.string().regex(/^[A-Za-z0-9_-]{43}$/),csrf:z.string().regex(/^[A-Za-z0-9_-]{43}$/),decision:z.enum(['allow','deny'])}).parse(req.body);
   stage='session';
   const cookie=(req.get('cookie')||'').match(/(?:^|;\s*)__Secure-shopibricks_bridge=([A-Za-z0-9_-]{43})(?:;|$)/)?.[1];
   if(cookie!==p.csrf)throw new BridgeError('invalid_request','Approval session changed');
   stage='grant';
   const redirect=await oauth.approve(p.request,p.csrf,res.locals.bridgeOwner,p.decision==='allow');
   res.clearCookie('__Secure-shopibricks_bridge',{secure:true,httpOnly:true,sameSite:'lax',path:'/bridge'});
   res.redirect(303,redirect);
  }catch(e){
   // Record only a fixed stage and error category, never forms, codes, cookies,
   // user identity or native SDK error messages.
   console.warn(JSON.stringify({event:'bridge.approval_rejected',stage,error:e instanceof BridgeError?e.code:'request_failed'}));
   const title=stage==='grant'&&e instanceof BridgeError?'Approval expired':stage==='session'?'Approval session changed':'Approval could not be verified';
   res.status(400).type('html').send(page(`<h1>${title}</h1><p>Return to ChatGPT and start the connection again in this browser.</p><small>Reference: ${stage}</small>`));
  }
 });
 return router;
}
