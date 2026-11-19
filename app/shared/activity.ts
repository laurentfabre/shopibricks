import {z} from 'zod';
import type {ProtocolEvent} from '../server/types';

export const mcpActivitySchema=z.object({
 version:z.literal(1),call_id:z.string(),tool:z.string(),channel:z.enum(['chatgpt','storefront','mcp']),
 phase:z.enum(['started','completed','failed']),transport:z.string(),
 query:z.string().optional(),product_ids:z.array(z.string()).default([]),
 duration_ms:z.number().nonnegative().optional(),result_count:z.number().nonnegative().optional(),
 quote_id:z.string().optional(),total_cents:z.number().optional(),error:z.string().optional(),
});
export type McpActivity=z.infer<typeof mcpActivitySchema>;
export type ActivityCall=McpActivity&{timestamp:number;runId?:string;eventId?:number};
export function activityCalls(events:ProtocolEvent[]):ActivityCall[]{
 const calls=new Map<string,ActivityCall>();
 for(const event of events){
  if(event.name!=='shopibricks.mcp')continue;
  const parsed=mcpActivitySchema.safeParse(event.value);if(!parsed.success)continue;
  const previous=calls.get(parsed.data.call_id);
  if(previous&&previous.phase!=='started'&&parsed.data.phase==='started')continue;
  calls.set(parsed.data.call_id,{...parsed.data,timestamp:event.timestamp,runId:event.runId,eventId:event.id});
 }
 return [...calls.values()].sort((a,b)=>b.timestamp-a.timestamp);
}
export function mergeEvents(previous:ProtocolEvent[],incoming:ProtocolEvent[],limit=600){
 const byId=new Map<number,ProtocolEvent>();
 for(const event of [...previous,...incoming])if(event.id!==undefined)byId.set(event.id,event);
 return [...byId.values()].sort((a,b)=>a.id!-b.id!).slice(-limit);
}
