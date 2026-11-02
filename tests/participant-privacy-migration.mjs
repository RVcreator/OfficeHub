import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {PGlite}=await import(process.env.OFFICEHUB_PGLITE_MODULE||'@electric-sql/pglite');const db=new PGlite();
const id=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const user=async n=>{await db.exec(`reset role;select set_config('request.jwt.claim.sub','${id(n)}',false),set_config('request.jwt.claim.role','authenticated',false),set_config('request.jwt.claim.email','fixture${n}@example.invalid',false);set role authenticated;`);};
const ids=async table=>(await db.query(`select id from public.${table} order by id`)).rows.map(r=>r.id);
try{
 await db.exec(await readFile(new URL('fixtures/participant-schema.sql',import.meta.url),'utf8'));
 for(const [n,role,org,department] of [[1,'Staff','WIPAHS','IT'],[2,'Staff','HO','Finance'],[3,'Admin','WIPAHS','IT'],[4,'Staff','HO','Finance'],[5,'Staff','WEC','Management'],[6,'Staff','HOP','Finance'],[7,'Staff','WEC','Finance']])await db.query('insert into profiles(id,name,email,role,organisation,department)values($1,$2,$3,$4,$5,$6)',[id(n),`Fixture ${n}`,`fixture${n}@example.invalid`,role,org,department]);
 await db.query(`insert into tasks(id,title,status,created_by_id,created_by_name,assigned_to_id,assigned_to_ids,organisation,department,assignment_type,assigned_departments,assigned_organisations)values
 ('private-task','Private','To Do',$1,'Fixture 1',$2,array[$2::uuid::text],'HO','Finance','specific_people',null,null),
 ('department-task','Department','To Do',$1,'Fixture 1',null,null,'HO','Finance','department',array['Finance'],null),
 ('org-task','Organisation','To Do',$1,'Fixture 1',null,null,'WEC','Finance','organization',null,array['WEC']),
 ('other-task','Other','To Do',$3,'Fixture 3',$4,null,'HO','Finance','specific_people',null,null),
 ('legacy-task','Legacy','To Do',null,null,$2,null,'HO','Finance',null,null,null)`,[id(1),id(2),id(3),id(4)]);
 await db.query("insert into task_assignees values('private-task',$1)",[id(2)]);
 await db.exec("insert into task_subtasks(id,task_id,title,completed)values('sub-private','private-task','Private subtask',false)");
 await db.query("insert into task_ratings(id,task_id,rated_user_id,rated_by_id,rating)values('rating-private','private-task',$1,$2,4)",[id(2),id(1)]);
 await db.query("insert into meetings(id,title,organizer_id,organizer_name,chair_id,department,status)values('private-meeting','Private meeting',$1,'Fixture 1',$2,'Finance','Scheduled')",[id(1),id(5)]);
 for(const n of [1,2,6])await db.query("insert into meeting_attendees(meeting_id,user_id,name,email,status)values('private-meeting',$1,$2,$3,'Pending')",[id(n),`Fixture ${n}`,`fixture${n}@example.invalid`]);
 await db.query("insert into approvals(id,title,requested_by_id,requested_by_name,status,approver_ids)values('private-approval','Private approval',$1,'Fixture 1','Pending',array[$2::uuid::text])",[id(1),id(2)]);
 await db.query("insert into notifications(id,title,type,target_user_id,actor_id,metadata)values('private-alert','Private approval','approval','all',$1,'{\"approvalId\":\"private-approval\"}'),('public-alert','Public notice','notice','all',$1,'{}'),('unattributed-alert','Legacy private','task','all',$1,'{}')",[id(1)]);
 await db.query("insert into audit_log(id,actor_id,event_type,target_name)values('private-audit',$1,'task_updated','Private title')",[id(1)]);
 await db.exec("insert into dispatched_emails(id,recipient_email,body_text)values('private-delivery','fixture2@example.invalid','Private content')");
 for(const filename of ['20261030000002_participant_privacy.sql','20261030000003_atomic_meeting_permissions.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+filename,import.meta.url),'utf8'));

 await user(3); // Administrator role is not an implicit private-record membership.
 assert.deepEqual(await ids('tasks'),['other-task']);assert.deepEqual(await ids('meetings'),[]);assert.deepEqual(await ids('approvals'),[]);
 for(const table of ['task_subtasks','task_ratings'])assert.deepEqual(await ids(table),[]);
 assert.equal((await db.query('select count(*)::int n from meeting_attendees')).rows[0].n,0);
 assert.deepEqual(await ids('notifications'),['public-alert']);assert.deepEqual(await ids('audit_log'),[]);assert.deepEqual(await ids('dispatched_emails'),[]);
 assert.equal((await db.query("update approvals set status='Approved' where id='private-approval' returning id")).rows.length,0);
 await assert.rejects(db.query("insert into task_assignees values('private-task',$1)",[id(3)]),/row-level security/);
 await assert.rejects(db.query("select public.officehub_save_meeting('private-meeting','{\"title\":\"Stolen\"}',null,false)"),/Only the organizer or chair/);

 await user(4);assert.deepEqual(await ids('tasks'),['department-task','other-task']);assert.deepEqual(await ids('meetings'),[]);assert.deepEqual(await ids('approvals'),[]);
 await user(7);assert.deepEqual(await ids('tasks'),['org-task']);assert.deepEqual(await ids('meetings'),[]);
 await user(2);assert.deepEqual(await ids('tasks'),['department-task','legacy-task','private-task']);assert.deepEqual(await ids('approvals'),['private-approval']);
 assert.deepEqual(await ids('notifications'),['private-alert','public-alert']);assert.deepEqual(await ids('dispatched_emails'),['private-delivery']);
 assert.deepEqual(await ids('task_subtasks'),['sub-private']);
 await db.exec("update task_subtasks set completed=true where id='sub-private'");
 await assert.rejects(db.query("update task_subtasks set task_id='other-task' where id='sub-private'"),/Subtask identity/);
 await assert.rejects(db.query("update tasks set assigned_to_ids=array[$1::text] where id='private-task'",[id(3)]),/Only the creator/);
 await assert.rejects(db.query("update tasks set rating='{}' where id='private-task'"),/Only the creator/);
 await assert.rejects(db.query("update meetings set title='Changed by attendee' where id='private-meeting' returning id").then(r=>{assert.equal(r.rows.length,0);throw Error('expected zero rows verified');}),/expected zero rows verified/);
 await db.query("update meeting_attendees set status='Declined' where meeting_id='private-meeting' and user_id=$1",[id(2)]);
 assert.equal((await db.query("update meeting_attendees set status='Accepted' where meeting_id='private-meeting' and user_id=$1 returning user_id",[id(6)])).rows.length,0);
 await assert.rejects(db.query("update meeting_attendees set user_id=$1 where meeting_id='private-meeting' and user_id=$2",[id(3),id(2)]),/Invitation identity/);
 await assert.rejects(db.query("update approvals set status='Approved',approver_ids=array[$1::text] where id='private-approval'",[id(3)]),/cannot rewrite/);
 await db.exec("update approvals set status='Approved',approved_by='Forged name',notes='Fixture decision' where id='private-approval'");
 assert.equal((await db.query("select approved_by from approvals where id='private-approval'")).rows[0].approved_by,'Fixture 2');

 await user(1);assert.equal((await db.query("select status from approvals where id='private-approval'")).rows[0].status,'Approved','requester sees result');
 await db.query("insert into approvals(id,title,requested_by_id,requested_by_name,status,approver_ids)values('new-approval','New',$1,'Fixture 1','Pending',array[$2::uuid::text]) returning id",[id(1),id(2)]);
 await assert.rejects(db.query("update approvals set status='Approved' where id='new-approval'"),/Only a selected approver/);
 await assert.rejects(db.query("insert into approvals(id,requested_by_id,status,approver_ids)values('spoof',$1,'Pending',array[$2::uuid::text])",[id(3),id(2)]),/another member/);
 await db.query("insert into tasks(id,title,created_by_id,status)values('new-task','New',$1,'To Do') returning id",[id(1)]);
 await assert.rejects(db.query("insert into notifications(id,title,type,target_user_id,metadata)values('bad-private','Private','task','all','{\"taskId\":\"private-task\"}')"),/permitted recipient/);
 await db.query("insert into notifications(id,title,type,target_user_id,metadata)values('valid-private','Private','task',$1,'{\"taskId\":\"private-task\"}') returning id",[id(2)]);
 await assert.rejects(db.query("insert into notifications(id,title,type,target_user_id,metadata)values('outside-private','Private','task',$1,'{\"taskId\":\"private-task\"}')",[id(3)]),/permitted recipient/);
 const prior=(await db.query("select title from meetings where id='private-meeting'")).rows[0].title;
 await assert.rejects(db.query("select public.officehub_save_meeting('private-meeting','{\"title\":\"Should roll back\"}',$1,false)",[JSON.stringify([{user_id:id(99)}])]),/existing members/);
 assert.equal((await db.query("select title from meetings where id='private-meeting'")).rows[0].title,prior);
 await db.query("select public.officehub_save_meeting('private-meeting','{\"title\":\"Saved atomically\"}',$1,false)",[JSON.stringify([{user_id:id(6)}])]);
 await user(2);assert.deepEqual(await ids('meetings'),[],'removed invitee loses access');assert.equal((await db.query('select count(*)::int n from meeting_attendees')).rows[0].n,0);
 await user(5);await db.exec("select public.officehub_save_meeting('private-meeting','{\"description\":\"Chair edit\"}',null,false)");
 await assert.rejects(db.query("select public.officehub_save_meeting('private-meeting',$1,null,false)",[JSON.stringify({chair_id:id(2)})]),/Only the organizer/);
 await user(1);const created=(await db.query("select public.officehub_save_meeting('new-meeting',$1,$2,true) result",[JSON.stringify({title:'New private',chair_id:id(5),date:'2026-11-02'}),JSON.stringify([{user_id:id(2),name:'Spoofed',email:'wrong@example.invalid'}])])).rows[0].result;
 assert.equal(created.attendees.find(a=>a.user_id===id(2)).email,'fixture2@example.invalid','server uses actual account identity');
 await assert.rejects(db.query("select public.officehub_save_meeting('invalid-new','{\"title\":\"Bad\"}',$1,true)",[JSON.stringify([{user_id:id(99)}])]),/existing members/);
 assert.equal((await db.query("select id from meetings where id='invalid-new'")).rows.length,0);
 await db.exec("reset role;set role anon");for(const table of ['tasks','meetings','approvals','task_subtasks','meeting_attendees','notifications'])await assert.rejects(db.query(`select * from ${table}`),/permission denied/);
 console.log('PASS: private parent/child/API access, unrelated admin and same-department denial, explicit group audiences, approval decision authority/requester result, RSVP ownership, invitation revocation, atomic meeting validation, private notification targeting, credential-free delivery/audit visibility, anonymous denial.');
}catch(error){console.error(JSON.stringify({message:error.message,code:error.code,where:error.where,position:error.position,internalPosition:error.internalPosition,internalQuery:error.internalQuery,query:error.query?.slice(0,250),stack:error.stack?.split('\n').slice(0,4)},null,2));process.exitCode=1;}finally{await db.close();}
