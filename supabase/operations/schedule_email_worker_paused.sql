-- Run only after both email migrations and the worker deployment.
-- Requires pg_cron, pg_net, Vault, and an approved dedicated worker secret.
-- Store it in Function secrets as OFFICEHUB_EMAIL_WORKER_SECRET and in Vault
-- as officehub_email_worker_secret. Also store the PUBLIC legacy anon JWT
-- as officehub_email_worker_anon_key. Never store a service-role key for this job.
-- This creates a PAUSED schedule; it cannot send until deliberately activated.
begin;
do $$
begin
  if not exists(select 1 from pg_extension where extname='pg_cron')
    or not exists(select 1 from pg_extension where extname='pg_net') then
    raise exception 'Verify pg_cron and pg_net availability first';
  end if;
  if not exists(select 1 from vault.secrets where name='officehub_email_worker_secret')
    or not exists(select 1 from vault.secrets where name='officehub_email_worker_anon_key') then
    raise exception 'Approved worker secret and public anon key have not been configured';
  end if;
end $$;
select cron.schedule('officehub-email-worker','* * * * *',$job$
  select net.http_post(
    url:='https://wjxrdpuhcrvzzxnznumm.supabase.co/functions/v1/officehub-email-worker',
    headers:=jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='officehub_email_worker_anon_key'),
      'apikey',(select decrypted_secret from vault.decrypted_secrets where name='officehub_email_worker_anon_key'),
      'x-officehub-worker-key',(select decrypted_secret from vault.decrypted_secrets where name='officehub_email_worker_secret')
    ),
    body:='{"dryRun":false}'::jsonb,
    timeout_milliseconds:=60000
  );
$job$);
select cron.alter_job(job_id:=jobid,active:=false) from cron.job where jobname='officehub-email-worker';
commit;

-- Activate only after restricted mailbox and app-preview tests:
-- select cron.alter_job(job_id:=jobid,active:=true)
-- from cron.job where jobname='officehub-email-worker';
