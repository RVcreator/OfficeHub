-- Separate visible-idle heartbeats from legacy clients that also sent false for hidden tabs.
begin;
create or replace function public.officehub_presence_heartbeat_v2(p_session uuid,p_active boolean)
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

create or replace function public.officehub_presence_heartbeat(p_session uuid,p_active boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
  -- Preserve all identity, account, parameter and session-limit checks.
  perform public.officehub_presence_heartbeat_v2(p_session,p_active);
  -- Legacy false means either hidden or idle: conservatively withdraw it.
  -- Only the v2 client can declare visible inactivity as Away.
  if not p_active then perform public.officehub_presence_leave(p_session); end if;
end $$;
revoke all on function public.officehub_presence_heartbeat_v2(uuid,boolean) from public,anon;
grant execute on function public.officehub_presence_heartbeat_v2(uuid,boolean) to authenticated;
commit;
