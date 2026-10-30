-- Apply after the frontend uses explicit profile projections. Keep the old
-- values for owner review; never expose them to browser roles or directory views.
begin;
revoke select on public.profiles from authenticated;
revoke select (temporary_password) on public.profiles from authenticated;
do $$declare cols text;begin
 select string_agg(quote_ident(attname),',') into cols from pg_attribute
 where attrelid='public.profiles'::regclass and attnum>0 and not attisdropped
 and attname=any(array['id','name','email','role','organisation','department','status','avatar','phone',
  'activity_score','tasks_count','last_active','teams_handle','birthday','bio','location','average_rating',
  'total_ratings_count','out_of_office','out_of_office_message','leave_type','leave_start_date','leave_end_date',
  'backup_contact_id','must_change_password','app_metadata','created_at','deactivated']);
 execute 'grant select ('||cols||') on public.profiles to authenticated';
end$$;
commit;
