begin;
-- Access checks need these three fields, not multi-megabyte copied avatars.
-- Keep the existing membership decision and grants exactly the same.
create or replace function public.officehub_can_view_notification(n public.notifications)
returns boolean language sql stable security definer set search_path='' as $$
 select officehub_private.notification_member(jsonb_build_object('metadata',n.metadata,'type',n.type,'meeting_id',n.meeting_id),auth.uid())
$$;
create index if not exists officehub_notification_target_date on public.notifications(target_user_id,created_at desc);
create index if not exists officehub_message_conversation_date on public.messages(conversation_id,timestamp desc);
-- Prevent fresh chat writes from copying the entire profile image into each row.
create or replace function public.officehub_guard_chat_message() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if coalesce(auth.role(),'')<>'authenticated' then return new;end if;
 if new.sender_id is distinct from auth.uid() or not officehub_private.chat_member(new.conversation_id,auth.uid()) then raise exception 'Only members may send messages as themselves' using errcode='42501';end if;
 if new.reply_to_id is not null and not exists(select 1 from public.messages m where m.id=new.reply_to_id and m.conversation_id=new.conversation_id) then raise exception 'Reply must reference this conversation' using errcode='42501';end if;
 select name,case when length(avatar)<=2048 and avatar ~ '^https?://' then avatar else null end into new.sender_name,new.sender_avatar from public.profiles where id=auth.uid();
 new.timestamp:=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');return new;
end$$;
notify pgrst,'reload schema';
commit;
