import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const db=new PGlite();
const repo=new URL('../',import.meta.url);
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,banned_until timestamptz,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;
    create function auth.email() returns text language sql stable as $$select email from auth.users where id=auth.uid()$$;`);
  await db.exec((await readFile(new URL('supabase/migrations/20261006000000_initial_schema.sql',repo),'utf8')).replace('create extension if not exists "uuid-ossp";',''));
  await db.exec(`alter table public.sharepoint_documents add column created_by_id uuid references public.profiles(id);`);
  for (const file of ['20261026000000_officehub_email_outbox.sql','20261026000001_validate_email_worker_service_role.sql','20261027000000_document_sharing.sql']) await db.exec(await readFile(new URL('supabase/migrations/'+file,repo),'utf8'));

  await db.exec(await readFile(new URL('supabase/migrations/20261027000002_personal_digests.sql',repo),'utf8'));
  const a='10000000-0000-4000-8000-000000000001',b='10000000-0000-4000-8000-000000000002';
  for (const [id,email] of [[a,'a@wipahs.org'],[b,'b@wipahs.org']]) await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[id,email]);
  for(const [id,due,status,who] of [['own','2026-11-02','To Do',a],['overdue','2026-10-30','To Do',a],['future','2026-11-09','To Do',a],['done','2026-11-02','Done',a],['other','2026-11-03','To Do',b],['undated',null,'To Do',a]]) await db.query('insert into tasks(id,title,due_date,status,assigned_to_id) values($1,$1,$2,$3,$4)',[id,due,status,who]);
  await db.query("insert into meetings(id,title,date,start_time,end_time,organizer_id,organizer_name) values('mine','Mine','2026-11-03','09:00','10:00',$1,'A'),('other','Other','2026-11-03','09:00','10:00',$2,'B')",[a,b]);
  await db.query("insert into projects(id,title,start_date,target_date,leader_id) values('mine','Mine','2026-10-01','2026-11-20',$1),('other','Other','2026-10-01','2026-11-20',$2),('future','Future','2026-12-01','2027-01-01',$1)",[a,b]);
  const data=(await db.query("select officehub_private.personal_digest($1,'week','2026-11-02') d",[a])).rows[0].d;
  assert.deepEqual(data.tasks.map(x=>x.id),['overdue','own','undated']);assert.equal(data.tasks[0].overdue,true);
  assert.deepEqual(data.meetings.map(x=>x.id),['mine']);assert.deepEqual(data.projects.map(x=>x.id),['mine']);
  const month=(await db.query("select officehub_private.personal_digest($1,'month','2026-11-01') d",[a])).rows[0].d;
  assert.equal(month.end,'2026-11-30');assert.ok(month.tasks.some(x=>x.id==='future'));
  assert.equal((await db.query("select officehub_private.digest_date('2026-02-31') d")).rows[0].d,null);
  await db.exec('update officehub_private.email_settings set capture_enabled=true,delivery_enabled=true;update officehub_private.digest_settings set enabled=true;');
  const enqueue=async(kind,when)=>(await db.query('select officehub_private.enqueue_personal_digests($1,$2) n',[kind,when])).rows[0].n;
  assert.equal(await enqueue('week','2026-11-02T04:59:00Z'),0);
  assert.equal(await enqueue('week','2026-11-03T05:00:00Z'),0);
  assert.equal(await enqueue('week','2026-11-02T05:00:00Z'),2);
  assert.equal(await enqueue('week','2026-11-02T05:01:00Z'),0);
  assert.equal(await enqueue('month','2026-11-01T05:00:00Z'),2);
  assert.equal(await enqueue('month','2026-11-01T05:01:00Z'),0);
  assert.equal((await db.query("select has_function_privilege('authenticated','officehub_private.personal_digest(uuid,text,date)','EXECUTE') allowed")).rows[0].allowed,false);
  assert.equal((await db.query("select has_function_privilege('anon','officehub_private.enqueue_personal_digests(text,timestamptz)','EXECUTE') allowed")).rows[0].allowed,false);
  const claim=(await db.query('select * from public.officehub_email_claim()')).rows;
  // Rows have a deliberate 30-second queue delay.
  assert.equal(claim.length,0);
  await db.exec('update public.officehub_email_outbox set available_at=now();');
  assert.equal((await db.query('select * from public.officehub_email_claim()')).rows.length,1);
  await db.query("update profiles set app_metadata='{"+String.fromCharCode(34)+"deactivated"+String.fromCharCode(34)+":true}' where id=$1",[b]);
  assert.equal((await db.query("select officehub_private.email_recipient_is_current('digest_week','2026-11-02',$1) allowed",[b])).rows[0].allowed,false);
  console.log('Digest PostgreSQL tests passed: scope, dates, overdue, boundaries, time zone, deduplication, eligibility, privileges, queue claim.');
} catch(e){console.error(e);process.exitCode=1;} finally {await db.close();}
