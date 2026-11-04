begin;
-- Auth's Admin API remains the only writer of sign-in identities. Its update
-- and the matching directory update commit or roll back in one transaction.
create or replace function officehub_private.sync_auth_email_profile() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.email is distinct from old.email then
  if exists(select 1 from public.profiles where id=new.id) then
   if new.email is null or btrim(new.email)='' then raise exception 'A staff account needs an email'; end if;
   if exists(select 1 from public.profiles where id<>new.id and lower(btrim(email))=lower(btrim(new.email))) then raise exception 'Email already assigned to another staff profile' using errcode='23505'; end if;
   update public.profiles set email=lower(btrim(new.email)) where id=new.id;
  end if;
 end if;
 return new;
end $$;
revoke all on function officehub_private.sync_auth_email_profile() from public,anon,authenticated;
drop trigger if exists officehub_auth_email_profile_sync on auth.users;
create trigger officehub_auth_email_profile_sync after update of email on auth.users
for each row execute function officehub_private.sync_auth_email_profile();
commit;
