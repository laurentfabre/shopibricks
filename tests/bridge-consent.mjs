/** Render the hosted consent document in isolated Chrome and capture its real
 * form submission. JSON travels over stdin/stdout to the native-SDK verifier;
 * never invoke this helper with credentials on the command line or log its
 * output. No request is sent to Databricks or ChatGPT by this browser.
 */
import {chromium} from 'playwright';

async function main(){
 let input='';for await(const chunk of process.stdin)input+=chunk;
 const consent=JSON.parse(input),origin=new URL(consent.url).origin;
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const context=await browser.newContext(),page=await context.newPage();
  page.setDefaultTimeout(10000);
  let resolveForm;const submission=new Promise(resolve=>{resolveForm=resolve;});
  await page.route('**/*',async route=>{
   const request=route.request();
   if(request.url()===consent.url&&request.method()==='GET')return route.fulfill({status:200,headers:consent.headers,body:consent.html});
   if(request.url()===origin+'/bridge/approve'&&request.method()==='POST'){
    const headers=await request.allHeaders();
    const cookies=(await context.cookies()).map(({name,domain,path,secure,sameSite})=>({name,domain,path,secure,sameSite}));
    resolveForm({body:request.postData(),headers:{'Content-Type':headers['content-type'],'Origin':headers.origin||'','Cookie':headers.cookie||''},cookie_metadata:cookies});
    return route.fulfill({status:200,contentType:'text/html',body:'<p>Browser form captured for hosted verification.</p>'});
   }
   return route.abort();
  });
  await page.goto(consent.url);
  await page.getByRole('button',{name:'Allow catalog, inventory and temporary quote access',exact:true}).click();
  const form=await Promise.race([submission,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('Form submission timed out')),10000);timer.unref();})]);
  process.stdout.write(JSON.stringify(form));
 }finally{await browser.close();}
}
main().catch(()=>{process.stderr.write('Consent browser verification failed; request details suppressed.\n');process.exitCode=1;});
