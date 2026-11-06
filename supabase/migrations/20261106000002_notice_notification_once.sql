begin;
lock table public.notifications in share row exclusive mode;
-- Keep historical copies, but identify the single delivery for each notice action.
with keyed as (
 select id,target_user_id,created_at,read,
 case when metadata->>'acknowledgedByUserId' is not null
 then 'notice-ack:'||(metadata->>'noticeId')||':'||(metadata->>'acknowledgedByUserId')
 else 'notice-published:'||(metadata->>'noticeId') end k
 from public.notifications where type='notice' and coalesce(metadata->>'noticeId','')<>''
), ranked as (
 select *,first_value(id) over(partition by k,target_user_id order by created_at,id) canonical,
 bool_or(read) over(partition by k,target_user_id) any_read from keyed
)
update public.notifications n set metadata=(coalesce(n.metadata,'{}')-'duplicateOf')||jsonb_build_object('noticeDeliveryKey',r.k)||
 case when r.id<>r.canonical then jsonb_build_object('duplicateOf',r.canonical) else '{}'::jsonb end,
 read=case when r.id=r.canonical then r.any_read else n.read end
from ranked r where n.id=r.id;
create unique index officehub_notice_delivery_once on public.notifications((metadata->>'noticeDeliveryKey'),target_user_id)
 where metadata ? 'noticeDeliveryKey' and not(metadata ? 'duplicateOf');
create function public.officehub_notice_delivery_key() returns trigger language plpgsql set search_path='' as $$
begin
 if new.type='notice' and coalesce(new.metadata->>'noticeId','')<>'' then
  if current_user='authenticated' and new.metadata ? 'acknowledgedByUserId' and new.metadata->>'acknowledgedByUserId' is distinct from auth.uid()::text then
   raise exception 'An acknowledgement alert must identify the signed-in member' using errcode='42501';
  end if;
  new.metadata:=(coalesce(new.metadata,'{}')-'duplicateOf')||jsonb_build_object('noticeDeliveryKey',
   case when new.metadata->>'acknowledgedByUserId' is not null
    then 'notice-ack:'||(new.metadata->>'noticeId')||':'||(new.metadata->>'acknowledgedByUserId')
    else 'notice-published:'||(new.metadata->>'noticeId') end);
 end if;return new;
end $$;
create trigger zz_officehub_notice_delivery_key before insert on public.notifications for each row execute function public.officehub_notice_delivery_key();
revoke all on function public.officehub_notice_delivery_key() from public,anon,authenticated;
commit;
