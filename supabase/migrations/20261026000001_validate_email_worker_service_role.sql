-- Validate the caller's database role, rather than comparing JWT bytes.
-- Signed service-role tokens may differ while representing the same server role.
begin;
create function public.officehub_email_authorize() returns boolean
language sql security invoker set search_path = '' as $$
  select auth.role() = 'service_role';
$$;
revoke all on function public.officehub_email_authorize() from public,anon,authenticated;
grant execute on function public.officehub_email_authorize() to service_role;
commit;
