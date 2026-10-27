-- Service-only confirmation after a successful user-scoped Auth password update.
-- Passwords and hashes never pass through this RPC. No existing account is modified by deployment.
begin;
create function public.officehub_confirm_password_change(p_user uuid,p_reset_id text,p_reset_at text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare metadata jsonb; changed_at text:=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
 select u.raw_app_meta_data into metadata from auth.users u where u.id=p_user for update;
 if not found then raise exception 'Account not found'; end if;
 if metadata->>'password_reset_id' is distinct from p_reset_id or metadata->>'password_reset_at' is distinct from p_reset_at then
  raise exception 'A newer password reset was issued';
 end if;
 metadata:=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('must_change_password',false,'password_changed_at',changed_at);
 update auth.users set raw_app_meta_data=metadata,updated_at=now() where id=p_user;
 update public.profiles set must_change_password=false,temporary_password=null,
  app_metadata=coalesce(app_metadata,'{}'::jsonb)||jsonb_build_object('must_change_password',false,'password_changed_at',changed_at,
   'password_reset_id',p_reset_id,'password_reset_at',p_reset_at) where id=p_user;
 if not found then raise exception 'Profile confirmation failed'; end if;
 return jsonb_build_object('userId',p_user,'app_metadata',metadata);
end $$;
revoke all on function public.officehub_confirm_password_change(uuid,text,text) from public,anon,authenticated;
grant execute on function public.officehub_confirm_password_change(uuid,text,text) to service_role;

do $$ declare u record; result jsonb; rejected boolean:=false; begin
 if has_function_privilege('authenticated','public.officehub_confirm_password_change(uuid,text,text)','EXECUTE')
   or has_function_privilege('anon','public.officehub_confirm_password_change(uuid,text,text)','EXECUTE') then raise exception 'Client confirmation must be forbidden'; end if;
 if not has_function_privilege('service_role','public.officehub_confirm_password_change(uuid,text,text)','EXECUTE') then raise exception 'Service confirmation is required'; end if;
 select a.id,a.raw_app_meta_data into u from auth.users a join public.profiles p on p.id=a.id order by a.id limit 1;
 if u.id is not null then
  begin
   perform public.officehub_confirm_password_change(u.id,'deliberately-stale-validation-cycle',null);
  exception when others then rejected:=true;
  end;
  if not rejected then raise exception 'Stale reset confirmation was accepted'; end if;
  result:=public.officehub_confirm_password_change(u.id,u.raw_app_meta_data->>'password_reset_id',u.raw_app_meta_data->>'password_reset_at');
  if result->'app_metadata'->>'must_change_password'<>'false' then raise exception 'Auth confirmation failed'; end if;
  if not exists(select 1 from public.profiles where id=u.id and not must_change_password and temporary_password is null and app_metadata->>'must_change_password'='false') then raise exception 'Profile confirmation failed'; end if;
 end if;
end $$;
select 'Password confirmation schema, atomic flags, stale-reset rejection and service-only access passed; all changes rolled back' as validation_result;
rollback;
