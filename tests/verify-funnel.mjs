import {fixtureTransport,agentRequest} from './copilot-fixtures.mjs';
/** Controlled browser regressions for recovery paths; no model calls or database writes. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const base = process.env.SHOPIBRICKS_TEST_URL || 'http://localhost:8000';
const artifacts = fileURLToPath(new URL(`./artifacts/funnel-${new Date().toISOString().replace(/[:.]/g, '-')}/`, import.meta.url));
await mkdir(artifacts, {recursive:true});
const browser = await chromium.launch({channel:'chrome',headless:true});
const checks=[];
const products=[{id:'sb-notebook',name:'Atelier Notebook',price_cents:1900,currency:'eur',stock:3,category:'Everyday',description:'A notebook.',color:'#dfad68',image_kind:'notebook',tags:[]},{id:'sb-camera',name:'Memo Pocket Camera',price_cents:17900,currency:'eur',stock:0,category:'Tech',description:'A camera.',color:'#aab8af',image_kind:'camera',tags:[]}];
const initial={id:'cs_fixture',status:'ready_for_payment',currency:'eur',items:[{id:'sb-notebook',quantity:2}],buyer:{name:'Alex Draft',email:'alex@example.test'},fulfillment_address:{name:'Alex Draft',line_one:'8 Rue du Test',city:'Lyon',postal_code:'69001',country:'FR'},fulfillment_option_id:'paris-standard',line_items:[],totals:[],messages:[],fulfillment_options:[],links:[],payment_provider:{provider:'stripe',supported_payment_methods:['card']}};
function price(input, amount=1900){const checkout=structuredClone({...initial,...input});checkout.line_items=checkout.items.map((item,i)=>({id:`li_${i}`,item,total:amount*item.quantity,subtotal:Math.round(amount*item.quantity/1.2),tax:amount*item.quantity-Math.round(amount*item.quantity/1.2),base_amount:Math.round(amount*item.quantity/1.2),discount:0}));const total=checkout.line_items.reduce((sum,line)=>sum+line.total,0);checkout.totals=[{type:'subtotal',display_text:'Subtotal before VAT',amount:Math.round(total/1.2)},{type:'tax',display_text:'VAT (20%)',amount:total-Math.round(total/1.2)},{type:'fulfillment',display_text:'Delivery (VAT included)',amount:0},{type:'total',display_text:'Total',amount:total}];return checkout;}
async function test(name,run){
 const context=await browser.newContext({viewport:{width:1440,height:950},reducedMotion:'reduce'});const page=await context.newPage();page.setDefaultTimeout(7000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const state={writes:[],checkout:price(initial),failure:null,price:1900};
 await page.route('**/api/**',async route=>{if(await fixtureTransport(route))return;
  const req=route.request(),path=new URL(req.url()).pathname;const json=(body,status=200)=>route.fulfill({status,json:body});
  if(req.method()!=='GET')state.writes.push({path,body:req.postDataJSON()});
  if(path==='/api/products')return json({products});
  if(path==='/api/health')return json({database:'connected',gateway:'configured'});
  if(path==='/api/whoami')return json({label:'Funnel fixture'});
  if((path==='/api/agent/run'||path.endsWith('/agent/default/run'))){const {runId,threadId}=agentRequest(route);return route.fulfill({contentType:'text/event-stream',body:[{type:'RUN_STARTED',runId,threadId},{type:'CUSTOM',name:'shopibricks.ui',value:{kind:'checkout',checkout:state.checkout}},{type:'RUN_FINISHED',runId,threadId}].map(e=>`data: ${JSON.stringify(e)}\n\n`).join('')});}
  if(path.endsWith('/complete')){
   if(state.failure==='stock')return json({...state.checkout,status:'not_ready_for_payment',messages:[{type:'error',content_type:'plain',code:'out_of_stock',content:'Atelier Notebook has 1 unit available.'}]});
   if(state.failure)return json({error:{code:state.failure,message:state.failure==='price_changed'?'The total changed. Review the updated checkout before confirming.':'Checkout expired. Create a new checkout to refresh the quote.'}},state.failure==='price_changed'?409:410);
   return json({...state.checkout,status:'completed',order:{id:'ord_fixture',checkout_session_id:state.checkout.id,permalink_url:`${base}/?order=ord_fixture`}});
  }
  if(path.startsWith('/api/checkout')){state.checkout=price({...state.checkout,...req.postDataJSON()},state.price);return json(state.checkout);}
  throw new Error(`Unexpected API: ${path}`);
 });
 const draft=async()=>{await page.getByRole('textbox',{name:'Ask your shopping concierge'}).fill('Prepare a draft');await page.getByRole('button',{name:'Send message',exact:true}).click();await page.getByRole('button',{name:'Review checkout',exact:true}).click();await page.getByRole('dialog').waitFor();};
 try{await page.goto(`${base}/?product=`);await page.getByRole('button',{name:'Add Atelier Notebook to bag',exact:true}).waitFor();await page.getByRole('button',{name:'Copilot',exact:true}).click();await run({page,state,draft});assert.deepEqual(errors,[]);checks.push({name,passed:true});}
 catch(error){checks.push({name,passed:false,error:String(error)});await page.screenshot({path:`${artifacts}/failure-${checks.length}.png`,fullPage:true});}
 finally{await context.close();}
}
await test('Empty bag, unavailable product, quantity limits and remove-to-empty',async({page})=>{
 await page.getByRole('button',{name:'Review bag, 0 items'}).click();await page.getByRole('heading',{name:'Room for something good.'}).waitFor();await page.keyboard.press('Escape');
 assert.equal(await page.getByRole('button',{name:'Add Memo Pocket Camera to bag',exact:true}).isDisabled(),true);
 await page.getByRole('button',{name:'Add Atelier Notebook to bag',exact:true}).click();await page.getByRole('button',{name:'Review bag, 1 items'}).click();
 const add=page.getByRole('button',{name:'Add one Atelier Notebook',exact:true});await add.click();await add.click();assert.equal(await add.isDisabled(),true);
 const remove=page.getByRole('button',{name:'Remove one Atelier Notebook',exact:true});await remove.click();await remove.click();await remove.click();await page.getByRole('heading',{name:'Room for something good.'}).waitFor();
});
await test('Agent draft preserves buyer and delivery details when opened',async({page,draft})=>{await draft();assert.equal(await page.getByLabel('Name',{exact:true}).inputValue(),'Alex Draft');assert.equal(await page.getByLabel('Demo email',{exact:true}).inputValue(),'alex@example.test');assert.equal(await page.getByLabel('City',{exact:true}).inputValue(),'Lyon');});
await test('Editing an agent draft can change its quantity and requires fresh approval',async({page,state,draft})=>{await draft();await page.getByRole('button',{name:'Edit selection',exact:true}).click();await page.getByRole('button',{name:'Remove one Atelier Notebook',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Review checkout',exact:true}).click();await page.getByRole('checkbox').waitFor();assert.equal(state.checkout.items[0].quantity,1);assert.equal(await page.getByRole('checkbox').isChecked(),false);});
await test('Invalid delivery details stay editable and can be corrected',async({page,state,draft})=>{await draft();await page.getByLabel('Postal code',{exact:true}).fill('oops');await page.getByRole('dialog').getByRole('button',{name:'Review checkout',exact:true}).click();assert.equal(state.writes.filter(w=>w.path.startsWith('/api/checkout')).length,0);await page.getByText('Enter a five-digit French postal code.',{exact:true}).waitFor();await page.getByLabel('Postal code',{exact:true}).fill('69002');await page.getByRole('dialog').getByRole('button',{name:'Review checkout',exact:true}).click();await page.getByRole('checkbox').waitFor();assert.equal(state.checkout.fulfillment_address.postal_code,'69002');});
await test('A changed price returns to review before another confirmation',async({page,state,draft})=>{await draft();state.failure='price_changed';state.price=2100;await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Confirm sandbox order',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Review checkout',exact:true}).click();await page.getByRole('checkbox').waitFor();assert.equal(await page.getByRole('checkbox').isChecked(),false);assert.equal(await page.getByRole('button',{name:'Confirm sandbox order',exact:true}).isDisabled(),true);assert.equal(state.checkout.totals.at(-1).amount,4200);});
await test('An expired quote can be recreated with the same selection and details',async({page,state,draft})=>{await draft();state.failure='expired_checkout';await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Confirm sandbox order',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Review checkout',exact:true}).click();await page.getByRole('checkbox').waitFor();const write=state.writes.at(-1);assert.equal(write.path,'/api/checkout');assert.equal(write.body.buyer.name,'Alex Draft');assert.equal(write.body.items[0].quantity,2);});
await test('Stock conflict lets the shopper edit the selection and re-review',async({page,draft,state})=>{await draft();state.failure='stock';await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Confirm sandbox order',exact:true}).click();await page.getByText('Atelier Notebook has 1 unit available.',{exact:true}).waitFor();await page.getByRole('button',{name:'Remove one Atelier Notebook',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Review checkout',exact:true}).click();await page.getByRole('checkbox').waitFor();assert.equal(state.checkout.items[0].quantity,1);assert.equal(await page.getByRole('checkbox').isChecked(),false);});
await browser.close();const passed=checks.every(c=>c.passed);await writeFile(`${artifacts}/results.json`,JSON.stringify({passed,checks},null,2));console.log(JSON.stringify({passed,checks,artifacts},null,2));process.exitCode=passed?0:1;
