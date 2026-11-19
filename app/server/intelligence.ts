import {activityCalls} from '../shared/activity.js';
import type {Product,ProtocolEvent} from './types.js';
import {experienceSchema} from './experience.js';
import {extractEuroBudget} from './product-ui.js';
import type {AtlasData,AtlasQuery,IntentCluster,QuerySignal} from '../shared/intelligence.js';

const stop=new Set('a an the for of to and or with in on my me i am is are that it its as by be at from this these those what which want need looking find show give have has good best something someone under below up max budget than more less no not can would should very some all one two three complete includes include buy price euros eur day small full made everyday'.split(' '));
const expansions:Record<string,string[]>={headphone:['audio'],headphones:['audio'],earbud:['audio'],earbuds:['audio'],speaker:['audio'],music:['audio'],sound:['audio'],bluetooth:['wireless','audio'],photo:['photography','camera'],photos:['photography','camera'],photographic:['photography','camera'],photography:['camera','creative'],sketching:['sketch','creative','notebook'],sketches:['sketch','creative','notebook'],stationery:['paper','notebook','gift'],birthday:['gift'],present:['gift'],commute:['commuter','work'],commuting:['commuter','work'],office:['work'],desk:['work'],focus:['work'],working:['work'],journey:['travel'],journeys:['travel'],trip:['travel'],train:['travel'],weekend:['travel'],backpack:['bag'],daypack:['bag'],tote:['bag'],hiking:['trail'],running:['trail'],outdoor:['outdoors'],usb:['charger'],charging:['charger']};
export function terms(text:string):string[]{
 const tokens=text.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').match(/[a-z][a-z-]{2,}/g)||[];
 return tokens.filter(t=>!stop.has(t)).flatMap(t=>[t,...(expansions[t]||[])]);
}
type Vector=Map<string,number>;
function normalize(vector:Vector){const length=Math.hypot(...vector.values())||1;return new Map([...vector].map(([k,v])=>[k,v/length]));}
function vectors(documents:string[]):Vector[]{
 const tokens=documents.map(terms),frequency=new Map<string,number>();
 for(const doc of tokens)for(const term of new Set(doc))frequency.set(term,(frequency.get(term)||0)+1);
 return tokens.map(doc=>{const tf=new Map<string,number>();for(const term of doc)tf.set(term,(tf.get(term)||0)+1);return normalize(new Map([...tf].map(([term,count])=>[term,(1+Math.log(count))*(1+Math.log((documents.length+1)/((frequency.get(term)||0)+1)))])));});
}
function cosine(a:Vector,b:Vector){let sum=0;for(const [term,value] of a)sum+=value*(b.get(term)||0);return sum;}
function centroid(vectors:Vector[]){const result=new Map<string,number>();for(const vector of vectors)for(const [term,value] of vector)result.set(term,(result.get(term)||0)+value/vectors.length);return normalize(result);}
/** Deterministic farthest-first initialization + spherical k-means on actual query text. */
export function clusterQueries(documents:string[],requested:number){
 const points=vectors(documents);if(!points.length)return {assignments:[],centers:[] as Vector[]};
 const count=Math.min(Math.max(1,requested),new Set(documents).size);
 let centers=[points[0]];const selected=new Set([0]);
 while(centers.length<count){let next=-1,score=-1;for(let i=0;i<points.length;i++){if(selected.has(i))continue;const distance=1-Math.max(...centers.map(center=>cosine(points[i],center)));if(distance>score){next=i;score=distance;}}if(next<0)break;centers.push(points[next]);selected.add(next);}
 let assignments=points.map(()=>-1);
 for(let iteration=0;iteration<24;iteration++){
  const next=points.map(point=>{let best=0;for(let c=1;c<centers.length;c++)if(cosine(point,centers[c])>cosine(point,centers[best])+1e-9)best=c;return best;});
  if(next.every((value,i)=>value===assignments[i]))break;
  assignments=next;centers=centers.map((old,c)=>{const members=points.filter((_,i)=>assignments[i]===c);return members.length?centroid(members):old;});
 }
 return {assignments,centers};
}

export function activityQueries(events:ProtocolEvent[]):QuerySignal[]{
 const queries=new Map<string,QuerySignal>();
 for(const event of events){
  if(event.name!=='shopibricks.context'||!event.runId||!event.value||typeof event.value!=='object')continue;
  const value=event.value as Record<string,unknown>,parsed=experienceSchema.safeParse(value.experience);
  if(!parsed.success||parsed.data.persona!=='shopper')continue;
  // Prior deployments did not store the prompt in this event. Never invent it from the intent label.
  if(typeof value.query!=='string'||!value.query.trim())continue;
  queries.set(event.runId,{id:event.runId,text:value.query.slice(0,3000),profile:parsed.data.profile,channel:parsed.data.channel,provenance:'shopper_prompt',budget:typeof value.budget_cents==='number'?value.budget_cents:undefined,at:event.timestamp,observed:{recommended:false,draft:false,gap:false,failed:false}});
 }
 for(const event of events){const query=event.runId?queries.get(event.runId):undefined;if(!query?.observed)continue;
  if(event.name==='shopibricks.gap')query.observed.gap=true;
  if(event.type==='RUN_ERROR')query.observed.failed=true;
  if(event.name==='shopibricks.ui'&&event.value&&typeof event.value==='object'){const value=event.value as {kind?:string;products?:unknown[]};if(value.kind==='products'&&Array.isArray(value.products)&&value.products.length)query.observed.recommended=true;if(value.kind==='checkout')query.observed.draft=true;}
 }
 for(const call of activityCalls(events)){
  // ChatGPT only exposes tool arguments, not the original prompt or a fictional profile.
  if(call.channel==='storefront'||call.phase==='started'||!call.query?.trim())continue;
  queries.set(call.call_id,{id:call.call_id,text:call.query,channel:call.channel,provenance:'tool_search',at:call.timestamp});
 }
 return [...queries.values()].sort((a,b)=>(b.at||0)-(a.at||0)).slice(0,180);
}
const absentCategories=['shoes','chair','monitor','vest','tent','keyboard','sofa','jacket','gps'];
export function buildAtlas(signals:QuerySignal[],products:Product[],options:{source:'examples'|'activity';clusters:number;truncated?:boolean}):AtlasData{
 const result=clusterQueries(signals.map(q=>q.text),options.clusters);
 const productDocuments=products.map(p=>`${p.name} ${p.category} ${p.description} ${p.tags.join(' ')} ${p.tags.join(' ')}`);
 const allVectors=vectors([...signals.map(q=>q.text),...productDocuments]);
 const catalogText=productDocuments.join(' ').toLowerCase();
 const queries:AtlasQuery[]=signals.map((q,index)=>{
  const budget=q.budget??extractEuroBudget(q.text),queryTerms=new Set(terms(q.text));
  const absent=absentCategories.find(word=>new RegExp(`\\b${word}\\b`,'i').test(q.text)&&!new RegExp(`\\b${word}\\b`,'i').test(catalogText));
  const ranked=products.map((p,i)=>({id:p.id,score:Math.round(cosine(allVectors[index],allVectors[signals.length+i])*1000)/1000,terms:[...new Set(terms(productDocuments[i]))].filter(t=>queryTerms.has(t)).slice(0,5)})).filter(p=>p.score>=.12).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
  const eligible=ranked.filter(match=>{const p=products.find(p=>p.id===match.id)!;return p.stock>0&&(budget===undefined||p.price_cents<=budget);});
  let status:AtlasQuery['status']='matched',reason=budget===undefined?'Relevant products are available in the current catalog.':'Relevant, available products within the stated per-item budget.';
  if(absent){status='uncovered';reason=`No ${absent} category is present in this catalog.`;}
  else if(!ranked.length){status='uncovered';reason='No product clears the keyword-similarity threshold.';}
  else if(!ranked.some(match=>products.find(p=>p.id===match.id)!.stock>0)){status='stock';reason='Relevant products are currently out of stock.';}
  else if(!eligible.length){status='budget';reason='No available relevant product fits the stated budget.';}
  return {...q,budget,cluster:`cluster-${result.assignments[index]}`,matches:(absent?[]:eligible.length?eligible:ranked).slice(0,3),status,reason};
 });
 const clusters:IntentCluster[]=result.centers.flatMap((center,index)=>{
  const members=queries.filter(q=>q.cluster===`cluster-${index}`);if(!members.length)return [];
  const keywords=[...center].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).map(([word])=>word).slice(0,5);
  const label=keywords.slice(0,2).map(w=>w[0].toUpperCase()+w.slice(1)).join(' & ')||'Other questions';
  return [{id:`cluster-${index}`,label,keywords,count:members.length,matched:members.filter(q=>q.status==='matched').length,gaps:members.filter(q=>q.status!=='matched').length,productIds:[...new Set(members.flatMap(q=>q.status==='matched'?q.matches.map(m=>m.id):[]))]}];
 }).sort((a,b)=>b.count-a.count||a.id.localeCompare(b.id));
 return {source:options.source,sourceLabel:options.source==='examples'?'Fictional example queries':'Your recorded shopper questions and MCP search signals',as_of:new Date().toISOString(),latest_at:signals.some(q=>q.at)?new Date(Math.max(...signals.map(q=>q.at||0))).toISOString():null,period:options.source==='examples'?'Curated example corpus':'Last 24 hours',truncated:options.truncated||false,queries,clusters,
  summary:{queries:queries.length,clusters:clusters.length,matched:queries.filter(q=>q.status==='matched').length,gaps:queries.filter(q=>q.status!=='matched').length,products:products.length},
  method:'Queries are grouped using deterministic spherical k-means over TF-IDF terms with a small synonym dictionary. Product matching uses cosine similarity ≥ 0.12 plus current price and stock. Scores are lexical relevance, not probabilities. Graph positions are a D3 layout, not an embedding projection. Match counts are catalog coverage estimates, not observed recommendations, purchases or conversion rates.'};
}
