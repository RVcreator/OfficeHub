import {readFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const {PGlite}=await import(process.env.OFFICEHUB_PGLITE_MODULE||'@electric-sql/pglite');const db=new PGlite();
const uid=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
try{
 await db.exec(await readFile(new URL('fixtures/participant-schema.sql',import.meta.url),'utf8'));
 for(let n=1;n<=3;n++)await db.query('insert into profiles(id,name,email)values($1,$2,$3)',[uid(n),`Fixture ${n}`,`fixture${n}@example.invalid`]);
 for(const [id,read] of [['old-a',false],['old-b',true]])await db.query(`insert into notifications(id,title,type,target_user_id,actor_id,metadata,read,created_at)values($1,'Ack','notice',$2,$3,$4,$5,$6)`,[id,uid(1),uid(2),{noticeId:'n',acknowledgedByUserId:uid(2)},read,id==='old-a'?'2026-11-01':'2026-11-02']);
 await db.exec(await readFile(new URL('../supabase/migrations/20261030000002_participant_privacy.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../supabase/migrations/20261106000002_notice_notification_once.sql',import.meta.url),'utf8'));
 const history=(await db.query('select id,read,metadata from notifications order by id')).rows;
 assert.equal(history.length,2);assert.equal(history[0].read,true);assert.equal(history[1].metadata.duplicateOf,'old-a');
 await db.exec(`select set_config('request.jwt.claim.sub','${uid(2)}',false),set_config('request.jwt.claim.role','authenticated',false);set role authenticated;`);
 const add=(id,member=uid(2),notice='n',target=uid(1))=>db.query(`insert into notifications(id,title,type,target_user_id,actor_id,metadata)values($1,'Ack','notice',$2,$3,$4)`,[id,target,uid(2),{noticeId:notice,acknowledgedByUserId:member,noticeDeliveryKey:'bypass',duplicateOf:'bypass'}]);
 await assert.rejects(add('new-random-id'),/duplicate key/);
 await assert.rejects(add('spoof',uid(3)),/signed-in member/);
 await add('other-notice',uid(2),'n2');await add('other-recipient',uid(2),'n',uid(3));
 await db.exec('reset role');await db.exec(`select set_config('request.jwt.claim.sub','${uid(3)}',false);set role authenticated;`);
 await add('different-member',uid(3));
 await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from notifications')).rows[0].n,5);
 console.log('PASS: old copies retained and marked, read state preserved, random-ID retries blocked, spoofed keys ignored, actor protected, different notices/recipients/members remain distinct.');
}catch(e){console.error(e);process.exitCode=1;}finally{await db.close();}
