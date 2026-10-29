import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {PGlite}=await import(process.env.OFFICEHUB_PGLITE_MODULE||'@electric-sql/pglite');const db=new PGlite();
try{
 await db.exec(`create table public.profiles(id text primary key,department text,organisation text);create table public.departments(id text primary key,name text not null,description text,head_id uuid,head_name text,member_count integer default 0,colour text,created_at timestamptz default now());insert into departments(id,name)values('old-a','Finance'),('old-b','finance');insert into profiles values('staff-a','IT','WIPAHS'),('staff-b','Finance','Other');`);
 await db.exec(await readFile(new URL('../supabase/migrations/20261029000002_department_metadata.sql',import.meta.url),'utf8'));
 assert.equal((await db.query("select count(*)::int as n from departments where lower(name)='finance' and organisation='WIPAHS'")).rows[0].n,2,'existing duplicate rows preserved');
 assert.equal((await db.query("select count(*)::int as n from departments where name='IT'")).rows[0].n,1,'missing staff department recovered');
 await assert.rejects(db.query("insert into departments(id,name,organisation)values('new-duplicate',' Finance ','WIPAHS')"),/already exists/);
 await db.query("insert into departments(id,name,organisation,budget,head_role)values('other-finance','Finance','Another','$123','Head')");
 await db.query("update departments set budget='$456' where id='old-a'");
 await db.query("delete from departments where id='old-a'");assert.equal((await db.query("select count(*)::int as n from departments where id='old-b'")).rows[0].n,1,'delete is by ID only');
 await assert.rejects(db.query("delete from departments where name='IT'"),/Reassign staff/);
 await assert.rejects(db.query("update departments set name='Renamed' where name='IT'"),/Reassign staff/);
 console.log('PASS: department schema upgrade, retained duplicates, reference recovery, organisation isolation, metadata persistence and used-department guards.');
}finally{await db.close();}
