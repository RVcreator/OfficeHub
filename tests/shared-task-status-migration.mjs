import {readFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const {PGlite}=await import(process.env.OFFICEHUB_PGLITE_MODULE||'@electric-sql/pglite');const db=new PGlite();
const uid=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const user=async n=>db.exec(`reset role;select set_config('request.jwt.claim.sub','${uid(n)}',false),set_config('request.jwt.claim.role','authenticated',false);set role authenticated;`);
const owner=async()=>db.exec('reset role');
const counts=async()=>{await owner();return(await db.query("select (select count(*)::int from notifications) alerts,(select count(*)::int from officehub_email_outbox where event_type<>'subtask') mail")).rows[0];};
try{
 await db.exec(await readFile(new URL('fixtures/participant-schema.sql',import.meta.url),'utf8'));
 await db.exec('create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,banned_until timestamptz)');
 const base=await readFile(new URL('../supabase/migrations/20261026000000_officehub_email_outbox.sql',import.meta.url),'utf8');
 await db.exec(base.slice(base.indexOf('create sequence officehub_private.email_event_seq;'),base.indexOf('create function officehub_private.notice_recipients')));
 await db.exec(base.slice(base.indexOf('create function officehub_private.email_task_event()'),base.indexOf('create function officehub_private.email_notice_event()')));
 await db.exec("create function officehub_private.email_recipient_is_current(text,text,uuid)returns boolean language sql as $$select true$$;update officehub_private.email_settings set capture_enabled=true;");
 for(let n=1;n<=3;n++){await db.query('insert into profiles(id,name,email)values($1,$2,$3)',[uid(n),`Fixture ${n}`,`fixture${n}@wipahs.org`]);await db.query('insert into auth.users(id,email,email_confirmed_at)values($1,$2,now())',[uid(n),`fixture${n}@wipahs.org`]);}
 await db.query("insert into officehub_email_outbox(event_key,event_type,entity_id,recipient_id,recipient_email,recipient_name,subject,body_text)values('legacy','subtask','t',$1,'fixture1@wipahs.org','Fixture 1','Legacy','Legacy')",[uid(1)]);
 await db.exec(await readFile(new URL('../supabase/migrations/20261030000002_participant_privacy.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../supabase/migrations/20261102000001_task_delivery_once.sql',import.meta.url),'utf8'));
 assert.equal((await db.query("select status from officehub_email_outbox where event_key='legacy'")).rows[0].status,'cancelled');
 assert.equal((await db.query("select officehub_private.email_recipient_is_current('subtask','t',$1) ok",[uid(1)])).rows[0].ok,false);
 assert.equal((await db.query("select officehub_private.email_recipient_is_current('digest_week','period',$1) ok",[uid(1)])).rows[0].ok,true);
 await db.exec(await readFile(new URL('../supabase/migrations/20261102000002_shared_task_status.sql',import.meta.url),'utf8'));
 await db.query('insert into profiles(id,name,email,role)values($1,$2,$3,$4)',[uid(4),'Outsider','outsider@wipahs.org','Admin']);
 await user(1);await db.query("insert into tasks(id,title,status,created_by_id,assigned_to_id,assigned_to_ids,assignment_type,pending_rating)values('shared','Shared fixture','To Do',$1,$2,array[$2::uuid::text,$3::uuid::text],'specific_people',false)",[uid(1),uid(2),uid(3)]);
 const change=async(status,version,reopen=false)=>(await db.query('select public.officehub_set_task_status($1,$2,$3,$4) result',['shared',status,version,reopen])).rows[0].result;
 await user(2);const first=await change('Done',1);assert.equal(first.task.status,'Done');assert.equal(first.changed,true);assert.equal(first.task.delivery_event_version,2);
 await user(3);const second=await change('Done',1);assert.equal(second.task.status,'Done');assert.equal(second.changed,false);assert.equal(second.task.completed_at,first.task.completed_at);
 const stale=await change('In Progress',1,true);assert.equal(stale.conflict,true);assert.equal(stale.task.status,'Done');
 await assert.rejects(change('In Progress',2),/Confirm changing/);await assert.rejects(db.exec("update tasks set status='In Progress' where id='shared'"),/Refresh OfficeHub/);
 await owner();assert.equal((await db.query("select count(*)::int n from officehub_email_outbox where event_type='task_status'")).rows[0].n,1);assert.equal((await db.query("select count(*)::int n from notifications where type='task_rating_required'")).rows[0].n,1);
 await user(4);await assert.rejects(change('Done',2),/Only task members/);
 await user(3);const reopened=await change('In Progress',2,true);assert.equal(reopened.task.status,'In Progress');assert.equal(reopened.task.completed_at,null);
 await user(2);const again=await change('Done',3);assert.equal(again.task.status,'Done');assert.equal(again.changed,true);
 await owner();assert.equal((await db.query("select count(*)::int n from officehub_email_outbox where subject like '[OfficeHub] Task Done:%'")).rows[0].n,2,'only genuinely separate completions create completion mail');
 await db.exec('set role anon');await assert.rejects(change('Done',4),/permission denied/);
 console.log('PASS: either assignee completes the whole task; second/stale completion is idempotent; stale reopening conflicts; explicit reopening required; old raw writes denied; one completion alert/email per transition; outsider/anonymous denial.');
}catch(error){console.error(JSON.stringify({message:error.message,code:error.code,where:error.where,query:error.query?.slice(0,200)},null,2));process.exitCode=1;}finally{await db.close();}
