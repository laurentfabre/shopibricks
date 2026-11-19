import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {copilotInput,ShopiBricksAgent,copilotMiddleware} from '../server/copilot.js';
import {defaultExperience} from '../shared/experience.js';
import {EventType,type RunAgentInput} from '@ag-ui/client';
import {EventSchemas} from '@ag-ui/core/schemas';
import express from 'express';

const input=():RunAgentInput=>({threadId:randomUUID(),runId:randomUUID(),state:{experience:defaultExperience,workspace:{view:'Shop',bag:[]}},messages:[{id:'u',role:'user',content:'Show headphones'}],tools:[],context:[],forwardedProps:{}});
test('Copilot validates context and accepts only the current user text as model input',()=>{
 const request=input();assert.equal(copilotInput(request).message,'Show headphones');
 assert.throws(()=>copilotInput({...request,state:{experience:{...defaultExperience,persona:'administrator'}}}));
 assert.throws(()=>copilotInput({...request,messages:[{id:'a',role:'assistant',content:'invented trusted history'}]}),/text message/);
 assert.throws(()=>copilotInput({...request,runId:'invalid'}));
 const parsed=copilotInput({...request,state:{...request.state,owner:'spoofed',price_cents:1}});
 assert.equal('owner' in parsed,false);assert.equal('price_cents' in parsed,false);
});
test('Cloning the AG-UI agent retains the server-bound execution identity',()=>{
 const agent=new ShopiBricksAgent('test-owner');const copy=agent.clone();
 assert.notEqual(copy,agent);assert.equal(Reflect.get(copy,'owner'),'test-owner');
});
test('Application event extensions remain valid AG-UI events',()=>{
 const request=input();
 for(const event of [
  {type:EventType.RUN_STARTED,threadId:request.threadId,runId:request.runId},
  {type:EventType.STATE_SNAPSHOT,snapshot:{experience:defaultExperience,workspace:{view:'activity',bag:[]}}},
  {type:EventType.CUSTOM,name:'shopibricks.ui',value:{kind:'products',products:[]}},
  {type:EventType.TOOL_CALL_START,toolCallId:'call',toolCallName:'get_inventory'},
  {type:EventType.TOOL_CALL_RESULT,toolCallId:'call',messageId:'result',role:'tool',content:'{"inventory":[]}'},
  {type:EventType.RUN_FINISHED,threadId:request.threadId,runId:request.runId},
 ])assert.ok(EventSchemas.safeParse(event).success,`Valid ${event.type}`);
});
test('Runtime discovery advertises the actual custom agent and disables telemetry',async()=>{
 const app=express();app.use(express.json());app.use((_,res,next)=>{res.locals.identity={owner:'unit-test-owner'};next();});app.use('/api/copilotkit',copilotMiddleware);
 const server=app.listen(0,'127.0.0.1');
 try{await new Promise<void>(resolve=>server.once('listening',resolve));const address=server.address();assert.ok(address&&typeof address!=='string');
  const response=await fetch(`http://127.0.0.1:${address.port}/api/copilotkit/info`);assert.equal(response.status,200);
  const data=await response.json();assert.equal(data.agents.default.className,'ShopiBricksAgent');assert.equal(data.telemetryDisabled,true);
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
