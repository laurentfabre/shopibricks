import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { OAuthClientMetadataSchema } from '@modelcontextprotocol/sdk/shared/auth.js';

export const bridgeScope='shopibricks:read';
export type RecordValue={kind:string;data:Record<string,any>;expires:number};
export interface Records {get(key:string):Promise<RecordValue|undefined>;set(key:string,value:RecordValue):Promise<void>}
export interface BridgeStore {atomic<T>(fn:(records:Records)=>Promise<T>):Promise<T>}
export class BridgeError extends Error {constructor(public code:string,message:string,public status=400){super(message);}}
function fail(code:string,message:string,status=400):never{throw new BridgeError(code,message,status);}
export const digest=(value:string)=>createHash('sha256').update(value).digest('base64url');
const random=()=>randomBytes(32).toString('base64url');
const string=z.string().min(1).max(2048);
const redirectAllowed=(value:string)=>{
 try{const u=new URL(value);return u.origin==='https://chatgpt.com'&&!u.search&&!u.hash&&(/^\/connector\/oauth\/[A-Za-z0-9_-]+$/.test(u.pathname)||u.pathname==='/connector_platform_oauth_redirect');}catch{return false;}
};

/** The bridge has its own OAuth grants. No Databricks access/refresh tokens are stored here. */
export class BridgeOAuth {
 readonly resource:string;
 constructor(readonly issuer:string,private store:BridgeStore,private now=()=>Date.now()){
  const u=new URL(issuer);if(u.protocol!=='https:'||u.origin!==issuer)throw new Error('Bridge issuer must be an HTTPS origin');
  this.resource=issuer+'/mcp';
 }
 private entry(kind:string,data:Record<string,any>,seconds:number):RecordValue{return{kind,data,expires:this.now()+seconds*1000};}
 private async read(records:Records,key:string,kind:string){const row=await records.get(key);return row&&row.kind===kind&&row.expires>this.now()?row:undefined;}
 private audience(value:unknown){if(value!==undefined&&value!==this.resource)fail('invalid_target','Unexpected resource');}
 private scopes(value:unknown){if(value!==undefined&&value!==bridgeScope)fail('invalid_scope','Only read-only ShopiBricks tools are available');}
 private async limit(records:Records,key:string,max:number,seconds:number){
  const row=await this.read(records,'rate:'+key,'rate')??this.entry('rate',{count:0},seconds);
  if(row.data.count>=max)fail('temporarily_unavailable','Please retry later',429);
  row.data.count++;await records.set('rate:'+key,row);
 }
 async register(body:unknown){
  const parsed=OAuthClientMetadataSchema.safeParse(body);
  if(!parsed.success)fail('invalid_client_metadata','Invalid client metadata');
  const metadata=parsed.data!;
  if(metadata.redirect_uris.length!==1||!metadata.redirect_uris.every(redirectAllowed))fail('invalid_redirect_uri','One exact ChatGPT HTTPS callback is required');
  if(metadata.token_endpoint_auth_method&&metadata.token_endpoint_auth_method!=='none')fail('invalid_client_metadata','This server supports public clients with PKCE');
  if(metadata.grant_types?.some(x=>!['authorization_code','refresh_token'].includes(x))||metadata.response_types?.some(x=>x!=='code'))fail('invalid_client_metadata','Unsupported grant or response type');
  this.scopes(metadata.scope);
  return this.store.atomic(async records=>{
   await this.limit(records,'register',30,3600);
   const client={client_id:randomUUID(),client_id_issued_at:Math.floor(this.now()/1000),client_name:'ChatGPT · ShopiBricks',redirect_uris:metadata.redirect_uris,token_endpoint_auth_method:'none',grant_types:['authorization_code','refresh_token'],response_types:['code'],scope:bridgeScope};
   await records.set('client:'+client.client_id,this.entry('client',client,30*86400));return client;
  });
 }
 async begin(input:unknown,owner:string){
  const parsed=z.object({client_id:string,redirect_uri:string,response_type:z.literal('code'),code_challenge:z.string().regex(/^[A-Za-z0-9_-]{43}$/),code_challenge_method:z.literal('S256'),state:z.string().min(1).max(2048),resource:string.optional(),scope:string.optional()}).safeParse(input);
  if(!parsed.success)fail('invalid_request','Authorization requires a client, exact callback, state and PKCE S256');
  const p=parsed.data!;this.audience(p.resource);this.scopes(p.scope);
  return this.store.atomic(async records=>{
   await this.limit(records,'authorize:'+digest(owner),60,3600);
   const client=await this.read(records,'client:'+p.client_id,'client');
   if(!client||!client.data.redirect_uris.includes(p.redirect_uri))fail('invalid_client','Client or callback is not registered');
   const request=random(),csrf=random();
   await records.set('pending:'+digest(request),this.entry('pending',{...p,owner,csrf:digest(csrf)},300));
   return{request,csrf,redirect:p.redirect_uri};
  });
 }
 async approve(request:string,csrf:string,owner:string,allow:boolean){
  return this.store.atomic(async records=>{
   const key='pending:'+digest(request),row=await this.read(records,key,'pending');
   if(!row||row.data.used||row.data.owner!==owner||row.data.csrf!==digest(csrf))fail('invalid_request','Approval expired or belongs to another session');
   row.data.used=true;await records.set(key,row);
   const url=new URL(row.data.redirect_uri);url.searchParams.set('state',row.data.state);url.searchParams.set('iss',this.issuer);
   if(!allow){url.searchParams.set('error','access_denied');return url.href;}
   const code='sb_code_'+random();
   await records.set(digest(code),this.entry('code',{owner,client:row.data.client_id,redirect:row.data.redirect_uri,challenge:row.data.code_challenge,used:false},60));
   url.searchParams.set('code',code);return url.href;
  });
 }
 private async issue(records:Records,grantId:string,grant:RecordValue){
  const access='sb_access_'+random(),refresh='sb_refresh_'+random();
  await records.set(digest(access),{kind:'access',data:{grant:grantId,client:grant.data.client},expires:Math.min(this.now()+600000,grant.expires)});
  await records.set(digest(refresh),{kind:'refresh',data:{grant:grantId,client:grant.data.client,used:false},expires:grant.expires});
  return{access_token:access,token_type:'Bearer',expires_in:Math.max(1,Math.floor((Math.min(this.now()+600000,grant.expires)-this.now())/1000)),refresh_token:refresh,scope:bridgeScope};
 }
 async token(body:unknown){
  const parsed=z.object({client_id:string,grant_type:z.enum(['authorization_code','refresh_token']),code:string.optional(),code_verifier:z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/).optional(),redirect_uri:string.optional(),refresh_token:string.optional(),resource:string.optional(),scope:string.optional()}).safeParse(body);
  if(!parsed.success)fail('invalid_request','Invalid token request');
  const p=parsed.data!;this.audience(p.resource);this.scopes(p.scope);
  await this.store.atomic(async records=>{
   if(!await this.read(records,'client:'+p.client_id,'client'))fail('invalid_client','Unknown client');
   await this.limit(records,'token:'+p.client_id,200,3600);
  });
  const result=await this.store.atomic(async records=>{
   if(p.grant_type==='authorization_code'){
    if(!p.code||!p.code_verifier||!p.redirect_uri)fail('invalid_request','Code, verifier and callback are required');
    const key=digest(p.code!),row=await this.read(records,key,'code');
    if(!row||row.data.used||row.data.client!==p.client_id||row.data.redirect!==p.redirect_uri||row.data.challenge!==digest(p.code_verifier!))fail('invalid_grant','Invalid or expired authorization code');
    row.data.used=true;await records.set(key,row);
    const grantId='grant:'+randomUUID(),grant=this.entry('grant',{owner:row.data.owner,client:p.client_id,revoked:false},8*3600);
    await records.set(grantId,grant);return this.issue(records,grantId,grant);
   }
   if(!p.refresh_token)fail('invalid_request','Refresh token required');
   const key=digest(p.refresh_token!),row=await this.read(records,key,'refresh');
   if(!row||row.data.client!==p.client_id)fail('invalid_grant','Invalid refresh token');
   const grant=await this.read(records,row.data.grant,'grant');
   if(!grant||grant.data.revoked)fail('invalid_grant','Grant expired or revoked');
   if(row.data.used){grant.data.revoked=true;await records.set(row.data.grant,grant);return null;}
   row.data.used=true;await records.set(key,row);return this.issue(records,row.data.grant,grant);
  });
  // Commit revocation before reporting reuse; a thrown transaction would undo it.
  if(!result)fail('invalid_grant','Refresh token was already used; authorize again');
  return result;
 }
 async verify(token:string){
  if(!/^sb_access_[A-Za-z0-9_-]{43}$/.test(token))fail('invalid_token','Bridge access token required',401);
  return this.store.atomic(async records=>{
   const row=await this.read(records,digest(token),'access');
   const grant=row?await this.read(records,row.data.grant,'grant'):undefined;
   if(!row||!grant||grant.data.revoked)fail('invalid_token','Token expired or revoked',401);
   await this.limit(records,'mcp:'+row.data.grant,120,600);
   return{owner:String(grant.data.owner),client:String(grant.data.client)};
  });
 }
 async revoke(body:unknown){
  const p=z.object({client_id:string,token:string}).safeParse(body);if(!p.success)fail('invalid_request','Client and token required');
  await this.store.atomic(async records=>{
   const row=await records.get(digest(p.data!.token));
   if(!row||!['access','refresh'].includes(row.kind)||row.data.client!==p.data!.client_id)return;
   const grant=await this.read(records,row.data.grant,'grant');if(grant){grant.data.revoked=true;await records.set(row.data.grant,grant);}
  });return{};
 }
}
