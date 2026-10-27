begin;
create table officehub_private.presence_sessions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid not null,
  seen_at timestamptz not null default now(),
  is_active boolean not null default false,
  primary key(user_id,session_id)
);
create index officehub_presence_seen_idx on officehub_private.presence_sessions(seen_at);
alter table officehub_private.presence_sessions enable row level security;
revoke all on officehub_private.presence_sessions from public,anon,authenticated;

create function public.officehub_presence_heartbeat(p_session uuid,p_active boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if p_session is null or p_active is null then raise exception 'Session and activity required'; end if;
  if not exists(select 1 from public.profiles p where p.id=auth.uid() and coalesce(to_jsonb(p)->>'deactivated','false')<>'true' and coalesce(p.app_metadata->>'deactivated','false')<>'true') then
    raise exception 'Active staff account required' using errcode='42501';
  end if;
  -- Bound abandoned tabs without relying on browser shutdown delivery.
  delete from officehub_private.presence_sessions where seen_at < now()-interval '1 day';
  if not exists(select 1 from officehub_private.presence_sessions where user_id=auth.uid() and session_id=p_session)
    and (select count(*) from officehub_private.presence_sessions where user_id=auth.uid()) >= 32 then
    raise exception 'Too many presence sessions; close unused tabs';
  end if;
  insert into officehub_private.presence_sessions(user_id,session_id,seen_at,is_active)
    values(auth.uid(),p_session,now(),p_active)
    on conflict(user_id,session_id) do update set seen_at=now(),is_active=excluded.is_active;
end $$;
create function public.officehub_presence_leave(p_session uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
  delete from officehub_private.presence_sessions where user_id=auth.uid() and session_id=p_session;
end $$;
create function public.officehub_presence_snapshot()
returns table(user_id uuid,status text,fresh_seconds integer,out_of_office boolean)
language sql stable security definer set search_path='' as $$
  select p.id,
    case
      when coalesce(p.out_of_office,false) then 'Out of Office'
      when s.seen_at is null then 'Offline'
      when not s.active then 'Away'
      when p.status='Busy' then 'Busy'
      else 'Online'
    end,
    case when s.seen_at is null then 0 else greatest(0,least(120,floor(extract(epoch from s.seen_at+interval '120 seconds'-now()))::integer)) end,coalesce(p.out_of_office,false)
  from public.profiles p
  left join lateral (
    select coalesce(max(v.seen_at) filter(where v.is_active),max(v.seen_at)) as seen_at,bool_or(v.is_active) as active
    from officehub_private.presence_sessions v
    where v.user_id=p.id and v.seen_at > now()-interval '120 seconds'
  ) s on true
  where exists(select 1 from public.profiles me where me.id=auth.uid() and coalesce(to_jsonb(me)->>'deactivated','false')<>'true' and coalesce(me.app_metadata->>'deactivated','false')<>'true')
    and coalesce(to_jsonb(p)->>'deactivated','false')<>'true'
    and coalesce(p.app_metadata->>'deactivated','false')<>'true';
$$;
revoke all on function public.officehub_presence_heartbeat(uuid,boolean) from public,anon;
revoke all on function public.officehub_presence_leave(uuid) from public,anon;
revoke all on function public.officehub_presence_snapshot() from public,anon;
grant execute on function public.officehub_presence_heartbeat(uuid,boolean) to authenticated;
grant execute on function public.officehub_presence_leave(uuid) to authenticated;
grant execute on function public.officehub_presence_snapshot() to authenticated;

do $$ begin
 if has_function_privilege('anon','public.officehub_presence_snapshot()','EXECUTE') then raise exception 'Anonymous presence access is forbidden'; end if;
 if has_function_privilege('anon','public.officehub_presence_heartbeat(uuid,boolean)','EXECUTE') then raise exception 'Anonymous heartbeat is forbidden'; end if;
 if has_table_privilege('authenticated','officehub_private.presence_sessions','SELECT') then raise exception 'Raw session records must remain private'; end if;
end $$;
do $$ declare u uuid; actual text; begin
 select id into u from public.profiles where not coalesce(out_of_office,false)
   and coalesce(app_metadata->>'deactivated','false')<>'true' order by id limit 1;
 if u is not null then
   perform set_config('request.jwt.claim.sub',u::text,true);
   perform public.officehub_presence_heartbeat('e1090000-0000-4000-8000-000000000001',true);
   select status into actual from public.officehub_presence_snapshot() where user_id=u;
   if actual not in ('Online','Busy') then raise exception 'Active presence failed: %',actual; end if;
   perform public.officehub_presence_heartbeat('e1090000-0000-4000-8000-000000000002',false);
   perform public.officehub_presence_leave('e1090000-0000-4000-8000-000000000001');
   select status into actual from public.officehub_presence_snapshot() where user_id=u;
   if actual<>'Away' then raise exception 'Away presence failed: %',actual; end if;
   update officehub_private.presence_sessions set seen_at=now()-interval '121 seconds' where user_id=u;
   select status into actual from public.officehub_presence_snapshot() where user_id=u;
   if actual<>'Offline' then raise exception 'Presence expiration failed: %',actual; end if;
 end if;
end $$;
select 'Presence schema, privileges, fresh/away/expiry checks passed; rolled back' as validation_result;
rollback;
