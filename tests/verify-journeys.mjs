import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fixtureTransport,agentRequest} from './copilot-fixtures.mjs';
const base=process.env.SHOPIBRICKS_TEST_URL||'http://localhost:8000';
const out=new URL('./artifacts/journeys/',import.meta.url);await mkdir(out,{recursive:true});
const catalog=JSON.parse(await readFile(new URL('../app/server-products.json',import.meta.url)));
const atlas=JSON.parse(await readFile(new URL('./artifacts/atlas/fixture.json',import.meta.url)));
const id=`q_${randomUUID()}`,sku=catalog.find(p=>p.id==='sb-headphones'),now=Date.now();
const quote={id,status:'not_ready_for_payment',currency:'eur',items:[{id:sku.id,quantity:1}],line_items:[{id:'li',item:{id:sku.id,quantity:1},base_amount:sku.price_cents,subtotal:sku.price_cents,tax:0,discount:0,total:sku.price_cents}],totals:[{type:'total',display_text:'Total',amount:sku.price_cents}],messages:[],fulfillment_options:[],links:[]};
const events=[
 {id:1,type:'CUSTOM',name:'shopibricks.mcp',timestamp:now, value:{version:1,call_id:'search',tool:'search_products',channel:'chatgpt',transport:'ChatGPT → Vercel → Databricks App',phase:'started',query:'weekend headphones',product_ids:[]}},
 {id:2,type:'CUSTOM',name:'shopibricks.mcp',timestamp:now+1,value:{version:1,call_id:'search',tool:'search_products',channel:'chatgpt',transport:'ChatGPT → Vercel → Databricks App',phase:'completed',query:'weekend headphones',product_ids:[sku.id],result_count:1,duration_ms:81}},
 {id:3,type:'CUSTOM',name:'shopibricks.mcp',timestamp:now+2,value:{version:1,call_id:'quote',tool:'quote_cart',channel:'chatgpt',transport:'ChatGPT → Vercel → Databricks App',phase:'completed',product_ids:[sku.id],quote_id:id,total_cents:sku.price_cents,duration_ms:105}},
];
const browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1050},reducedMotion:'reduce'});
const errors=[],checks=[],requests=[],writes=[];let unavailable=false,expired=false;
page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
const check=(value,label)=>{assert.ok(value,label);checks.push(label);};
await page.route('**/api/**',async route=>{
 const path=new URL(route.request().url()).pathname;const json=data=>route.fulfill({json:data});
 if(path==='/api/events/stream')return route.fulfill({contentType:'text/event-stream',body:events.map(e=>`id: ${e.id}\ndata: ${JSON.stringify(e)}\n\n`).join('')});
 if(await fixtureTransport(route))return;
 if(route.request().method()==='POST')writes.push(path);
 if(path==='/api/products')return json({products:catalog});
 if(path==='/api/health')return json({database:'connected',mcp_bridge_configured:true});
 if(path==='/api/whoami')return json({label:'Browser fixture'});
 if(path==='/api/intelligence')return json(atlas);
 if(path==='/api/catalog/readiness')return json({items:[],total:12,ready:12,available:12});
 if(path===`/api/quotes/${id}`){if(expired)return route.fulfill({status:410,json:{error:{message:'This quote has expired. Ask for a fresh quote.'}}});return json({quote_id:id,channel:'chatgpt',quote,items:quote.items,products:[{...sku,stock:unavailable?0:sku.stock}],original_total_cents:sku.price_cents-100,price_changed:true,available:!unavailable,created_at:new Date(now).toISOString(),expires_at:new Date(now+1800000).toISOString(),checked_at:new Date().toISOString()});}
 if(path===`/api/quotes/${id}/continue`)return json({...quote,id:'cs_fixture'});
 if(path.endsWith('/agent/default/run')){
  const request=agentRequest(route);requests.push(request);const messageId=randomUUID();
  const stream=[{type:'RUN_STARTED',threadId:request.threadId,runId:request.runId},{type:'TEXT_MESSAGE_START',messageId,role:'assistant'},{type:'TEXT_MESSAGE_CONTENT',messageId,delta:'Fixture answer based on tool evidence.'},{type:'TEXT_MESSAGE_END',messageId}];
  if(request.experience.persona==='merchant')stream.push({type:'STATE_SNAPSHOT',snapshot:{experience:request.experience,workspace:{view:'activity',bag:[]},navigation:{view:'activity',request_id:randomUUID()}}});
  else {
   for(const [name,args,result] of [
    ['get_inventory',{product_ids:[sku.id]},{inventory:[{id:sku.id,stock:sku.stock}],checked_at:new Date(now).toISOString()}],
    ['quote_cart',{items:quote.items},{...quote,quote_id:id,expires_at:new Date(now+1800000).toISOString()}],
   ]){
    const toolCallId=randomUUID();
    stream.push({type:'TOOL_CALL_START',toolCallId,toolCallName:name},
     {type:'TOOL_CALL_ARGS',toolCallId,delta:JSON.stringify(args)},
     {type:'TOOL_CALL_END',toolCallId},
     {type:'TOOL_CALL_RESULT',toolCallId,messageId:randomUUID(),role:'tool',content:JSON.stringify(result)});
   }
   stream.push({type:'CUSTOM',name:'shopibricks.ui',value:{kind:'products',products:[sku],headline:'Verified fixture selection'}});
  }
  stream.push({type:'RUN_FINISHED',threadId:request.threadId,runId:request.runId});
  await new Promise(r=>setTimeout(r,150));return route.fulfill({contentType:'text/event-stream',body:stream.map(e=>`data: ${JSON.stringify(e)}\n\n`).join('')});
 }
 return route.fulfill({status:500,json:{error:{message:`Unexpected fixture request ${path}`}}});
});
const button=name=>page.getByRole('button',{name,exact:true});
try{
 await page.goto(base);await page.locator('.map-node').first().waitFor();await button('Live journeys').click();await page.locator('.activity-row').first().waitFor();
 check(await page.locator('.activity-row').count()===2,'Start and completed events collapse into one call');
 check((await page.locator('.activity-kpis').innerText()).includes('Saved quotes'),'Observed quote metrics are visible');
 await page.getByRole('group',{name:'Activity source'}).getByRole('button',{name:'ChatGPT',exact:true}).click();
 await page.locator('.activity-row').filter({hasText:'weekend headphones'}).click();check((await page.locator('.activity-evidence').innerText()).includes('81 ms'),'Evidence includes measured duration and source');
 await page.getByText('Inspect recorded payload',{exact:true}).click();check((await page.locator('.activity-evidence pre').innerText()).includes('search'),'Recorded payload is inspectable');
 await page.screenshot({path:new URL('merchant-desktop.png',out).pathname,fullPage:true});
 await button('Ask the merchant copilot').click();await page.locator('.message.assistant').filter({hasText:'Fixture answer'}).waitFor();
 check(requests[0].experience.persona==='merchant'&&requests[0].workspace.view==='activity','CopilotKit sends merchant context and selected evidence');
 check(await page.locator('.live-activity').isVisible(),'AG-UI navigation state focuses the merchant workspace');
 await button('Close copilot').click();
 for(const width of [390,320]){await page.setViewportSize({width,height:900});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Live journeys fits ${width}px`);await page.screenshot({path:new URL(`merchant-${width}.png`,out).pathname,fullPage:true});}
 await page.setViewportSize({width:1440,height:1050});await page.goto(`${base}/?quote=${id}`);await page.locator('.saved-quote-items').waitFor();
 check((await page.locator('.saved-quote').innerText()).includes('Price changed'),'Quote handoff surfaces a changed price');
 check(!writes.some(p=>p.includes('/continue')),'Opening a quote does not create a checkout');
 await page.screenshot({path:new URL('shopper-desktop.png',out).pathname,fullPage:true});
 await button('Review sandbox checkout').click();await page.locator('.checkout-drawer').waitFor();check(!writes.some(p=>p.endsWith('/complete')),'Continuing a quote never submits an order');
 await page.goto(`${base}/?quote=${id}`);await page.locator('.saved-quote-items').waitFor();await button('Copilot').click();await page.getByLabel('Ask your shopping concierge').fill('Suggest a useful alternative.');await button('Send message').click();await page.locator('.generated-card').waitFor();
 check(requests.at(-1).experience.persona==='shopper','Quote handoff opens the shopper persona');check(requests.at(-1).threadId!==requests[0].threadId,'Merchant and shopper use separate CopilotKit threads');
 await page.locator('.copilot-proof').filter({hasText:'Stock checked for 1 products'}).waitFor();
 check(await page.locator('.copilot-proof').filter({hasText:'Stock checked for 1 products'}).isVisible(),'CopilotKit renders inventory evidence from the tool result');
 check(await page.getByRole('link',{name:'Open your saved quote'}).getAttribute('href')===`/?quote=${id}`,'CopilotKit renders the exact saved quote continuation link');
 await button('Close copilot').click();await page.setViewportSize({width:390,height:900});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Saved quote fits mobile');await page.screenshot({path:new URL('shopper-mobile.png',out).pathname,fullPage:true});
 unavailable=true;await page.reload();await page.locator('.saved-quote-items').waitFor();check(await button('Review sandbox checkout').isDisabled(),'Unavailable inventory blocks continuation');
 expired=true;await page.reload();await page.getByRole('alert').filter({hasText:'expired'}).waitFor();check(await button('Review sandbox checkout').count()===0,'Expired quotes show a recovery message');
 check(errors.length===0,`No runtime errors: ${errors.join('; ')}`);await writeFile(new URL('results.json',out),JSON.stringify({passed:true,checks,requests},null,2));console.log(JSON.stringify({passed:true,checks:checks.length}));
}catch(e){await page.screenshot({path:new URL('failure.png',out).pathname,fullPage:true});await writeFile(new URL('results.json',out),JSON.stringify({passed:false,error:String(e),checks,errors,requests},null,2));throw e;}finally{await browser.close();}
