import {readFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const {PGlite}=await import(process.env.OFFICEHUB_PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite(),uid=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema officehub_private;
 create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.role()returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz,banned_until timestamptz,raw_app_meta_data jsonb default '{}');
 create table profiles(id uuid primary key,name text,email text,role text,department text,organisation text,app_metadata jsonb default '{}',temporary_password text,must_change_password boolean,created_at timestamptz default now());
 create function public.officehub_department_key(text,text)returns text language sql immutable as $$select lower(btrim($1))$$;
 create function public.is_admin()returns boolean language sql stable as $$select true$$;
 create function public.officehub_guard_profile_security()returns trigger language plpgsql as $$begin return new;end$$;
 create trigger fixture_profile_guard before update on profiles for each row execute function officehub_guard_profile_security();
 create function public.officehub_account_delete_allowed(uuid)returns boolean language sql stable as $$select true$$;revoke all on function officehub_account_delete_allowed(uuid)from public,anon,authenticated;grant execute on function officehub_account_delete_allowed(uuid)to service_role;
 create table role_permissions(role_id text primary key,role_name text,permissions jsonb default '[]',description text);
 create table departments(id text primary key,name text);
 create table audit_log(id text primary key,actor_id uuid,actor_name text,actor_email text,event_type text,target_name text,timestamp text,badge_color text);
 alter table profiles enable row level security;alter table role_permissions enable row level security;alter table audit_log enable row level security;alter table departments enable row level security;
 grant usage on schema public,auth to authenticated,service_role;grant all on profiles,role_permissions,departments,audit_log to authenticated,service_role;
 create policy directory on profiles for select to authenticated using(true);
 create policy "Profiles updatable by self or admin" on profiles for update to authenticated using(id=auth.uid() or is_admin());
 create policy "Profiles insertable by admin" on profiles for insert to authenticated with check(is_admin());
 create policy "Profiles deletable by admin" on profiles for delete to authenticated using(is_admin());
 create policy fixture_old_roles on role_permissions for all using(true)with check(true);
 create policy fixture_old_audit on audit_log for all using(true)with check(true);
 create policy participant_audit_privacy on audit_log as restrictive for select to authenticated using(actor_id=auth.uid());
 create policy department_directory on departments for select to authenticated using(true);
 create policy "Departments manageable by admin" on departments for all using(is_admin());
 insert into role_permissions values('role','Fixture role','[]','Description');insert into departments values('department','Shared directory');`);
 const rows=[['System adminstrator','IT','it@wipahs.org'],['COO','Top management','top@example.invalid'],['Hospitality Manager','Hospitality','hospitality@example.invalid'],['Director','Management','management@example.invalid'],['Staff','Finance','delegate@example.invalid'],['Chief','Top management','inactive@example.invalid'],['Chief','Top management','password@example.invalid'],['Chief','Top management','deleted@example.invalid'],['Chief','Top management','unconfirmed@example.invalid'],['Chief','Top management','banned@example.invalid'],['Admin','Finance','claims@example.invalid']];
 for(let i=0;i<rows.length;i++){
  const n=i+1,[role,department,email]=rows[i];await db.query('insert into auth.users(id,email,email_confirmed_at,deleted_at,banned_until,raw_app_meta_data)values($1,$2,$3,$4,$5,$6)',[uid(n),email,n===9?null:new Date(),n===8?new Date():null,n===10?new Date(Date.now()+86400000):null,n===7?{must_change_password:true}:n===11?{role:'Admin',department:'IT'}:{}]);
  await db.query('insert into profiles(id,name,email,role,department,organisation,app_metadata)values($1,$2,$3,$4,$5,$6,$7)',[uid(n),`Fixture ${n}`,email,role,department,'WIPAHS',n===6?{deactivated:true}:{}]);
 }
 await db.query("insert into audit_log(id,actor_id)values('owner-private',$1),('delegate-private',$2)",[uid(1),uid(5)]);
 await db.exec(await readFile(new URL('../supabase/migrations/20261104000001_administration_access.sql',import.meta.url),'utf8'));
 const asUser=async n=>db.exec(`reset role;select set_config('request.jwt.claim.sub','${uid(n)}',false),set_config('request.jwt.claim.role','authenticated',false);set role authenticated;`);
 const access=async()=>(await db.query('select officehub_administration_access() access')).rows[0].access;
 for(const n of [3,4,5,6,7,8,9,10,11]){await asUser(n);const permissions=await access();assert.equal(permissions.can_view,false,`fixture ${n} cannot view via role, substring, claims or inactive status`);assert.equal(permissions.can_manage,false);assert.equal((await db.query('select * from role_permissions')).rows.length,0);assert.equal((await db.query('select * from audit_log')).rows.length,0);assert.equal((await db.query('select * from departments')).rows.length,1,'normal department picker still works');}
 await asUser(3);await assert.rejects(db.query('select officehub_set_administration_access($1,true)',[uid(3)]),/Only access managers/);
 await assert.rejects(db.query('select officehub_administration_manager_allowed($1)',[uid(2)]),/permission denied/);
 await assert.rejects(db.exec("update profiles set department='Top management' where id=auth.uid()"),/Only an access manager/);
 await assert.rejects(db.query('insert into officehub_administration_grants(user_id,can_manage)values($1,true)',[uid(3)]),/permission denied/);
 await asUser(2);assert.equal((await access()).can_manage,true);assert.equal((await access()).automatic,true);assert.equal((await db.query('select is_admin() allowed')).rows[0].allowed,false,'new top-management administration access does not broaden generic private-record admin exceptions');
 assert.equal((await db.query("update departments set name='Managed' where id='department' returning id")).rows.length,1);
 await asUser(1);assert.equal((await access()).can_manage,true);assert.equal((await access()).automatic,false);assert.equal((await db.query('select is_admin() allowed')).rows[0].allowed,true);
 const before=(await db.query('select count(*)::int n from audit_log')).rows[0].n;
 await db.query('select officehub_set_administration_access($1,true)',[uid(5)]);await db.query('select officehub_set_administration_access($1,true)',[uid(5)]);
 assert.equal((await db.query('select count(*)::int n from audit_log')).rows[0].n,before+1,'repeat grant adds no duplicate audit event');
 await asUser(5);assert.equal((await access()).can_view,true);assert.equal((await access()).can_manage,false);assert.equal((await db.query('select is_admin() allowed')).rows[0].allowed,false);assert.equal((await db.query('select * from role_permissions')).rows.length,1);
 assert.deepEqual((await db.query('select id from audit_log')).rows.map(row=>row.id),['delegate-private'],'participant audit privacy remains restrictive');
 assert.equal((await db.query("update role_permissions set role_name='Escalation' returning role_id")).rows.length,0);await assert.rejects(db.query('select officehub_set_administration_access($1,true)',[uid(3)]),/Only access managers/);
 await asUser(1);await db.query('select officehub_set_administration_access($1,false)',[uid(5)]);await asUser(5);assert.equal((await access()).can_view,false);assert.equal((await db.query('select * from role_permissions')).rows.length,0);
 await asUser(1);await assert.rejects(db.query('select officehub_set_administration_access($1,false)',[uid(2)]),/automatic/);await assert.rejects(db.query('select officehub_set_administration_access($1,false)',[uid(1)]),/Access manager assignments/);
 await db.exec("reset role;select set_config('request.jwt.claim.role','service_role',false);set role service_role;");assert.equal((await db.query('select officehub_administration_manager_allowed($1) allowed',[uid(3)])).rows[0].allowed,false);assert.equal((await db.query('select officehub_account_delete_allowed($1) allowed',[uid(2)])).rows[0].allowed,true);
 await db.exec('reset role;set role anon;');await assert.rejects(db.query('select officehub_administration_access()'),/permission denied/);
 console.log('Administration SQL passed: exact Top management, explicit owner retention, view-only grants, revocation, no self escalation, inactive/password/banned denial, server account gates, shared directory retained and private audit policies preserved.');
}finally{await db.close();}
