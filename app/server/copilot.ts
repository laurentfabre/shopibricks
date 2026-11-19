import {AbstractAgent,EventType,type BaseEvent,type RunAgentInput} from '@ag-ui/client';
import {CopilotRuntime,InMemoryAgentRunner,createCopilotRuntimeHandler} from '@copilotkit/runtime';
import {Observable} from 'rxjs';
import {z} from 'zod';
import type {Request,Response,NextFunction} from 'express';
import {runAgent,cancelRun} from './agents.js';
import {agentInputSchema,experienceSchema} from './experience.js';
import {defaultExperience} from '../shared/experience.js';

const workspaceSchema=z.object({view:z.string().max(80),bag:z.array(z.object({id:z.string().max(100),quantity:z.number().int().min(1).max(10)})).max(12)});
const stateSchema=z.object({experience:experienceSchema.default(defaultExperience),workspace:workspaceSchema.optional()});
export function copilotInput(input:RunAgentInput){
 const last=input.messages.at(-1);
 if(last?.role!=='user'||typeof last.content!=='string')throw new Error('Send a text message to continue.');
 const state=stateSchema.parse(input.state);
 return {...agentInputSchema.parse({message:last.content,threadId:input.threadId,experience:state.experience}),runId:z.string().uuid().parse(input.runId),workspace:state.workspace};
}
export class ShopiBricksAgent extends AbstractAgent{
 constructor(private owner:string){super({description:'ShopiBricks commerce copilot. Live catalog, merchant evidence and human-reviewed sandbox checkout.'});}
 override clone():ShopiBricksAgent{const copy=super.clone() as ShopiBricksAgent;copy.owner=this.owner;return copy;}
 run(input:RunAgentInput):Observable<BaseEvent>{
  return new Observable(subscriber=>{
   let id:string|undefined;
   try{
    const parsed=copilotInput(input);id=parsed.runId;
    void runAgent(this.owner,parsed.message,parsed.threadId,event=>{
     // Server event producers are an allowlisted AG-UI surface. Custom evidence stays typed CUSTOM.
     subscriber.next({...event,type:event.type as EventType});
    },parsed.experience,{runId:parsed.runId,workspace:parsed.workspace}).then(()=>subscriber.complete()).catch(e=>subscriber.error(e));
   }catch(error){subscriber.error(error);}
   return()=>{if(id)cancelRun(id,this.owner);};
  });
 }
}

process.env.COPILOTKIT_TELEMETRY_DISABLED='true';
const ownerHeader='x-shopibricks-runtime-owner';
const owner=(request:globalThis.Request)=>{const value=request.headers.get(ownerHeader);if(!value)throw new Error('Authenticated identity is required');return value;};
const runtime=new CopilotRuntime({
 agents:({request})=>({default:new ShopiBricksAgent(owner(request))}),
 identifyUser:request=>({id:owner(request),name:'ShopiBricks user'}),
 runner:new InMemoryAgentRunner({maxThreads:100,maxRunsPerThread:8,maxBytes:24*1024*1024}),
 forwardHeaders:{allow:[]},generativeUI:false,sseKeepAliveIntervalSeconds:10,
});
const handler=createCopilotRuntimeHandler({runtime,basePath:'/api/copilotkit'});

/** The caller cannot supply this identity: it is taken from the app's trusted ingress middleware. */
export async function copilotMiddleware(req:Request,res:Response,next:NextFunction){
 try{
  const headers=new Headers({'Content-Type':'application/json',[ownerHeader]:res.locals.identity.owner});
  const request=new globalThis.Request(`http://shopibricks.internal${req.originalUrl}`,{method:req.method,headers,...(['GET','HEAD'].includes(req.method)?{}:{body:JSON.stringify(req.body)})});
  const response=await handler(request);res.status(response.status);
  for(const [key,value] of response.headers)if(!key.startsWith('access-control-'))res.setHeader(key,value);
  if(!response.body){res.end();return;}
  res.flushHeaders();const reader=response.body.getReader();
  const closed=()=>{void reader.cancel().catch(()=>{});};res.on('close',closed);
  try{while(!res.destroyed){const chunk=await reader.read();if(chunk.done)break;res.write(Buffer.from(chunk.value));}}
  finally{res.off('close',closed);reader.releaseLock();res.end();}
 }catch(error){next(error);}
}
