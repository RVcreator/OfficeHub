import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {PGlite}=await import(process.env.OFFICEHUB_PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite(),root=new URL('../',import.meta.url);
const migration=await readFile(new URL('supabase/migrations/20261112000000_verification_query_load.sql',root),'utf8');
const id=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
try{
 await db.exec(await readFile(new URL('tests/fixtures/participant-schema.sql',root),'utf8'));
 await db.exec(await readFile(new URL('tests/fixtures/chat-schema.sql',root),'utf8'));
 await db.exec("alter table profiles add column status text,add column out_of_office boolean;create function public.is_admin() returns boolean language sql stable as $$select false$$;");
 for(const file of ['20261030000002_participant_privacy.sql','20261102000000_private_conversations.sql','20261027000001_live_presence.sql','20261029000001_presence_protocol_v2.sql','20261105000001_presence_expired_sessions.sql'])await db.exec(await readFile(new URL('supabase/migrations/'+file,root),'utf8'));
 for(let n=1;n<=3;n++)await db.query('insert into profiles(id,name,email,organisation,department,avatar)values($1,$2,$3,$4,$5,$6)',[id(n),'Fixture '+n,n+'@example.invalid','WIPAHS','IT','data:image/png;base64,'+'A'.repeat(2600000)]);
 await db.query("insert into tasks(id,title,created_by_id,assigned_to_ids,assigned_to_avatar) values('task','Fixture',$1,array[$2::uuid::text],$3)",[id(1),id(2),'x'.repeat(2600000)]);
 await db.exec("insert into conversations(id,type)values('chat','direct')");
 await db.query("insert into conversation_participants values('chat',$1),('chat',$2)",[id(1),id(2)]);
 await db.query("insert into messages(id,conversation_id,sender_id,sender_name,text,timestamp)values('message','chat',$1,'Fixture','Fixture','2026-11-12')",[id(1)]);
 await db.query(`insert into notifications(id,type,target_user_id,metadata,actor_avatar)values
 ('task-alert','task','all','{"taskId":"task"}',$1),('chat-alert','new_message','all','{"conversationId":"chat","messageId":"message"}',$1),('notice','notice','all','{}',$1)`,['x'.repeat(2600000)]);
 const snapshot=async()=>{const result=[];for(let n=1;n<=3;n++){
  await db.exec(`reset role;select set_config('request.jwt.claim.sub','${id(n)}',false);select set_config('request.jwt.claim.role','authenticated',false);set role authenticated;`);
  result.push((await db.query('select id from notifications order by id')).rows);
 }await db.exec('reset role');return result;};
 const before=await snapshot();await db.exec(migration);assert.deepEqual(await snapshot(),before,'exact notification audience preserved');
 assert.deepEqual(before[0].map(r=>r.id),['chat-alert','notice','task-alert']);assert.deepEqual(before[2].map(r=>r.id),['notice']);
 await db.exec(`select set_config('request.jwt.claim.sub','${id(1)}',false);set role authenticated;`);
 await db.query('select officehub_presence_heartbeat_v2($1,true)',[id(99)]);
 assert.equal((await db.query('select status from officehub_presence_snapshot() where user_id=$1',[id(1)])).rows[0].status,'Online');
 await db.exec("reset role;update profiles set app_metadata='{\"deactivated\":true}' where id='"+id(1)+"';set role authenticated");
 assert.equal((await db.query('select * from officehub_presence_snapshot()')).rows.length,0);
 await assert.rejects(db.query('select officehub_presence_heartbeat_v2($1,true)',[id(99)]),/Active staff/);
 await db.exec('reset role');await db.exec(migration);
 await db.exec('set role authenticated');assert.equal((await db.query('select * from officehub_presence_snapshot()')).rows.length,0);
 await db.exec('reset role;set role anon');await assert.rejects(db.query('select * from notifications'),/permission denied/);
 console.log('PASS: large-photo migration preserves task/chat audiences, anonymous denial, active presence and deactivation; safely reruns.');
}catch(error){console.error(error.message);process.exitCode=1;}finally{await db.close();}
