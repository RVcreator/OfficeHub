-- A saved valid rating always wins over an obsolete rating-required flag.
begin;
create function officehub_private.has_task_rating(r jsonb) returns boolean language sql immutable set search_path='' as $$
 select coalesce(case when jsonb_typeof(r->'stars')='number' then (r->>'stars')::numeric between 1 and 5 and trunc((r->>'stars')::numeric)=(r->>'stars')::numeric else false end,false)
$$;
create function public.officehub_normalize_task_rating() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.status<>'Done' or officehub_private.has_task_rating(new.rating) then new.pending_rating:=false;end if;
 if TG_OP='UPDATE' and new.pending_rating is distinct from old.pending_rating and new.delivery_event_version=old.delivery_event_version then new.delivery_event_version:=old.delivery_event_version+1;end if;
 return new;
end$$;
-- Runs after delivery-version and participant guards, before AFTER delivery events.
create trigger officehub_task_rating_state before insert or update on public.tasks for each row execute function public.officehub_normalize_task_rating();
update public.tasks set pending_rating=false where pending_rating and officehub_private.has_task_rating(rating);
update public.notifications n set read=true where n.type='task_rating_required' and not coalesce(n.read,false) and exists(select 1 from public.tasks t where t.id=n.metadata->>'taskId' and officehub_private.has_task_rating(t.rating));
revoke all on function officehub_private.has_task_rating(jsonb),public.officehub_normalize_task_rating() from public,anon,authenticated;
commit;
