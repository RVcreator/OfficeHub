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
 const save=async(id,changes,attendees=null,create=false)=>(await db.query('select officehub_save_meeting($1,$2,$3,$4) result',[id,changes,attendees,create])).rows[0].result;
 const claim=async id=>(await db.query('select officehub_claim_teams_sync($1) job',[id])).rows[0].job;
 const finish=async(j,error=null,blocked=false)=>db.query('select officehub_finish_teams_sync($1,$2,$3,$4,$5,$6)',[j.meeting_id,j.lease_token,j.revision,{event_id:'immutable-event',owner_id:'owner',online_id:'online',join_url:'https://teams.microsoft.com/real',applied_hash:'hash'},error,blocked]);
 const changes={title:'Teams fixture',date:'2099-11-05',start_time:'10:00 AM',end_time:'11:00 AM',time:'10:00',meeting_type:'Microsoft Teams',recurrence:'None'};
 await user(1);await save('online',changes,[{user_id:uid(2)}],true);
 await assert.rejects(()=>db.query('select officehub_claim_teams_sync($1)',['online']),error=>error.code==='42501');
 await assert.rejects(()=>save('online',{teams_join_url:'https://evil.invalid'}));
 await db.exec('reset role');let j=await claim('online');assert.equal(j.payload.attendees.length,2);assert.equal(j.payload.organizer_email,'fixture1@wipahs.org');assert.equal(new Date(j.payload.start).toISOString(),'2099-11-05T07:00:00.000Z');assert.equal(await claim('online'),null,'Only one lease per meeting');
 await user(1);await save('online',{chair_id:uid(2)},[{user_id:uid(2)},{user_id:uid(3)}]);await db.exec('reset role');await finish(j);
 let next=await claim('online');assert.ok(next.revision>j.revision);assert.equal(next.event_id,'immutable-event','Checkpoint survives newer edit');assert.equal(next.payload.chair_email,'fixture2@wipahs.org');assert.equal(next.payload.attendees.length,3);
 await finish(next);assert.equal(await claim('online'),null,'Synced job is not sent again');
 await user(1);await save('online',{},[{user_id:uid(2)},{user_id:uid(3)}]);await db.exec('reset role');assert.equal(await claim('online'),null,'No-op save does not queue duplicate invitations');
 await user(1);await save('online',{},[{user_id:uid(2)}]);await db.exec('reset role');j=await claim('online');assert.equal(j.payload.attendees.length,2,'Removed person no longer in desired audience');await finish(j,'Microsoft configuration required',true);assert.equal(await claim('online'),null,'Blocked work does not loop');
 await user(3);await assert.rejects(()=>db.query('select officehub_retry_teams_sync($1)',['online']));assert.equal((await db.query("select count(*)::int n from meetings where id='online'")).rows[0].n,0);await assert.rejects(()=>db.query('select * from officehub_private.teams_sync_jobs'));
 await user(1);await db.query('select officehub_retry_teams_sync($1)',['online']);await db.exec('reset role');j=await claim('online');assert.ok(j);await finish(j);
 await user(1);await db.query("delete from meetings where id='online'");await db.exec('reset role');j=await claim('online');assert.equal(j.payload.cancelled,true);assert.equal(j.event_id,'immutable-event');assert.equal((await db.query('select officehub_teams_sync_authorized($1,$2) allowed',[uid(1),'online'])).rows[0].allowed,true);assert.equal((await db.query('select officehub_teams_sync_authorized($1,$2) allowed',[uid(3),'online'])).rows[0].allowed,false);await finish(j);
 await user(1);await save('physical',{...changes,meeting_type:'In-Person Boardroom',location:'Boardroom'},[{user_id:uid(2)}],true);await db.exec('reset role');assert.equal(await claim('physical'),null,'Physical invitation path unchanged');
 console.log('PASS: canonical saved attendees/host, UTC conversion, one lease, newer-revision retention, checkpoint persistence, no-op dedup, removal, blocked retries, unrelated-user denial, server-owned IDs, cancellation tombstones and physical-meeting isolation.');
}finally{await db.close();}})().catch(error=>{console.error(error.message,error.query||'');process.exitCode=1;});
