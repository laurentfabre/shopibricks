import {fixtureTransport,agentRequest} from './copilot-fixtures.mjs';
import {chromium} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
const base=process.env.SHOPIBRICKS_TEST_URL||'http://localhost:8012';
const products=JSON.parse(await readFile(new URL('../app/server-products.json',import.meta.url)));
const fixture=JSON.parse(await readFile(new URL('./artifacts/atlas/fixture.json',import.meta.url)));
const out=new URL('./artifacts/atlas/',import.meta.url);await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1100},reducedMotion:'reduce'});page.setDefaultTimeout(10000);
const errors=[],checks=[],requests=[],intelligenceRequests=[];let fail=false;
const check=(condition,label)=>{if(!condition)throw new Error(label);checks.push(label);};
await page.route('**/api/**',async route=>{if(await fixtureTransport(route))return;
 const url=new URL(route.request().url()),p=url.pathname;let data={};
 if(p==='/api/products')data={products};
 else if(p==='/api/health')data={database:'connected',model:'Browser fixture',gateway:'configured'};
 else if(p==='/api/whoami')data={label:'Browser fixture'};
 else if(p==='/api/intelligence'){
  intelligenceRequests.push(url.search);
  if(fail)return route.fulfill({status:503,json:{error:{message:'Fixture: intelligence temporarily unavailable'}}});
  const activity=url.searchParams.get('source')==='activity';
  const queries=activity?[]:fixture.queries.filter(q=>(!url.searchParams.get('profile')||q.profile===url.searchParams.get('profile'))&&(!url.searchParams.get('channel')||q.channel===url.searchParams.get('channel')));
  const clusters=fixture.clusters.map(c=>{const list=queries.filter(q=>q.cluster===c.id);return {...c,count:list.length,matched:list.filter(q=>q.status==='matched').length,gaps:list.filter(q=>q.status!=='matched').length};}).filter(c=>c.count);
  data={...fixture,source:activity?'activity':'examples',queries,clusters,summary:{queries:queries.length,clusters:clusters.length,matched:queries.filter(q=>q.status==='matched').length,gaps:queries.filter(q=>q.status!=='matched').length,products:products.length}};
 }else if(p==='/api/catalog/readiness')data={ready:12,total:12,available:12,as_of:new Date().toISOString(),source:'Browser fixture',items:products.map(p=>({...p,ready:true,checks:[{key:'identity',label:'Stable ID and product name',ok:true}]}))};
 else if(p==='/api/catalog/feed')data={schema:'shopibricks.catalog.v1',sandbox:true,products};
 else if(p==='/api/events')data={events:[]};
 else if(p==='/api/operations')data={metrics:{orders:0,revenue_cents:0},inventory:products,orders:[],events:[],as_of:new Date().toISOString(),source:'Browser fixture'};
 else if(p==='/api/lakehouse')data={daily:[],demand:[],sql:'SELECT fixture',source:'Browser fixture',queried_at:new Date().toISOString()};
 else if((p==='/api/agent/run'||p.endsWith('/agent/default/run'))){
  const request=agentRequest(route);requests.push(request);const runId=request.runId||randomUUID(),threadId=request.threadId||randomUUID(),messageId=randomUUID();
  const events=[{type:'RUN_STARTED',runId,threadId},{type:'TEXT_MESSAGE_START',messageId,role:'assistant'},{type:'TEXT_MESSAGE_CONTENT',messageId,delta:`Fixture reply for ${request.experience.profile}, ${request.experience.voice}.`},{type:'TEXT_MESSAGE_END',messageId},{type:'RUN_FINISHED',runId,threadId}];
  await new Promise(r=>setTimeout(r,250));return route.fulfill({contentType:'text/event-stream',body:events.map(e=>`data: ${JSON.stringify(e)}\n\n`).join('')});
 }else return route.fulfill({status:500,json:{error:{message:`Unexpected test request: ${p}`}}});
 return route.fulfill({json:data});
});page.on('pageerror',e=>errors.push(e.message));
const button=(name)=>page.getByRole('button',{name,exact:true});
const tab=(name)=>page.getByRole('navigation',{name:'Merchant workspace'}).getByRole('button',{name});
const merchant=()=>page.getByRole('button',{name:/Merchant Grow your brand/}).click();
const shopper=()=>page.getByRole('button',{name:/Shopper Discover & shop/}).click();
const send=async(text)=>{await page.getByRole('textbox',{name:'Ask your shopping concierge'}).fill(text);await button('Send message').click();await button('Stop agent run').waitFor();check(await page.getByRole('button',{name:/Alex focused commuter/i}).isDisabled(),'Context cannot switch during an agent run');await button('Stop agent run').waitFor({state:'hidden'});};
try{
 await page.goto(base);await page.locator('.map-node').first().waitFor();
 check(await page.locator('.map-node').count()===72,'Every example question has a map point');
 check(await page.locator('.sample-badge').isVisible(),'Fictional dataset provenance is visible');
 check(await page.locator('.concierge').isHidden(),'Merchant map has the full workspace by default');
 await page.screenshot({path:new URL('atlas-desktop.png',out).pathname,fullPage:true});
 const before=await page.locator('.map-controls output').innerText();await button('Zoom in').click();check(await page.locator('.map-controls output').innerText()!==before,'Zoom changes the map viewport');await button('Reset map view').click();
 await button('Expand intent map').click();check(await page.locator('.map-expanded').isVisible(),'Map expands for inspection');await button('Exit expanded map').click();
 await page.locator('.map-node').first().focus();await page.keyboard.press('Enter');await page.locator('.selected-question').waitFor();check(await page.locator('.query-context-tags').isVisible(),'Keyboard point selection opens the query context and matches');
 await page.screenshot({path:new URL('atlas-inspector.png',out).pathname,fullPage:true});
 await button('Clear intent selection').click();await page.getByLabel('Search intent questions').fill('running shoes');
 check(await page.locator('.query-table strong').count()===2,'Question search narrows the visible rows');
 await page.locator('.query-table strong').first().click();check((await page.locator('.match-explanation').innerText()).includes('No shoes category'),'Unsupported demand explains its assortment gap');
 const query=(await page.locator('.selected-question').innerText()).replace(/[“”]/g,'');
 await button('Try in the storefront').click();await page.getByRole('heading',{name:'Who are we shopping for?'}).waitFor();
 check(await page.getByLabel('Ask your shopping concierge').inputValue()===query,'Query handoff prefills the shopper composer');check(requests.length===0,'Query handoff waits for user submission');
 await button('Close copilot').click();await page.getByRole('button',{name:/Camille Paris weekender/i}).click();await button('Add Atelier Notebook to bag').click();check(await button('Review bag, 1 items').isVisible(),'Shopper cart supports manual product selection');
 await page.getByRole('button',{name:/Alex focused commuter/i}).click();check(await button('Review bag, 0 items').isVisible(),'Each shopper profile keeps its own bag');
 await button('Copilot').click();await page.getByLabel('Shopping experience',{exact:true}).selectOption('storefront');await send('Find my workday essentials');check(requests.at(-1).experience.profile==='alex','Selected profile reaches the agent');
 await page.getByLabel('Shopping experience',{exact:true}).selectOption('travel');await send('Find my travel essentials');check(requests.at(-1).threadId!==requests.at(-2).threadId&&requests.at(-1).experience.channel==='travel','Specialist experiences keep separate conversations');
 await page.getByLabel('Shopping experience',{exact:true}).selectOption('storefront');await send('One more suggestion');check(!!requests.at(-1).threadId,'Returning to a context restores its conversation');
 await merchant();await tab('Catalog lab').click();await page.getByLabel('Search catalog lab').fill('Memo');check(await page.locator('.catalog-product').count()===1,'Catalog lab searches real product metadata');await page.locator('.catalog-product').click();check((await page.locator('.product-dossier').innerText()).includes('Memo'),'Selected product opens its catalog dossier');
 const download=page.waitForEvent('download');await button('Export catalog preview').click();check((await download).suggestedFilename()==='shopibricks-catalog.json','Catalog preview exports as JSON');await page.screenshot({path:new URL('catalog-desktop.png',out).pathname,fullPage:true});
 await tab('Brand studio').click();await page.getByRole('group',{name:'Brand voice'}).getByRole('button',{name:/Concise/}).click();check((await page.locator('.brand-preview').innerText()).includes('VAT included'),'Voice preview preserves live product facts');await page.screenshot({path:new URL('brand-desktop.png',out).pathname,fullPage:true});
 await button('Try this voice with the concierge').click();await send('Try my new brand voice');check(requests.at(-1).experience.voice==='concise'&&requests.at(-1).threadId!==requests.at(-2).threadId,'Brand voice reaches the agent in a separate conversation');
 await merchant();await tab('Channels').click();await page.getByRole('button',{name:/ChatGPT External AI platform/}).click();check((await page.locator('.channel-dossier').innerText()).includes('Not connected'),'External platforms are accurately marked unconnected');await page.screenshot({path:new URL('channels-desktop.png',out).pathname,fullPage:true});
 await tab('Intent atlas').click();await button('My live activity').click();await page.locator('.atlas-empty').waitFor();check(await page.locator('.map-node').count()===0,'Empty live activity never invents example traffic');
 await button('Example queries').click();await page.locator('.map-node').first().waitFor();await page.getByLabel('Atlas shopper profile').selectOption('noor');await page.waitForFunction(()=>document.querySelectorAll('.map-node').length<72);check(intelligenceRequests.at(-1).includes('profile=noor'),'Profile filter is applied by the API');
 await page.getByLabel('Atlas shopper profile').selectOption('');await page.getByLabel('Number of intent clusters').selectOption('4');await page.waitForTimeout(100);check(intelligenceRequests.at(-1).includes('clusters=4'),'Cluster detail is requested from the clustering engine');
 fail=true;await button('Refresh intent intelligence').click();await page.locator('.atlas-error').waitFor();check(await page.locator('.map-node').count()===0,'Failed refresh removes stale graph data');fail=false;await button('Try again').click();await page.locator('.map-node').first().waitFor();
 const exported=page.waitForEvent('download');await button('Export view').click();check((await exported).suggestedFilename()==='shopibricks-intents-examples.json','Intent export retains source identity');
 for(const width of [1440,1024,768,390,320]){
  await page.setViewportSize({width,height:1000});await merchant();
  for(const view of ['Intent atlas','Catalog lab','Brand studio','Channels']){await tab(view).click();await page.waitForTimeout(80);check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${view} fits ${width}px without horizontal overflow`);if(width===390)await page.screenshot({path:new URL(`${view.split(' ')[0].toLowerCase()}-mobile.png`,out).pathname,fullPage:true});}
  await shopper();await button('Close copilot').click();check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Storefront fits ${width}px`);
  await page.getByRole('button',{name:/Developer Connect & inspect/}).click();check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Developer studio fits ${width}px`);
 }
 check(errors.length===0,`No browser runtime errors: ${errors.join('; ')}`);await writeFile(new URL('browser-results.json',out),JSON.stringify({passed:true,checks,requests},null,2));console.log(JSON.stringify({passed:true,checks:checks.length}));
}catch(e){await page.screenshot({path:new URL('failure.png',out).pathname,fullPage:true});await writeFile(new URL('browser-results.json',out),JSON.stringify({passed:false,error:String(e),checks,errors},null,2));throw e;}finally{await browser.close();}
