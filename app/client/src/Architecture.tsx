import {useRef,useState,type KeyboardEvent} from 'react';
import {ArrowRight,Download,ExternalLink,MessageSquare,Network,Quote,ShieldCheck} from 'lucide-react';
import './architecture.css';
import {architectureAssets,componentAssets,type ArchitectureAsset} from './architecture-assets';

type View='app'|'chatgpt';
type Kind='experience'|'ai'|'data'|'protocol';
type Node={id:string;title:string;subtitle:string;tag:string;x:number;y:number;w?:number;kind:Kind;detail:string;proof:string;resource?:'genie'|'traces'|'pipeline'};
type Edge={from:string;to:string;path:string;label?:string;x?:number;y?:number;dashed?:boolean;both?:boolean};
type Diagram={title:string;description:string;nodes:Node[];edges:Edge[];steps:Array<{node:string;title:string;body:string}>;talk:string};
export type ArchitectureHealth={model?:string;workspace?:string;genie_space_id?:string;experiment_id?:string;pipeline_id?:string;lakebase_cdc?:string};
function diagrams(health?:ArchitectureHealth):Record<View,Diagram>{
 const model=health?.model?.replace(/^system\.ai\./,'')||'Deployment-configured model';
 const modelDetail=health?.model?.includes('gpt-oss')?'This deployment uses OpenAI GPT-OSS served on Databricks. Unity Gateway exposes the Responses API; this is not a direct request to api.openai.com.':'The application calls the deployment-configured OpenAI model through Unity Gateway. The selected Databricks endpoint determines model serving and routing.';
 return {
  app:{title:'The app, its agents and the data platform',description:'Follow a shopper request through the interface, governed inference and authoritative commerce tools. The merchant uses the same foundation for analysis.',
   nodes:[
    {id:'interface',title:'ShopiBricks UI',subtitle:'React · CopilotKit · Driver.js',tag:'DATABRICKS APP',x:60,y:128,w:230,kind:'experience',detail:'The Databricks App serves the shopper, merchant and developer interfaces. CopilotKit carries the current persona, view and bag to the backend; product cards render validated catalog facts.',proof:'Shared state is UI context. Prices, inventory and authorization are checked on the server.'},
    {id:'runtime',title:'CopilotKit runtime',subtitle:'AG-UI runs + shared state',tag:'EXPRESS BACKEND',x:330,y:128,w:230,kind:'ai',detail:'The owner-scoped runtime wraps the existing commerce agent. AG-UI events carry text, tool results, product cards and requested merchant navigation back to the browser.',proof:'Persisted conversation history is isolated by authenticated account, persona, profile, channel and voice.'},
    {id:'agents',title:'Specialist agents',subtitle:'Concierge + four specialists',tag:'CUSTOM APP AGENTS',x:600,y:128,w:230,kind:'ai',detail:'The concierge delegates to Catalog, Inventory, Checkout and Merchant analyst. The server validates selections and checks stock before rendering product cards.',proof:'Developer studio exposes actual delegations, tool arguments and returned results.'},
    {id:'gateway',title:'Unity Gateway',subtitle:'OpenAI Responses API',tag:'GOVERNED INFERENCE',x:920,y:128,w:210,kind:'ai',detail:'The Databricks OpenAI client sends model requests through the configured Unity Gateway route. Native SDK authentication uses the app identity; model access is granted through declared resources.',proof:'The model name comes from this deployment’s health response, not from a diagram default.'},
    {id:'model',title:'OpenAI model',subtitle:model,tag:'MODEL ENDPOINT',x:1170,y:128,w:210,kind:'ai',detail:modelDetail,proof:health?.model?`Configured model: ${health.model}.`:'Model configuration is currently unavailable. The architecture remains available for explanation.'},
    {id:'tools',title:'Commerce MCP',subtitle:'Catalog · stock · quotes',tag:'IN-APP TOOL SERVER',x:600,y:328,w:230,kind:'protocol',detail:'The official MCP SDK exposes catalog search, inventory, temporary quotes, merchant metrics and semantic search. In-app specialists use an in-process MCP transport.',proof:'Inventory is checked in Lakebase. Search retrieval never substitutes for an authoritative stock check.'},
    {id:'lakebase',title:'Lakebase Postgres',subtitle:'Operational commerce state',tag:'LIVE READS & WRITES',x:330,y:328,w:230,kind:'data',detail:'Products, prices, stock, conversations, saved quotes, checkout drafts and protocol events persist in Lakebase. Sandbox order completion uses transactions and idempotency.',proof:'Quotes expire after 30 minutes. Only explicit human confirmation completes sandbox checkout.'},
    {id:'genie',title:'AI/BI Genie',subtitle:'Question → SQL → results',tag:'MERCHANT ANALYST',x:920,y:328,w:210,kind:'ai',detail:'An explicit “Use Genie” request delegates a merchant question to the configured Genie space. The backend retrieves generated SQL and executed query results from the Conversation API.',proof:'Inspect ask_genie, query_results and statement_id in Developer studio. Genie executes as the app service principal.',resource:'genie'},
    {id:'traces',title:'MLflow traces',subtitle:'Model inputs, outputs, tools',tag:'OBSERVABILITY',x:1170,y:328,w:210,kind:'data',detail:'OpenAI SDK autolog captures model calls in the configured MLflow experiment with a Unity Catalog trace destination. Lakebase separately retains the application protocol timeline.',proof:'A recorded application event and a persisted model trace are separate evidence surfaces.',resource:'traces'},
    {id:'lakeflow',title:'Lakeflow',subtitle:'Bounded synthetic microbatches',tag:'ANALYTICS INGESTION',x:60,y:528,w:230,kind:'data',detail:'A bounded demo job writes synthetic campaign events to a Unity Catalog volume. Lakeflow processes bronze, silver and gold datasets for analytical demonstrations.',proof:'Campaign events are fictional. Gold metrics are separate from actual sandbox checkout totals.',resource:'pipeline'},
    {id:'delta',title:'Delta tables',subtitle:'Catalog + gold analytics',tag:'UNITY CATALOG',x:330,y:528,w:230,kind:'data',detail:'Unity Catalog holds the descriptive product catalog and governed analytical tables. Gold demand and daily commerce aggregates support SQL, Genie and dashboards.',proof:health?.lakebase_cdc==='unavailable'?'Lakebase CDC is unavailable on this personal target. The diagram does not imply operational order replication.':'Lakebase CDC is deployment-dependent. Synthetic campaign ingestion is an independent data flow.'},
    {id:'vector',title:'Vector Search',subtitle:'Hybrid catalog retrieval',tag:'GOVERNED INDEX',x:600,y:528,w:230,kind:'data',detail:'Semantic search queries the configured product index using hybrid retrieval. It provides descriptive product matches; current stock and prices come from Lakebase.',proof:'The catalog feeds retrieval. A semantic match is not a purchase or a stock reservation.'},
    {id:'sql',title:'SQL warehouse',subtitle:'Execute governed queries',tag:'ANALYTICAL COMPUTE',x:920,y:528,w:210,kind:'data',detail:'Genie-generated queries and the application’s analytical queries run on the bound SQL warehouse over governed Delta tables.',proof:'Results include query provenance and freshness. Synthetic exposure is not confirmed lost revenue.'},
   ],edges:[
    {from:'interface',to:'runtime',path:'M290 184H330',both:true},
    {from:'runtime',to:'agents',path:'M560 184H600',both:true},
    {from:'agents',to:'gateway',path:'M830 184H920',label:'Responses API',x:875,y:169,both:true},
    {from:'gateway',to:'model',path:'M1130 184H1170',both:true},
    {from:'agents',to:'tools',path:'M715 240V328',label:'MCP tools',x:755,y:288,both:true},
    {from:'tools',to:'lakebase',path:'M600 384H560',both:true},
    {from:'agents',to:'genie',path:'M830 214H876V298H1025V328',label:'Merchant analysis',x:968,y:288},
    {from:'gateway',to:'traces',path:'M1025 240V270H1275V328',label:'SDK autolog',x:1275,y:294,dashed:true},
    {from:'tools',to:'vector',path:'M715 440V528',label:'Hybrid search',x:765,y:488,both:true},
    {from:'lakeflow',to:'delta',path:'M290 584H330'},
    {from:'delta',to:'vector',path:'M560 584H600',label:'Catalog',x:580,y:568},
    {from:'genie',to:'sql',path:'M1025 440V528',label:'Generated SQL',x:1080,y:488,both:true},
    {from:'sql',to:'delta',path:'M1025 640V680H445V640',label:'Queries over governed Delta tables',x:715,y:699},
   ],steps:[
    {node:'interface',title:'Start with a persona',body:'Shopper discovery or merchant analysis.'},
    {node:'gateway',title:'Reason through UG',body:'OpenAI model calls use governed access.'},
    {node:'tools',title:'Ground the answer',body:'MCP, Lakebase, retrieval and Genie.'},
    {node:'traces',title:'Inspect the execution',body:'Protocol events, SQL and model traces.'},
   ],talk:'“CopilotKit connects the experience to our agents. Unity Gateway provides governed OpenAI model access. The tools ground each answer in Databricks data, and Genie turns merchant questions into inspectable SQL.”'},
  chatgpt:{title:'ChatGPT discovery, Databricks execution',description:'A logical integration view: authenticated MCP connects the shopper’s conversation to commerce tools, saved selections and merchant intelligence.',
   nodes:[
    {id:'chatgpt',title:'ChatGPT',subtitle:'Discover · compare · request a quote',tag:'SHOPPER CONVERSATION',x:60,y:128,w:240,kind:'experience',detail:'The shopper selects ShopiBricks in ChatGPT. ChatGPT chooses catalog, stock, quote or analytical tools and uses their returned facts in its response.',proof:'Databricks receives tool arguments and outcomes, not the shopper’s full ChatGPT conversation.'},
    {id:'consent',title:'Account consent',subtitle:'OAuth + approved tool access',tag:'AUTHENTICATED CONNECTION',x:60,y:328,w:240,kind:'protocol',detail:'The connection requests explicit consent and binds commerce activity and saved quotes to the signed-in account. This logical view abstracts authentication transport.',proof:'The grant permits catalog, inventory and metrics reads plus temporary quote storage. It does not permit order confirmation.'},
    {id:'mcp',title:'ShopiBricks MCP',subtitle:'Five bounded commerce tools',tag:'DATABRICKS APP',x:420,y:128,w:250,kind:'protocol',detail:'The Databricks App executes search_products, get_inventory, quote_cart, semantic_search and get_merchant_metrics. The external tool surface cannot complete checkout.',proof:'Four tools are read-only. quote_cart saves a temporary selection and returns its authenticated continuation URL.'},
    {id:'catalog',title:'Lakebase',subtitle:'Catalog · stock · saved quotes',tag:'AUTHORITATIVE STATE',x:730,y:128,w:250,kind:'data',detail:'Commerce tools read current product prices and inventory from Lakebase. Quotes retain the exact selection, initial total, source, account and expiry.',proof:'A quote does not reserve stock or place an order. Current price and stock are rechecked on continuation.'},
    {id:'retrieval',title:'Search & analytics',subtitle:'Vector Search · SQL',tag:'UNITY CATALOG',x:1040,y:128,w:320,kind:'data',detail:'Semantic product retrieval uses the governed vector index. Merchant metrics combine operational Lakebase facts with explicitly separated Lakehouse aggregates.',proof:'The ChatGPT bridge does not expose ask_genie. Genie is available through the in-app merchant analyst.'},
    {id:'events',title:'MCP activity',subtitle:'Start · outcome · call ID',tag:'PERSISTED IN LAKEBASE',x:420,y:352,w:250,kind:'data',detail:'The server records a correlated start and outcome for each executed tool call, including source, duration, bounded result IDs and quote references.',proof:'This is application telemetry around MCP calls. It does not push unsolicited messages into ChatGPT.'},
    {id:'merchant',title:'Merchant intelligence',subtitle:'Live journeys + intent atlas',tag:'SHOPIBRICKS UI',x:730,y:352,w:250,kind:'experience',detail:'The merchant sees account-scoped events through a separate SSE feed. Captured ChatGPT search arguments join the intent atlas with their source clearly labeled.',proof:'These counts describe the retained event window. Returned products are not impressions and quotes are not sales.'},
    {id:'quote',title:'Saved quote link',subtitle:'Continue in ShopiBricks',tag:'SAME ACCOUNT · 30 MINUTES',x:730,y:556,w:250,kind:'experience',detail:'ChatGPT returns a link to the saved selection. The shopper opens ShopiBricks with the same account, sees current prices and stock, then chooses whether to create a checkout draft.',proof:'Opening the link creates no checkout. Changed totals and unavailable stock are shown before continuation.'},
    {id:'checkout',title:'Sandbox checkout',subtitle:'Review → explicit confirmation',tag:'HUMAN DECISION',x:1040,y:556,w:320,kind:'protocol',detail:'The existing ACP-shaped checkout handles delivery, review and explicit confirmation inside ShopiBricks. Completion creates a fictional order and changes demo inventory.',proof:'No real payment or shipment occurs. This is not native ChatGPT merchant checkout.'},
   ],edges:[
    {from:'chatgpt',to:'mcp',path:'M300 184H420',label:'MCP / OAuth',x:360,y:169,both:true},
    {from:'consent',to:'mcp',path:'M300 384H350V214H420',dashed:true},
    {from:'mcp',to:'catalog',path:'M670 184H730',both:true},
    {from:'mcp',to:'retrieval',path:'M545 240V280H1200V240',label:'Hybrid search + governed metrics',x:930,y:271,both:true},
    {from:'mcp',to:'events',path:'M545 240V352',label:'Call outcomes',x:595,y:322},
    {from:'events',to:'merchant',path:'M670 408H730',label:'SSE',x:700,y:393},
    {from:'catalog',to:'quote',path:'M980 214H1008V518H855V556',label:'Saved selection',x:1080,y:504},
    {from:'quote',to:'chatgpt',path:'M730 612H366V214H300',label:'Continuation link returned to the shopper',x:545,y:635,dashed:true},
    {from:'quote',to:'checkout',path:'M980 612H1040'},
   ],steps:[
    {node:'chatgpt',title:'Ask in ChatGPT',body:'Find products and check current stock.'},
    {node:'mcp',title:'Execute in Databricks',body:'Authenticated tools return catalog facts.'},
    {node:'merchant',title:'See the demand signal',body:'Inspect calls and cluster search intent.'},
    {node:'quote',title:'Continue the selection',body:'Open the quote and review checkout.'},
   ],talk:'“The conversation starts in ChatGPT. Databricks executes the commerce tools and records the evidence. The merchant sees real discovery signals, while the shopper can carry a saved selection into an explicitly reviewed checkout.”'},
 };
}

export function Architecture({health,onInspect}:{health?:ArchitectureHealth;onInspect:()=>void}){
 const[view,setView]=useState<View>(()=>new URLSearchParams(location.search).get('diagram')==='chatgpt'?'chatgpt':'app');
 const[selected,setSelected]=useState<string>();const[exportError,setExportError]=useState('');const svg=useRef<SVGSVGElement>(null);
 const diagram=diagrams(health)[view];const node=diagram.nodes.find(n=>n.id===selected)||diagram.nodes[0];
 function selectView(next:View){setView(next);setSelected(undefined);setExportError('');}
 function tabKey(event:KeyboardEvent<HTMLButtonElement>){if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?'app':event.key==='End'?'chatgpt':view==='app'?'chatgpt':'app';selectView(next);document.getElementById(`architecture-tab-${next}`)?.focus();}}
 function download(){try{if(!svg.current)return;const copy=svg.current.cloneNode(true) as SVGSVGElement;copy.setAttribute('xmlns','http://www.w3.org/2000/svg');copy.setAttribute('width','1460');copy.setAttribute('height','840');copy.removeAttribute('role');copy.querySelectorAll('[role="button"]').forEach(n=>{n.removeAttribute('role');n.removeAttribute('tabindex');});const blob=new Blob([new XMLSerializer().serializeToString(copy)],{type:'image/svg+xml;charset=utf-8'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`shopibricks-architecture-${view}.svg`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch{setExportError('Diagram download is unavailable. Please try again.');}}
 const host=health?.workspace?`${/^https:\/\//.test(health.workspace)?health.workspace:`https://${health.workspace}`}`.replace(/\/$/,''):undefined;
 const link=node.resource==='genie'&&health?.genie_space_id?`/genie/rooms/${health.genie_space_id}`:node.resource==='traces'&&health?.experiment_id?`/ml/experiments/${health.experiment_id}`:node.resource==='pipeline'&&health?.pipeline_id?`/pipelines/${health.pipeline_id}`:undefined;
 return <section className="architecture-page" aria-label="ShopiBricks architecture">
  <div className="architecture-intro"><div><span className="section-kicker">FROM EXPERIENCE TO EXECUTION</span><h1>ShopiBricks architecture</h1><p>Applications, AI and governed data on the Databricks platform.</p></div><div className="architecture-brand"><img src={architectureAssets.databricks} alt="Databricks"/><span>×</span><img src={architectureAssets.openaiWordmark} alt="OpenAI"/></div></div>
  <div className="architecture-toolbar"><div className="architecture-tabs" role="tablist" aria-label="Architecture diagram">{([{id:'app',label:'App & Databricks',icon:Network},{id:'chatgpt',label:'ChatGPT & Databricks',icon:MessageSquare}] as const).map(({id,label,icon:Icon},i)=><button key={id} role="tab" id={`architecture-tab-${id}`} aria-controls="architecture-panel" aria-selected={view===id} tabIndex={view===id?0:-1} onKeyDown={tabKey} onClick={()=>selectView(id)}><span>0{i+1}</span><Icon size={16}/>{label}</button>)}</div><button className="quiet-button" onClick={download}><Download size={14}/>Download SVG</button></div>
  {exportError&&<p role="alert">{exportError}</p>}
  <div id="architecture-panel" role="tabpanel" aria-labelledby={`architecture-tab-${view}`}>
   <div className="architecture-diagram-heading"><div><h2>{diagram.title}</h2><p>{diagram.description}</p></div><span className="architecture-logical">LOGICAL ARCHITECTURE</span></div>
   <div className="architecture-canvas">
    <svg ref={svg} viewBox="0 0 1460 840" role="group" aria-labelledby="architecture-svg-title architecture-svg-description" style={{fontFamily:'Arial, sans-serif',background:'#ffffff'}}>
     <title id="architecture-svg-title">{diagram.title}</title><desc id="architecture-svg-description">{diagram.description} Select a component for details. Databricks reference architecture layout with official product artwork. Connections are logical; authentication transport is abstracted.</desc>
     <defs><marker id="architecture-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="#5b6b73"/></marker><marker id="architecture-arrow-active" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="#ff3621"/></marker></defs>
     <rect width="1460" height="840" fill="#ffffff"/>
     {view==='app'?<>
      <rect x="28" y="28" width="1404" height="780" rx="4" fill="#ffffff" stroke="#ff3621" strokeWidth="1.6"/>
      <image data-brand="databricks" href={architectureAssets.databricks} x="52" y="47" width="146" height="28" preserveAspectRatio="xMinYMid meet"/>
      <text x="224" y="67" fontSize="17" fill="#1b3139" fontWeight="600">Data Intelligence Platform</text>
      <text x="1380" y="65" textAnchor="end" fontSize="10" fill="#5b6b73" letterSpacing="1">APPLICATION + DATA &amp; AI SERVICES</text>
      <rect x="44" y="104" width="804" height="158" rx="3" fill="#f9f7f4"/><rect x="904" y="104" width="492" height="158" rx="3" fill="#f9f7f4"/>
      <text x="60" y="119" fontSize="9" fill="#1b3139" fontWeight="700" letterSpacing="1">DATABRICKS APPS · EXPERIENCE &amp; ORCHESTRATION</text>
      <text x="920" y="119" fontSize="9" fill="#1b3139" fontWeight="700" letterSpacing="1">GOVERNED MODEL ACCESS</text>
      <rect x="314" y="306" width="1082" height="158" rx="3" fill="#f9f7f4"/>
      <text x="60" y="365" fontSize="12" fill="#1b3139" fontWeight="700">COMMERCE &amp;</text><text x="60" y="384" fontSize="12" fill="#1b3139" fontWeight="700">INTELLIGENCE</text><text x="60" y="409" fontSize="11" fill="#5b6b73">Authoritative tools and evidence</text>
      <rect x="44" y="506" width="1102" height="158" rx="3" fill="#f9f7f4"/>
      <text x="60" y="521" fontSize="9" fill="#1b3139" fontWeight="700" letterSpacing="1">DATA INGESTION, RETRIEVAL &amp; ANALYTICAL COMPUTE</text>
      <text x="1186" y="572" fontSize="12" fill="#1b3139" fontWeight="600">Open data foundation</text><text x="1186" y="596" fontSize="11" fill="#5b6b73">Delta · SQL · hybrid retrieval</text>
     </>:<>
      <rect x="28" y="28" width="304" height="448" rx="4" fill="#f9f7f4" stroke="#c9d1d6"/>
      <image data-brand="openai" href={architectureAssets.openaiWordmark} x="60" y="48" width="126" height="34" preserveAspectRatio="xMinYMid meet"/>
      <text x="60" y="108" fontSize="10" fill="#1b3139" fontWeight="700" letterSpacing="1">CHATGPT · SHOPPER EXPERIENCE</text>
      <rect x="380" y="28" width="1052" height="780" rx="4" fill="#ffffff" stroke="#ff3621" strokeWidth="1.6"/>
      <image data-brand="databricks" href={architectureAssets.databricks} x="420" y="47" width="146" height="28" preserveAspectRatio="xMinYMid meet"/>
      <text x="590" y="67" fontSize="17" fill="#1b3139" fontWeight="600">Data Intelligence Platform</text>
      <rect x="404" y="104" width="972" height="158" rx="3" fill="#f9f7f4"/>
      <text x="420" y="119" fontSize="9" fill="#1b3139" fontWeight="700" letterSpacing="1">DATABRICKS APPS · COMMERCE TOOLS &amp; GOVERNED DATA</text>
      <rect x="404" y="330" width="592" height="158" rx="3" fill="#f9f7f4"/><rect x="714" y="534" width="662" height="158" rx="3" fill="#f9f7f4"/>
      <text x="730" y="345" fontSize="9" fill="#1b3139" fontWeight="700" letterSpacing="1">MERCHANT OBSERVABILITY</text>
      <text x="1040" y="549" fontSize="9" fill="#1b3139" fontWeight="700" letterSpacing="1">SHOPPER CONTINUATION · HUMAN REVIEW</text>
      <text x="60" y="758" fontSize="10" fill="#5b6b73">Logical MCP connection</text><text x="60" y="776" fontSize="10" fill="#5b6b73">Authentication transport abstracted</text>
     </>}
     <GovernanceBand view={view}/>
     {diagram.edges.map((edge,i)=>{const active=edge.from===node.id||edge.to===node.id;const marker=`url(#architecture-arrow${active?'-active':''})`;return <g key={i}><path d={edge.path} fill="none" stroke={active?'#ff3621':'#5b6b73'} strokeWidth={active?2.3:1.6} strokeDasharray={edge.dashed?'5 5':undefined} markerEnd={marker} markerStart={edge.both?marker:undefined}/>{edge.label&&<text x={edge.x} y={edge.y} textAnchor="middle" fontSize="10" fill="#5b6b73" stroke="#ffffff" strokeWidth="5" paintOrder="stroke">{edge.label}</text>}</g>;})}
     {diagram.nodes.map(n=><DiagramNode key={n.id} node={n} selected={n.id===node.id} onSelect={()=>setSelected(n.id)}/>)}
    </svg>
    <div className="architecture-mobile-components" aria-label="Architecture components">{diagram.nodes.map(n=><button key={n.id} aria-pressed={n.id===node.id} onClick={()=>setSelected(n.id)}><div className="architecture-mobile-logo">{(componentAssets[n.id]||[]).map(asset=><BrandImage key={asset} asset={asset}/>)}</div><small>{n.tag}</small><strong>{n.title}<ArrowRight size={14}/></strong><span>{n.subtitle}</span></button>)}</div>
   </div>
   <div className="architecture-legend"><span><i className="flow"/>Request / data flow</span><span><i className="flow dashed"/>Consent, trace or link</span><span><i className="selected"/>Selected component</span><span className="architecture-hint">Official product artwork · select a component to inspect its role</span></div>
   <div className="architecture-steps">{diagram.steps.map((step,i)=><button key={step.node} aria-pressed={node.id===step.node} onClick={()=>setSelected(step.node)}><span>0{i+1}</span><div><strong>{step.title}</strong><p>{step.body}</p></div><ArrowRight size={15}/></button>)}</div>
   <div className="architecture-details"><article aria-live="polite" className="architecture-component-detail"><span className="section-kicker">COMPONENT IN FOCUS</span><div className="architecture-detail-title">{(componentAssets[node.id]||[]).map(asset=><BrandImage key={asset} asset={asset}/>)}<h2>{node.title}</h2></div><p>{node.detail}</p><div className="architecture-proof"><ShieldCheck size={17}/><p>{node.proof}</p></div><div className="architecture-detail-actions"><button className="quiet-button" onClick={onInspect}>Inspect execution<ArrowRight size={13}/></button>{host&&link&&<a className="quiet-button" href={`${host}${link}`} target="_blank" rel="noreferrer">Open in Databricks<ExternalLink size={13}/></a>}</div></article><aside className="architecture-talk"><span className="section-kicker"><Quote size={14}/>PRESENTER TALK TRACK</span><p>{diagram.talk}</p><small>{view==='app'?'Show the Genie component, then ask the merchant copilot to “Use Genie” and inspect the returned SQL.':'Ask ChatGPT for a quote with a continuation link. Show the matching calls in Live journeys, then open the saved selection.'}</small></aside></div>
   <p className="architecture-footnote">Architecture reference · synthetic commerce demo · component selection makes no model calls or data changes.{view==='chatgpt'?' Connection shown at the logical level; authentication transport is abstracted.':''}</p>
  </div>
 </section>;
}

function BrandImage({asset}:{asset:ArchitectureAsset}){
 return <img className={`architecture-product-logo ${asset==='mlflow'?'on-dark':''}`} src={architectureAssets[asset]} alt="" aria-hidden="true"/>;
}
function GovernanceBand({view}:{view:View}){
 const x=view==='app'?60:420,w=view==='app'?1320:960;
 return <g aria-label="Unity Catalog governance foundation"><rect x={x} y="728" width={w} height="62" rx="3" fill="#f9f7f4" stroke="#c9d1d6"/><rect x={x} y="728" width="4" height="62" fill="#ff3621"/><image data-brand="unityCatalog" href={architectureAssets.unityCatalog} x={x+18} y="738" width="42" height="42"/><text x={x+76} y="753" fontSize="16" fill="#1b3139" fontWeight="600">Unity Catalog</text><text x={x+76} y="774" fontSize="11" fill="#5b6b73">Governed analytics, model access, indexes and trace tables</text><text x={x+w-20} y="764" textAnchor="end" fontSize="10" fill="#5b6b73">App identity + declared resource permissions</text></g>;
}
function DiagramNode({node:n,selected,onSelect}:{node:Node;selected:boolean;onSelect:()=>void}){
 const assets=componentAssets[n.id]||[],wideLogo=assets.includes('mlflow')||assets.length>1,textX=n.x+(wideLogo?98:64);
 return <g className="architecture-node" role="button" tabIndex={0} aria-label={`Inspect ${n.title}`} aria-pressed={selected} onClick={onSelect} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect();}}} style={{cursor:'pointer'}}>
  <rect x={n.x} y={n.y} width={n.w} height="112" rx="3" fill="#ffffff" stroke={selected?'#ff3621':'#c9d1d6'} strokeWidth={selected?2.5:1.2}/>
  {selected&&<rect x={n.x} y={n.y} width="4" height="112" fill="#ff3621"/>}
  {assets.map((asset,i)=><g key={asset}>{asset==='mlflow'&&<rect x={n.x+12} y={n.y+17} width="74" height="40" rx="3" fill="#1b3139"/>}<image data-brand={asset} href={architectureAssets[asset]} x={n.x+14+i*38} y={n.y+18} width={asset==='mlflow'?70:36} height="36" preserveAspectRatio="xMidYMid meet"/></g>)}
  <text x={textX} y={n.y+26} fontSize="7.2" letterSpacing=".5" fill="#5b6b73" fontWeight="600">{n.tag}</text>
  <text x={textX} y={n.y+47} fontSize="13" fontWeight="600" fill="#1b3139">{n.title}</text>
  <line x1={n.x+14} y1={n.y+70} x2={n.x+(n.w||230)-14} y2={n.y+70} stroke="#eeede9"/>
  <text x={n.x+14} y={n.y+92} fontSize="11" fill="#5b6b73">{n.subtitle}</text>
 </g>;
}
