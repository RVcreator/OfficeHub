import{readFile}from'node:fs/promises';import assert from'node:assert/strict';
const{PGlite}=await import(process.env.OFFICEHUB_PGLITE_MODULE||'@electric-sql/pglite');const db=new PGlite();
try{
 await db.exec("create role anon;create role authenticated;create schema auth;create schema officehub_private;create table auth.users(id uuid primary key,email text unique);create table public.profiles(id uuid primary key,email text,name text);insert into auth.users values('10000000-0000-4000-8000-000000000001','old@wipahs.org');insert into profiles values('10000000-0000-4000-8000-000000000001','old@wipahs.org','Existing member');");
 await db.exec(await readFile(new URL('../supabase/migrations/20261104000003_auth_email_profile_sync.sql',import.meta.url),'utf8'));
 await db.exec("update auth.users set email='new@wipahs.org'");
 assert.deepEqual((await db.query('select email,name from profiles')).rows,[{email:'new@wipahs.org',name:'Existing member'}]);
 await db.exec("insert into profiles values('10000000-0000-4000-8000-000000000002','duplicate@wipahs.org','Other member')");
 await assert.rejects(()=>db.exec("update auth.users set email='duplicate@wipahs.org'"));
 assert.equal((await db.query('select email from auth.users')).rows[0].email,'new@wipahs.org','Profile failure rolls back Auth email too');
 assert.equal((await db.query("select has_function_privilege('authenticated','officehub_private.sync_auth_email_profile()','execute') allowed")).rows[0].allowed,false);
 console.log('PASS: Auth and profile commit atomically, duplicate rejection rolls back both, UUID/name preserved, trigger not callable by members.');
}finally{await db.close();}
