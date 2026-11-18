import {readFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const {PGlite}=await import(process.env.OFFICEHUB_PGLITE_MODULE||'@electric-sql/pglite');
(async()=>{const db=new PGlite();const uid=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const user=async n=>db.exec(`reset role;select set_config('request.jwt.claim.sub','${uid(n)}',false),set_config('request.jwt.claim.role','authenticated',false);set role authenticated;`);
try{
 await db.exec(await readFile(new URL('fixtures/participant-schema.sql',import.meta.url),'utf8'));
 await db.exec('create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,banned_until timestamptz,deleted_at timestamptz,raw_app_meta_data jsonb)');
 const base=await readFile(new URL('../supabase/migrations/20261026000000_officehub_email_outbox.sql',import.meta.url),'utf8');
 await db.exec(base.slice(base.indexOf('create sequence officehub_private.email_event_seq;'),base.indexOf('create function officehub_private.notice_recipients')));
 await db.exec(base.slice(base.indexOf('create function officehub_private.email_meeting_event()'),base.indexOf('create function officehub_private.email_recipient_is_current')));
 await db.exec("create function officehub_private.email_recipient_is_current(text,text,uuid)returns boolean language sql as $$select $1 in ('meeting','meeting_invite','meeting_rsvp')$$;update officehub_private.email_settings set capture_enabled=true;");
 for(let n=1;n<=3;n++){await db.query('insert into profiles(id,name,email) values($1,$2,$3)',[uid(n),`Fixture ${n}`,`fixture${n}@wipahs.org`]);await db.query('insert into auth.users(id,email,email_confirmed_at)values($1,$2,now())',[uid(n),`fixture${n}@wipahs.org`]);}
 for(const file of ['20261030000002_participant_privacy.sql','20261030000003_atomic_meeting_permissions.sql','20261103000000_meeting_response_deadline.sql','20261103000002_physical_meetings.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));

 await db.exec(await readFile(new URL('../supabase/migrations/20261104000002_teams_meeting_sync.sql',import.meta.url),'utf8'));
 const digests=await readFile(new URL('../supabase/migrations/20261027000002_personal_digests.sql',import.meta.url),'utf8');
 await db.exec(digests.slice(digests.indexOf('create function officehub_private.digest_date('),digests.indexOf('create function officehub_private.personal_digest(')));
 await db.exec('create table projects(id text,title text,status text,progress numeric,target_date text,start_date text,leader_id uuid);create table project_members(project_id text,user_id uuid);');
 const save=async(id,changes,attendees=null,create=false)=>(await db.query('select officehub_save_meeting($1,$2,$3,$4) result',[id,changes,attendees,create])).rows[0].result;
 const claim=async id=>(await db.query('select officehub_claim_teams_sync($1) job',[id])).rows[0].job;
 const finish=async(j,error=null,blocked=false)=>db.query('select officehub_finish_teams_sync($1,$2,$3,$4,$5,$6)',[j.meeting_id,j.lease_token,j.revision,{event_id:'immutable-event',owner_id:'owner',online_id:'online',join_url:'https://teams.microsoft.com/real',applied_hash:'hash'},error,blocked]);
 // Reproduce a previously stored recurring meeting whose first date has passed.
 await db.exec("select set_config('request.jwt.claim.role','service_role',false)");
 await db.query("insert into meetings(id,title,date,time,start_time,end_time,status,recurrence,meeting_type,location,organizer_id,organizer_name,chair_id) values('legacy-series','Legacy recurring','2020-01-31','10:00','10:00','11:00','Scheduled','Monthly','In-Person Boardroom','Boardroom',$1,'Fixture 1',$1)",[uid(1)]);
 await db.query("insert into meeting_attendees(meeting_id,user_id,status)values('legacy-series',$1,'Pending')",[uid(2)]);
 await db.exec(await readFile(new URL('../supabase/migrations/20261118000000_recurring_meetings_delivery.sql',import.meta.url),'utf8'));
 const queued=async id=>(await db.query("select * from officehub_email_outbox where entity_id=$1 and status='queued'",[id])).rows;
 let jobs=await queued('legacy-series');assert.equal(jobs.length,2);assert.ok(jobs.every(j=>j.calendar_payload.recurrence==='Monthly'&&j.body_text.includes('Repeats: Monthly')));
 assert.equal((await db.query("select officehub_private.email_recipient_is_current('physical_calendar_request','legacy-series',$1) allowed",[uid(2)])).rows[0].allowed,true);
 const next=(await db.query("select officehub_private.meeting_next_end_at(m,'2026-02-01T00:00:00Z') cutoff from meetings m where id='legacy-series'")).rows[0].cutoff;
 assert.equal(new Date(next).toISOString(),'2026-03-31T08:00:00.000Z');
 let digest=(await db.query("select officehub_private.personal_digest($1,'month','2026-03-01') result",[uid(2)])).rows[0].result;
 assert.equal(digest.meetings.length,1);assert.equal(digest.meetings[0].date,'2026-03-31');assert.equal(digest.meetings[0].recurrence,'Monthly');
 assert.equal((await db.query("select officehub_private.personal_digest($1,'month','2026-03-01') result",[uid(3)])).rows[0].result.meetings.length,0);
 await user(2);await db.query("update meeting_attendees set status='Accepted' where meeting_id='legacy-series' and user_id=$1",[uid(2)]);
 await user(1);await save('legacy-series',{recurrence:'Weekly'});await db.exec('reset role');
 await user(1);await assert.rejects(()=>save('legacy-series',{recurrence:'None'}),error=>error.code==='23514');await assert.rejects(()=>save('legacy-series',{recurrence:'Yearly'}),error=>error.code==='23514');await db.exec('reset role');
 jobs=await queued('legacy-series');assert.equal(jobs.filter(j=>j.calendar_payload).length,2);assert.ok(jobs.filter(j=>j.calendar_payload).every(j=>j.calendar_payload.recurrence==='Weekly'));
 // A delivered invitation anchored in the past must still receive a series cancellation.
 await db.exec("update officehub_email_outbox set status='accepted' where entity_id='legacy-series' and calendar_payload is not null and status='queued'");
 await user(1);await save('legacy-series',{status:'Cancelled'});await db.exec('reset role');
 assert.equal((await queued('legacy-series')).filter(j=>j.calendar_payload?.method==='CANCEL').length,2);
 const changes={title:'Recurring Teams',date:'2099-11-05',time:'10:00',start_time:'10:00',end_time:'11:00',meeting_type:'Microsoft Teams',recurrence:'Weekly'};
 await user(1);await save('teams-series',changes,[{user_id:uid(2)}],true);await db.exec('reset role');
 assert.equal((await queued('teams-series')).length,0,'Graph owns Teams invitations: no parallel sendMail invitations');
 let j=await claim('teams-series');assert.equal(j.payload.recurrence,'Weekly');await finish(j);
 assert.equal((await queued('teams-series')).length,0,'Saving the confirmed Teams link does not send a second notification');
 await user(2);await db.query("update meeting_attendees set status='Accepted' where meeting_id='teams-series' and user_id=$1",[uid(2)]);await db.exec('reset role');
 jobs=await queued('teams-series');assert.equal(jobs.length,1);assert.equal(jobs[0].event_type,'meeting_rsvp');assert.match(jobs[0].body_text,/Fixture 2/);
 await user(2);await db.query("update meeting_attendees set status='Accepted' where meeting_id='teams-series' and user_id=$1",[uid(2)]);await db.exec('reset role');assert.equal((await queued('teams-series')).length,1,'No-op response cannot duplicate mail');
 await user(3);await assert.rejects(()=>save('teams-series',{recurrence:'Daily'}));
 await db.exec('reset role');assert.equal((await db.query("select has_function_privilege('authenticated','officehub_claim_teams_sync(text)','execute') allowed")).rows[0].allowed,false);
 console.log('PASS: recurring legacy backfill, monthly boundaries, post-anchor RSVP/edit, repeat-rule supersession, post-anchor series cancellation, one Teams delivery path, link-update suppression, named RSVP/no-op dedup, permission isolation.');
}finally{await db.close();}})().catch(error=>{console.error(error.message,error.query||'');process.exitCode=1;});
