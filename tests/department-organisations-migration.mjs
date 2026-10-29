import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {PGlite}=await import(process.env.OFFICEHUB_PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
try{
 await db.exec(`create role anon;create role authenticated;
 create table public.profiles(id text primary key,department text,organisation text);
 create table public.departments(id text primary key,name text,description text,head_id uuid,head_name text,member_count integer default 0,colour text,created_at timestamptz default now());
 insert into departments(id,name)values('finance-a','Finance'),('finance-b','finance'),('management-a','Management'),('management-b','Management'),('projects','Projects and Marketing'),('logistics','Logistics and Operations'),('tabligh','Tabligh');
 insert into profiles values('it','IT','WIPAHS'),('finance','Finance','WIPAHS'),('ho-head','Top management','HO'),('ho-projects','Marketing and Projects','HO'),('ho-marketing','Marketing','HO'),('ho-operations','Logistics and Operations','HO');`);
 const before=(await db.query('select * from profiles order by id')).rows;
 await db.exec(await readFile(new URL('../supabase/migrations/20261029000002_department_metadata.sql',import.meta.url),'utf8'));
 const oldCount=(await db.query('select count(*)::int as n from departments')).rows[0].n;
 const migration=await readFile(new URL('../supabase/migrations/20261029000003_restore_department_organisations.sql',import.meta.url),'utf8');
 await db.exec(migration);
 const active=(await db.query('select organisation,name from departments where archived_at is null order by organisation,name')).rows;
 for(const [organisation,names] of Object.entries({WIPAHS:['Top management','IT','Finance'],HO:['Management','Finance','Projects and Marketing','Logistics and Operations','Tabligh','Marketing'],HOP:['Management','Finance'],WEC:['Management','Finance'],MEDEWELL:['Management','Finance']})){
  assert.deepEqual(active.filter(d=>d.organisation===organisation).map(d=>d.name).sort(),names.sort());
 }
 assert.deepEqual((await db.query('select * from profiles order by id')).rows,before,'staff IDs and raw assignments/history labels untouched');
 assert.equal((await db.query('select count(*)::int as n from officehub_department_repair_20261029')).rows[0].n,oldCount,'all old department rows backed up');
 assert.equal((await db.query("select archived_at is not null as archived from departments where id='finance-b'")).rows[0].archived,true);
 await assert.rejects(db.query("insert into departments(id,name,organisation)values('duplicate','top management','HO')"),/already exists/);
 await assert.rejects(db.query("delete from departments where organisation='HO' and name='Management'"),/Reassign staff/);
 await assert.rejects(db.query("update departments set archived_at=now() where organisation='HO' and name='Projects and Marketing' and archived_at is null"),/Reassign staff/);
 await db.exec(migration);
 assert.deepEqual((await db.query('select organisation,name from departments where archived_at is null order by organisation,name')).rows,active,'repair is idempotent');
 console.log('PASS: workbook organisation matrix restored, unrelated staff department retained, aliases reconciled, duplicates archived with backup, staff/history untouched, active uniqueness and reference guards enforced, repeat run safe.');
}finally{await db.close();}
