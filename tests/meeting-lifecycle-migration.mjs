import {readFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const {PGlite}=await import(process.env.OFFICEHUB_PGLITE_MODULE||'@electric-sql/pglite');const db=new PGlite();
const uid=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const user=async n=>db.exec(`reset role;select set_config('request.jwt.claim.sub','${uid(n)}',false),set_config('request.jwt.claim.role','authenticated',false);set role authenticated;`);
try{
 for(const file of ['fixtures/participant-schema.sql','../supabase/migrations/20261030000002_participant_privacy.sql','../supabase/migrations/20261030000003_atomic_meeting_permissions.sql'])await db.exec(await readFile(new URL(file,import.meta.url),'utf8'));
 for(let n=1;n<=3;n++)await db.query('insert into profiles(id,name,email,role)values($1,$2,$3,$4)',[uid(n),`Fixture ${n}`,`fixture${n}@example.invalid`,n===3?'Admin':'Staff']);
 await db.query(`insert into meetings(id,title,date,start_time,end_time,duration_minutes,organizer_id,chair_id,status)values
 ('dormant','Past',to_char((now() at time zone 'Africa/Dar_es_Salaam')-interval '2 hours','YYYY-MM-DD'),to_char((now() at time zone 'Africa/Dar_es_Salaam')-interval '2 hours','HH24:MI:SS'),to_char((now() at time zone 'Africa/Dar_es_Salaam')-interval '1 hour','HH24:MI:SS'),60,$1,$1,'Scheduled'),
 ('future','Future',to_char((now() at time zone 'Africa/Dar_es_Salaam')+interval '1 day','YYYY-MM-DD'),'10:00 AM','11:00 AM',60,$1,$1,'Scheduled'),
 ('archived','Archived','2020-01-01','10:00','11:00',60,$1,$1,'Scheduled'),
 ('unknown','Unknown',to_char(now(),'YYYY-MM-DD'),null,null,60,$1,$1,'Scheduled')`,[uid(1)]);
 await db.query("insert into meeting_attendees(meeting_id,user_id,name,status)select id,$1,'Invitee','Pending' from meetings",[uid(2)]);
 await db.exec(`create table fixture_response_events(meeting_id text);create function public.fixture_response_event()returns trigger language plpgsql security definer as $$begin insert into fixture_response_events values(new.meeting_id);return new;end$$;create trigger fixture_after_response after update on meeting_attendees for each row execute function public.fixture_response_event();`);
 await db.exec(await readFile(new URL('../supabase/migrations/20261103000000_meeting_response_deadline.sql',import.meta.url),'utf8'));
 const deadline=async data=>(await db.query(`select to_char(officehub_private.meeting_end_at(jsonb_populate_record(null::public.meetings,$1)) at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') ending`,[data])).rows[0].ending;
 assert.equal(await deadline({date:'2026-11-03',start_time:'10:00 AM',end_time:'11:00 AM'}),'2026-11-03T08:00:00Z');
 assert.equal(await deadline({date:'2026-11-03',start_time:'11:30 PM',end_time:'12:30 AM'}),'2026-11-03T21:30:00Z');
 assert.equal(await deadline({date:'2026-11-03',start_time:'10:00',end_time:'TBD',duration_minutes:90}),'2026-11-03T08:30:00Z');
 assert.equal(await deadline({date:'2026-02-31',start_time:'10:00',end_time:'11:00'}),null);
 await user(2);
 for(const id of ['dormant','archived','unknown'])for(const status of ['Accepted','Declined','Proposed New Time'])await assert.rejects(db.query("update meeting_attendees set status=$1,responded_at=now()::text where meeting_id=$2 and user_id=$3",[status,id,uid(2)]),/response window has closed/);
 await assert.rejects(db.exec("update meeting_attendees set note='Late comment' where meeting_id='dormant'"),/response window has closed/);
 await db.exec("update meeting_attendees set status='Accepted' where meeting_id='future'");
 await user(1);await assert.rejects(db.query("insert into meeting_attendees(meeting_id,user_id,name,status)values('dormant',$1,'Added late','Pending')",[uid(3)]),/response window has closed/);
 await assert.rejects(db.exec("select public.officehub_save_meeting('dormant',jsonb_build_object('date','2099-01-01'),null,false)"),/Past meetings are dormant/);
 await db.exec("select public.officehub_save_meeting('future','{\"description\":\"Confirmed update\"}',null,false)");
 await user(3);assert.equal((await db.query("update meeting_attendees set status='Accepted' where meeting_id='future' returning user_id")).rows.length,0,'outsider remains blocked');
 await db.exec('reset role');assert.deepEqual((await db.query('select meeting_id from fixture_response_events')).rows.map(r=>r.meeting_id),['future'],'late decisions cannot reach AFTER notification/email triggers');
 assert.equal((await db.query("select status from meetings where id='dormant'")).rows[0].status,'Scheduled','historical record preserved without scheduled-label bypass');
 await user(1);await db.exec("delete from meetings where id='archived'");
 await db.exec('reset role;set role anon');await assert.rejects(db.query("select officehub_private.meeting_end_at(null::public.meetings)"),/permission denied/);
 console.log('PASS: EAT/12h/overnight/duration deadlines agree, expired and archived accept/decline/proposal/note writes blocked, late invitations and rescheduling blocked, future response preserved, no late AFTER events, membership privacy/cascade preserved.');
}catch(error){console.error(JSON.stringify({message:error.message,code:error.code,where:error.where,query:error.query?.slice(0,200)},null,2));process.exitCode=1;}finally{await db.close();}
