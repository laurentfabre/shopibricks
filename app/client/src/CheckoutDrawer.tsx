import {useEffect, useRef, useState, type Dispatch, type SetStateAction} from 'react';
import {ArrowRight, ArrowUpRight, Check, CheckCircle2, Minus, Package, Plus, ShieldCheck, ShoppingBag, Truck, X} from 'lucide-react';
import type {Address, Buyer, Checkout, Product} from '../../server/types';
import {ApiError, post} from './api';
import {ProductArt} from './ProductArt';
import {TourButton, type GuideStep} from './GuidedTour';

const euro = (cents: number) => new Intl.NumberFormat('fr-FR', {style: 'currency', currency: 'EUR', maximumFractionDigits: cents % 100 ? 2 : 0}).format(cents / 100);
type Props = {products: Product[]; bag: Record<string, number>; setBag: Dispatch<SetStateAction<Record<string, number>>>; checkout?: Checkout; setCheckout: (checkout: Checkout | undefined) => void; onClose: () => void; onDone: () => void};

export function CheckoutDrawer({products, bag, setBag, checkout, setCheckout, onClose, onDone}: Props) {
  const dialog = useRef<HTMLElement>(null);
  const close = useRef(onClose); close.current = onClose;
  const checkoutId = useRef(checkout?.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [approved, setApproved] = useState(false);
  const [buyer, setBuyer] = useState<Buyer>(checkout?.buyer || {name: 'Camille Martin', email: 'camille@example.test'});
  const [address, setAddress] = useState<Address>(checkout?.fulfillment_address || {name: checkout?.buyer?.name || 'Camille Martin', line_one: '10 Rue de Rivoli', city: 'Paris', postal_code: '75001', country: 'FR'});
  const [items, setItems] = useState(() => checkout?.items || products.filter(product => bag[product.id]).map(product => ({id: product.id, quantity: bag[product.id]})));
  const completed = checkout?.status === 'completed';
  const ready = checkout?.status === 'ready_for_payment';
  const estimate = items.reduce((sum, item) => sum + (products.find(product => product.id === item.id)?.price_cents || 0) * item.quantity, 0);
  function invalidate() {setCheckout(undefined); setApproved(false); setError(''); setFields({}); setBag(Object.fromEntries(items.map(item => [item.id, item.quantity])));}
  function quantity(id: string, delta: number) {
    const next = items.map(item => item.id === id ? {...item, quantity: Math.max(0, Math.min(10, delta > 0 ? products.find(product => product.id === id)?.stock || 0 : 10, item.quantity + delta))} : item).filter(item => item.quantity > 0);
    invalidate(); setItems(next); setBag(Object.fromEntries(next.map(item => [item.id, item.quantity])));
  }
  function recover(error: unknown) {
    setApproved(false);
    if (error instanceof ApiError && ['price_changed', 'expired_checkout', 'terminal_checkout'].includes(error.code || '')) {
      if (error.code !== 'price_changed') checkoutId.current = undefined;
      setCheckout(undefined);
    }
    setError(error instanceof Error ? error.message : 'Unable to update checkout. Please try again.');
  }
  async function quote() {
    const invalid: Record<string, string> = {};
    if (!buyer.name.trim()) invalid.name = 'Enter a name for this demo order.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyer.email)) invalid.email = 'Enter a valid fictional email address.';
    if (!address.line_one.trim()) invalid.line_one = 'Enter a fictional delivery address.';
    if (!address.city.trim()) invalid.city = 'Enter a city in France.';
    if (!/^\d{5}$/.test(address.postal_code)) invalid.postal_code = 'Enter a five-digit French postal code.';
    setFields(invalid); setError('');
    if (Object.keys(invalid).length) {dialog.current?.querySelector<HTMLInputElement>(`[name="${Object.keys(invalid)[0]}"]`)?.focus(); return;}
    setBusy(true);
    try {
      const body = {items, buyer, fulfillment_address: address, fulfillment_option_id: checkout?.fulfillment_option_id || 'paris-standard'};
      const result = await post<Checkout>(checkoutId.current ? `/api/checkout/${checkoutId.current}` : '/api/checkout', body);
      checkoutId.current = result.id; setCheckout(result); setApproved(false);
    } catch (error) {recover(error);} finally {setBusy(false);}
  }
  async function confirm() {
    if (!checkout || !approved || busy) return;
    setBusy(true); setError('');
    try {
      const result = await post<Checkout>(`/api/checkout/${checkout.id}/complete`, {confirmed: true, buyer, payment_data: {provider: 'stripe', token: 'shopibricks_sandbox'}});
      setCheckout(result); setApproved(false);
      if (result.status === 'completed') onDone();
    } catch (error) {recover(error);} finally {setBusy(false);}
  }
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLElement>('[aria-label="Close bag"]')?.focus();
    const handler = (event: KeyboardEvent) => {
      if (document.body.classList.contains('driver-active')) return;
      if (event.key === 'Escape') close.current();
      if (event.key === 'Tab') {
        const elements = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled])') || []);
        const first = elements[0], last = elements.at(-1);
        if (event.shiftKey && document.activeElement === first) {event.preventDefault(); last?.focus();}
        else if (!event.shiftKey && document.activeElement === last) {event.preventDefault(); first?.focus();}
      }
    };
    document.addEventListener('keydown', handler);
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => {document.removeEventListener('keydown', handler); document.body.style.overflow = overflow; previous?.focus();};
  }, []);

  const tour: GuideStep[] = completed ? [
    {target: '.order-success', title: 'Confirmed, and safely saved.', description: 'The sandbox order is recorded in Lakebase and its inventory update has completed. No payment or shipment takes place.', chapter: 'CHECKOUT / CONFIRMED'},
    {target: '.persisted-order-link', title: 'Keep the receipt.', description: 'View persisted order opens a dedicated receipt with the saved items, amounts and delivery details. The same link works after a reload.', chapter: 'CHECKOUT / RECEIPT'},
  ] : items.length ? [
    {target: '.bag-items', title: 'Make the selection yours.', description: 'Check the products and quantities. Use Edit selection after a quote if you want to make changes, then review the new total.', chapter: 'CHECKOUT / SELECTION'},
    {target: '.delivery-form', title: 'A fictional destination.', description: 'Use demo contact details and a five-digit French postal code. Editing details requires a fresh review.', chapter: 'CHECKOUT / DETAILS'},
    {target: '.drawer-footer', title: ready ? 'Your confirmation comes last.' : 'Review before you confirm.', description: ready ? 'The verified total is shown here. Only you can check the approval box and confirm the sandbox order. This tour leaves both controls unchanged.' : 'Review checkout verifies current prices and stock. You will see the authoritative total before a separate approval step.', chapter: 'CHECKOUT / YOUR DECISION'},
  ] : [{target: '.checkout-drawer .empty-state', title: 'Start with something you love.', description: 'Return to the collection and add a product, or ask the concierge to prepare a draft checkout.', chapter: 'CHECKOUT / GET STARTED'}];

  const input = (key: string, label: string, value: string, update: (value: string) => void, type = 'text', maxLength = 60) => <label>{label}<input aria-label={label} name={key} type={type} value={value} disabled={busy} maxLength={maxLength} aria-invalid={!!fields[key]} aria-describedby={fields[key] ? `checkout-${key}-error` : undefined} onChange={event => {invalidate(); update(event.target.value);}}/>{fields[key] && <small id={`checkout-${key}-error`} className="field-error">{fields[key]}</small>}</label>;

  return <div className="drawer-overlay" onMouseDown={event => {if (event.target === event.currentTarget && !busy) onClose();}}><section ref={dialog} className="checkout-drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
    <div className="drawer-header"><div><span className="eyebrow">YOUR NEXT GOOD DECISION</span><h2 id="drawer-title">{completed ? 'All yours. In the sandbox.' : 'Your considered collection'}</h2></div><div className="drawer-header-actions"><TourButton steps={tour} label="Guide me" disabled={busy}/><button className="icon-button" onClick={onClose} disabled={busy} aria-label="Close bag"><X size={22}/></button></div></div>
    {completed ? <div className="order-success"><div className="success-grid" aria-hidden="true"/><span><CheckCircle2 size={38} strokeWidth={1.4}/></span><h3>One good decision.<br/>One connected order.</h3><p>Your sandbox order is confirmed. No payment has been collected and no goods will be shipped.</p><code>{checkout.order?.id}</code><div className="confirmation-steps"><span><Check size={14}/> Inventory updated atomically</span><span><Check size={14}/> Order persisted in Lakebase</span><span><Check size={14}/> Commerce event recorded</span></div><a className="dark-button persisted-order-link" href={`/?order=${checkout.order?.id}`}>View persisted order <ArrowUpRight size={15}/></a><button className="text-button" onClick={onClose}>Back to the collection <ArrowRight size={15}/></button></div> : <>
      <div className="checkout-progress" aria-label="Checkout progress"><span className="done"><Check size={12}/> Selection</span><i/><span className={ready ? 'done' : 'current'}>02 Review</span><i/><span className={ready ? 'current' : ''}>03 Confirm</span></div>
      <div className="drawer-content">{items.length ? <>
        <div className="bag-items">{items.map(item => {
          const product = products.find(product => product.id === item.id);
          const line = checkout?.line_items.find(line => line.item.id === item.id);
          return <div className="bag-item" key={item.id}><div className="mini-art">{product ? <ProductArt kind={product.image_kind} color={product.color}/> : <Package size={25}/>}</div><div><h3>{product?.name || item.id}</h3><p>{ready ? `Quantity ${item.quantity} · saved quote` : `${euro(product?.price_cents || 0)} / item`}</p>{!ready && <div className="quantity"><button aria-label={`Remove one ${product?.name || item.id}`} disabled={busy} onClick={() => quantity(item.id, -1)}><Minus size={12}/></button><span>{item.quantity}</span><button aria-label={`Add one ${product?.name || item.id}`} disabled={busy || item.quantity >= Math.min(10, product?.stock || 0)} onClick={() => quantity(item.id, 1)}><Plus size={12}/></button></div>}</div><b>{euro(line?.total ?? (product?.price_cents || 0) * item.quantity)}</b></div>;
        })}</div>
        {ready && <button className="text-button edit-selection" onClick={invalidate} disabled={busy}>Edit selection <ArrowRight size={14}/></button>}
        <div className="sandbox-notice"><ShieldCheck size={19}/><p><b>Presentation sandbox</b>Use fictional details only. No charge, no shipment, no email.</p></div>
        <div className="delivery-form"><h3><Truck size={18}/> Where should we pretend to deliver?</h3>
          {input('name', 'Name', buyer.name, name => {setBuyer({...buyer, name}); setAddress({...address, name});}, 'text', 256)}
          {input('email', 'Demo email', buyer.email, email => setBuyer({...buyer, email}), 'email', 256)}
          {input('line_one', 'Delivery address', address.line_one, line_one => setAddress({...address, line_one}))}
          <div className="form-row">{input('city', 'City', address.city, city => setAddress({...address, city}))}{input('postal_code', 'Postal code', address.postal_code, postal_code => setAddress({...address, postal_code}), 'text', 5)}</div>
        </div>
        {checkout && <div className="quote"><h3>Authoritative checkout total</h3>{checkout.totals.filter(total => ['subtotal', 'tax', 'fulfillment', 'total'].includes(total.type)).map(total => <div className={total.type === 'total' ? 'total' : ''} key={total.type}><span>{total.display_text}</span><b>{euro(total.amount)}</b></div>)}<small>Prices verified against current Lakebase data.</small></div>}
        {checkout?.messages.filter(message => message.type === 'error').map((message, index) => <div className="inline-error" role="alert" key={index}>{message.content}</div>)}
      </> : <div className="empty-state"><ShoppingBag size={36}/><h3>Room for something good.</h3><p>Add a favourite from the collection or ask your concierge for a recommendation.</p><button className="dark-button" onClick={onClose}>Explore the collection <ArrowRight size={15}/></button></div>}</div>
      {items.length > 0 && <div className="drawer-footer">{error && <div className="inline-error" role="alert">{error}</div>}{ready ? <><div className="bag-total authoritative-total"><span>Your order total, VAT included</span><b>{euro(checkout.totals.find(total => total.type === 'total')?.amount || 0)}</b></div><label className="approval"><input type="checkbox" checked={approved} disabled={busy} onChange={event => setApproved(event.target.checked)}/><span>I confirm this sandbox order and understand no payment or shipment will happen.</span></label><button className="dark-button full" disabled={!approved || busy} onClick={() => void confirm()}>{busy ? 'Confirming…' : 'Confirm sandbox order'}<ShieldCheck size={17}/></button></> : <><div className="bag-total"><span>Estimated total, VAT included</span><b>{euro(estimate)}</b></div><button className="dark-button full" disabled={busy} onClick={() => void quote()}>{busy ? 'Verifying prices & stock…' : 'Review checkout'}<ArrowRight size={17}/></button></>}<p className="checkout-note"><ShieldCheck size={12}/> Your confirmation. Always your decision.</p></div>}
    </>}
  </section></div>;
}
