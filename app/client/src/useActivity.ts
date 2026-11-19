import {useEffect,useState} from 'react';
import type {ProtocolEvent} from '../../server/types';
import {mergeEvents} from '../../shared/activity';

export function useActivity(){
 const[events,setEvents]=useState<ProtocolEvent[]>([]);
 const[status,setStatus]=useState<'connecting'|'live'|'reconnecting'>('connecting');
 useEffect(()=>{
  const stream=new EventSource('/api/events/stream');
  stream.onopen=()=>setStatus('live');
  stream.onmessage=message=>{try{const event=JSON.parse(message.data) as ProtocolEvent;setEvents(old=>mergeEvents(old,[event]));setStatus('live');}catch{setStatus('reconnecting');}};
  stream.onerror=()=>setStatus('reconnecting');
  stream.addEventListener('unavailable',()=>setStatus('reconnecting'));
  return()=>stream.close();
 },[]);
 return {events,status};
}
