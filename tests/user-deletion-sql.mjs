// Run with @electric-sql/pglite installed, or set OFFICEHUB_PGLITE_MODULE to its ESM file URL.
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {PGlite}=await import(process.env.OFFICEHUB_PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const root=new URL('../',import.meta.url),links=JSON.parse(await readFile(new URL('user-deletion-schema.json',import.meta.url),'utf8'));
const actor='10000000-0000-4000-8000-000000000001',target='10000000-0000-4000-8000-000000000002',replacement='10000000-0000-4000-8000-000000000003',ordinary='10000000-0000-4000-8000-000000000004';
const q=name=>{assert.match(name,/^[a-z_]+$/);return '"'+name+'"';};
try {
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
 create table auth.users(id uuid primary key,email text unique,email_confirmed_at timestamptz,raw_app_meta_data jsonb,deleted_at timestamptz,banned_until timestamptz);
 create table public.profiles(id uuid primary key,email text,role text,app_metadata jsonb);`);
 const tables=new Map();for(const link of links){if(!tables.has(link.table))tables.set(link.table,new Map());for(const column of link.columns)tables.get(link.table).set(column.name,column.not_null);}
 for(const [table,columns] of tables){
  if(table==='profiles'){for(const [column,required] of columns)if(column!=='id')await db.exec(`alter table public.profiles add column ${q(column)} uuid ${required?'not null':''}`);}
  else await db.exec(`create table public.${q(table)}(id text primary key,${[...columns].map(([column,required])=>q(column)+' uuid '+(required?'not null':'')).join(',')})`);
 }
 for(const link of links){const action={a:'no action',c:'cascade',n:'set null'}[link.on_delete];assert.ok(action);await db.exec(`alter table public.${q(link.table)} add constraint ${q(link.constraint)} foreign key(${q(link.columns[0].name)}) references ${link.parent==='auth.users'?'auth.users':'public.profiles'}(id) on delete ${action}`);}
 await db.exec('alter table notifications add column target_user_id text');
 for(const [id,email,authRole,profileRole] of [[actor,'it@wipahs.org',null,'System adminstrator'],[target,'fixture@example.invalid','Staff Member','Staff Member'],[ordinary,'ordinary@example.invalid','Staff Member','Admin']]){
  await db.query('insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values($1,$2,now(),$3)',[id,email,{role:authRole}]);
  await db.query('insert into profiles(id,email,role,app_metadata) values($1,$2,$3,$4)',[id,email,profileRole,{}]);
 }
 for(const [table,columns] of tables){
  if(table==='profiles'){await db.query('update profiles set backup_contact_id=$1 where id=$2',[target,actor]);continue;}
  const names=[...columns.keys()];await db.query(`insert into public.${q(table)}(id,${names.map(q).join(',')}) values($1,${names.map((_,i)=>'$'+(i+2)).join(',')})`,['linked-'+table,...names.map(()=>target)]);
 }
 await assert.rejects(db.query('delete from auth.users where id=$1',[target]),/foreign key/);
 const migration=await readFile(new URL('supabase/migrations/20261029000000_staff_account_deletion.sql',root),'utf8');
 await db.exec('alter table tasks alter column created_by_id set not null');
 await assert.rejects(db.exec(migration),/Unexpected user-reference schema/);await db.exec('rollback');
 assert.equal((await db.query("select confdeltype from pg_constraint where conname='audit_log_actor_id_fkey'")).rows[0].confdeltype,'a');
 await db.exec('alter table tasks alter column created_by_id drop not null');await db.exec(migration);
 await db.query('insert into notifications(id,actor_id,target_user_id) values($1,$2,$3),($4,$2,$5)',['personal-id',actor,target,'personal-email','fixture@example.invalid']);
 assert.equal((await db.query('select officehub_account_delete_allowed($1) allowed',[actor])).rows[0].allowed,true);
 assert.equal((await db.query('select officehub_account_delete_allowed($1) allowed',[ordinary])).rows[0].allowed,false,'self-edited profile role cannot authorize deletion');
 await db.query("update auth.users set raw_app_meta_data='{"+'"role":"Admin"'+"}' where id=$1",[ordinary]);
 assert.equal((await db.query('select officehub_account_delete_allowed($1) allowed',[ordinary])).rows[0].allowed,true);
 await db.query("update profiles set role='Staff Member' where id=$1",[ordinary]);
 assert.equal((await db.query('select officehub_account_delete_allowed($1) allowed',[ordinary])).rows[0].allowed,false,'profile demotion removes deletion permission');
 assert.equal((await db.query("select has_function_privilege('authenticated','public.officehub_account_delete_allowed(uuid)','EXECUTE') allowed")).rows[0].allowed,false);
 await db.query('delete from auth.users where id=$1',[target]);
 assert.equal((await db.query("select count(*) n from notifications where id like 'personal-%'")).rows[0].n,0);
 assert.equal((await db.query('select count(*) n from profiles where id=$1',[target])).rows[0].n,0);
 for(const [table,columns] of tables){
  if(table==='profiles')continue;
  const cascade=links.some(link=>link.table===table&&link.on_delete==='c'&&link.columns[0].name!=='rated_user_id');
  const rows=(await db.query(`select * from public.${q(table)}`)).rows;
  assert.equal(rows.length,cascade?0:1,table+' history/membership behavior');
  if(!cascade)for(const column of columns.keys())assert.equal(rows[0][column],null,table+'.'+column);
 }
 await db.query("insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values($1,'fixture@example.invalid',now(),'{}')",[replacement]);
 await db.query("insert into profiles(id,email,role,app_metadata) values($1,'fixture@example.invalid','Staff Member','{}')",[replacement]);
 assert.equal((await db.query("select id from auth.users where email='fixture@example.invalid'")).rows[0].id,replacement);
 console.log('PASS: migration rollback, trusted administrator checks, Auth/profile cascade, task/meeting/document/audit/rating history, membership cleanup, and same-email registration with a new UUID.');
}finally{await db.close();}
