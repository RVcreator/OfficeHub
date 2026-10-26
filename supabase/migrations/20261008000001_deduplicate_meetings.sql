-- =========================================================================
-- MIGRATION: 20261008000001_deduplicate_meetings.sql
-- Deduplicate any existing duplicate meeting records created by rapid multi-clicks
-- =========================================================================

-- 1. Delete duplicate notifications associated with duplicate meeting IDs
delete from public.notifications
where meeting_id in (
  select id from (
    select id,
           row_number() over (
             partition by lower(trim(title)), date, start_time, coalesce(organizer_id::text, chair_id::text, '')
             order by created_at asc, id asc
           ) as rn
    from public.meetings
  ) dupes
  where dupes.rn > 1
);

-- 2. Delete duplicate meeting rows (meeting_attendees cascades automatically)
delete from public.meetings
where id in (
  select id from (
    select id,
           row_number() over (
             partition by lower(trim(title)), date, start_time, coalesce(organizer_id::text, chair_id::text, '')
             order by created_at asc, id asc
           ) as rn
    from public.meetings
  ) dupes
  where dupes.rn > 1
);
