begin;
-- Membership uses assignment fields only, never descriptions or copied photos.
create or replace function officehub_private.task_member(k text,u uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.tasks t where t.id=k and officehub_private.task_audience(jsonb_build_object(
 'id',t.id,'created_by_id',t.created_by_id,'assigned_to_id',t.assigned_to_id,'assigned_to_ids',t.assigned_to_ids,
 'assignment_type',t.assignment_type,'organisation',t.organisation,'department',t.department,
 'assigned_departments',t.assigned_departments,'assigned_organisations',t.assigned_organisations),u))
$$;
-- Earlier compatibility checks serialized every profile (including its photo)
-- to check an optional column. Preserve its meaning without serializing a row.
do $$declare signature text; definition text; alias_name text; replacement text; has_column boolean;
begin
 select exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='deactivated') into has_column;
 foreach signature in array array['public.officehub_presence_snapshot()','public.officehub_presence_heartbeat(uuid,boolean)','public.officehub_presence_heartbeat_v2(uuid,boolean)'] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  foreach alias_name in array array['p','me'] loop
   replacement:=case when has_column then format('%I.deactivated::text',alias_name) else 'null::text' end;
   definition:=replace(definition,format('to_jsonb(%s)->>''deactivated''',alias_name),replacement);
  end loop;
  execute definition;
 end loop;
end$$;
-- An admin decision is constant for the statement, not a per-notification read.
do $$declare p record; expression text;
begin
 for p in select policyname,qual from pg_policies where schemaname='public' and tablename='notifications' and qual like '%is_admin()%' loop
  expression:=regexp_replace(p.qual,'(public\.)?is_admin\(\)','(select public.is_admin())','g');
  execute format('alter policy %I on public.notifications using (%s)',p.policyname,expression);
 end loop;
end$$;
-- Passing notifications.* into a function materializes copied image fields
-- before the check can discard them. Supply exactly the fields it inspects.
do $$declare p record; expression text; check_expression text;
 narrow text:='jsonb_populate_record(null::public.notifications,jsonb_build_object(''metadata'',metadata,''type'',type,''meeting_id'',meeting_id))';
begin
 for p in select policyname,qual,with_check from pg_policies where schemaname='public' and tablename='notifications'
 and policyname in ('participant_notification_privacy','participant_notification_update_privacy','participant_notification_delete_privacy','chat_alert_read','chat_alert_update','chat_alert_delete') loop
  expression:=replace(p.qual,'notifications.*',narrow);
  check_expression:=replace(p.with_check,'notifications.*',narrow);
  execute format('alter policy %I on public.notifications using (%s)%s',p.policyname,expression,
   case when check_expression is not null then format(' with check (%s)',check_expression) else '' end);
 end loop;
end$$;
notify pgrst,'reload schema';
commit;
