import React,{useEffect,useMemo,useState} from 'react';
import {Activity,AlertCircle,ArrowRight,BarChart3,CheckCircle2,Code2,Copy,Database,ExternalLink,FileText,Gauge,KeyRound,Layers,Play,RefreshCw,Route,ShieldCheck,Sparkles,Terminal,Users,Wallet} from 'lucide-react';
import {api,post} from './api';
import {OpenAIMark} from './Brand';
import './gateway.css';

export type DeveloperView='protocols'|'gateway'|'lab'|'codex';
type Row=Record<string,unknown>;
type Destination={name:string;traffic_percentage?:number;pay_per_token_config?:{model?:string}};
type Overview={service:string;identity?:string;workspace_id?:string;config?:{routing?:{destinations?:Destination[];fallback?:{destinations?:Destination[]}};rate_limits?:{key:string;renewal_period:string;requests?:number;tokens?:number;principal?:string}[];inference_table?:{table?:string}};grants?:{privilege_assignments?:{principal:string;privileges:string[]}[]};system_ai_models?:{name:string;api_types:string[]}[];mcp_services?:{name:string;comment:string}[];routable:string[];routing_enabled:boolean;queried_at:string;model_service?:{error?:string}};
type Usage={window:string;queried_at:string;service:string;services?:Row[]|{error:string};consumers?:Row[]|{error:string};concierge?:Row[]|{error:string};coding?:Row[]|{error:string};sql:Record<string,string>};
type BenchModel={model:string;provider:string;runs:number;passed:number;success_rate:number;median_latency_s:number|null;p90_latency_s:number|null;avg_cost_usd:number;cost_per_success_usd:number|null;avg_tokens:number;errors:number;by_scenario:Record<string,number>};
type Bench={generated_at:string;repeats:number;openai_reasoning_effort:string;scenarios:{id:string;title:string;prompt:string}[];pricing_note:string;models:BenchModel[]};
type LabRow={model:string;provider:string;scenario:string;pass:boolean;reasons:string[];latency_s:number;tool_calls:number;usage:{input:number;output:number};cost_usd:number;answer?:{items?:{id:string;quantity:number}[];total_cents?:number;note?:string}|null;error?:string|null};

const OPENAI='#ff3621',OTHER='#2a78c4'; // validated categorical pair (dataviz validate_palette.js, light surface)
const isOpenAI=(provider:string)=>provider.startsWith('OpenAI');
const NAMES:Record<string,string>={'gpt-6-luna':'GPT-6 Luna','gpt-6-astra':'GPT-6 Astra','gpt-6-sol':'GPT-6 Sol','gpt-6-1-sol':'GPT-6.1 Sol','gpt-6-1-terra':'GPT-6.1 Terra','gpt-oss-120b':'gpt-oss-120b','claude-opus-5-5':'Claude Opus 5.5','claude-sonnet-5-5':'Claude Sonnet 5.5','gemini-3-8-flash':'Gemini 3.8 Flash','glm-5-3':'GLM-5.3'};
const prettyModel=(m:string)=>{const k=String(m||'').replace(/^models\//,'').replace(/^system\.ai\./,'').replace(/^databricks-/,'').replace(/\./g,'-');return NAMES[k]||k;};
const usd=(v:number|null|undefined)=>v==null?'—':v<0.01?`$${v.toFixed(4)}`:`$${v.toFixed(3)}`;
const ms=(v:unknown)=>v==null?'—':`${(Number(v)/1000).toFixed(1)} s`;
const num=(v:unknown)=>new Intl.NumberFormat('en-GB').format(Number(v||0));
const clock=(v:unknown)=>v?new Date(String(v)).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}):'—';
const rows=(v:Row[]|{error:string}|undefined)=>Array.isArray(v)?v:[];
const failed=(v:Row[]|{error:string}|undefined)=>v&&!Array.isArray(v)?v.error:undefined;
const modelOf=(d?:Destination)=>(d?.pay_per_token_config?.model||d?.name||'').replace('models/system.ai.databricks-','');

export function DeveloperTabs({view,onView}:{view:DeveloperView;onView:(v:DeveloperView)=>void}){
 return <nav className="studio-tabs" aria-label="Developer studio">{([{id:'protocols',label:'Protocols',icon:Layers},{id:'gateway',label:'Unity Gateway',icon:ShieldCheck},{id:'lab',label:'Model lab',icon:Gauge},{id:'codex',label:'Codex',icon:Terminal}] as const).map(({id,label,icon:Icon})=><button key={id} aria-current={view===id?'page':undefined} onClick={()=>onView(id)}><Icon size={16}/>{label}{id!=='protocols'&&<span className="new-pill">NEW</span>}</button>)}</nav>;
}

export function GatewayStudio({view,workspace}:{view:Exclude<DeveloperView,'protocols'>;workspace?:string}){
 const [overview,setOverview]=useState<Overview>();const [usage,setUsage]=useState<Usage>();const [windowSize,setWindow]=useState<'1h'|'24h'|'7d'>('24h');const [error,setError]=useState('');
 const loadOverview=(refresh=false)=>api<Overview>(`/api/ug/overview${refresh?'?refresh=1':''}`).then(setOverview).catch(e=>setError(e.message));
 const loadUsage=(refresh=false)=>api<Usage>(`/api/ug/usage?window=${windowSize}${refresh?'&refresh=1':''}`).then(setUsage).catch(e=>setError(e.message));
 useEffect(()=>{void loadOverview();},[]);
 useEffect(()=>{if(view==='lab')return;void loadUsage();const id=setInterval(()=>void loadUsage(),30000);return()=>clearInterval(id);},[view,windowSize]);
 const host=workspace?(/^https?:\/\//.test(workspace)?workspace:`https://${workspace}`):'';
 return <div className="gateway-studio">
  {error&&<div className="ug-alert" role="alert"><AlertCircle size={15}/>{error}<button className="text-button" onClick={()=>{setError('');void loadOverview(true);void loadUsage(true);}}>Retry</button></div>}
  {view==='gateway'&&<GatewayView overview={overview} usage={usage} windowSize={windowSize} onWindow={setWindow} onRefresh={()=>{void loadOverview(true);void loadUsage(true);}} onRouted={()=>void loadOverview(true)} host={host}/>}
  {view==='lab'&&<ModelLab overview={overview}/>}
  {view==='codex'&&<CodexView usage={usage} host={host} windowSize={windowSize} onWindow={setWindow} onRefresh={()=>void loadUsage(true)}/>}
 </div>;
}

function WindowPicker({value,onChange}:{value:string;onChange:(v:'1h'|'24h'|'7d')=>void}){return <div className="ug-window" role="group" aria-label="Time window">{(['1h','24h','7d'] as const).map(w=><button key={w} className={value===w?'active':''} onClick={()=>onChange(w)}>{w}</button>)}</div>;}

function GatewayView({overview,usage,windowSize,onWindow,onRefresh,onRouted,host}:{overview?:Overview;usage?:Usage;windowSize:string;onWindow:(v:'1h'|'24h'|'7d')=>void;onRefresh:()=>void;onRouted:()=>void;host:string}){
 const cfg=overview?.config;const primary=cfg?.routing?.destinations||[];const fallback=cfg?.routing?.fallback?.destinations||[];
 const models=overview?.system_ai_models||[];const providers=useMemo(()=>{const groups:Record<string,number>={};for(const m of models){const p=/^gpt|^o\d/.test(m.name)?'OpenAI':/^claude/.test(m.name)?'Anthropic':/^gemini/.test(m.name)?'Google':/^(llama|meta)/.test(m.name)?'Meta':'Open & other';groups[p]=(groups[p]||0)+1;}return Object.entries(groups).sort((a,b)=>b[1]-a[1]);},[models]);
 const services=rows(usage?.services);const consumers=rows(usage?.consumers);const recent=rows(usage?.concierge);
 const spend=services.reduce((s,r)=>s+Number(r.cost_usd||0),0);const totalRequests=services.reduce((s,r)=>s+Number(r.requests||0),0);
 const [routing,setRouting]=useState('');const [routeMsg,setRouteMsg]=useState('');
 async function route(primaryModel:string){setRouting(primaryModel);setRouteMsg('');try{await post('/api/ug/route',{primary:primaryModel});setRouteMsg(`Primary route is now ${prettyModel(primaryModel)}. No code change, no redeploy.`);onRouted();}catch(e){setRouteMsg(e instanceof Error?e.message:'Routing update failed');}finally{setRouting('');}}
 const grants=overview?.grants?.privilege_assignments||[];
 return <>
  <div className="ug-map panel" aria-label="Unity Gateway architecture">
   <div className="ug-map-col"><span className="eyebrow">WHO CALLS</span>{[[Sparkles,'ShopiBricks agents','App service principal'],[Terminal,'Developers in Codex','Their own Databricks identity'],[Users,'Business users','ChatGPT × Genie, Databricks One'],[Layers,'Agent Bricks & apps','Governed agents']].map(([Icon,t,s])=>{const I=Icon as typeof Sparkles;return <div className="ug-node" key={String(t)}><I size={16}/><div><strong>{String(t)}</strong><small>{String(s)}</small></div></div>;})}</div>
   <ArrowRight className="ug-arrow" size={20}/>
   <div className="ug-core"><span className="eyebrow">ONE CONTROL PLANE</span><h3>Unity Gateway</h3><p>Governance built on Unity Catalog, for models, MCP tools and coding agents.</p><div className="ug-chips">{['Identity & grants','Routing & fallback','Rate limits','Budgets','Guardrails','Payload logging','Usage & cost'].map(c=><span key={c}>{c}</span>)}</div></div>
   <ArrowRight className="ug-arrow" size={20}/>
   <div className="ug-map-col"><span className="eyebrow">WHAT IT GOVERNS</span><div className="ug-node"><OpenAIMark/><div><strong>{models.length?`${models.length} model services`:'Model services'}</strong><small>{providers.map(([p,n])=>`${p} ${n}`).join(' · ')||'system.ai'}</small></div></div><div className="ug-node"><Code2 size={16}/><div><strong>{overview?.mcp_services?`${overview.mcp_services.length} MCP services`:'MCP services'}</strong><small>{(overview?.mcp_services||[]).slice(0,4).map(m=>m.name.split('.').pop()).join(', ')||'Governed tools'}</small></div></div><div className="ug-node"><Database size={16}/><div><strong>Unity Catalog data</strong><small>Same permissions, same lineage</small></div></div></div>
  </div>

  <div className="page-subhead"><div><span className="eyebrow">THE SERVICE THIS APP CALLS</span><h2><code>{overview?.service||'Loading…'}</code></h2></div><div className="ug-actions"><WindowPicker value={windowSize} onChange={onWindow}/><button className="icon-button" aria-label="Refresh Unity Gateway data" onClick={onRefresh}><RefreshCw size={16}/></button></div></div>
  {overview?.model_service?.error&&<div className="ug-alert"><AlertCircle size={15}/>{overview.model_service.error}</div>}
  <div className="ug-controls">
   <Control icon={KeyRound} title="Identity & access" status={grants.length?'good':'info'} statusText={grants.length?`${grants.length} explicit grants`:'Inherited Unity Catalog permissions'}>
    <p>Every caller presents its own Databricks identity. Access is an <code>EXECUTE</code> grant on a Unity Catalog securable, not a shared API key.</p>
    <ul className="ug-list">{grants.slice(0,4).map(g=><li key={g.principal}><span>{g.principal.includes('@')?`${g.principal[0]}•••@${g.principal.split('@')[1]}`:g.principal}</span><b>{g.privileges.join(', ')}</b></li>)}{overview?.identity&&<li><span>This app runs as</span><b>{/^[0-9a-f-]{36}$/i.test(overview.identity)?`SP ${overview.identity.slice(0,8)}`:overview.identity.includes('@')?'presenter (local)':overview.identity}</b></li>}</ul>
   </Control>
   <Control icon={Route} title="Routing & fallback" status={primary.length?'good':'info'} statusText={fallback.length?'Automatic failover on 429 / 5xx':'Single destination'}>
    <ul className="ug-list">{primary.map(d=><li key={d.name}><span>Primary</span><b>{prettyModel(modelOf(d))} · {d.traffic_percentage??100}%</b></li>)}{fallback.map((d,i)=><li key={d.name}><span>Fallback {i+1}</span><b>{prettyModel(modelOf(d))}</b></li>)}</ul>
    {overview?.routing_enabled&&<div className="ug-route"><span>Promote a model to primary:</span><div>{overview.routable.map(m=><button key={m} disabled={!!routing||modelOf(primary[0])===m} className={modelOf(primary[0])===m?'active':''} onClick={()=>void route(m)}>{routing===m?'Updating…':prettyModel(m)}</button>)}</div>{routeMsg&&<small>{routeMsg}</small>}</div>}
   </Control>
   <Control icon={Gauge} title="Rate limits" status={cfg?.rate_limits?.length?'good':'info'} statusText={cfg?.rate_limits?.length?'Enforced at the gateway · HTTP 429':'Not configured'}>
    <ul className="ug-list">{(cfg?.rate_limits||[]).map((l,i)=><li key={i}><span>{l.key.replace('RATE_LIMIT_KEY_','').replace('USER_DEFAULT','Each user').replace('SERVICE_PRINCIPAL','Service principal').replace('USER_GROUP','Group').replace('SERVICE','Whole service').toLowerCase().replace(/^\w/,c=>c.toUpperCase())}</span><b>{[l.requests&&`${num(l.requests)} req`,l.tokens&&`${num(l.tokens)} tokens`].filter(Boolean).join(' · ')} / {l.renewal_period.endsWith('HOUR')?'hour':'min'}</b></li>)}</ul>
    <p className="muted">Per user, group or service principal. A runaway agent can't starve the others.</p>
   </Control>
   <Control icon={Wallet} title="Budgets & cost attribution" status="info" statusText={`${usd(spend)} estimated · last ${windowSize}`}>
    <p>Spend is attributed by service, model, principal and tags. Budgets alert or block per user or per tag.</p>
    <ul className="ug-list"><li><span>Requests · last {windowSize}</span><b>{num(totalRequests)}</b></li><li><span>Estimated spend · list price</span><b>{usd(spend)}</b></li></ul>
   </Control>
   <Control icon={ShieldCheck} title="Guardrails" status="info" statusText="Service policies · Beta">
    <p>Built-in, custom and partner policies inspect requests and responses: PII, prompt injection, unsafe content. They are applied per caller identity.</p>
    <p className="muted">The catalog prompt-injection test in the model lab shows why this layer matters.</p>
   </Control>
   <Control icon={FileText} title="Audit & payload logging" status={cfg?.inference_table?.table?'good':'info'} statusText={cfg?.inference_table?.table?'Inference table enabled':'Not configured'}>
    <p>Requests and responses land in a Delta table in Unity Catalog, ready for evaluation, audit and fine-tuning datasets.</p>
    {cfg?.inference_table?.table&&<ul className="ug-list"><li><span>Table</span><b><code>{cfg.inference_table.table.replace('tables/','')}</code></b></li></ul>}
   </Control>
  </div>

  <div className="ug-grid-2">
   <div className="panel"><div className="panel-heading"><h3>Who is calling · last {windowSize}</h3><Users size={18}/></div>
    {failed(usage?.consumers)?<UsageError message={failed(usage?.consumers)!}/>:consumers.length?<div className="ug-table"><div className="ug-th"><span>Consumer</span><span>Requests</span><span>Principals</span><span>Tokens</span></div>{consumers.map(r=><div className="ug-tr" key={String(r.consumer)}><span>{String(r.consumer)}</span><span>{num(r.requests)}</span><span>{num(r.principals)}</span><span>{num(r.tokens)}</span></div>)}</div>:<Empty loading={!usage}/>}
    <div className="source-note">system.ai_gateway.usage · this workspace · as of {clock(usage?.queried_at)}</div></div>
   <div className="panel"><div className="panel-heading"><h3>Concierge requests · live</h3><Activity size={18}/></div>
    {failed(usage?.concierge)?<UsageError message={failed(usage?.concierge)!}/>:recent.length?<div className="ug-table ug-table-5"><div className="ug-th"><span>Time</span><span>Served by</span><span>Status</span><span>Latency</span><span>Attempts</span></div>{recent.map((r,i)=><div className="ug-tr" key={i}><span>{clock(r.event_time)}</span><span>{prettyModel(String(r.destination_model||'').replace(/^databricks-/,''))}</span><span className={Number(r.status_code)>=400?'bad':'good'}>{String(r.status_code)}</span><span>{ms(r.latency_ms)}</span><span>{Number(r.attempts)>1?`${r.attempts} · rerouted`:'1'}</span></div>)}</div>:<Empty loading={!usage} text="Ask the concierge something: each call appears here within minutes."/>}
    <div className="source-note">Usage records land asynchronously, usually within a few minutes.</div></div>
  </div>

  <div className="panel"><div className="panel-heading"><h3>Every model service · last {windowSize}</h3><BarChart3 size={18}/></div>
   {failed(usage?.services)?<UsageError message={failed(usage?.services)!}/>:services.length?<div className="ug-table ug-table-8"><div className="ug-th"><span>Service</span><span>Model</span><span>Requests</span><span>p50</span><span>p95</span><span>Errors · 429</span><span>Rerouted</span><span>Est. cost</span></div>{services.map((r,i)=><div className="ug-tr" key={i}><span><code>{String(r.service_name||'').replace('system.ai.','')}</code></span><span>{prettyModel(String(r.destination_model||'').replace(/^databricks-/,''))}</span><span>{num(r.requests)}</span><span>{ms(r.p50_ms)}</span><span>{ms(r.p95_ms)}</span><span>{num(r.errors)} · {num(r.throttled)}</span><span>{num(r.rerouted)}</span><span>{usd(r.cost_usd as number|null)}</span></div>)}</div>:<Empty loading={!usage}/>}
   <div className="source-note">Cost is estimated from tokens at public Databricks pay-per-token list prices; billing system tables are the source of truth.{host&&<> · <a href={`${host}/ml/ai-gateway`} target="_blank" rel="noreferrer">Open Unity Gateway <ExternalLink size={11}/></a></>}</div></div>
 </>;
}

function Control({icon:Icon,title,status,statusText,children}:{icon:typeof ShieldCheck;title:string;status:'good'|'info';statusText:string;children:React.ReactNode}){
 return <div className="ug-control"><div className="ug-control-head"><span className="protocol-icon"><Icon size={17}/></span><h3>{title}</h3></div>{children}<span className={`status-text ${status==='good'?'good':''}`}>{status==='good'?<CheckCircle2 size={11}/>:<span className="tiny-dot"/>}{statusText}</span></div>;
}
function Empty({loading,text='No traffic in this window yet.'}:{loading?:boolean;text?:string}){return <div className="empty-state ug-empty">{loading?'Reading system.ai_gateway.usage…':text}</div>;}
function UsageError({message}:{message:string}){return <div className="ug-alert"><AlertCircle size={15}/><div><strong>Usage table unavailable.</strong> {message.slice(0,220)}<br/><small>The app service principal needs SELECT on system.ai_gateway.usage.</small></div></div>;}

// ---------------------------------------------------------------- Model lab
function ModelLab({overview}:{overview?:Overview}){
 const [bench,setBench]=useState<Bench>();const [error,setError]=useState('');const [anon,setAnon]=useState(true);
 useEffect(()=>{api<Bench>('/api/ug/bench').then(setBench).catch(e=>setError(e.message));},[]);
 const label=useMemo(()=>{const map=new Map<string,string>();let i=0;for(const m of [...(bench?.models||[])].sort((a,b)=>a.model.localeCompare(b.model)))if(!isOpenAI(m.provider))map.set(m.model,`Model ${String.fromCharCode(65+i++)}`);return(m:string,p:string)=>!isOpenAI(p)&&anon?map.get(m)||'Other model':prettyModel(m);},[bench,anon]);
 const ranked=[...(bench?.models||[])].filter(m=>m.cost_per_success_usd!=null).sort((a,b)=>(a.cost_per_success_usd!)-(b.cost_per_success_usd!));
 const cheapest=ranked[0];
 return <>
  <div className="page-subhead"><div><span className="eyebrow">THE METRIC THAT MATTERS</span><h2>Cost per <em>successful</em> task.<br/>Not price per token.</h2><p className="muted">The same ShopiBricks agent task (search, stock check, budgeted basket, final answer) on every model, through the same Unity Gateway. Each run is graded deterministically: right products, in stock, within budget, exact total, no injected instruction followed.</p></div>
   <label className="ug-toggle"><input type="checkbox" checked={anon} onChange={e=>setAnon(e.target.checked)}/><span>Anonymize non-OpenAI models</span></label></div>
  {error&&<div className="ug-alert"><AlertCircle size={15}/>{error}</div>}
  {bench&&<>
   <div className="metric-grid">
    {cheapest&&<div className="metric"><span className="eyebrow">LOWEST COST PER SUCCESS</span><strong className="ug-hero">{label(cheapest.model,cheapest.provider)}</strong><span className="muted">{usd(cheapest.cost_per_success_usd)} per successful task · {Math.round(cheapest.success_rate*100)}% success</span></div>}
    {(()=>{const best=[...bench.models].sort((a,b)=>b.success_rate-a.success_rate||(a.cost_per_success_usd??9)-(b.cost_per_success_usd??9))[0];return best&&<div className="metric"><span className="eyebrow">HIGHEST SUCCESS RATE</span><strong className="ug-hero">{label(best.model,best.provider)}</strong><span className="muted">{Math.round(best.success_rate*100)}% · {usd(best.cost_per_success_usd)} per success</span></div>;})()}
    {(()=>{const xs=ranked.filter(m=>m.cost_per_success_usd);const spread=xs.length>1?xs[xs.length-1].cost_per_success_usd!/xs[0].cost_per_success_usd!:0;return <div className="metric"><span className="eyebrow">SPREAD, SAME TASK</span><strong className="ug-hero">{spread?`${Math.round(spread)}×`:'—'}</strong><span className="muted">between the cheapest and the most expensive cost per success</span></div>;})()}
    <div className="metric"><span className="eyebrow">RUNS GRADED</span><strong className="ug-hero">{num(bench.models.reduce((s,m)=>s+m.runs,0))}</strong><span className="muted">{bench.scenarios.length} scenarios × {bench.repeats} repeats × {bench.models.length} models</span></div>
   </div>
   <div className="ug-grid-2 ug-grid-lab">
    <div className="panel"><div className="panel-heading"><h3>Success vs cost per successful task</h3><span className="ug-legend"><i style={{background:OPENAI}}/>OpenAI<i className="diamond" style={{background:OTHER}}/>Other providers</span></div><Scatter models={bench.models} label={label}/></div>
    <div className="panel"><div className="panel-heading"><h3>Ranking</h3><span className="eyebrow">CHEAPEST SUCCESS FIRST</span></div>
     <div className="ug-table ug-table-5"><div className="ug-th"><span>Model</span><span>Success</span><span>Cost / success</span><span>Median</span><span>Tokens</span></div>{ranked.map(m=><div className="ug-tr" key={m.model}><span><i className={`ug-dot ${isOpenAI(m.provider)?'':'diamond'}`} style={{background:isOpenAI(m.provider)?OPENAI:OTHER}}/>{label(m.model,m.provider)}</span><span>{Math.round(m.success_rate*100)}%</span><span>{usd(m.cost_per_success_usd)}</span><span>{m.median_latency_s?.toFixed(1)} s</span><span>{num(Math.round(m.avg_tokens))}</span></div>)}</div></div>
   </div>
   <div className="panel"><div className="panel-heading"><h3>Where models fail</h3><span className="eyebrow">PASSES OUT OF {bench.repeats} PER SCENARIO</span></div><Heatmap bench={bench} label={label}/></div>
   <LiveLab scenarios={bench.scenarios} models={bench.models} label={label} service={overview?.service}/>
   <PublicBenchmarks/>
   <div className="data-provenance"><span>Run {bench.generated_at.replace(/T(\d\d)(\d\d).*/,' $1:$2 UTC').replace(/^(\d{4})(\d\d)(\d\d)/,'$1-$2-$3')} · OpenAI reasoning effort “{bench.openai_reasoning_effort}” as in production · OpenAI via Responses API, others via Chat Completions, all through Unity Gateway.</span><span>{bench.pricing_note}</span></div>
  </>}
 </>;
}

function Scatter({models,label}:{models:BenchModel[];label:(m:string,p:string)=>string}){
 const pts=models.filter(m=>m.cost_per_success_usd);const [hover,setHover]=useState<string>();
 const W=560,H=320,L=46,R=16,T=34,B=40;const xs=pts.map(m=>Math.log10(m.cost_per_success_usd!));const x0=Math.floor(Math.min(...xs)),x1=Math.ceil(Math.max(...xs));
 const yMin=Math.max(0,Math.floor(Math.min(...pts.map(m=>m.success_rate))*10)/10-0.1);
 const sx=(v:number)=>L+(Math.log10(v)-x0)/(x1-x0||1)*(W-L-R);const sy=(v:number)=>T+(1-(v-yMin)/(1-yMin))*(H-T-B);
 const ticks=Array.from({length:x1-x0+1},(_,i)=>10**(x0+i));const yt=Array.from({length:Math.round((1-yMin)/0.1)+1},(_,i)=>yMin+i*0.1);
 const h=pts.find(p=>p.model===hover);
 const placed:{x:number;y:number;w:number}[]=[];const pos=new Map<string,{dx:number;dy:number;anchor:'start'|'end'}>();for(const m of [...pts].sort((a,b)=>a.cost_per_success_usd!-b.cost_per_success_usd!)){const x=sx(m.cost_per_success_usd!),y=sy(m.success_rate),w=label(m.model,m.provider).length*6.6+8;const options=[{dx:9,dy:-9,anchor:'start' as const},{dx:9,dy:16,anchor:'start' as const},{dx:-9,dy:-9,anchor:'end' as const},{dx:-9,dy:16,anchor:'end' as const},{dx:9,dy:-22,anchor:'start' as const},{dx:9,dy:29,anchor:'start' as const},{dx:-9,dy:-22,anchor:'end' as const},{dx:-9,dy:29,anchor:'end' as const},{dx:9,dy:42,anchor:'start' as const}];const pick=options.find(o=>{const lx=o.anchor==='start'?x+o.dx:x+o.dx-w,ly=y+o.dy;return lx>=L&&lx+w<=W-R&&ly>=12&&!pts.some(q=>q.model!==m.model&&Math.abs(sy(q.success_rate)-(ly-4))<9&&Math.abs(sx(q.cost_per_success_usd!)-(lx+w/2))<w/2+6)&&!placed.some(p=>Math.abs(p.y-ly)<13&&lx<p.x+p.w&&lx+w>p.x);})||options[0];const lx=pick.anchor==='start'?x+pick.dx:x+pick.dx-w;placed.push({x:lx,y:y+pick.dy,w});pos.set(m.model,pick);}
 return <div className="ug-scatter"><svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Scatter of success rate against cost per successful task, log scale">
  {yt.map(v=><g key={v}><line x1={L} x2={W-R} y1={sy(v)} y2={sy(v)} className="grid"/><text x={L-8} y={sy(v)+3} textAnchor="end" className="axis">{Math.round(v*100)}%</text></g>)}
  {ticks.map(v=><text key={v} x={sx(v)} y={H-B+16} textAnchor="middle" className="axis">{v>=1?`$${v}`:`$${v.toFixed(Math.max(0,-Math.log10(v)))}`}</text>)}
  <text x={(L+W-R)/2} y={H-6} textAnchor="middle" className="axis-title">Cost per successful task (log scale) · lower is better →</text>
  {pts.map(m=>{const x=sx(m.cost_per_success_usd!),y=sy(m.success_rate),oa=isOpenAI(m.provider);return <g key={m.model} onMouseEnter={()=>setHover(m.model)} onMouseLeave={()=>setHover(undefined)} tabIndex={0} onFocus={()=>setHover(m.model)} onBlur={()=>setHover(undefined)}>
   <circle cx={x} cy={y} r={14} fill="transparent"/>
   {oa?<circle cx={x} cy={y} r={6} fill={OPENAI} stroke="#fff" strokeWidth={2}/>:<rect x={x-5.5} y={y-5.5} width={11} height={11} transform={`rotate(45 ${x} ${y})`} fill={OTHER} stroke="#fff" strokeWidth={2}/>}
   {(()=>{const o=pos.get(m.model)!;return <text x={x+o.dx} y={y+o.dy} textAnchor={o.anchor} className="pt-label">{label(m.model,m.provider)}</text>;})()}</g>;})}
 </svg>{h&&<div className="ug-tip" style={{left:`${sx(h.cost_per_success_usd!)/W*100}%`,top:`${sy(h.success_rate)/H*100}%`}}><strong>{label(h.model,h.provider)}</strong><span>{Math.round(h.success_rate*100)}% success · {h.passed}/{h.runs}</span><span>{usd(h.cost_per_success_usd)} per success</span><span>median {h.median_latency_s?.toFixed(1)} s · p90 {h.p90_latency_s?.toFixed(1)} s</span></div>}</div>;
}

function Heatmap({bench,label}:{bench:Bench;label:(m:string,p:string)=>string}){
 const ordered=[...bench.models].sort((a,b)=>b.success_rate-a.success_rate);
 return <div className="ug-heat" style={{gridTemplateColumns:`170px repeat(${bench.scenarios.length},1fr)`}}>
  <span/>{bench.scenarios.map(s=><span key={s.id} className="ug-heat-col" title={s.prompt}>{s.title}</span>)}
  {ordered.map(m=><React.Fragment key={m.model}><span className="ug-heat-row">{label(m.model,m.provider)}</span>{bench.scenarios.map(s=>{const v=m.by_scenario[s.id]??0;return <span key={s.id} className={`ug-cell v${Math.round(v/bench.repeats*3)}`} title={`${label(m.model,m.provider)} · ${s.title}: ${v}/${bench.repeats}`}>{v}</span>;})}</React.Fragment>)}
 </div>;
}

function LiveLab({scenarios,models,label,service}:{scenarios:Bench['scenarios'];models:BenchModel[];label:(m:string,p:string)=>string;service?:string}){
 const [scenario,setScenario]=useState('injection');const [picked,setPicked]=useState<string[]>(['gpt-6-luna','gpt-6-1-terra','gpt-oss-120b']);const [running,setRunning]=useState(false);const [result,setResult]=useState<{rows:LabRow[];ran_at:string}>();const [error,setError]=useState('');
 const provider=(m:string)=>models.find(x=>x.model===m)?.provider||'';
 async function run(){setRunning(true);setError('');setResult(undefined);try{setResult(await api('/api/ug/lab',{scenario,models:picked}));}catch(e){setError(e instanceof Error?e.message:'Run failed');}finally{setRunning(false);}}
 const s=scenarios.find(x=>x.id===scenario);
 return <div className="panel ug-live"><div className="panel-heading"><div><span className="eyebrow">LIVE · THROUGH UNITY GATEWAY</span><h3>Run one scenario now</h3></div><Play size={18}/></div>
  <div className="ug-live-form"><label><span className="eyebrow">SCENARIO</span><select value={scenario} onChange={e=>setScenario(e.target.value)}>{scenarios.map(x=><option key={x.id} value={x.id}>{x.title}</option>)}</select></label>
   <div><span className="eyebrow">MODELS · UP TO 4</span><div className="ug-chip-picker">{models.map(m=><button key={m.model} aria-pressed={picked.includes(m.model)} className={picked.includes(m.model)?'active':''} onClick={()=>setPicked(p=>p.includes(m.model)?p.filter(x=>x!==m.model):p.length<4?[...p,m.model]:p)}><i className={`ug-dot ${isOpenAI(m.provider)?'':'diamond'}`} style={{background:isOpenAI(m.provider)?OPENAI:OTHER}}/>{label(m.model,m.provider)}</button>)}</div></div>
   <button className="primary-button" disabled={running||!picked.length} onClick={()=>void run()}>{running?'Running…':'Run comparison'}</button></div>
  {s&&<blockquote className="ug-prompt">“{s.prompt}”</blockquote>}
  {error&&<div className="ug-alert"><AlertCircle size={15}/>{error}</div>}
  {result&&<div className="ug-live-results">{[...result.rows].sort((a,b)=>Number(b.pass)-Number(a.pass)||a.cost_usd-b.cost_usd).map(r=><div key={r.model} className={`ug-result ${r.pass?'pass':'fail'}`}><div className="ug-result-head"><strong>{label(r.model,provider(r.model))}</strong><span className={r.pass?'good':'bad'}>{r.pass?<><CheckCircle2 size={13}/> Pass</>:<><AlertCircle size={13}/> Fail</>}</span></div>
   <dl><div><dt>Latency</dt><dd>{r.latency_s.toFixed(1)} s</dd></div><div><dt>Tool calls</dt><dd>{r.tool_calls}</dd></div><div><dt>Tokens</dt><dd>{num(r.usage.input+r.usage.output)}</dd></div><div><dt>Cost</dt><dd>{usd(r.cost_usd)}</dd></div></dl>
   {r.answer?.items?.length?<p className="ug-answer">{r.answer.items.map(i=>`${i.quantity}× ${i.id.replace('sb-','')}`).join(' · ')} · €{((r.answer.total_cents||0)/100).toFixed(2)}</p>:r.answer?<p className="ug-answer">{r.answer.note?.slice(0,140)}</p>:null}
   {!r.pass&&<p className="ug-reasons">{r.reasons.join(' · ').slice(0,180)}</p>}</div>)}</div>}
  <div className="source-note">Runs as the app service principal{service?` · same gateway that governs ${service}`:''} · every call is logged in system.ai_gateway.usage.</div>
 </div>;
}

function PublicBenchmarks(){
 const items=[
  {source:'Databricks AI Index · coding agents',href:'https://www.databricks.com/blog/introducing-databricks-ai-index-state-enterprise-ai-tokenomics',headline:'$0.05 per task',detail:'GPT-6 Luna: 89.1% task success at about $0.05 per task, matching Claude Opus 5.5 (89.1%) at $1.62. Private codebase, hidden tests, public list prices.'},
  {source:'Databricks OfficeQA Pro V2',href:'https://www.databricks.com/blog/introducing-officeqa-pro-v2-new-benchmark-enterprise-grounded-reasoning',headline:'2× the accuracy',detail:'GPT-5.6 Sol on Codex: 33.3% at $4.70 per rollout, versus Sonnet 5 on Claude Code: 15.6% at $5.01. Enterprise grounded reasoning.'},
  {source:'OpenAI · GPT-6 Astra',href:'https://openai.com/index/gpt-6-astra-next-generation-work/',headline:'57.9% Terminal-Bench 4.0',detail:'Versus 37.3% for GPT-5.6 Sol, at about 9% lower estimated cost per task. Databricks: “new state of the art on OfficeQA Pro & Pro V2, using our Genie harness.”'},
 ];
 return <div className="ug-public"><div className="page-subhead"><div><span className="eyebrow">PUBLIC BENCHMARKS</span><h2>What published evaluations say</h2></div></div><div className="protocol-cards">{items.map(i=><a key={i.source} className="protocol-card ug-bench-card" href={i.href} target="_blank" rel="noreferrer"><span className="eyebrow">{i.source.toUpperCase()}</span><h3>{i.headline}</h3><p className="muted">{i.detail}</p><span className="text-button">Read the source <ExternalLink size={12}/></span></a>)}</div></div>;
}

// ---------------------------------------------------------------- Codex
function CodexView({usage,host,windowSize,onWindow,onRefresh}:{usage?:Usage;host:string;windowSize:string;onWindow:(v:'1h'|'24h'|'7d')=>void;onRefresh:()=>void}){
 const sessions=rows(usage?.coding);const [copied,setCopied]=useState('');
 const hostname=host.replace(/^https?:\/\//,'')||'<workspace-hostname>';
 const quick=`# one-time: install the ug CLI (Unity Gateway coding-agent quickstart)\ncd shopibricks\nug codex --workspace https://${hostname}`;
 const manual=`# ~/.codex/config.toml\nmodel = "system.ai.gpt-6-1-sol"\nmodel_provider = "databricks"\n\n[model_providers.databricks]\nname = "Databricks Unity Gateway"\nbase_url = "https://${hostname}/ai-gateway/codex/v1"\nwire_api = "responses"\nrequires_openai_auth = false`;
 const copy=(k:string,t:string)=>{void navigator.clipboard.writeText(t);setCopied(k);setTimeout(()=>setCopied(''),1500);};
 const agents=new Set(sessions.map(s=>String(s.agent)));const people=new Set(sessions.map(s=>String(s.requester)));
 const tokens=sessions.reduce((s,r)=>s+Number(r.input_tokens||0)+Number(r.output_tokens||0),0);const spend=sessions.reduce((s,r)=>s+Number(r.cost_usd||0),0);
 return <>
  <div className="page-subhead"><div><span className="eyebrow">CODEX × UNITY GATEWAY</span><h2>Developer agents,<br/><em>governed like production.</em></h2><p className="muted">Codex keeps its own sandbox and approvals for files and shell. Every model request goes through the same Unity Gateway as this app's agents: the developer's identity, granted models only, per-user limits and budgets, and attribution by session.</p></div><div className="ug-actions"><WindowPicker value={windowSize} onChange={onWindow}/><button className="icon-button" aria-label="Refresh coding agent usage" onClick={onRefresh}><RefreshCw size={16}/></button></div></div>
  <div className="metric-grid">
   <div className="metric"><span className="eyebrow">CODING SESSIONS</span><strong className="ug-hero">{num(new Set(sessions.map(s=>String(s.session_id))).size)}</strong><span className="muted">last {windowSize} · this workspace</span></div>
   <div className="metric"><span className="eyebrow">DEVELOPERS</span><strong className="ug-hero">{num(people.size)}</strong><span className="muted">{[...agents].join(', ')||'No coding agents yet'}</span></div>
   <div className="metric"><span className="eyebrow">TOKENS</span><strong className="ug-hero">{num(tokens)}</strong><span className="muted">input + output</span></div>
   <div className="metric"><span className="eyebrow">ESTIMATED SPEND</span><strong className="ug-hero">{usd(spend)}</strong><span className="muted">public list price</span></div>
  </div>
  <div className="ug-grid-2">
   <div className="panel"><div className="panel-heading"><h3>Connect Codex in one command</h3><Terminal size={18}/></div>
    <div className="ug-code"><button className="icon-button" aria-label="Copy quick start" onClick={()=>copy('quick',quick)}>{copied==='quick'?<CheckCircle2 size={14}/>:<Copy size={14}/>}</button><pre>{quick}</pre></div>
    <p className="muted">First run signs you in with Databricks OAuth. <code>/model</code> lists only the models you are granted. <a href="https://docs.databricks.com/aws/en/ai-gateway/coding-agent-codex" target="_blank" rel="noreferrer">Setup guide <ExternalLink size={11}/></a></p>
    <details><summary>Manual config.toml</summary><div className="ug-code"><button className="icon-button" aria-label="Copy config" onClick={()=>copy('manual',manual)}>{copied==='manual'?<CheckCircle2 size={14}/>:<Copy size={14}/>}</button><pre>{manual}</pre></div><p className="muted">Add a Databricks credential as an Authorization header and keep the file private. Prefer <code>ug</code>, which refreshes OAuth for you.</p></details>
   </div>
   <div className="panel"><div className="panel-heading"><h3>What the gateway adds</h3><ShieldCheck size={18}/></div>
    <ul className="ug-checks">{[['One identity','Requests carry the developer’s Databricks identity, not a shared key.'],['Model allow-list','EXECUTE grants decide which models appear in /model.'],['Limits & budgets','Per-user TPM/QPM and spend caps, like any production workload.'],['Attribution','Usage by person, session, agent and version in system tables.'],['Spend in the terminal','`ug usage` shows Unity Gateway dollars spent against the budget.'],['Same MCP governance','Tools exposed to Codex are Unity Catalog MCP services.']].map(([t,d])=><li key={t}><CheckCircle2 size={14}/><div><strong>{t}</strong><span>{d}</span></div></li>)}</ul>
   </div>
  </div>
  <div className="panel"><div className="panel-heading"><h3>Coding agent sessions · last {windowSize}</h3><Code2 size={18}/></div>
   {failed(usage?.coding)?<UsageError message={failed(usage?.coding)!}/>:sessions.length?<div className="ug-table ug-table-7"><div className="ug-th"><span>Developer</span><span>Agent</span><span>Model</span><span>Requests</span><span>Tokens</span><span>Est. cost</span><span>Last</span></div>{sessions.map((r,i)=><div className="ug-tr" key={i}><span>{String(r.requester)}</span><span>{String(r.agent)}{r.version?` ${r.version}`:''}</span><span>{prettyModel(String(r.destination_model||'').replace(/^databricks-/,''))}</span><span>{num(r.requests)}</span><span>{num(Number(r.input_tokens||0)+Number(r.output_tokens||0))}</span><span>{usd(r.cost_usd as number|null)}</span><span>{clock(r.last_event)}</span></div>)}</div>:<Empty loading={!usage} text="Start `ug codex` in this repository: the session appears here within minutes."/>}
   <div className="source-note">system.ai_gateway.usage · session_metadata.coding_agent · developer names are masked on screen.{host&&<> · <a href={`${host}/ml/ai-gateway`} target="_blank" rel="noreferrer">Usage dashboard <ExternalLink size={11}/></a></>}</div></div>
 </>;
}
