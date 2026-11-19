import {useEffect,useRef,useState} from 'react';
import {ArrowRight,CheckCircle2,RefreshCw,AlertCircle} from 'lucide-react';
import type {getQuote} from '../../server/quotes';
import type {Checkout} from '../../server/types';
import {ProductArt} from './ProductArt';
import {api} from './api';
import './journey.css';

type Quote=Awaited<ReturnType<typeof getQuote>>;
const money=(c:number)=>new Intl.NumberFormat('en-IE',{style:'currency',currency:'EUR'}).format(c/100);
export function SavedQuote({id,onCheckout}:{id:string;onCheckout:(checkout:Checkout)=>void}){
 const[data,setData]=useState<Quote>();const[error,setError]=useState('');const[loading,setLoading]=useState(true);const[busy,setBusy]=useState(false);const[refresh,setRefresh]=useState(0);const key=useRef(crypto.randomUUID());
 useEffect(()=>{let live=true;setLoading(true);setError('');void api<Quote>(`/api/quotes/${encodeURIComponent(id)}`).then(q=>{if(live)setData(q);}).catch(e=>{if(live){setError(e.message);setData(undefined);}}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[id,refresh]);
 const total=data?.quote.totals.find(t=>t.type==='total')?.amount;
 async function review(){setBusy(true);setError('');try{const checkout=await api<Checkout>(`/api/quotes/${encodeURIComponent(id)}/continue`,{reviewed:true},{'Idempotency-Key':key.current});onCheckout(checkout);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <section className="saved-quote" aria-label="Saved quote"><div className="saved-quote-intro"><span className="section-kicker">YOUR CONVERSATION, CONTINUED</span><h1>A good find.<br/><em>Ready to review.</em></h1><p>Your saved selection from {data?.channel==='chatgpt'?'ChatGPT':'ShopiBricks'}, checked against the live catalog.</p></div>
 {loading&&<p role="status">Refreshing prices and stock…</p>}{error&&<div className="quote-error" role="alert"><AlertCircle size={18}/><p>{error}</p><button className="quiet-button" onClick={()=>setRefresh(n=>n+1)}>Retry<RefreshCw size={13}/></button></div>}
 {data&&!loading&&<><div className="saved-quote-items">{data.items.map(item=>{const p=data.products.find(p=>p.id===item.id)!;return <div key={item.id}><div className="quote-product-art"><ProductArt kind={p.image_kind} color={p.color}/></div><div><strong>{p.name}</strong><span>Quantity {item.quantity} · {p.stock>=item.quantity?'Available now':`Only ${p.stock} available`}</span><small>{p.description}</small></div><b>{money(p.price_cents*item.quantity)}</b></div>;})}</div><div className="saved-quote-review"><div><span>Current selection total · VAT included</span><strong>{money(total!)}</strong>{data.price_changed&&<p className="quote-price-change">Price changed from {money(data.original_total_cents)}. Review the current total before continuing.</p>}<small>Checked {new Date(data.checked_at).toLocaleTimeString()} · expires {new Date(data.expires_at).toLocaleTimeString()}</small></div><button className="dark-button" disabled={busy||!data.available} onClick={()=>void review()}>{busy?'Preparing review…':'Review sandbox checkout'}<ArrowRight size={16}/></button></div><p className="quote-trust"><CheckCircle2 size={16}/>Nothing has been ordered or reserved. You will review delivery and confirm explicitly in the next step.</p>{!data.available&&<p role="status">Some items are unavailable. Explore the collection or ask the concierge for alternatives.</p>}</>}
 </section>;
}
