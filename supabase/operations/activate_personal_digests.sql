-- Run after digest schema + updated worker deployment + rollback tests.
-- 05:00 UTC = 08:00 Africa/Dar_es_Salaam. No credentials are added.
begin;
select cron.schedule('officehub-weekly-digest','0 5 * * 1',
 $job$select officehub_private.enqueue_personal_digests('week');$job$);
select cron.schedule('officehub-monthly-digest','0 5 1 * *',
 $job$select officehub_private.enqueue_personal_digests('month');$job$);
update officehub_private.digest_settings set enabled=true where id;
commit;
