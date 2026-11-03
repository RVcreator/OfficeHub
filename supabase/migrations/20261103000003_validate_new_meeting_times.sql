begin;
-- Validate the allocation before attendee inserts can produce a misleading RSVP error.
create function public.officehub_new_meeting_time_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare finish timestamptz;begin
 if coalesce(auth.role(),'')<>'authenticated' then return new;end if;
 finish:=officehub_private.meeting_end_at(new);
 if officehub_private.meeting_start_at(new) is null or finish is null then
  raise exception 'Choose a valid meeting date, start and end time.' using errcode='23514';end if;
 if finish<=clock_timestamp() then
  raise exception 'This meeting time has already ended in Tanzania (EAT). Choose a later time or a future date.' using errcode='23514';end if;
 if finish<=officehub_private.meeting_start_at(new) then
  raise exception 'The meeting must have a positive duration. Choose a different end time.' using errcode='23514';end if;
 return new;
end$$;
create trigger officehub_new_meeting_time_guard before insert on public.meetings for each row execute function public.officehub_new_meeting_time_guard();
revoke all on function public.officehub_new_meeting_time_guard() from public,anon,authenticated;
commit;
