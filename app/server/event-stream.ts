import type {Request,Response} from 'express';
import {z} from 'zod';
import {readEvents} from './db.js';

/** Database IDs are SSE cursors. Reconnects replay only this authenticated owner's rows. */
export async function streamEvents(req:Request,res:Response){
 let cursor=z.coerce.number().int().nonnegative().parse(req.get('Last-Event-ID')||req.query.after||0);
 // Validate and query before committing headers so authentication/DB failures stay inspectable.
 const owner=res.locals.identity.owner;const initial=await readEvents(owner,cursor);
 res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});
 res.flushHeaders();res.write('retry: 2000\n\n');
 let closed=false;let timer:ReturnType<typeof setTimeout>;
 const send=(rows:Awaited<ReturnType<typeof readEvents>>)=>{
  for(const row of rows){cursor=Math.max(cursor,row.id);res.write(`id: ${row.id}\ndata: ${JSON.stringify(row)}\n\n`);}
 };
 send(initial);
 const tick=async()=>{
  if(closed)return;
  try{const rows=await readEvents(owner,cursor);if(closed)return;send(rows);res.write(': heartbeat\n\n');timer=setTimeout(()=>void tick(),rows.length===300?50:2000);}
  catch{if(!closed){res.write('event: unavailable\ndata: {"message":"Activity is temporarily unavailable. Reconnecting…"}\n\n');res.end();}}
 };
 // Bounded streams release proxy connections; EventSource reconnects using Last-Event-ID.
 const lifetime=setTimeout(()=>res.end(),55000);
 res.on('close',()=>{closed=true;clearTimeout(timer);clearTimeout(lifetime);});
 timer=setTimeout(()=>void tick(),initial.length===300?50:2000);
}
