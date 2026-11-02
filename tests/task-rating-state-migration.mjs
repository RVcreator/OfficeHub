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
 await db.query(`insert into tasks(id,title,status,created_by_id,assigned_to_id,assigned_to_ids,assignment_type,pending_rating,rating,completed_at)values('rated','Already rated','Done',$1,$2,array[$2::uuid::text],'specific_people',true,'{"stars":4,"comment":"Original feedback","ratedAt":"2026-11-02T08:00:00Z"}','2026-11-02T07:00:00Z')`,[uid(1),uid(2)]);
 await db.query(`insert into notifications(id,type,target_user_id,metadata,read)values('old-rating-required','task_rating_required',$1,'{"taskId":"rated","requiresRating":true}',false)`,[uid(1)]);
 const before=(await db.query("select rating,delivery_event_version from tasks where id='rated'")).rows[0],mailBefore=(await db.query('select count(*)::int n from officehub_email_outbox')).rows[0].n;
 await db.exec(await readFile(new URL('../supabase/migrations/20261102000003_consistent_task_rating.sql',import.meta.url),'utf8'));
 const fixed=(await db.query("select status,rating,pending_rating,delivery_event_version from tasks where id='rated'")).rows[0];assert.equal(fixed.status,'Done');assert.equal(fixed.pending_rating,false);assert.deepEqual(fixed.rating,before.rating);assert.equal(fixed.delivery_event_version,before.delivery_event_version+1);
 assert.equal((await db.query('select count(*)::int n from officehub_email_outbox')).rows[0].n,mailBefore,'repair sends no email');assert.equal((await db.query("select read from notifications where id='old-rating-required'")).rows[0].read,true);
 await user(2);await db.query("select public.officehub_set_task_status('rated','In Progress',$1,true)",[fixed.delivery_event_version]);const recompleted=(await db.query("select public.officehub_set_task_status('rated','Done',$1,false) result",[fixed.delivery_event_version+1])).rows[0].result.task;
 assert.equal(recompleted.pending_rating,false);assert.deepEqual(recompleted.rating,before.rating);
 await owner();assert.equal((await db.query("select count(*)::int n from notifications where metadata->>'taskId'='rated' and type='task_rating_required'")).rows[0].n,1,'no new request to rate an already-rated task');
 for(const [value,valid] of [[null,false],[{},false],[{stars:0},false],[{stars:6},false],[{stars:4.5},false],[{stars:'5'},false],[{stars:5},true]])assert.equal((await db.query('select officehub_private.has_task_rating($1) valid',[value])).rows[0].valid,valid);
 await user(1);await db.query("insert into tasks(id,title,status,created_by_id,assigned_to_id,assignment_type)values('unrated','Needs rating','To Do',$1,$2,'specific_people')",[uid(1),uid(2)]);
 await user(2);await db.exec("select public.officehub_set_task_status('unrated','Done',1,false)");assert.equal((await db.query("select pending_rating from tasks where id='unrated'")).rows[0].pending_rating,true,'genuine unrated work stays pending');
 await user(1);await db.exec(`update tasks set rating='{"stars":5,"ratedAt":"2026-11-02T09:00:00Z"}',pending_rating=false where id='unrated'`);assert.equal((await db.query("select pending_rating from tasks where id='unrated'")).rows[0].pending_rating,false);
 console.log('PASS: stale flags repaired without changing ratings or sending email, task versions advance, old rating alerts retired, reopened/recompleted rated work remains rated, genuine unrated work stays pending, valid rating definition agrees with UI.');
}catch(error){console.error(JSON.stringify({message:error.message,code:error.code,where:error.where,query:error.query?.slice(0,200)},null,2));process.exitCode=1;}finally{await db.close();}
