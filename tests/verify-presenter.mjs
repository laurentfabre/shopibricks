import {fixtureTransport} from './copilot-fixtures.mjs';
/** Presenter guide and safe Driver.js highlights, using explicit API fixtures. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const base=process.env.SHOPIBRICKS_TEST_URL||'http://localhost:8012';
const out=new URL('./artifacts/presenter/',import.meta.url);await mkdir(out,{recursive:true});
const products=JSON.parse(await readFile(new URL('../app/server-products.json',import.meta.url)));
const atlas=JSON.parse(await readFile(new URL('./artifacts/atlas/fixture.json',import.meta.url)));
const browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});const page=await context.newPage();page.setDefaultTimeout(12000);
const checks=[],errors=[],writes=[];let atlasDelay=400,atlasFailed=false,atlasEmpty=false;
page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.presenterCopied=text;}}});});
await page.route('**/api/**',async route=>{if(await fixtureTransport(route))return;
 const req=route.request(),path=new URL(req.url()).pathname;const json=body=>route.fulfill({json:body});if(req.method()!=='GET')writes.push(path);
 if(path==='/api/products')return json({products});
 if(path==='/api/health')return json({database:'connected',gateway:'configured',model:'Fixture'});
 if(path==='/api/whoami')return json({label:'Presenter fixture'});
 if(path==='/api/intelligence'){const failed=atlasFailed,empty=atlasEmpty;await new Promise(r=>setTimeout(r,atlasDelay));if(failed)return route.fulfill({status:503,json:{error:{message:'Fixture atlas unavailable'}}});return json(empty?{...atlas,queries:[],clusters:[],summary:{queries:0,clusters:0,matched:0,gaps:0,products:12}}:atlas);}
 if(path==='/api/catalog/readiness')return json({items:[],total:12,ready:12,available:12,source:'Fixture',as_of:new Date().toISOString()});
 if(path==='/api/operations')return json({metrics:{orders:0,revenue_cents:0},orders:[],inventory:products,events:[],source:'Fixture',as_of:new Date().toISOString()});
 if(path==='/api/lakehouse')return json({daily:[],demand:[],sql:'SELECT fixture',source:'Fixture',queried_at:new Date().toISOString()});
 if(path==='/api/events')return json({events:[]});
 return route.fulfill({status:500,json:{error:{message:`Unexpected test request ${path}`}}});
});
const dialog=()=>page.getByRole('dialog',{name:'A clear story. A confident demo.'});
const button=name=>page.getByRole('button',{name,exact:true});
const agenda=()=>page.getByRole('navigation',{name:'Demo agenda'}).getByRole('button');
const targets=['.persona-bar','.intent-map','.atlas-inspector','.live-activity','.catalog-summary','.voice-preview','.profile-section','.agent-roster','.composer','.bag-button','.metric-grid','.traffic-panel','.protocol-log','.destination-grid'];
const check=(condition,label)=>{assert.ok(condition,label);checks.push(label);};
async function highlight(target,index){
 await page.waitForFunction(selector=>document.querySelector(selector)?.classList.contains('driver-active-element')&&document.querySelector(selector)?.inert,target);
 await page.waitForFunction(n=>document.querySelector('.driver-popover-progress-text')?.textContent?.trim()===`${n+1} / 14`,index);
 // Driver.js refreshes placement on the next animation frame after notes expand.
 await page.waitForFunction(()=>{const r=document.querySelector('.driver-popover')?.getBoundingClientRect();return r&&r.x>=0&&r.y>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1;});
 const r=await page.locator('.driver-popover').boundingBox(),vp=page.viewportSize();assert.ok(r&&r.x>=0&&r.y>=0&&r.x+r.width<=vp.width+1&&r.y+r.height<=vp.height+1,`Popover fits viewport at ${index}: ${JSON.stringify(r)}`);
}
async function exit(){await button('Exit tour').click();await dialog().waitFor();assert.equal(await page.locator('.driver-active-element, [inert], .tour-loading').count(),0);}
try{
 await page.goto(`${base}/?product=sb-notebook`);await button('Add Atelier Notebook to bag').click();await button('Present').click();await dialog().waitFor();
 check(await agenda().count()===14,'Guide presents a 14-stop agenda with talking points');
 check(await dialog().getByRole('checkbox').isChecked()===false,'Shared-screen speaker notes start collapsed');
 await button('Copy this talking point').click();check((await page.evaluate(()=>window.presenterCopied)).includes('one question'),'Talking point copy uses the selected script');
 const downloadPromise=page.waitForEvent('download');await button('Download talking points').click();const download=await downloadPromise;await download.saveAs(new URL('presenter-notes.md',out).pathname);const exported=await readFile(new URL('presenter-notes.md',out),'utf8');check(exported.includes('## 14.')&&exported.includes('If unavailable'),'Downloaded notes include all highlights and fallback cues');
 await page.screenshot({path:new URL('guide-desktop.png',out).pathname});
 for(const width of [390,320]){await page.setViewportSize({width,height:844});check(await dialog().evaluate(e=>e.scrollWidth<=e.clientWidth+1),`Presenter guide has no horizontal overflow at ${width}px`);const box=await dialog().boundingBox();check(box.x>=0&&box.x+box.width<=width+1,`Guide fits ${width}px viewport`);await page.screenshot({path:new URL(`guide-${width}.png`,out).pathname});}
 await page.setViewportSize({width:1440,height:1000});await button('Start guided demo').click();await highlight(targets[0],0);check(await dialog().isVisible()===false,'Starting the spotlight closes the modal top layer');
 await button('Speaker notes').focus();await page.keyboard.press('Enter');check(await page.locator('.tour-notes-content').isVisible(),'Speaker notes can be expanded with the keyboard inside the tour');
 for(let i=0;i<targets.length;i++){await highlight(targets[i],i);assert.equal(await button('Speaker notes').getAttribute('aria-expanded'),'true');if(i===1)await page.screenshot({path:new URL('cluster-spotlight.png',out).pathname});await button(i===targets.length-1?'Finish tour':'Next tour step').click();}
 await dialog().waitFor();check(writes.length===0,'All 14 highlights navigate without submitting prompts or mutating commerce');check(await page.getByRole('button',{name:'Review bag, 1 items',exact:true,includeHidden:true}).count()===1,'The tour preserves the original shopper bag');check(await page.locator('.driver-active-element, [inert]').count()===0,'Tour finish removes every highlight and restores interaction');
 await agenda().nth(8).click();await button('Use demo prompt').click();await dialog().waitFor({state:'hidden'});const prompt=await page.getByLabel('Ask your shopping concierge').inputValue();check(prompt.includes('maximum €250 total')&&writes.length===0,'Demo prompt prefills the composer without a model request');
 await button('Present').click();await agenda().nth(1).click();await button('Spotlight this step').click();await highlight('.intent-map',1);await button('Previous tour step').click();await highlight('.persona-bar',0);await page.keyboard.press('Escape');await dialog().waitFor();check(await page.getByLabel('Ask your shopping concierge').inputValue()===prompt,'Escape restores the original conversation draft and guide');
 atlasFailed=true;await agenda().nth(1).click();await button('Spotlight this step').click();await highlight('.intent-panel',1);check(await page.locator('.tour-unavailable').isVisible(),'Unavailable atlas has a real-panel fallback and a visible explanation');await exit();atlasFailed=false;
 atlasEmpty=true;await button('Spotlight this step').click();await highlight('.intent-panel',1);check(await page.locator('.tour-unavailable').isVisible(),'An empty atlas is not presented as a populated graph');await exit();atlasEmpty=false;
 atlasDelay=700;await button('Spotlight this step').click();await page.locator('.tour-loading').waitFor();await page.locator('.tour-loading').getByRole('button',{name:'Cancel'}).click();await dialog().waitFor();await page.waitForTimeout(850);check(await page.locator('.driver-popover,.tour-loading').count()===0,'Canceling a pending highlight prevents a late tour from appearing');
 await button('Spotlight this step').click();await page.locator('.tour-loading').waitFor();await page.keyboard.press('Escape');await dialog().waitFor();await page.waitForTimeout(850);check(await page.locator('.driver-popover,.tour-loading').count()===0,'Escape cancels an initial asynchronous highlight and restores the guide');atlasDelay=80;
 await page.setViewportSize({width:320,height:844});await dialog().getByRole('checkbox').check();await button('Start guided demo').click();for(let i=0;i<targets.length;i++){await highlight(targets[i],i);await button(i===targets.length-1?'Finish tour':'Next tour step').click();}await dialog().waitFor();check(true,'All 14 highlights and expanded notes fit the 320px mobile viewport');
 await page.keyboard.press('Escape');await dialog().waitFor({state:'hidden'});check(await button('Present').evaluate(e=>e===document.activeElement),'Closing the guide restores the presentation trigger focus');
 check(errors.length===0,`No runtime exceptions: ${errors.join('; ')}`);check(writes.length===0,'Rehearsal, fallbacks, exports and prompt preparation make zero POST requests');
 await writeFile(new URL('results.json',out),JSON.stringify({passed:true,checks,errors},null,2));console.log(JSON.stringify({passed:true,checks:checks.length}));
}catch(error){await page.screenshot({path:new URL('failure.png',out).pathname,fullPage:true});await writeFile(new URL('results.json',out),JSON.stringify({passed:false,error:String(error),checks,errors},null,2));throw error;}finally{await browser.close();}
