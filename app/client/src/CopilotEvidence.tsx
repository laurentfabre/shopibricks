import {Fragment} from 'react';
import {useRenderTool,useRenderToolCall} from '@copilotkit/react-core/headless';
import type {AbstractAgent} from '@ag-ui/client';
import {z} from 'zod';
import {CheckCircle2,ExternalLink,Clock} from 'lucide-react';

const quoteResult=z.object({quote_id:z.string().regex(/^q_[0-9a-f-]{36}$/),expires_at:z.string(),totals:z.array(z.object({type:z.string(),amount:z.number()}))});
const inventoryResult=z.object({inventory:z.array(z.object({id:z.string(),stock:z.number()})),checked_at:z.string()});
const parse=(text:unknown)=>{try{return typeof text==='string'?JSON.parse(text):text;}catch{return undefined;}};
export function CopilotEvidence({agent}:{agent:AbstractAgent}){
 useRenderTool({name:'quote_cart',parameters:z.object({items:z.array(z.object({id:z.string(),quantity:z.number()}))}),render:({status,result})=>{
  if(status!=='complete')return <div className="copilot-proof"><Clock size={14}/>Checking the selection total…</div>;
  const quote=quoteResult.safeParse(parse(result));if(!quote.success)return null;
  const total=quote.data.totals.find(t=>t.type==='total')?.amount;
  return <div className="copilot-proof quote"><CheckCircle2 size={16}/><div><strong>Selection saved{total!==undefined?` · €${(total/100).toFixed(2)}`:''}</strong><small>Expires {new Date(quote.data.expires_at).toLocaleTimeString()} · no order placed</small><a href={`/?quote=${quote.data.quote_id}`}>Open your saved quote<ExternalLink size={12}/></a></div></div>;
 }},[]);
 useRenderTool({name:'get_inventory',parameters:z.object({product_ids:z.array(z.string())}),render:({status,result})=>{
  if(status!=='complete')return <div className="copilot-proof"><Clock size={14}/>Checking live inventory…</div>;
  const inventory=inventoryResult.safeParse(parse(result));if(!inventory.success)return null;
  return <div className="copilot-proof"><CheckCircle2 size={14}/><span>Stock checked for {inventory.data.inventory.length} products · {new Date(inventory.data.checked_at).toLocaleTimeString()}</span></div>;
 }},[]);
 const render=useRenderToolCall();
 const calls=agent.messages.flatMap(m=>m.role==='assistant'?m.toolCalls||[]:[]).filter(c=>['quote_cart','get_inventory'].includes(c.function.name)).slice(-3);
 return <div className="copilot-evidence">{calls.map(call=><Fragment key={call.id}>{render({toolCall:call,toolMessage:agent.messages.find(m=>m.role==='tool'&&m.toolCallId===call.id) as Extract<typeof agent.messages[number],{role:'tool'}>|undefined})}</Fragment>)}</div>;
}
