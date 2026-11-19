import {randomUUID} from 'node:crypto';
import {protocolEvent} from './db.js';
import type {ProtocolEvent} from './types.js';
import type {McpActivity} from '../shared/activity.js';

export type McpContext={owner:string;channel:McpActivity['channel'];transport:string;runId?:string;threadId?:string};
type RecordEvent=(owner:string,event:ProtocolEvent)=>Promise<unknown>;
const record=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'?value as Record<string,unknown>:{};
export function resultSummary(value:unknown){
 const data=record(value);
 const rows=Array.isArray(data.products)?data.products:Array.isArray(data.inventory)?data.inventory:Array.isArray(data.items)?data.items:undefined;
 const total=Array.isArray(data.totals)?data.totals.map(record).find(t=>t.type==='total')?.amount:undefined;
 return {product_ids:rows?rows.map(record).map(p=>p.id).filter((id):id is string=>typeof id==='string').slice(0,24):[],
  ...(rows?{result_count:rows.length}:{}),
  ...(typeof data.quote_id==='string'?{quote_id:data.quote_id}:{}),
  ...(typeof total==='number'?{total_cents:total}:{}),
 };
}
/** Telemetry contains allowlisted commerce fields, never OAuth grants or conversations. */
export async function observeMcp<T>(context:McpContext|undefined,tool:string,args:Record<string,unknown>,execute:()=>Promise<T>,persist:RecordEvent=protocolEvent):Promise<T>{
 if(!context)return execute();
 const started=Date.now(),call_id=randomUUID();
 const base={version:1 as const,call_id,tool,channel:context.channel,transport:context.transport,
  ...(['search_products','semantic_search'].includes(tool)&&typeof args.query==='string'?{query:args.query.slice(0,1000)}:{}),
  product_ids:Array.isArray(args.product_ids)?args.product_ids.filter((id):id is string=>typeof id==='string').slice(0,24):[],
 };
 const emit=async(value:McpActivity)=>{await persist(context.owner,{type:'CUSTOM',name:'shopibricks.mcp',timestamp:Date.now(),runId:context.runId,threadId:context.threadId,value}).catch(()=>console.warn('MCP activity persistence unavailable'));};
 await emit({...base,phase:'started'});
 try{const result=await execute();await emit({...base,...resultSummary(result),phase:'completed',duration_ms:Date.now()-started});return result;}
 catch(error){await emit({...base,phase:'failed',duration_ms:Date.now()-started,error:'Tool execution failed. Inspect the tool response for details.'});throw error;}
}
