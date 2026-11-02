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
 await user(1);await db.query("insert into tasks(id,title,status,created_by_id,assigned_to_id,assigned_to_ids,assignment_type,pending_rating)values('t','Fixture','To Do',$1,$2,array[$2::uuid::text],'specific_people',false)",[uid(1),uid(2)]);
 assert.deepEqual(await counts(),{alerts:2,mail:1});
 await user(1);await db.exec("update tasks set title='Renamed',status='To Do' where id='t'");assert.deepEqual(await counts(),{alerts:2,mail:1});
 await user(2);await db.exec("update tasks set status='Done',completed_at='2026-11-02T08:00:00Z',pending_rating=true where id='t'");assert.deepEqual(await counts(),{alerts:3,mail:2});
 const completion=(await db.query("select target_user_id,type,metadata from notifications where type='task_rating_required'")).rows[0];assert.equal(completion.target_user_id,uid(1));assert.equal(completion.metadata.requiresRating,true);

 await user(2);await db.exec("update tasks set status='Done',completed_at='2026-11-02T08:01:00Z',pending_rating=true where id='t'");assert.deepEqual(await counts(),{alerts:3,mail:2});
 assert.equal((await db.query("select completed_at from tasks where id='t'")).rows[0].completed_at,'2026-11-02T08:00:00Z');
 await user(1);await db.exec(`update tasks set rating='{"stars":5,"comment":"Good","ratedAt":"first"}',pending_rating=false where id='t'`);assert.deepEqual(await counts(),{alerts:4,mail:2});
 assert.equal((await db.query("select read from notifications where type='task_rating_required'")).rows[0].read,true);
 await user(1);await db.exec(`update tasks set rating='{"stars":5,"comment":"Good","ratedAt":"retry"}',pending_rating=false where id='t'`);assert.deepEqual(await counts(),{alerts:4,mail:2});
 await user(2);await db.exec("update tasks set status='Done',pending_rating=true where id='t'");assert.equal((await db.query("select pending_rating from tasks where id='t'")).rows[0].pending_rating,false);
 await user(1);await db.exec("insert into task_subtasks(id,task_id,title,completed)values('s','t','Checklist',false)");assert.deepEqual(await counts(),{alerts:4,mail:2});
 await user(2);await db.exec("update task_subtasks set completed=true where id='s'");assert.deepEqual(await counts(),{alerts:5,mail:2});
 await user(2);await db.exec("update task_subtasks set completed=true,title='Edited title' where id='s'");assert.deepEqual(await counts(),{alerts:5,mail:2});
 await user(2);await db.exec("update task_subtasks set completed=false where id='s';update task_subtasks set completed=true where id='s'");assert.deepEqual(await counts(),{alerts:6,mail:2},'a genuinely new completion gets its own in-app alert only');
 assert.equal((await db.query("select count(*)::int n from officehub_email_outbox where event_type='subtask' and status<>'cancelled'")).rows[0].n,0);
 await user(2);await assert.rejects(db.query("insert into notifications(id,type,target_user_id,metadata)values('client-duplicate','task',$1,'{\"taskId\":\"t\"}')",[uid(1)]),/created automatically/);
 await owner();assert.equal((await db.query("select count(*)::int n from notifications where target_user_id=$1",[uid(3)])).rows[0].n,0,'no unrelated recipients');
 console.log('PASS: one assignment/completion event, no-op and completion retries silent, same rating replay silent, rating alert retired by server, subtask completion in-app only, old subtask queue cancelled/blocked, genuine recompletion notified, unrelated recipients excluded, old client duplicates rejected.');
}catch(error){console.error(JSON.stringify({message:error.message,code:error.code,where:error.where,query:error.query?.slice(0,200)},null,2));process.exitCode=1;}finally{await db.close();}
