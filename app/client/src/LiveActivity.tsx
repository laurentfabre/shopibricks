import {useMemo,useState} from 'react';
import {Activity,ArrowUpRight,Check,Clock,Search,ExternalLink,AlertCircle} from 'lucide-react';
import {activityCalls,type ActivityCall} from '../../shared/activity';
import type {Product,ProtocolEvent} from '../../server/types';
import {ProductArt} from './ProductArt';
import './journey.css';

const money=(n:number)=>new Intl.NumberFormat('en-IE',{style:'currency',currency:'EUR'}).format(n/100);
const channel=(s:string)=>s==='chatgpt'?'ChatGPT':s==='mcp'?'External MCP':'ShopiBricks';
const label=(s:string)=>({search_products:'Catalog search',get_inventory:'Stock check',quote_cart:'Saved quote',semantic_search:'Semantic search',get_merchant_metrics:'Merchant metrics'}[s]||s);
export function LiveActivity({events,status,products,onExplore,onAsk}:{events:ProtocolEvent[];status:string;products:Product[];onExplore:()=>void;onAsk:(text:string)=>void}){
 const[source,setSource]=useState('all');const[selected,setSelected]=useState<string>();
 const calls=useMemo(()=>activityCalls(events),[events]);
 const filtered=calls.filter(c=>source==='all'||c.channel===source);
 const current=filtered.find(c=>c.call_id===selected)||filtered[0];
 const completed=filtered.filter(c=>c.phase==='completed');
 const searches=completed.filter(c=>['search_products','semantic_search'].includes(c.tool));
 const quotes=completed.filter(c=>c.quote_id);
 const continuations=new Set(events.filter(e=>e.name==='shopibricks.quote').map(e=>(e.value as {quote_id:string}).quote_id));
 const continued=quotes.filter(c=>continuations.has(c.quote_id!)).length;
 const latest=filtered[0]?.timestamp;
 return <section className="live-activity">
  <div className="atlas-intro"><div><span className="section-kicker">FROM CONVERSATION TO COMMERCE</span><h1>Every signal.<br className="mobile-break"/> <em>A clearer picture.</em></h1><p>Follow discovery across ChatGPT and your storefront. Inspect the evidence, then act.</p></div><span className={`activity-connection ${status==='live'?'is-live':''}`} role="status"><i/>{status==='live'?'Live event feed':status==='connecting'?'Connecting…':'Reconnecting · showing saved activity'}</span></div>
  <div className="activity-toolbar"><div className="dataset-switch" role="group" aria-label="Activity source">{[['all','All sources'],['chatgpt','ChatGPT'],['storefront','Storefront'],['mcp','External MCP']].map(([id,name])=><button key={id} aria-pressed={source===id} onClick={()=>setSource(id)}>{name}</button>)}</div><button className="quiet-button" onClick={onExplore}><Search size={14}/>Explore intent clusters<ArrowUpRight size={14}/></button></div>
  <div className="activity-kpis">{[['Search calls',searches.length,'Completed catalog + semantic searches'],['Stock checks',completed.filter(c=>c.tool==='get_inventory').length,'Completed authoritative inventory reads'],['Saved quotes',quotes.length,'Temporary selections · no orders'],['Continued in app',continued,'Quotes with a recorded checkout draft']].map(([name,note,detail])=><div key={name}><span>{name}</span><strong>{note}</strong><small>{detail}</small></div>)}</div>
  <p className="activity-provenance">Your authenticated account · latest {events.length} retained protocol events · Lakebase{latest?` · latest call ${new Date(latest).toLocaleTimeString()}`:''}. Counts describe this window, not a conversion rate.</p>
  {filtered.length?<div className="activity-workbench"><div className="activity-list"><div className="activity-list-title"><h2>The discovery trail</h2><span>{filtered.length} calls</span></div>{filtered.slice(0,60).map(c=><button key={c.call_id} onClick={()=>setSelected(c.call_id)} aria-pressed={current?.call_id===c.call_id} className="activity-row"><span className={`activity-step ${c.phase}`}>{c.phase==='completed'?<Check size={16}/>:c.phase==='failed'?<AlertCircle size={16}/>:<Clock size={16}/>}</span><div><span className="activity-row-meta">{channel(c.channel)} · {label(c.tool)}</span><strong>{c.query|| (c.tool==='quote_cart'&&c.total_cents!==undefined?`${money(c.total_cents)} selection` : c.product_ids.map(id=>products.find(p=>p.id===id)?.name||id).join(', ')||label(c.tool))}</strong><small>{c.phase==='completed'?'Completed':c.phase==='failed'?'Failed':'Started · awaiting outcome'}{c.result_count!==undefined?` · ${c.result_count} records returned`:''}{c.duration_ms!==undefined?` · ${(c.duration_ms/1000).toFixed(2)}s`:''}</small></div><time>{new Date(c.timestamp).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</time><ArrowUpRight size={14}/></button>)}</div>{current&&<Evidence call={current} products={products} onAsk={onAsk}/>}</div>:<div className="activity-empty"><Activity size={32}/><h2>Ready for the next conversation.</h2><p>In ChatGPT, use ShopiBricks to find products, check stock, and ask for a quote. The actual calls will appear here automatically.</p><code>Find a weekend kit under €250. Check stock and give me a quote with a link to continue in ShopiBricks.</code><small>Connect using the same account you use to view this app.</small></div>}
  <div className="activity-explainer"><div><strong>What this tells you</strong><p>Search arguments reveal needs. Tool outcomes show catalog response. A quote link connects discovery to a deliberate shopper action.</p></div><div><strong>Keep the distinction clear</strong><p>ChatGPT tool searches are not the full conversation. Returned products are not impressions; a saved quote is not a sale.</p></div></div>
 </section>;
}
function Evidence({call:c,products,onAsk}:{call:ActivityCall;products:Product[];onAsk:(text:string)=>void}){
 return <aside className="activity-evidence"><span className="section-kicker">OBSERVED EVIDENCE</span><h2>{label(c.tool)}</h2><span className="activity-source-chip">{channel(c.channel)} · {c.phase}</span>{c.query&&<blockquote>“{c.query}”</blockquote>}<dl><div><dt>Source</dt><dd>{c.transport}</dd></div><div><dt>Recorded</dt><dd>{new Date(c.timestamp).toLocaleString()}</dd></div>{c.duration_ms!==undefined&&<div><dt>Duration</dt><dd>{c.duration_ms} ms</dd></div>}</dl>{c.error&&<p role="alert">{c.error}</p>}
 {c.product_ids.length>0&&<><h3>Returned catalog IDs</h3>{c.product_ids.slice(0,6).map(id=>{const p=products.find(p=>p.id===id);return <div className="evidence-product" key={id}>{p&&<div className="mini-art"><ProductArt kind={p.image_kind} color={p.color}/></div>}<div><strong>{p?.name||id}</strong><small>{p?`${money(p.price_cents)} · ${p.stock} available now`:id}</small></div></div>;})}<small>Product details above reflect the current catalog.</small></>}
 {c.quote_id&&<a className="primary-button" href={`/?quote=${encodeURIComponent(c.quote_id)}`} target="_blank" rel="noreferrer">Open saved quote<ExternalLink size={14}/></a>}
 {c.query&&<button className="primary-button" onClick={()=>onAsk(`Review this observed ${channel(c.channel)} tool search: ${JSON.stringify(c.query)}. Use the live catalog and inventory to explain any assortment or stock gaps. Do not infer a sale or customer identity.`)}>Ask the merchant copilot<ArrowUpRight size={14}/></button>}
 <details><summary>Inspect recorded payload</summary><pre>{JSON.stringify(c,null,2)}</pre></details><p className="activity-evidence-note">Identity scopes access. The Merchant persona is a demo view, not an authorization role.</p></aside>;
}
