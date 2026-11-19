import test from 'node:test';
import assert from 'node:assert/strict';
import {BridgeOAuth,bridgeScope,digest,type BridgeStore,type Records,type RecordValue} from '../server/bridge-oauth.js';
import express from 'express';
import {bridgeMcp,restrictBridgePrincipal} from '../server/bridge.js';

class MemoryStore implements BridgeStore {
 rows=new Map<string,RecordValue>();tail=Promise.resolve();
 async atomic<T>(fn:(rows:Records)=>Promise<T>):Promise<T>{
  const previous=this.tail;let release!:()=>void;this.tail=new Promise(resolve=>{release=resolve;});await previous;
  const copy=structuredClone(this.rows);
  try{const result=await fn({get:async key=>copy.get(key),set:async(key,value)=>{copy.set(key,value);}});this.rows=copy;return result;}finally{release();}
 }
}
async function setup(){
 let time=1000000;const store=new MemoryStore(),oauth=new BridgeOAuth('https://bridge.example',store,()=>time);
 const client=await oauth.register({redirect_uris:['https://chatgpt.com/connector/oauth/demo123'],token_endpoint_auth_method:'none'});
 const verifier='v'.repeat(64),owner='laurent@example.com';
 const request={client_id:client.client_id,redirect_uri:client.redirect_uris[0],response_type:'code',code_challenge:digest(verifier),code_challenge_method:'S256',state:'test-state',resource:oauth.resource,scope:bridgeScope};
 async function code(){const p=await oauth.begin(request,owner);return new URL(await oauth.approve(p.request,p.csrf,owner,true)).searchParams.get('code')!;}
 const exchange=(value:string)=>({client_id:client.client_id,grant_type:'authorization_code',code:value,code_verifier:verifier,redirect_uri:request.redirect_uri,resource:oauth.resource});
 return{store,oauth,client,owner,verifier,request,code,exchange,advance:(ms:number)=>{time+=ms;}};
}
test('OAuth approval preserves state and issuer, scopes access, and stores only hashed credentials',async()=>{
 const s=await setup(),p=await s.oauth.begin(s.request,s.owner);
 const redirect=new URL(await s.oauth.approve(p.request,p.csrf,s.owner,true));
 assert.equal(redirect.searchParams.get('state'),'test-state');assert.equal(redirect.searchParams.get('iss'),s.oauth.issuer);
 const code=redirect.searchParams.get('code')!,tokens=await s.oauth.token(s.exchange(code));
 assert.deepEqual(await s.oauth.verify(tokens.access_token),{owner:s.owner,client:s.client.client_id});
 assert.equal(tokens.scope,bridgeScope);
 const persisted=JSON.stringify([...s.store.rows]);for(const value of [code,tokens.access_token,tokens.refresh_token,p.csrf])assert.equal(persisted.includes(value),false);
});
test('Only an exact ChatGPT HTTPS callback can be registered and used',async()=>{
 const s=await setup();
 for(const uri of ['http://chatgpt.com/connector/oauth/demo','https://chatgpt.com.evil.example/connector/oauth/demo','https://chatgpt.com/connector/oauth/demo?next=x','https://other.example/callback'])await assert.rejects(s.oauth.register({redirect_uris:[uri],token_endpoint_auth_method:'none'}));
 await assert.rejects(s.oauth.begin({...s.request,redirect_uri:'https://chatgpt.com/connector/oauth/other'},s.owner));
 await assert.rejects(s.oauth.begin({...s.request,code_challenge_method:'plain'},s.owner));
});
test('Consent is bound to the authenticated user and browser session and cancellation grants nothing',async()=>{
 const s=await setup(),p=await s.oauth.begin(s.request,s.owner);
 await assert.rejects(s.oauth.approve(p.request,p.csrf,'other@example.com',true));
 await assert.rejects(s.oauth.approve(p.request,'incorrect',s.owner,true));
 const canceled=new URL(await s.oauth.approve(p.request,p.csrf,s.owner,false));assert.equal(canceled.searchParams.get('error'),'access_denied');assert.equal(canceled.searchParams.has('code'),false);
 await assert.rejects(s.oauth.approve(p.request,p.csrf,s.owner,true));
});
test('Code exchange requires the original PKCE verifier, client, callback and resource',async()=>{
 const s=await setup(),code=await s.code(),body=s.exchange(code);
 for(const patch of [{code_verifier:'x'.repeat(64)},{client_id:'other'},{redirect_uri:'https://chatgpt.com/connector/oauth/other'},{resource:'https://other.example/mcp'},{scope:'all-apis'}])await assert.rejects(s.oauth.token({...body,...patch}));
 assert.ok((await s.oauth.token(body)).access_token);
});
test('Concurrent code exchanges allow exactly one redemption',async()=>{
 const s=await setup(),body=s.exchange(await s.code());
 const results=await Promise.allSettled([s.oauth.token(body),s.oauth.token(body)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
});
test('Authorization requests, codes and access tokens expire',async()=>{
 const s=await setup(),pending=await s.oauth.begin(s.request,s.owner);s.advance(301000);
 await assert.rejects(s.oauth.approve(pending.request,pending.csrf,s.owner,true));
 const code=await s.code();s.advance(61000);await assert.rejects(s.oauth.token(s.exchange(code)));
 const tokens=await s.oauth.token(s.exchange(await s.code()));s.advance(601000);await assert.rejects(s.oauth.verify(tokens.access_token));
});
test('Refresh rotation rejects replay and revokes the entire grant',async()=>{
 const s=await setup(),first=await s.oauth.token(s.exchange(await s.code()));
 const body={client_id:s.client.client_id,grant_type:'refresh_token',refresh_token:first.refresh_token,resource:s.oauth.resource};
 const second=await s.oauth.token(body);assert.notEqual(second.refresh_token,first.refresh_token);await s.oauth.verify(second.access_token);
 await assert.rejects(s.oauth.token(body));await assert.rejects(s.oauth.verify(second.access_token));await assert.rejects(s.oauth.verify(first.access_token));
});
test('Revocation is client-bound and invalidates both access and refresh credentials',async()=>{
 const s=await setup(),tokens=await s.oauth.token(s.exchange(await s.code()));
 await s.oauth.revoke({client_id:'other',token:tokens.access_token});await s.oauth.verify(tokens.access_token);
 await s.oauth.revoke({client_id:s.client.client_id,token:tokens.access_token});await assert.rejects(s.oauth.verify(tokens.access_token));
 await assert.rejects(s.oauth.token({client_id:s.client.client_id,grant_type:'refresh_token',refresh_token:tokens.refresh_token}));
});
test('Audience and scope cannot be broadened at authorization; native credentials are not accepted',async()=>{
 const s=await setup();await assert.rejects(s.oauth.begin({...s.request,scope:'all-apis'},s.owner));await assert.rejects(s.oauth.begin({...s.request,resource:'https://other.example/mcp'},s.owner));await assert.rejects(s.oauth.verify('not-a-bridge-token'));
});
test('MCP bridge refuses order creation and unknown methods before contacting commerce tools',async()=>{
 for(const name of ['prepare_checkout','complete_checkout','run_sql']){
  const r=await bridgeMcp({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:{}}},'owner');assert.ok(r.body&&'error' in r.body);
 }
 const init=await bridgeMcp({jsonrpc:'2.0',id:2,method:'initialize',params:{protocolVersion:'2025-03-26'}},'owner');assert.equal(init.status,200);
});
test('Dedicated bridge identity reaches the relay but cannot use ordinary app routes',async()=>{
 const previous=process.env.SHOPIBRICKS_BRIDGE_PRINCIPALS;
 process.env.SHOPIBRICKS_BRIDGE_PRINCIPALS='bridge-numeric-id,bridge-client-id';
 const app=express();app.use(restrictBridgePrincipal);app.all('*',(_req,res)=>res.json({reached:true}));
 const server=app.listen(0,'127.0.0.1');
 try{
  await new Promise<void>((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
  const address=server.address();assert.ok(address&&typeof address==='object');
  const base=`http://127.0.0.1:${address.port}`;
  const identities:Array<Record<string,string>>=[{'x-forwarded-user':'bridge-numeric-id'},{'x-forwarded-email':'bridge-client-id'}];
  for(const headers of identities){
   assert.equal((await fetch(base+'/bridge/relay',{method:'POST',headers})).status,200);
   for(const path of ['/api/checkout','/checkout_sessions','/api/scenarios','/mcp'])assert.equal((await fetch(base+path,{method:'POST',headers})).status,403);
  }
  assert.equal((await fetch(base+'/api/products',{headers:{'x-forwarded-email':'owner@example.com'}})).status,200);
 }finally{
  await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  if(previous===undefined)delete process.env.SHOPIBRICKS_BRIDGE_PRINCIPALS;else process.env.SHOPIBRICKS_BRIDGE_PRINCIPALS=previous;
 }
});
