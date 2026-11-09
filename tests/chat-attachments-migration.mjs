import {readFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const {PGlite}=await import(process.env.OFFICEHUB_PGLITE_MODULE||'@electric-sql/pglite');const db=new PGlite();
const uid=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const user=async n=>db.exec(`reset role;select set_config('request.jwt.claim.sub','${uid(n)}',false),set_config('request.jwt.claim.role','authenticated',false);set role authenticated;`);
const save=async(id,type,ids,create=true)=>db.query('select officehub_save_conversation($1,$2,$3,$4,$5) result',[id,'Fixture chat',type,ids.map(uid),create]);
try{
 for(const file of ['fixtures/participant-schema.sql','fixtures/chat-schema.sql','../supabase/migrations/20261030000002_participant_privacy.sql','../supabase/migrations/20261102000000_private_conversations.sql'])await db.exec(await readFile(new URL(file,import.meta.url),'utf8'));
 for(let n=1;n<=4;n++)await db.query('insert into profiles(id,name,email,role)values($1,$2,$3,$4)',[uid(n),`Fixture ${n}`,`fixture${n}@example.invalid`,n===3?'Admin':'Staff']);
 await user(1);await save('private-dm','direct',[1,2]);await save('group','group',[1,2]);
 const sent=await db.query("insert into messages(id,conversation_id,sender_id,sender_name,text,timestamp)values('private-message','private-dm',$1,'Spoofed','Private text','wrong') returning sender_name,timestamp",[uid(1)]);
 assert.equal(sent.rows[0].sender_name,'Fixture 1');assert.ok(Number.isFinite(Date.parse(sent.rows[0].timestamp)));
 assert.equal((await db.query("select last_message from conversations where id='private-dm'")).rows[0].last_message,'Private text');
 await db.exec("insert into message_attachments(id,message_id,name)values('private-file','private-message','Private attachment')");
 await db.query("insert into notifications(id,type,title,target_user_id,metadata)values('private-alert','new_message','Private preview',$1,'{\"conversationId\":\"private-dm\",\"messageId\":\"private-message\"}')",[uid(2)]);
 await assert.rejects(db.query("insert into notifications(id,type,target_user_id,metadata)values('leak','new_message',$1,'{\"conversationId\":\"private-dm\",\"messageId\":\"private-message\"}')",[uid(3)]),/conversation recipients/);
 await assert.rejects(save('bad-dm','direct',[1,2,3]),/exactly two/);
 await assert.rejects(save('bad-group','group',[1,99]),/active members/);assert.equal((await db.query("select id from conversations where id='bad-group'")).rows.length,0);
 for(const n of [3,4]){
  await user(n);
  for(const table of ['conversations','conversation_participants','messages','message_attachments','notifications'])assert.equal((await db.query(`select count(*)::int n from ${table}`)).rows[0].n,0,`${table} hidden from outsider ${n}`);
  await assert.rejects(db.query("insert into conversation_participants values('private-dm',$1)",[uid(n)]),/permission denied/);
  await assert.rejects(db.query("insert into messages(id,conversation_id,sender_id,sender_name,text,timestamp)values('intrusion','private-dm',$1,'Outsider','No','now')",[uid(n)]),/Only members|row-level security/);
  await assert.rejects(save('private-dm','direct',[1,2,n],false),/Only conversation members/);
  assert.equal((await db.query("delete from conversations where id='private-dm' returning id")).rows.length,0);
 }
 await user(2);assert.equal((await db.query('select count(*)::int n from messages')).rows[0].n,1);
 await assert.rejects(db.query("insert into messages(id,conversation_id,sender_id,sender_name,text,timestamp)values('spoof','private-dm',$1,'Fake','No','now')",[uid(1)]),/as themselves/);
 await assert.rejects(db.exec("update conversations set last_message='Forged' where id='private-dm'"),/permission denied/);
 await assert.rejects(db.exec("insert into message_attachments(id,message_id)values('stolen-file','private-message')"),/row-level security/);
 await assert.rejects(save('private-dm','direct',[1,2,4],false),/membership is immutable/);
 await save('group','group',[1,2,4],false);await user(4);assert.deepEqual((await db.query('select id from conversations')).rows.map(r=>r.id),['group']);
 await assert.rejects(db.query("insert into messages(id,conversation_id,sender_id,sender_name,text,timestamp,reply_to_id)values('bad-reply','group',$1,'Me','No','now','private-message')",[uid(4)]),/Reply must reference/);
 await db.exec("reset role;delete from conversation_participants where conversation_id='group' and user_id='"+uid(4)+"'");await user(4);assert.equal((await db.query('select count(*)::int n from conversations')).rows[0].n,0,'revocation is immediate');
 await db.exec('reset role;set role anon');for(const table of ['conversations','conversation_participants','messages','message_attachments'])await assert.rejects(db.query(`select * from ${table}`),/permission denied/);
 await assert.rejects(save('anon-chat','group',[1]),/permission denied/);
 await db.exec(`reset role;create schema storage;grant usage on schema storage to authenticated;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);create table storage.objects(id text primary key,bucket_id text,name text,metadata jsonb);alter table storage.objects enable row level security;grant select,insert on storage.objects to authenticated;`);
 await db.exec(await readFile(new URL('../supabase/migrations/20261109000000_chat_files.sql',import.meta.url),'utf8'));
 await user(1);await save('files','direct',[1,2]);
 const path=`files/${uid(1)}/original`;
 await db.query(`insert into storage.objects values('f','officehub-chat',$1,'{"size":5}')`,[path]);
 const msg={id:'with-file',conversation_id:'files',sender_id:uid(1),text:'Shared Example.txt'};
 const att={id:'att',name:'Example.txt',size:'1 KB',type:'file',url:`storage://officehub-chat/${path}`};
 const send=(m,a)=>db.query('select officehub_send_attached_message($1,$2) result',[JSON.stringify(m),JSON.stringify(a)]);
 const saved=await send(msg,[att]);assert.equal(saved.rows[0].result.message_attachments[0].url,att.url);
 await assert.rejects(send({...msg,id:'rollback'},[{...att,id:'missing',url:`storage://officehub-chat/files/${uid(1)}/missing`}]),/missing/);
 assert.equal((await db.query("select id from messages where id='rollback'")).rows.length,0);
 await user(2);assert.equal((await db.query("select name from storage.objects")).rows.length,1);assert.equal((await db.query("select name from message_attachments where id='att'")).rows.length,1);
 await assert.rejects(send({...msg,id:'spoof'},[att]),/as themselves/);
 for(const n of [3,4]){await user(n);assert.equal((await db.query('select * from storage.objects')).rows.length,0);assert.equal((await db.query("select * from message_attachments where id='att'")).rows.length,0);await assert.rejects(send({...msg,id:'outside'},[att]),/Only conversation/);await assert.rejects(db.query(`insert into storage.objects values('outside','officehub-chat',$1,'{"size":5}')`,[path]),/row-level security/);}
 await db.exec('reset role;set role anon');await assert.rejects(send(msg,[att]),/permission denied/);
 console.log('PASS: atomic file saves, original file references, missing upload rolls back, recipient file access, unrelated admin/staff denial and anonymous denial.');
 console.log('PASS: private DMs/groups, unrelated admin and staff denial, attachment/preview protection, no self-joining or sender spoofing, atomic creation, immutable DM membership, member-only group additions, revocation, anonymous denial.');
}catch(error){console.error(JSON.stringify({message:error.message,code:error.code,where:error.where,query:error.query?.slice(0,180)},null,2));process.exitCode=1;}finally{await db.close();}
