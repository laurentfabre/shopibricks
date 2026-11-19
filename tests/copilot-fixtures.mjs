/** Shared transport fixtures. Product/model data in these tests is explicitly synthetic. */
export async function fixtureTransport(route){
 const path=new URL(route.request().url()).pathname;
 if(path==='/api/copilotkit/info'){
  await route.fulfill({json:{version:'2.0.0-rc.44',mode:'sse',agents:{default:{name:'default',description:'Browser fixture',className:'ShopiBricksAgent'}},audioFileTranscriptionEnabled:false,telemetryDisabled:true}});return true;
 }
 if(path==='/api/events/stream'){
  await route.fulfill({contentType:'text/event-stream',body:': fixture heartbeat\n\n'});return true;
 }
 // Optional metadata discovery is independent of agent execution.
 if(path.startsWith('/api/copilotkit/')&&!path.endsWith('/run')){await route.fulfill({status:404,json:{error:'Not available in this browser fixture'}});return true;}
 return false;
}
export function agentRequest(route){const body=route.request().postDataJSON();return body.state?{message:body.messages.at(-1).content,threadId:body.threadId,runId:body.runId,experience:body.state.experience,workspace:body.state.workspace}:body;}
