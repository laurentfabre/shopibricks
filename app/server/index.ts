import { existsSync } from 'node:fs';
if(existsSync('.env'))process.loadEnvFile('.env');
import express, { type Request, type Response, type NextFunction } from 'express';
import { randomUUID, createHash } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CommerceError,products,initialize,getPool,idempotent,createCheckout,getCheckout,updateCheckout,completeCheckout,cancelCheckout,operations,readEvents,transaction,commerceEvent,protocolEvent } from './db.js';
import { buyerSchema,checkoutSchema } from './pricing.js';
import { runAgent,cancelRun,lastGatewaySuccess } from './agents.js';
import { commerceMcp } from './mcp.js';
import { lakehouseMetrics } from './analytics.js';
import { gateway } from './gateway.js';
import { readExperienceEvents, publicUrl } from './db.js';
import { agentInputSchema, catalogFeed, catalogReadiness, summarizeIntents } from './experience.js';
import { profiles, channels } from '../shared/experience.js';
import { exampleQueries } from '../shared/intelligence.js';
import { activityQueries, buildAtlas } from './intelligence.js';
import { registerUnityGateway } from './unity-gateway.js';

const app=express();app.disable('x-powered-by');
app.use(express.json({limit:'100kb'}));
app.use((req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('Cache-Control','no-store');next();});
function identity(req:Request,res:Response){
 const email=req.get('x-forwarded-email');const user=email||req.get('x-forwarded-user');
 if(user)return{owner:createHash('sha256').update(user).digest('hex'),label:email||user,mode:'Databricks authenticated user'};
 const found=(req.headers.cookie||'').match(/(?:^|;\s*)shopibricks_session=([0-9a-f-]{36})(?:;|$)/)?.[1];const session=found||randomUUID();
 if(!found)res.cookie('shopibricks_session',session,{httpOnly:true,sameSite:'strict',secure:process.env.NODE_ENV==='production',maxAge:86400000});
 return{owner:session,label:'Local development session',mode:'Local developer'};
}
const wrap=(fn:(req:Request,res:Response)=>Promise<unknown>)=>(req:Request,res:Response,next:NextFunction)=>{Promise.resolve(fn(req,res)).catch(next);};
app.use(['/api','/checkout_sessions','/mcp'],(req,res,next)=>{
 const origin=req.get('origin');const expected=`${req.get('x-forwarded-proto')||req.protocol}://${req.get('x-forwarded-host')||req.get('host')}`;
 if(origin && origin!==expected && origin!==process.env.SHOPIBRICKS_PUBLIC_URL)return res.status(403).json({error:{code:'invalid_origin',message:'Cross-origin mutations are not allowed.'}});
 res.locals.identity=identity(req,res);next();
});
app.use(['/checkout_sessions','/api/checkout'],(req,res,next)=>{res.setHeader('Request-Id',req.get('Request-Id')||randomUUID());if(req.get('Idempotency-Key'))res.setHeader('Idempotency-Key',req.get('Idempotency-Key')!);next();});
app.get('/api/whoami',(req,res)=>res.json({...res.locals.identity,execution_identity:'App service principal for shared synthetic commerce data'}));
app.get('/api/health',wrap(async(_req,res)=>{let database='unavailable';let error:string|undefined;try{await initialize();await getPool().query('SELECT 1');database='connected';}catch(e){error=e instanceof Error?e.message:'Connection failed';}res.json({name:'ShopiBricks',database,error,gateway:lastGatewaySuccess?'verified':'configured',last_gateway_success:lastGatewaySuccess,model:process.env.SHOPIBRICKS_MODEL,workspace:process.env.DATABRICKS_HOST,mode:'sandbox',stream_job_id:process.env.SHOPIBRICKS_STREAM_JOB_ID,pipeline_id:process.env.SHOPIBRICKS_PIPELINE_ID,experiment_id:process.env.MLFLOW_EXPERIMENT_ID,vector_index:process.env.SHOPIBRICKS_VECTOR_INDEX,genie_space_id:process.env.SHOPIBRICKS_GENIE_SPACE_ID,acp:'sandbox · merchant onboarding required',mcp:'Streamable HTTP',generative_ui:'AG-UI',timestamp:new Date().toISOString()});}));
app.get('/api/products',wrap(async(req,res)=>{const query=z.string().max(100).parse(req.query.q||'');res.json({products:await products(query),source:'Lakebase · shopibricks.products',as_of:new Date().toISOString()});}));
app.get('/api/catalog/readiness',wrap(async(_req,res)=>res.json({...catalogReadiness(await products()),source:'Lakebase · shopibricks.products',as_of:new Date().toISOString()})));
app.get('/api/catalog/feed',wrap(async(_req,res)=>{res.setHeader('Content-Disposition','attachment; filename="shopibricks-catalog.json"');res.json(catalogFeed(await products(),publicUrl()));}));
app.get('/api/insights',wrap(async(req,res)=>{
 const filters=z.object({profile:z.enum(profiles.map(p=>p.id)).optional(),channel:z.enum(channels.map(c=>c.id)).optional()}).parse(req.query);
 const {events,truncated}=await readExperienceEvents(res.locals.identity.owner);
 res.json({...summarizeIntents(events,filters),truncated,source:'Lakebase · shopibricks.protocol_events',scope:'Your activity · last 24 hours',as_of:new Date().toISOString()});
}));
app.get('/api/intelligence',wrap(async(req,res)=>{
 const input=z.object({source:z.enum(['examples','activity']).default('examples'),clusters:z.coerce.number().int().min(3).max(8).default(6),profile:z.enum(profiles.map(p=>p.id)).optional(),channel:z.enum(channels.map(c=>c.id)).optional()}).parse(req.query);
 const [catalog,recorded]=await Promise.all([products(),input.source==='activity'?readExperienceEvents(res.locals.identity.owner):Promise.resolve({events:[],truncated:false})]);
 const all=input.source==='examples'?exampleQueries():activityQueries(recorded.events);
 const signals=all.filter(q=>(!input.profile||q.profile===input.profile)&&(!input.channel||q.channel===input.channel));
 const captured=recorded.events.filter(e=>e.name==='shopibricks.context'&&typeof (e.value as {query?:unknown}|undefined)?.query==='string').length;
 res.json(buildAtlas(signals,catalog,{source:input.source,clusters:input.clusters,truncated:recorded.truncated||captured>180}));
}));
app.get('/api/operations',wrap(async(_req,res)=>res.json(await operations())));
app.get('/api/orders/:id',wrap(async(req,res)=>{await initialize();const {rows}=await getPool().query('SELECT c.data FROM shopibricks.orders o JOIN shopibricks.checkouts c ON c.id=o.checkout_id WHERE o.id=$1 AND o.owner=$2',[req.params.id,res.locals.identity.owner]);if(!rows[0])throw new CommerceError(404,'not_found','Order not found.');res.json(rows[0].data);}));
app.get('/api/lakehouse',wrap(async(req,res)=>res.json(await lakehouseMetrics(req.query.refresh==='1'))));
app.get('/api/events',wrap(async(req,res)=>{const after=z.coerce.number().int().nonnegative().parse(req.query.after||0);res.json({events:await readEvents(res.locals.identity.owner,after,typeof req.query.runId==='string'?req.query.runId:undefined)});}));
app.post('/api/agent/run',wrap(async(req,res)=>{
 const input=agentInputSchema.parse(req.body);
 await initialize();const owner=res.locals.identity.owner;
 res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache,no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});res.flushHeaders();
 let runId:string|undefined;let ended=false;const heartbeat=setInterval(()=>res.write(': heartbeat\n\n'),10000);
 res.on('close',()=>{if(!ended&&runId)cancelRun(runId,owner);clearInterval(heartbeat);});
 await runAgent(owner,input.message,input.threadId,event=>{if(event.runId)runId=event.runId;if(!res.destroyed)res.write(`data: ${JSON.stringify(event)}\n\n`);},input.experience);
 ended=true;clearInterval(heartbeat);res.end();
}));
app.post('/api/agent/cancel',(req,res)=>{const id=z.string().uuid().parse(req.body.runId);res.json({canceled:cancelRun(id,res.locals.identity.owner)});});

for(const base of ['/api/checkout','/checkout_sessions']){
 app.post(base,wrap(async(req,res)=>{
  const input=checkoutSchema.parse(req.body);const owner=res.locals.identity.owner;const key=req.get('Idempotency-Key');
  const checkout=await idempotent(owner,key,'create',req.body,201,c=>createCheckout(c,owner,input));
  res.setHeader('Idempotency-Key',key!);res.setHeader('Request-Id',req.get('Request-Id')||randomUUID());
  await protocolEvent(owner,{type:'CUSTOM',name:'shopibricks.acp',timestamp:Date.now(),value:{method:'POST',path:'/checkout_sessions',status:201,checkout_id:checkout.id,state:checkout.status}});
  res.status(201).json(checkout);
 }));
 app.get(`${base}/:id`,wrap(async(req,res)=>res.json(await getCheckout(req.params.id,res.locals.identity.owner))));
 app.post(`${base}/:id`,wrap(async(req,res)=>{
  const input=checkoutSchema.partial().parse(req.body);const owner=res.locals.identity.owner;const key=req.get('Idempotency-Key');
  const data=await idempotent(owner,key,`update:${req.params.id}`,req.body,200,c=>updateCheckout(c,req.params.id,owner,input));res.setHeader('Idempotency-Key',key!);res.json(data);
 }));
 app.post(`${base}/:id/complete`,wrap(async(req,res)=>{
  const input=z.object({confirmed:base.startsWith('/api')?z.literal(true):z.literal(true).optional(),buyer:buyerSchema.optional(),payment_data:z.object({provider:z.literal('stripe'),token:z.literal('shopibricks_sandbox')})}).parse(req.body);
  const owner=res.locals.identity.owner;const key=req.get('Idempotency-Key');
  const data=await idempotent(owner,key,`complete:${req.params.id}`,req.body,200,async c=>{
   return completeCheckout(c,req.params.id,owner,input.buyer);
  });
  res.setHeader('Idempotency-Key',key!);await protocolEvent(owner,{type:'CUSTOM',name:'shopibricks.acp',timestamp:Date.now(),value:{method:'POST',path:`/checkout_sessions/${req.params.id}/complete`,status:200,state:data.status,order_id:data.order?.id,sandbox:true}});res.json(data);
 }));
 app.post(`${base}/:id/cancel`,wrap(async(req,res)=>{const owner=res.locals.identity.owner;const key=req.get('Idempotency-Key');const data=await idempotent(owner,key,`cancel:${req.params.id}`,req.body,200,c=>cancelCheckout(c,req.params.id,owner));res.setHeader('Idempotency-Key',key!);res.json(data);}));
}

app.post('/api/demo/scenario',wrap(async(req,res)=>{
 const input=z.object({scenario:z.enum(['stockout','restock','demand']),product_id:z.string().default('sb-headphones')}).parse(req.body);
 const value=await transaction(async c=>{
  const row=await c.query('SELECT * FROM shopibricks.products WHERE id=$1 FOR UPDATE',[input.product_id]);if(!row.rows[0])throw new CommerceError(404,'not_found','Product not found.');
  if(input.scenario!=='demand')await c.query('UPDATE shopibricks.products SET stock=$1,updated_at=now() WHERE id=$2',[input.scenario==='stockout'?0:42,input.product_id]);
  await commerceEvent(c,input.scenario==='demand'?'add_to_cart':input.scenario,input.product_id,input.scenario==='demand'?1:0,0,{source:'presenter',synthetic:true});
  return{scenario:input.scenario,product_id:input.product_id,applied_at:new Date().toISOString(),scope:'Lakebase operational data'};
 });res.json(value);
}));
app.post('/api/demo/start-stream',wrap(async(_req,res)=>res.json(await gateway({action:'job'}))));
app.post('/mcp',wrap(async(req,res)=>{
 const server=commerceMcp();const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
 res.on('close',()=>{void transport.close();void server.close();});
 await server.connect(transport);await transport.handleRequest(req,res,req.body);
 if(req.body?.method==='tools/call')await protocolEvent(res.locals.identity.owner,{type:'CUSTOM',name:'shopibricks.mcp',timestamp:Date.now(),value:{method:req.body.method,tool:req.body.params?.name,transport:'Streamable HTTP',server:'shopibricks-commerce'}});
}));
registerUnityGateway(app,wrap);
app.get('/mcp',(_req,res)=>res.status(405).json({jsonrpc:'2.0',error:{code:-32000,message:'This stateless MCP server uses POST Streamable HTTP.'},id:null}));
app.get('/legal/:page',(_req,res)=>res.type('html').send('<!doctype html><html><title>ShopiBricks sandbox policies</title><body style="font:18px system-ui;max-width:720px;margin:80px auto;line-height:1.8"><h1>ShopiBricks is a demonstration.</h1><p>All catalog and commerce data is synthetic. Orders never collect payment, send email, ship products or create a commercial contract. Use fictional contact details only. Demo conversations and protocol events are stored in the dedicated Databricks Lakebase database for presentation and debugging. This demo is not an approved ChatGPT commerce merchant.</p><a href="/">Back to ShopiBricks</a></body></html>'));
app.use((error:unknown,req:Request,res:Response,_next:NextFunction)=>{
 if(res.headersSent)return;
 const acp=req.path.startsWith('/checkout_sessions');
 if(error instanceof z.ZodError){const body={type:'invalid_request',code:'invalid_request',message:error.issues.map(x=>`${x.path.join('.')}: ${x.message}`).join('; ')};return res.status(422).json(acp?body:{error:body});}
 const e=error as Error;const body={type:error instanceof CommerceError?'invalid_request':'server_error',code:error instanceof CommerceError?error.code:'service_unavailable',message:e.message||'The service is temporarily unavailable.'};res.status(error instanceof CommerceError?error.status:503).json(acp?body:{error:body});
});
if(process.env.NODE_ENV==='production'||existsSync('dist/index.html')){app.use(express.static(path.resolve('dist'),{index:false}));app.get('*',(_req,res)=>res.sendFile(path.resolve('dist/index.html')));}
else{const {createServer}=await import('vite');const vite=await createServer();app.use(vite.middlewares);}
const port=Number(process.env.DATABRICKS_APP_PORT||8000);
app.listen(port,'0.0.0.0',()=>console.log(`ShopiBricks listening on http://localhost:${port}`));
