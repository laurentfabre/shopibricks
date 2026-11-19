import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {CommerceError,getPool,initialize,products,publicUrl} from './db.js';
import {checkoutSchema,priceCheckout} from './pricing.js';
import type {Item,Product} from './types.js';

export const quoteIdSchema=z.string().regex(/^q_[0-9a-f-]{36}$/);
export type SavedQuote={id:string;owner:string;items:Item[];total_cents:number;channel:string;created_at:string;expires_at:string};
let ready:Promise<void>|undefined;
export async function initializeQuotes(){
 await initialize();
 ready??=getPool().query(`CREATE SCHEMA IF NOT EXISTS shopibricks_journeys;
 CREATE TABLE IF NOT EXISTS shopibricks_journeys.quotes(id TEXT PRIMARY KEY,owner TEXT NOT NULL,items JSONB NOT NULL,total_cents INTEGER NOT NULL,channel TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),expires_at TIMESTAMPTZ NOT NULL);
 CREATE INDEX IF NOT EXISTS quotes_owner_expiry ON shopibricks_journeys.quotes(owner,expires_at);`).then(()=>{}).catch(error=>{ready=undefined;throw error;});
 await ready;
}
export function resolveQuote(quote:SavedQuote|undefined,owner:string,catalog:Product[],now=Date.now()){
 if(!quote||quote.owner!==owner)throw new CommerceError(404,'not_found','Quote not found. Sign in with the account used to connect ChatGPT.');
 if(new Date(quote.expires_at).getTime()<=now)throw new CommerceError(410,'expired_quote','This quote has expired. Ask for a fresh quote or explore the current collection.');
 const current=priceCheckout(quote.id,{items:quote.items},catalog,publicUrl(),new Date(now));
 const total=current.totals.find(t=>t.type==='total')!.amount;
 return {quote_id:quote.id,channel:quote.channel,created_at:quote.created_at,expires_at:quote.expires_at,items:quote.items,
  products:catalog.filter(p=>quote.items.some(i=>i.id===p.id)),quote:current,original_total_cents:quote.total_cents,
  price_changed:total!==quote.total_cents,available:!current.messages.some(m=>m.code==='out_of_stock'),checked_at:new Date(now).toISOString()};
}
export async function saveQuote(owner:string,channel:string,items:Item[],catalog:Product[]){
 const parsed=checkoutSchema.parse({items});const id=`q_${randomUUID()}`;
 const quote=priceCheckout(id,parsed,catalog,publicUrl());const expires=new Date(Date.now()+30*60*1000).toISOString();
 await initializeQuotes();
 await getPool().query('INSERT INTO shopibricks_journeys.quotes(id,owner,items,total_cents,channel,expires_at) VALUES($1,$2,$3,$4,$5,$6)',[id,owner,JSON.stringify(items),quote.totals.find(t=>t.type==='total')!.amount,channel,expires]);
 return {...quote,quote_id:id,expires_at:expires,continuation_url:`${publicUrl()}/?quote=${encodeURIComponent(id)}`,
  continuation_instructions:'Open this link while signed in to the same Databricks account. Price and stock are checked again. Review and explicitly confirm sandbox checkout; this quote does not reserve stock or place an order.'};
}
export async function loadQuote(id:string,owner:string):Promise<SavedQuote|undefined>{
 quoteIdSchema.parse(id);await initializeQuotes();
 const {rows}=await getPool().query('SELECT * FROM shopibricks_journeys.quotes WHERE id=$1 AND owner=$2',[id,owner]);
 const row=rows[0];return row?{...row,created_at:new Date(row.created_at).toISOString(),expires_at:new Date(row.expires_at).toISOString()}:undefined;
}
export async function getQuote(id:string,owner:string){return resolveQuote(await loadQuote(id,owner),owner,await products());}
