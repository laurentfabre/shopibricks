import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {observeMcp} from '../server/mcp-activity.js';
import {resolveQuote,type SavedQuote} from '../server/quotes.js';
import {activityCalls,mergeEvents} from '../shared/activity.js';
import {activityQueries} from '../server/intelligence.js';
import type {Product,ProtocolEvent} from '../server/types.js';
const catalog:Product[]=JSON.parse(readFileSync('server-products.json','utf8'));
const quote:SavedQuote={id:'q_test',owner:'alice',items:[{id:catalog[0].id,quantity:1}],total_cents:catalog[0].price_cents,channel:'chatgpt',created_at:new Date(0).toISOString(),expires_at:new Date(10000).toISOString()};

test('A continuation is owner-bound, expires, and recalculates stock and price',()=>{
 assert.throws(()=>resolveQuote(quote,'bob',catalog,1),/Quote not found/);
 assert.throws(()=>resolveQuote(undefined,'alice',catalog,1),/Quote not found/);
 assert.throws(()=>resolveQuote(quote,'alice',catalog,10000),/expired/);
 const current=resolveQuote(quote,'alice',catalog.map(p=>({...p,price_cents:p.price_cents+100,stock:0})),1);
 assert.equal(current.price_changed,true);assert.equal(current.available,false);
 assert.equal(current.quote.totals.find(t=>t.type==='total')?.amount,quote.total_cents+100);
 assert.equal(current.original_total_cents,quote.total_cents);
 assert.equal(current.quote.order,undefined);
});
test('MCP telemetry correlates a call and records only allowlisted commerce fields',async()=>{
 const events:ProtocolEvent[]=[];const owners:string[]=[];
 const result=await observeMcp({owner:'alice',channel:'chatgpt',transport:'bridge'},'search_products',{query:'weekend headphones',access_token:'must-not-log'},async()=>({products:[catalog[0]],privateField:'must-not-log'}),async(owner,event)=>{owners.push(owner);events.push(event);});
 assert.equal(result.products[0].id,catalog[0].id);
 assert.deepEqual(owners,['alice','alice']);assert.equal(events.length,2);
 assert.ok(!JSON.stringify(events).includes('must-not-log'));
 const calls=activityCalls(events);assert.equal(calls.length,1);assert.equal(calls[0].phase,'completed');
 assert.equal(calls[0].result_count,1);assert.equal(calls[0].duration_ms!>=0,true);
 const queries=activityQueries(events);assert.equal(queries.length,1);assert.equal(queries[0].profile,undefined);
 assert.equal(queries[0].provenance,'tool_search');assert.equal(queries[0].observed,undefined);
});
test('MCP failures retain source and call correlation without logging sensitive errors',async()=>{
 const events:ProtocolEvent[]=[];
 await assert.rejects(()=>observeMcp({owner:'alice',channel:'mcp',transport:'HTTP'},'get_inventory',{product_ids:['unknown']},async()=>{throw Error('private backend credentials');},async(_,event)=>{events.push(event);}),/private backend/);
 const calls=activityCalls(events);assert.equal(calls[0].phase,'failed');assert.equal(calls.length,1);
 assert.ok(!JSON.stringify(events).includes('private backend'));
 assert.equal(activityQueries(events).length,0);
});
test('Replay deduplicates numeric cursors and preserves terminal call outcomes',()=>{
 const value={version:1,call_id:'a',tool:'quote_cart',channel:'chatgpt',transport:'bridge',product_ids:[]};
 const started:ProtocolEvent={id:8,type:'CUSTOM',name:'shopibricks.mcp',timestamp:1,value:{...value,phase:'started'}};
 const done:ProtocolEvent={id:9,type:'CUSTOM',name:'shopibricks.mcp',timestamp:2,value:{...value,phase:'completed',quote_id:'q_1'}};
 assert.deepEqual(mergeEvents([started,done],[started,done]).map(e=>e.id),[8,9]);
 assert.equal(activityCalls([done,started])[0].phase,'completed');
 assert.equal(mergeEvents([started],[done],1)[0].id,9);
});
test('In-app MCP searches do not duplicate the original shopper prompt in the atlas',async()=>{
 const events:ProtocolEvent[]=[];
 await observeMcp({owner:'alice',channel:'storefront',transport:'local',runId:'r'},'search_products',{query:'headphones'},async()=>({products:catalog}),async(_,event)=>{events.push(event);});
 assert.equal(activityQueries(events).length,0);
 assert.equal(activityCalls(events).length,1);
});
