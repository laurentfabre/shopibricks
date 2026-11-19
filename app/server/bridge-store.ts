import { getPool } from './db.js';
import type { BridgeStore, RecordValue } from './bridge-oauth.js';

let ready:Promise<void>|undefined;
export const bridgeStore:BridgeStore={
 async atomic(fn){
  ready??=getPool().query(`CREATE SCHEMA IF NOT EXISTS shopibricks_bridge;
   CREATE TABLE IF NOT EXISTS shopibricks_bridge.oauth_records(key TEXT PRIMARY KEY,kind TEXT NOT NULL,data JSONB NOT NULL,expires_at TIMESTAMPTZ NOT NULL);
   CREATE INDEX IF NOT EXISTS oauth_records_expiry ON shopibricks_bridge.oauth_records(expires_at);`).then(()=>{}).catch(error=>{ready=undefined;throw error;});
  await ready;const c=await getPool().connect();
  try{
   await c.query('BEGIN');await c.query("SELECT pg_advisory_xact_lock(hashtext('shopibricks_bridge.oauth_records'))");
   await c.query('DELETE FROM shopibricks_bridge.oauth_records WHERE expires_at<now()');
   const result=await fn({
    async get(key){const {rows}=await c.query('SELECT kind,data,expires_at FROM shopibricks_bridge.oauth_records WHERE key=$1',[key]);return rows[0]?{kind:rows[0].kind,data:rows[0].data,expires:new Date(rows[0].expires_at).getTime()} as RecordValue:undefined;},
    async set(key,value){await c.query('INSERT INTO shopibricks_bridge.oauth_records(key,kind,data,expires_at) VALUES($1,$2,$3,$4) ON CONFLICT(key) DO UPDATE SET kind=$2,data=$3,expires_at=$4',[key,value.kind,JSON.stringify(value.data),new Date(value.expires)]);},
   });await c.query('COMMIT');return result;
  }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
 }
};
