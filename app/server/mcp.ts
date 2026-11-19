import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { z } from 'zod';
import { products, operations } from './db.js';
import { priceCheckout } from './pricing.js';
import { publicUrl } from './db.js';
import { gateway } from './gateway.js';
import { lakehouseMetrics } from './analytics.js';
import {observeMcp,type McpContext} from './mcp-activity.js';
import {saveQuote} from './quotes.js';

const result=(data:unknown)=>({content:[{type:'text' as const,text:JSON.stringify(data)}]});
export function commerceMcp(context?:McpContext){
 const observed=(tool:string,args:Record<string,unknown>,fn:()=>Promise<unknown>)=>observeMcp(context,tool,args,fn).then(result);
 const server=new McpServer({name:'shopibricks-commerce',version:'1.0.0'},{capabilities:{logging:{}}});
 server.registerTool('search_products',{description:'Search the authoritative ShopiBricks Lakebase catalog. Prices are in EUR cents including VAT.',inputSchema:{query:z.string().max(100).default(''),max_price_cents:z.number().int().positive().optional()},annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},async args=>observed('search_products',args,async()=>({products:await products(args.query,args.max_price_cents),source:'Lakebase shopibricks.products'})));
 server.registerTool('get_inventory',{description:'Read live available inventory for product IDs. Never infer stock from a recommendation.',inputSchema:{product_ids:z.array(z.string()).min(1).max(12)},annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},async args=>observed('get_inventory',args,async()=>{const rows=await products();return {inventory:rows.filter(x=>args.product_ids.includes(x.id)).map(({id,name,stock,updated_at})=>({id,name,stock,updated_at})),source:'Lakebase shopibricks.products',checked_at:new Date().toISOString()};}));
 server.registerTool('quote_cart',{description:'Calculate and save a 30-minute quote with an authenticated ShopiBricks continuation link. Does not reserve stock, place an order or charge payment. Present the continuation_url to the shopper.',inputSchema:{items:z.array(z.object({id:z.string(),quantity:z.number().int().min(1).max(10)})).min(1).max(12)},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:false}},async args=>observed('quote_cart',args,async()=>context?saveQuote(context.owner,context.channel,args.items,await products()):priceCheckout('preview',args,await products(),publicUrl())));
 server.registerTool('get_merchant_metrics',{description:'Read live Lakebase order and stock metrics and governed Lakehouse commerce aggregates.',inputSchema:{},annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},async()=>observed('get_merchant_metrics',{},async()=>{const [operational,lakehouse]=await Promise.all([operations(),lakehouseMetrics().catch(e=>({unavailable:true,message:e.message}))]);return {operational,lakehouse};}));
 server.registerTool('semantic_search',{description:'Run hybrid semantic search against the Unity Catalog governed product vector index.',inputSchema:{query:z.string().min(1).max(1000)},annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},async args=>observed('semantic_search',args,()=>gateway({action:'vector',query:args.query})));
 server.registerResource('commerce-policies','shopibricks://policies',{mimeType:'text/plain',description:'ShopiBricks sandbox commerce policies'},async uri=>({contents:[{uri:uri.href,mimeType:'text/plain',text:'ShopiBricks is a synthetic commerce demo. EUR VAT-inclusive prices; delivery to France only. Orders require human confirmation. No real payments, shipping, or emails. Standard delivery is free; express is €9.'}]}));
 server.registerPrompt('weekend-in-paris',{description:'Curate a weekend kit from the live catalog',argsSchema:{budget:z.string().optional()}},args=>({messages:[{role:'user',content:{type:'text',text:`Build a Paris weekend kit under €${args.budget||'250'}. Include one audio product and something to carry. Check live stock and show me the choices.`}}]}));
 return server;
}
export async function callMcp(name:string,args:Record<string,unknown>,context?:McpContext){
 const server=commerceMcp(context);const client=new Client({name:'shopibricks-agent',version:'1.0.0'});const [clientTransport,serverTransport]=InMemoryTransport.createLinkedPair();
 try{await server.connect(serverTransport);await client.connect(clientTransport);const response=await client.callTool({name,arguments:args});if(response.isError)throw new Error(JSON.stringify(response.content));const content=response.content as Array<{type:string;text?:string}>;return JSON.parse(content.find(x=>x.type==='text')?.text||'{}');}
 finally{await client.close();await server.close();}
}
