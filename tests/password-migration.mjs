import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const db=new PGlite();const root=new URL('../',import.meta.url);
try {
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
 create table auth.users(id uuid primary key,raw_app_meta_data jsonb,updated_at timestamptz);
 create table public.profiles(id uuid primary key,must_change_password boolean,temporary_password text,app_metadata jsonb);`);
 const id='10000000-0000-4000-8000-000000000001';
 await db.query("insert into auth.users values($1,$2,now())",[id,{must_change_password:true,password_reset_id:'reset-2',password_reset_at:'2026-10-27',role:'Staff'}]);
 await db.query("insert into profiles values($1,true,'fixture-only',$2)",[id,{custom:'keep'}]);
 await db.exec(await readFile(new URL('supabase/migrations/20261027000003_confirm_password_change.sql',root),'utf8'));
 await assert.rejects(db.query('select public.officehub_confirm_password_change($1,$2,$3)',[id,'reset-1','2026-10-27']),/newer password reset/);
 assert.equal((await db.query('select must_change_password from profiles')).rows[0].must_change_password,true);
 const confirmed=(await db.query('select public.officehub_confirm_password_change($1,$2,$3) d',[id,'reset-2','2026-10-27'])).rows[0].d;
 assert.equal(confirmed.app_metadata.must_change_password,false);assert.equal(confirmed.app_metadata.role,'Staff');
 const p=(await db.query('select * from profiles')).rows[0];assert.equal(p.must_change_password,false);assert.equal(p.temporary_password,null);assert.equal(p.app_metadata.custom,'keep');
 await db.query("update auth.users set raw_app_meta_data=$2 where id=$1",[id,{must_change_password:true,password_reset_id:'reset-3'}]);
 await db.query('delete from profiles where id=$1',[id]);
 await assert.rejects(db.query('select public.officehub_confirm_password_change($1,$2,$3)',[id,'reset-3',null]),/Profile confirmation failed/);
 assert.equal((await db.query('select raw_app_meta_data from auth.users')).rows[0].raw_app_meta_data.must_change_password,true);
 assert.equal((await db.query("select has_function_privilege('authenticated','public.officehub_confirm_password_change(uuid,text,text)','EXECUTE') allowed")).rows[0].allowed,false);
 console.log('Password confirmation PostgreSQL tests passed: service-only access, atomic rollback, profile/Auth consistency, stale-reset protection, metadata preservation.');
} catch(e){console.error(e);process.exitCode=1;}finally{await db.close();}
