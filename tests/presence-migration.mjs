const {PGlite}=await import(process.env.OFFICEHUB_PGLITE_MODULE||'@electric-sql/pglite');
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const db=new PGlite();const repo=new URL('../',import.meta.url);
const first='10000000-0000-4000-8000-000000000001',second='10000000-0000-4000-8000-000000000002';
const tab1='20000000-0000-4000-8000-000000000001',tab2='20000000-0000-4000-8000-000000000002';
try {
 await db.exec(`create role anon;create role authenticated;create schema auth;create schema officehub_private;
 create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;
 create function auth.email() returns text language sql stable as $$select email from auth.users where id=auth.uid()$$;`);
 await db.exec((await readFile(new URL('supabase/migrations/20261006000000_initial_schema.sql',repo),'utf8')).replace('create extension if not exists "uuid-ossp";',''));
 for(const id of [first,second]) await db.query("insert into auth.users(id,email) values($1,$2)",[id,id+'@wipahs.org']);
 await db.exec(await readFile(new URL('supabase/migrations/20261027000001_live_presence.sql',repo),'utf8'));
 await db.exec(await readFile(new URL('supabase/migrations/20261029000001_presence_protocol_v2.sql',repo),'utf8'));
 await db.exec("update public.profiles set status='Online';");
 const asUser=async(id,fn)=>{await db.exec(`begin;set local role authenticated;select set_config('request.jwt.claim.sub','${id}',true);`);try {await fn();await db.exec('commit;');}catch(e){await db.exec('rollback;');throw e;}};
 const snapshot=async id=>(await db.query('select * from public.officehub_presence_snapshot() where user_id=$1',[id])).rows[0];
 await asUser(first,async()=>{
  assert.equal((await snapshot(second)).status,'Offline');
  await db.query('select public.officehub_presence_heartbeat_v2($1,true)',[tab1]);
  assert.equal((await snapshot(first)).status,'Online');
  await db.query('select public.officehub_presence_heartbeat_v2($1,false)',[tab2]);
  assert.equal((await snapshot(first)).status,'Online');
  await db.query('select public.officehub_presence_leave($1)',[tab1]);
  assert.equal((await snapshot(first)).status,'Away');
 });
 await asUser(second,async()=>{
  await db.query('select public.officehub_presence_leave($1)',[tab2]);
  assert.equal((await snapshot(first)).status,'Away');
 });
 await asUser(first,async()=>{
  await db.query('select public.officehub_presence_leave($1)',[tab2]);
  assert.equal((await snapshot(first)).status,'Offline','withdrawing the last hidden tab removes Away');
  await db.query('select public.officehub_presence_heartbeat_v2($1,true)',[tab1]);
  await db.query('select public.officehub_presence_heartbeat_v2($1,true)',[tab2]);
  await db.query('select public.officehub_presence_leave($1)',[tab1]);
  assert.equal((await snapshot(first)).status,'Online','another active OfficeHub tab keeps the member online');
  await db.query('select public.officehub_presence_leave($1)',[tab2]);
  assert.equal((await snapshot(first)).status,'Offline');
  await db.query('select public.officehub_presence_heartbeat_v2($1,true)',[tab1]);
 });
 await asUser(first,async()=>{
  await db.query('select public.officehub_presence_leave($1)',[tab1]);
  await db.query('select public.officehub_presence_heartbeat($1,false)',[tab1]);
  assert.equal((await snapshot(first)).status,'Offline','legacy hidden heartbeat cannot manufacture Away');
  await db.query('select public.officehub_presence_heartbeat($1,true)',[tab1]);
  assert.equal((await snapshot(first)).status,'Online','legacy visible activity still works');
  await db.query('select public.officehub_presence_heartbeat($1,false)',[tab1]);
  assert.equal((await snapshot(first)).status,'Offline','legacy tab hiding withdraws its own session');
  await db.query('select public.officehub_presence_heartbeat_v2($1,false)',[tab2]);
  await db.query('select public.officehub_presence_heartbeat($1,false)',[tab1]);
  assert.equal((await snapshot(first)).status,'Away','old tabs cannot withdraw another visible-idle session');
 });
 await db.exec("update officehub_private.presence_sessions set seen_at=now()-interval '121 seconds';");
 await asUser(first,async()=>assert.equal((await snapshot(first)).status,'Offline'));
 await db.query('update public.profiles set out_of_office=true where id=$1',[first]);
 await asUser(second,async()=>assert.equal((await snapshot(first)).status,'Out of Office'));
 await db.query("update public.profiles set out_of_office=false,status='Out of Office' where id=$1",[first]);
 await asUser(second,async()=>assert.equal((await snapshot(first)).status,'Offline'));
 await asUser(first,async()=>await assert.rejects(db.query('select * from officehub_private.presence_sessions'),/permission denied/));
 assert.equal((await db.query("select has_function_privilege('anon','public.officehub_presence_snapshot()','EXECUTE') allowed")).rows[0].allowed,false);
 assert.equal((await db.query("select has_function_privilege('anon','public.officehub_presence_heartbeat_v2(uuid,boolean)','EXECUTE') allowed")).rows[0].allowed,false);
 console.log('Presence PostgreSQL tests PASSED: fresh/idle/stale, multi-tab logout, office flag, identity isolation, and privileges.');
} catch(e){console.error(e);process.exitCode=1;}finally{await db.close();}
