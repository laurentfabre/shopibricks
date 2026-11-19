import {useEffect, useRef} from 'react';
import {Compass} from 'lucide-react';
import {driver, type Driver, type DriveStep} from 'driver.js';
import 'driver.js/dist/driver.css';
import './tour.css';

export type GuideStep = {target: string; title: string; description: string; chapter: string; prepare?: () => void; waitForTarget?:boolean; fallbackTarget?:string; notes?:{say:string;action:string;proof:string;fallback:string}; duration?:string};
const visibleElement=(selector:string)=>{const element=document.querySelector(selector);return element&&element.getClientRects().length&&!element.closest('[hidden]')?element:undefined;};

export function TourButton({steps, label = 'Take a tour', disabled = false, onEnd, onStart, initialStep=0, speakerNotes=false, onStepChange}: {
  steps: GuideStep[]; label?: string; disabled?: boolean; onEnd?: () => void; onStart?:()=>void; initialStep?:number; speakerNotes?:boolean; onStepChange?:(index:number)=>void;
}) {
  const active = useRef<Driver | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const generation=useRef(0);
  const pending=useRef<HTMLElement|null>(null);
  const cleanup=useRef<(()=>void)|null>(null);
  useEffect(() => () => {generation.current++;pending.current?.remove();if(active.current?.isActive())active.current.destroy();else cleanup.current?.();}, []);

  function start() {
    if (active.current || !steps.length) return;
    const origin = {x: scrollX, y: scrollY};
    const inertElements = new Map<HTMLElement, boolean>();
    const attributes=new Map<Element,Map<string,string|null>>();
    const visited = new Set<HTMLElement>();
    let transitioning = false, ended=false,showNotes=speakerNotes;
    const cancelPending=(event:KeyboardEvent)=>{
      if(event.key==='Escape'&&pending.current){event.preventDefault();event.stopImmediatePropagation();if(active.current?.isActive())active.current.destroy();else finish();}
    };
    document.addEventListener('keydown',cancelPending,true);
    const restore = (element?: Element) => {
      if (element instanceof HTMLElement && inertElements.has(element)) {
        element.inert = inertElements.get(element)!;
        inertElements.delete(element);
      }
    };
    const finish=()=>{
      if(ended)return;ended=true;generation.current++;pending.current?.remove();pending.current=null;
      document.removeEventListener('keydown',cancelPending,true);
      for(const element of inertElements.keys())restore(element);
      for(const element of visited){element.classList.remove('driver-active-element','driver-no-interaction');for(const [name,value] of attributes.get(element)||[]){if(value===null)element.removeAttribute(name);else element.setAttribute(name,value);}}
      active.current=null;cleanup.current=null;onEnd?.();
      requestAnimationFrame(()=>{trigger.current?.focus({preventScroll:true});window.scrollTo({left:origin.x,top:origin.y,behavior:'instant'});});
    };
    cleanup.current=finish;
    const resolved=new Map<number,Element>();const fallbackSteps=new Set<number>();
    async function move(index:number){
      transitioning=true;const ticket=++generation.current;const step=steps[index];
      const state=active.current?.getState();if(state?.popover){state.popover.nextButton.disabled=true;state.popover.previousButton.disabled=true;}
      step.prepare?.();
      if(step.waitForTarget&&!visibleElement(step.target)){
        const status=document.createElement('div');status.className='tour-loading';status.setAttribute('role','status');
        const text=document.createElement('span');text.textContent='Preparing this demo highlight…';const cancel=document.createElement('button');cancel.textContent='Cancel';cancel.onclick=()=>{if(active.current?.isActive())active.current.destroy();else finish();};status.append(text,cancel);document.body.append(status);pending.current=status;
        const until=performance.now()+5000;
        while(ticket===generation.current&&!visibleElement(step.target)&&performance.now()<until){
          if(step.fallbackTarget&&document.querySelector(`${step.fallbackTarget} .atlas-error, ${step.fallbackTarget} .atlas-empty`))break;
          await new Promise(resolve=>setTimeout(resolve,60));
        }
        status.remove();if(pending.current===status)pending.current=null;
      }
      if(ticket!==generation.current||ended)return;
      const found=visibleElement(step.target);const target=found||(step.fallbackTarget?visibleElement(step.fallbackTarget):undefined)||document.body;
      if(!found)fallbackSteps.add(index);else fallbackSteps.delete(index);
      if(!attributes.has(target))attributes.set(target,new Map(['aria-haspopup','aria-expanded','aria-controls'].map(name=>[name,target.getAttribute(name)])));
      resolved.set(index,target);onStepChange?.(index);
      if(active.current?.isActive())active.current.moveTo(index);else active.current?.drive(index);
    }
    const tourSteps: DriveStep[] = steps.map((step,index) => ({
      element: () => resolved.get(index)||visibleElement(step.target)||document.body,
      popover: {title: step.title, description: step.description, side: 'bottom', align: 'start'},
      onHighlightStarted: element => {
        transitioning = true;
        if (element instanceof HTMLElement && element !== document.body) {visited.add(element);inertElements.set(element,element.inert);element.inert=true;}
      },
      onHighlighted: (_element, _step, {state, driver}) => {
        transitioning = false;
        if (state.popover) {state.popover.nextButton.disabled=false;state.popover.previousButton.disabled=driver.isFirstStep();}
      },
      onDeselected: restore,
    }));
    active.current = driver({
      steps: tourSteps,
      animate: !matchMedia('(prefers-reduced-motion: reduce)').matches,
      smoothScroll: false,
      overlayColor: '#102237', overlayOpacity: .72, stagePadding: 8, stageRadius: 12,
      disableActiveInteraction: true, allowKeyboardControl: true, allowClose: true,
      overlayClickBehavior: () => {},
      showProgress: true, progressText: '{{current}} / {{total}}',
      nextBtnText: 'Next →', prevBtnText: 'Back', doneBtnText: 'Finish tour',
      popoverClass: 'shopibricks-tour',
      onNextClick: (_element, _step, {driver}) => {if(!transitioning){if(driver.isLastStep())driver.destroy();else void move((driver.getActiveIndex()||0)+1);}},
      onPrevClick: (_element, _step, {driver}) => {if(!transitioning)void move((driver.getActiveIndex()||0)-1);},
      onPopoverRender: (popover, {state,driver}) => {
        const index=state.activeIndex||0;const step=steps[index];
        const chapter = document.createElement('div');chapter.className='tour-chapter';chapter.textContent=step.chapter+(step.duration?` · ${step.duration}`:'');popover.wrapper.prepend(chapter);
        if(fallbackSteps.has(index)){const notice=document.createElement('p');notice.className='tour-unavailable';notice.setAttribute('role','status');notice.textContent='This highlight is unavailable. Showing its surrounding view; use the fallback in your speaker notes.';popover.description.append(notice);}
        if(step.notes){
          popover.wrapper.classList.add('presenter-tour');
          const details=document.createElement('section');details.className='tour-speaker-notes';
          const toggle=document.createElement('button');toggle.type='button';toggle.textContent='Speaker notes';toggle.setAttribute('aria-label','Speaker notes');toggle.setAttribute('aria-expanded',String(showNotes));toggle.setAttribute('aria-controls','tour-notes-content');details.append(toggle);
          const content=document.createElement('div');content.className='tour-notes-content';content.id='tour-notes-content';content.hidden=!showNotes;
          for(const [heading,text] of [['Say',step.notes.say],['Show',step.notes.action],['Evidence',step.notes.proof],['If unavailable',step.notes.fallback]]){const section=document.createElement('div');const label=document.createElement('strong');label.textContent=heading;const paragraph=document.createElement('p');paragraph.textContent=text;section.append(label,paragraph);content.append(section);}
          details.append(content);toggle.onclick=()=>{showNotes=!showNotes;content.hidden=!showNotes;toggle.setAttribute('aria-expanded',String(showNotes));driver.refresh();};popover.description.after(details);
          const hint=document.createElement('p');hint.className='tour-presenter-hint';hint.textContent='Notes appear on the shared screen when expanded. Exit the spotlight to interact with the app.';details.after(hint);
        }
        popover.closeButton.setAttribute('aria-label','Exit tour');popover.nextButton.setAttribute('aria-label',index===steps.length-1?'Finish tour':'Next tour step');popover.previousButton.setAttribute('aria-label','Previous tour step');
        popover.nextButton.disabled=transitioning;popover.previousButton.disabled=transitioning||!index;
      },
      onDestroyed: finish,
    });
    onStart?.();void move(Math.max(0,Math.min(initialStep,steps.length-1)));
  }

  return <button ref={trigger} aria-label={label} className="tour-button" onClick={start} disabled={disabled}><Compass size={16}/><span>{label}</span></button>;
}

export function demoTour(show: (tab: string) => void): GuideStep[] {
  const shop = () => show('Shop');
  const operations = () => show('Operations');
  const protocol = () => show('Protocol studio');
  return [
    {target: '.hero-cta', title: 'Your Paris story starts here.', description: 'Describe a weekend, a budget, or an idea. The concierge turns it into a collection you can explore.', chapter: '01 / DISCOVER', prepare: shop},
    {target: '.section-top', title: 'Find your next favourite.', description: 'Search the collection, then use the category filters below to narrow the selection. Prices include VAT.', chapter: '01 / DISCOVER', prepare: shop},
    {target: '.agent-roster', title: 'Five specialists, one conversation.', description: 'Watch the active agent as the concierge searches the catalog, checks stock, prepares checkout, or answers a merchant question.', chapter: '02 / CONVERSE', prepare: shop},
    {target: '.composer', title: 'Make it personal.', description: 'Ask for a kit under €250, compare two products, or request a draft checkout. Product cards appear in the conversation for your review.', chapter: '02 / CONVERSE', prepare: shop},
    {target: '.bag-button', title: 'Your bag. Your decision.', description: 'Add products, review quantities and delivery details, then approve the sandbox order yourself. Open the bag for a dedicated checkout guide.', chapter: '03 / CHECKOUT', prepare: shop},
    {target: '.metric-grid', title: 'See the merchant’s view.', description: 'These metrics read operational orders and current inventory from Lakebase. Each card shows its scope and source.', chapter: '04 / OPERATE', prepare: operations},
    {target: '.traffic-panel', title: 'Follow the streaming signals.', description: 'Synthetic traffic flows through Lakeflow and Delta. Inspect the query and freshness beneath the chart to see what is actually being read.', chapter: '04 / OPERATE', prepare: operations},
    {target: '.orders-panel', title: 'Every order has a paper trail.', description: 'An order link opens its saved receipt for the account that placed it. The receipt keeps the quantities and totals captured at checkout.', chapter: '04 / OPERATE', prepare: operations},
    {target: '.protocol-cards', title: 'OpenAI, governed by Databricks.', description: 'Inspect Unity Gateway status, the AG-UI and MCP integration, and the ACP sandbox. ChatGPT merchant onboarding remains a separate step.', chapter: '05 / UNDER THE HOOD', prepare: protocol},
    {target: '.protocol-log', title: 'See the actual handoffs.', description: 'Select a timeline event to inspect its payload. Agent runs and commerce actions generate these records; start a conversation if the timeline is empty.', chapter: '05 / UNDER THE HOOD', prepare: protocol},
    {target: '.persona-bar', title: 'Three sides of the same story.', description: 'Switch between shopper discovery, merchant growth and developer inspection. These are demo perspectives; your signed-in permissions stay the same.', chapter: '06 / EXPLORE PERSONAS', prepare: shop},
    {target: '.profile-section', title: 'A different person. A different possibility.', description: 'Four fictional profiles change interests, default budget, product ranking and agent context. Each profile keeps its own bag and conversation. Try a travel or gift specialist too.', chapter: '06 / EXPLORE PERSONAS', prepare: shop},
    {target: '.brand-studio', title: 'Bring your brand into the conversation.', description: 'Preview editorial, concise or playful language using live product facts. Your chosen voice also guides the agents in this browser session.', chapter: '07 / GROW YOUR BRAND', prepare: () => show('Growth studio:brand')},
    {target: '.distribution-panel', title: 'Understand channel readiness.', description: 'Inspect catalog completeness and export an internal feed. Channel status distinguishes the native storefront, a configured ChatGPT MCP bridge, and platforms that are not connected.', chapter: '07 / GROW YOUR BRAND', prepare: () => show('Growth studio:channels')},
    {target: '.live-activity', title: 'Follow the conversation across channels.', description: 'Inspect real MCP calls from ChatGPT and the storefront, including durations, outcomes and temporary quotes. Tool-search signals also feed the intent atlas.', chapter: '07 / GROW YOUR BRAND', prepare: () => show('Growth studio:activity')},
    {target: '.intent-panel', title: 'See the language behind demand.', description: 'Explore interactive clusters, inspect catalog matches and gaps, and try a question in the storefront. Switch between clearly labeled fictional examples and your own recorded questions.', chapter: '07 / GROW YOUR BRAND', prepare: () => show('Growth studio:atlas')},
    {target: '.presentation-button', title: 'Ready for the Paris session.', description: 'Present mode makes the experience easier to read on stage. Replay this tour anytime, or explore freely. Laurent + Hatim, back to back.', chapter: '06 / TAKE THE STAGE', prepare: shop},
  ];
}

export const receiptTour: GuideStep[] = [
  {target: '.receipt-reference', title: 'An order you can come back to.', description: 'This reference identifies the saved order. Bookmark the page and reopen it with the same signed-in account.', chapter: 'YOUR SAVED ORDER'},
  {target: '.receipt-items', title: 'Exactly what you confirmed.', description: 'Quantities and line amounts come from the saved checkout. Changing catalog prices does not change this receipt.', chapter: 'YOUR COLLECTION'},
  {target: '.receipt-totals', title: 'Every amount accounted for.', description: 'Review the captured subtotal, VAT, delivery and final total. This sandbox receipt never represents a real payment.', chapter: 'YOUR TOTAL'},
  {target: '.receipt-delivery', title: 'The details stay with the order.', description: 'Your fictional customer and delivery details are saved here. Use Back to the collection when you are ready to explore again.', chapter: 'YOUR DETAILS'},
];
