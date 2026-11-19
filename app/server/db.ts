import { createLakebasePool } from '@databricks/lakebase';
import type { Pool, PoolClient } from 'pg';
import { readFileSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { checkoutSchema, priceCheckout } from './pricing.js';
import type { Buyer, Checkout, CheckoutInput, Product, ProtocolEvent } from './types.js';

export class CommerceError extends Error { constructor(public status: number, public code: string, message: string) { super(message); } }
let pool: Pool | undefined;
let initPromise: Promise<void> | undefined;
export const publicUrl = () => (process.env.SHOPIBRICKS_PUBLIC_URL || 'http://localhost:8000').replace(/\/$/,'');
export function getPool() {
 if (!process.env.PGHOST || !process.env.LAKEBASE_ENDPOINT) throw new CommerceError(503,'database_unavailable','Lakebase is not configured.');
 if (!pool) pool = createLakebasePool({ max:8,connectionTimeoutMillis:12000,idleTimeoutMillis:30000 });
 return pool;
}
export async function initialize() {
 if (!initPromise) initPromise = migrate().catch(error => {initPromise=undefined; throw error;});
 return initPromise;
}
async function migrate() {
 const p=getPool();
 // Hosted runtime reuses the provisioned schema with DML privileges only.
 // New, empty development databases still bootstrap through the owner below.
 const expected=['products','checkouts','orders','commerce_events','protocol_events','idempotency','threads'];
 const existing=await p.query("SELECT count(*)::int AS count FROM pg_tables WHERE schemaname='shopibricks' AND tablename=ANY($1::text[])",[expected]);
 if(existing.rows[0].count===expected.length)return;
 await p.query(`CREATE SCHEMA IF NOT EXISTS shopibricks;
 CREATE TABLE IF NOT EXISTS shopibricks.products(id TEXT PRIMARY KEY,name TEXT NOT NULL,category TEXT NOT NULL,description TEXT NOT NULL,price_cents INTEGER NOT NULL CHECK(price_cents>=0),currency TEXT NOT NULL DEFAULT 'eur',stock INTEGER NOT NULL CHECK(stock>=0),color TEXT NOT NULL,image_kind TEXT NOT NULL,tags JSONB NOT NULL DEFAULT '[]',updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
 CREATE TABLE IF NOT EXISTS shopibricks.checkouts(id TEXT PRIMARY KEY,owner TEXT NOT NULL,data JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),expires_at TIMESTAMPTZ NOT NULL DEFAULT now()+interval '30 minutes');
 CREATE TABLE IF NOT EXISTS shopibricks.orders(id TEXT PRIMARY KEY,checkout_id TEXT NOT NULL UNIQUE,owner TEXT NOT NULL,total_cents INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'confirmed',items JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now());
 CREATE TABLE IF NOT EXISTS shopibricks.commerce_events(id TEXT PRIMARY KEY,event_type TEXT NOT NULL,product_id TEXT,quantity INTEGER NOT NULL DEFAULT 0,amount_cents INTEGER NOT NULL DEFAULT 0,city TEXT NOT NULL DEFAULT 'Paris',channel TEXT NOT NULL DEFAULT 'agent',payload JSONB NOT NULL DEFAULT '{}',created_at TIMESTAMPTZ NOT NULL DEFAULT now());
 CREATE TABLE IF NOT EXISTS shopibricks.protocol_events(id BIGSERIAL PRIMARY KEY,owner TEXT NOT NULL,run_id TEXT,kind TEXT NOT NULL,payload JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now());
 CREATE INDEX IF NOT EXISTS protocol_events_run ON shopibricks.protocol_events(run_id,id);
 CREATE TABLE IF NOT EXISTS shopibricks.idempotency(owner TEXT NOT NULL,key TEXT NOT NULL,route TEXT NOT NULL,request_hash TEXT NOT NULL,response JSONB NOT NULL,status INTEGER NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),PRIMARY KEY(owner,key,route));
 CREATE TABLE IF NOT EXISTS shopibricks.threads(id TEXT PRIMARY KEY,owner TEXT NOT NULL,messages JSONB NOT NULL DEFAULT '[]',updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
 DO $migration$ DECLARE t record; BEGIN FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='shopibricks' AND tableowner=current_user LOOP EXECUTE format('ALTER TABLE shopibricks.%I REPLICA IDENTITY FULL',t.tablename); END LOOP; END $migration$;`);
 const seed:Product[]=JSON.parse(readFileSync('server-products.json','utf8'));
 for (const x of seed) await p.query(`INSERT INTO shopibricks.products(id,name,category,description,price_cents,currency,stock,color,image_kind,tags) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(id) DO NOTHING`,[x.id,x.name,x.category,x.description,x.price_cents,x.currency,x.stock,x.color,x.image_kind,JSON.stringify(x.tags)]);
}
export async function products(search='',maxPrice?:number):Promise<Product[]> {
 await initialize();
 const terms=search.toLowerCase().split(/\s+/).filter(x=>x.length>2).map(x=>`%${x}%`);
 const {rows}=await getPool().query(`SELECT * FROM shopibricks.products WHERE ($1::text[]='{}' OR name ILIKE ANY($1) OR category ILIKE ANY($1) OR description ILIKE ANY($1) OR tags::text ILIKE ANY($1)) AND ($2::integer IS NULL OR price_cents<=$2) ORDER BY id LIMIT 24`,[terms,maxPrice??null]);
 return rows;
}
export async function transaction<T>(fn:(client:PoolClient)=>Promise<T>):Promise<T>{
 await initialize(); const c=await getPool().connect();
 try {await c.query('BEGIN');const result=await fn(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
export async function idempotent<T>(owner:string,key:string|undefined,route:string,body:unknown,status:number,fn:(c:PoolClient)=>Promise<T>):Promise<T>{
 if (!key || key.length>200) throw new CommerceError(400,'missing_idempotency_key','An Idempotency-Key header is required.');
 const hash=createHash('sha256').update(JSON.stringify(body)).digest('hex');
 return transaction(async c=>{
   await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`${owner}:${route}:${key}`]);
   const {rows}=await c.query('SELECT * FROM shopibricks.idempotency WHERE owner=$1 AND key=$2 AND route=$3',[owner,key,route]);
   if(rows[0]) { if(rows[0].request_hash!==hash) throw new CommerceError(409,'request_not_idempotent','This idempotency key was already used for a different request.');return rows[0].response as T; }
   const response=await fn(c);
   await c.query('INSERT INTO shopibricks.idempotency(owner,key,route,request_hash,response,status) VALUES($1,$2,$3,$4,$5,$6)',[owner,key,route,hash,JSON.stringify(response),status]);
   return response;
 });
}
async function checkoutRow(c:PoolClient,id:string,owner:string){
 const {rows}=await c.query('SELECT * FROM shopibricks.checkouts WHERE id=$1 AND owner=$2 FOR UPDATE',[id,owner]);
 if(!rows[0]) throw new CommerceError(404,'not_found','Checkout session not found.');
 return rows[0];
}
async function priceInTransaction(c:PoolClient,id:string,input:CheckoutInput){
 if(new Set(input.items.map(x=>x.id)).size!==input.items.length)throw new CommerceError(422,'invalid_item','Duplicate product IDs are not allowed.');
 const {rows}=await c.query('SELECT * FROM shopibricks.products WHERE id=ANY($1::text[]) ORDER BY id FOR UPDATE',[input.items.map(x=>x.id)]);
 if(rows.length!==input.items.length)throw new CommerceError(422,'invalid_item','One or more product IDs do not exist.');
 return priceCheckout(id,input,rows,publicUrl());
}
export async function createCheckout(c:PoolClient,owner:string,input:CheckoutInput):Promise<Checkout>{
 const parsed=checkoutSchema.parse(input);const id=`cs_${randomUUID()}`;
 const checkout=await priceInTransaction(c,id,parsed);
 await c.query('INSERT INTO shopibricks.checkouts(id,owner,data) VALUES($1,$2,$3)',[id,owner,JSON.stringify(checkout)]);
 await commerceEvent(c,'checkout.created',null,0,0,{checkout_id:id});
 return checkout;
}
export async function getCheckout(id:string,owner:string):Promise<Checkout>{
 await initialize();const {rows}=await getPool().query('SELECT data FROM shopibricks.checkouts WHERE id=$1 AND owner=$2',[id,owner]);
 if(!rows[0])throw new CommerceError(404,'not_found','Checkout session not found.');return rows[0].data;
}
export async function updateCheckout(c:PoolClient,id:string,owner:string,patch:Partial<CheckoutInput>):Promise<Checkout>{
 const row=await checkoutRow(c,id,owner);const old:Checkout=row.data;
 if(['completed','canceled'].includes(old.status))throw new CommerceError(405,'terminal_checkout','A completed or canceled checkout cannot be changed.');
 if(new Date(row.expires_at)<new Date())throw new CommerceError(410,'expired_checkout','Checkout expired. Create a new checkout to refresh the quote.');
 const input=checkoutSchema.parse({...old,...patch});const data=await priceInTransaction(c,id,input);
 await c.query('UPDATE shopibricks.checkouts SET data=$1,updated_at=now() WHERE id=$2',[JSON.stringify(data),id]);return data;
}
export async function completeCheckout(c:PoolClient,id:string,owner:string,buyer?:Buyer):Promise<Checkout>{
 const row=await checkoutRow(c,id,owner);const old:Checkout=row.data;
 if(old.status==='completed')return old;
 if(old.status==='canceled')throw new CommerceError(405,'terminal_checkout','A canceled checkout cannot be completed.');
 if(new Date(row.expires_at)<new Date())throw new CommerceError(410,'expired_checkout','Checkout expired. Create a new checkout to refresh the quote.');
 if(buyer)old.buyer=buyer;
 if(!old.buyer)throw new CommerceError(422,'missing_buyer','A name and email are required for sandbox checkout.');
 const current=await priceInTransaction(c,id,old);
 if(current.status!=='ready_for_payment') {await c.query('UPDATE shopibricks.checkouts SET data=$1,updated_at=now() WHERE id=$2',[JSON.stringify(current),id]);return current;}
 const previousTotal=old.totals.find(x=>x.type==='total')?.amount;
 const total=current.totals.find(x=>x.type==='total')!.amount;
 if(total!==previousTotal)throw new CommerceError(409,'price_changed','The total changed. Review the updated checkout before confirming.');
 const orderId=`ord_${randomUUID()}`;
 for(const item of current.items){
   await c.query('UPDATE shopibricks.products SET stock=stock-$1,updated_at=now() WHERE id=$2',[item.quantity,item.id]);
   const amount=current.line_items.find(x=>x.item.id===item.id)!.total;
   await commerceEvent(c,'purchase',item.id,item.quantity,amount,{order_id:orderId,checkout_id:id,sandbox:true});
 }
 await c.query('INSERT INTO shopibricks.orders(id,checkout_id,owner,total_cents,items) VALUES($1,$2,$3,$4,$5)',[orderId,id,owner,total,JSON.stringify(current.items)]);
 current.status='completed';current.order={id:orderId,checkout_session_id:id,permalink_url:`${publicUrl()}/?order=${orderId}`};
 await c.query('UPDATE shopibricks.checkouts SET data=$1,updated_at=now() WHERE id=$2',[JSON.stringify(current),id]);
 await commerceEvent(c,'order_created',null,0,total,{type:'order',checkout_session_id:id,permalink_url:current.order.permalink_url,status:'confirmed',refunds:[],sandbox:true});
 return current;
}
export async function cancelCheckout(c:PoolClient,id:string,owner:string):Promise<Checkout>{
 const row=await checkoutRow(c,id,owner);const data:Checkout=row.data;
 if(['completed','canceled'].includes(data.status))throw new CommerceError(405,'terminal_checkout','A completed or canceled checkout cannot be canceled.');
 data.status='canceled';await c.query('UPDATE shopibricks.checkouts SET data=$1,updated_at=now() WHERE id=$2',[JSON.stringify(data),id]);return data;
}
export async function commerceEvent(c:PoolClient,kind:string,productId:string|null,quantity:number,amount:number,payload:unknown){
 await c.query('INSERT INTO shopibricks.commerce_events(id,event_type,product_id,quantity,amount_cents,payload) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),kind,productId,quantity,amount,JSON.stringify(payload)]);
}
export async function protocolEvent(owner:string,event:ProtocolEvent){
 await initialize(); const {rows}=await getPool().query('INSERT INTO shopibricks.protocol_events(owner,run_id,kind,payload) VALUES($1,$2,$3,$4) RETURNING id',[owner,event.runId??null,event.type,JSON.stringify(event)]);return Number(rows[0].id);
}
export async function readEvents(owner:string,after=0,runId?:string){
 await initialize();
 const query=after===0
  ? 'SELECT id,payload FROM (SELECT id,payload FROM shopibricks.protocol_events WHERE owner=$1 AND id>$2 AND ($3::text IS NULL OR run_id=$3) ORDER BY id DESC LIMIT 300) recent ORDER BY id'
  : 'SELECT id,payload FROM shopibricks.protocol_events WHERE owner=$1 AND id>$2 AND ($3::text IS NULL OR run_id=$3) ORDER BY id LIMIT 300';
 const {rows}=await getPool().query(query,[owner,after,runId??null]);
 return rows.map(x=>({...x.payload,id:Number(x.id)}));
}
export async function readExperienceEvents(owner:string){
 await initialize();
 const {rows}=await getPool().query(`SELECT payload FROM shopibricks.protocol_events
   WHERE owner=$1 AND created_at>now()-interval '24 hours'
   AND (kind IN ('RUN_ERROR','RUN_FINISHED') OR payload->>'name' IN ('shopibricks.context','shopibricks.ui','shopibricks.gap','shopibricks.mcp','shopibricks.quote'))
   ORDER BY id DESC LIMIT 5001`,[owner]);
 return {events:rows.slice(0,5000).reverse().map(row=>row.payload as ProtocolEvent),truncated:rows.length>5000};
}
export async function operations(){
 await initialize();const p=getPool();const [metrics,recent,stock,events]=await Promise.all([
 p.query("SELECT count(*)::int orders,coalesce(sum(total_cents),0)::bigint revenue_cents,max(created_at) latest_order_at FROM shopibricks.orders WHERE created_at>now()-interval '24 hours'"),
 p.query('SELECT id,total_cents,status,items,created_at FROM shopibricks.orders ORDER BY created_at DESC LIMIT 8'),
 p.query('SELECT id,name,stock,price_cents FROM shopibricks.products ORDER BY stock LIMIT 6'),
 p.query('SELECT id,event_type,product_id,quantity,amount_cents,city,channel,created_at FROM shopibricks.commerce_events ORDER BY created_at DESC LIMIT 20')]);
 return {metrics:metrics.rows[0],orders:recent.rows,inventory:stock.rows,events:events.rows,source:'Lakebase · shopibricks',as_of:new Date().toISOString()};
}
export async function saveThread(id:string,owner:string,messages:unknown[]){
 await initialize();await getPool().query('INSERT INTO shopibricks.threads(id,owner,messages) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET messages=$3,updated_at=now() WHERE shopibricks.threads.owner=$2',[id,owner,JSON.stringify(messages.slice(-20))]);
}
export async function loadThread(id:string,owner:string):Promise<Array<{role:'user'|'assistant';content:string}>>{
 await initialize();const {rows}=await getPool().query('SELECT owner,messages FROM shopibricks.threads WHERE id=$1',[id]);
 if(rows[0]&&rows[0].owner!==owner)throw new CommerceError(404,'not_found','Conversation not found.');return rows[0]?.messages??[];
}
