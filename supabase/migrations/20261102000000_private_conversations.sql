-- Chat membership is authoritative; administrative roles never bypass it.
begin;
create or replace function officehub_private.chat_member(k text,u uuid) returns boolean language sql stable security definer set search_path='' as $$
 select u is not null and exists(select 1 from public.conversation_participants where conversation_id=k and user_id=u)
$$;
create or replace function public.officehub_can_view_chat(k text) returns boolean language sql stable security definer set search_path='' as $$select officehub_private.chat_member(k,auth.uid())$$;
create or replace function public.officehub_can_view_message(k text) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.messages where id=k and officehub_private.chat_member(conversation_id,auth.uid()))$$;
do $$declare t text;p record;begin
 foreach t in array array['conversations','conversation_participants','messages','message_attachments'] loop
  for p in select policyname from pg_policies where schemaname='public' and tablename=t loop execute format('drop policy %I on public.%I',p.policyname,t);end loop;
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
 end loop;
end$$;
grant delete on public.conversations to authenticated;
grant insert on public.messages,public.message_attachments to authenticated;
create policy chat_member_read on public.conversations for select to authenticated using(public.officehub_can_view_chat(id));
create policy chat_member_delete on public.conversations for delete to authenticated using(public.officehub_can_view_chat(id));
create policy chat_member_directory on public.conversation_participants for select to authenticated using(public.officehub_can_view_chat(conversation_id));
create policy chat_member_messages on public.messages for select to authenticated using(public.officehub_can_view_chat(conversation_id));
create policy chat_member_send on public.messages for insert to authenticated with check(sender_id=auth.uid() and public.officehub_can_view_chat(conversation_id));
create policy chat_member_attachments on public.message_attachments for select to authenticated using(public.officehub_can_view_message(message_id));
create policy chat_sender_attachments on public.message_attachments for insert to authenticated with check(exists(select 1 from public.messages m where m.id=message_id and m.sender_id=auth.uid() and public.officehub_can_view_chat(m.conversation_id)));

-- Create details and memberships together. Existing group members may add members;
-- a stale client cannot remove members or turn a private DM into a group.
create or replace function public.officehub_save_conversation(p_id text,p_title text,p_type text,p_participant_ids uuid[],p_create boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();c public.conversations;ids uuid[];
begin
 if u is null or auth.role()<>'authenticated' or not exists(select 1 from public.profiles where id=u and coalesce(app_metadata->>'deactivated','false')<>'true') then raise exception 'Active sign-in required' using errcode='42501';end if;
 if p_create then
  if p_type not in ('direct','group') or p_type is null then raise exception 'Choose direct or group chat' using errcode='23514';end if;
  select array_agg(distinct x) into ids from unnest(coalesce(p_participant_ids,'{}')||array[u]) x;
  if p_type='direct' and cardinality(ids)<>2 then raise exception 'Direct chats require exactly two members' using errcode='23514';end if;
 else
  select * into c from public.conversations where id=p_id for update;
  if not found or not officehub_private.chat_member(p_id,u) then raise exception 'Only conversation members may change this chat' using errcode='42501';end if;
  if p_type is not null and p_type<>c.type then raise exception 'Chat type is immutable' using errcode='42501';end if;
  if c.type='direct' and p_participant_ids is not null and (exists(select 1 from unnest(p_participant_ids) x where not exists(select 1 from public.conversation_participants where conversation_id=p_id and user_id=x)) or exists(select 1 from public.conversation_participants where conversation_id=p_id and not(user_id=any(p_participant_ids)))) then raise exception 'Direct chat membership is immutable' using errcode='42501';end if;
  select array_agg(distinct x) into ids from(select unnest(coalesce(p_participant_ids,'{}')) x union select user_id from public.conversation_participants where conversation_id=p_id) a;
 end if;
 if exists(select 1 from unnest(ids) x where x is null or not exists(select 1 from public.profiles p where p.id=x and coalesce(p.app_metadata->>'deactivated','false')<>'true')) then raise exception 'Choose existing active members' using errcode='23514';end if;
 if p_create then
  insert into public.conversations(id,title,type)values(p_id,coalesce(nullif(btrim(p_title),''),'Conversation'),p_type) returning * into c;
 else
  update public.conversations set title=coalesce(nullif(btrim(p_title),''),title) where id=p_id returning * into c;
 end if;
 insert into public.conversation_participants(conversation_id,user_id)select p_id,unnest(ids) on conflict do nothing;
 return jsonb_build_object('conversation',to_jsonb(c),'participant_ids',to_jsonb(ids));
end$$;
create or replace function public.officehub_guard_chat_message() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if coalesce(auth.role(),'')<>'authenticated' then return new;end if;
 if new.sender_id is distinct from auth.uid() or not officehub_private.chat_member(new.conversation_id,auth.uid()) then raise exception 'Only members may send messages as themselves' using errcode='42501';end if;
 if new.reply_to_id is not null and not exists(select 1 from public.messages m where m.id=new.reply_to_id and m.conversation_id=new.conversation_id) then raise exception 'Reply must reference this conversation' using errcode='42501';end if;
 select name,avatar into new.sender_name,new.sender_avatar from public.profiles where id=auth.uid();
 new.timestamp:=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');return new;
end$$;
create trigger officehub_chat_message_guard before insert on public.messages for each row execute function public.officehub_guard_chat_message();
create or replace function public.officehub_chat_preview() returns trigger language plpgsql security definer set search_path='' as $$begin
 update public.conversations set last_message=new.text,last_message_time=new.timestamp where id=new.conversation_id;return new;
end$$;
create trigger officehub_chat_message_preview after insert on public.messages for each row execute function public.officehub_chat_preview();
revoke all on function officehub_private.chat_member(text,uuid) from public,anon,authenticated;
revoke all on function public.officehub_can_view_chat(text),public.officehub_can_view_message(text),public.officehub_save_conversation(text,text,text,uuid[],boolean) from public,anon;
grant execute on function public.officehub_can_view_chat(text),public.officehub_can_view_message(text),public.officehub_save_conversation(text,text,text,uuid[],boolean) to authenticated;
revoke all on function public.officehub_guard_chat_message(),public.officehub_chat_preview() from public,anon,authenticated;
-- Notification previews are private conversation content too, including old alerts.
create or replace function public.officehub_can_view_chat_alert(n public.notifications) returns boolean language plpgsql stable security definer set search_path='' as $$
declare k text:=nullif(n.metadata->>'conversationId','');mid text:=nullif(n.metadata->>'messageId','');
begin
 if k is null then return coalesce(n.type,'') not in ('new_message','message');end if;
 return officehub_private.chat_member(k,auth.uid()) and (mid is null or exists(select 1 from public.messages where id=mid and conversation_id=k));
end$$;
create policy chat_alert_read on public.notifications as restrictive for select to authenticated using(public.officehub_can_view_chat_alert(notifications));
create policy chat_alert_update on public.notifications as restrictive for update to authenticated using(public.officehub_can_view_chat_alert(notifications)) with check(public.officehub_can_view_chat_alert(notifications));
create policy chat_alert_delete on public.notifications as restrictive for delete to authenticated using(public.officehub_can_view_chat_alert(notifications));
create or replace function public.officehub_guard_chat_alert() returns trigger language plpgsql security definer set search_path='' as $$
declare k text:=nullif(new.metadata->>'conversationId','');mid text:=nullif(new.metadata->>'messageId','');target uuid;
begin
 if coalesce(auth.role(),'')<>'authenticated' then return new;end if;
 if k is null and coalesce(new.type,'') not in ('new_message','message') then return new;end if;
 select id into target from public.profiles where id::text=new.target_user_id or lower(email)=lower(new.target_user_id) limit 1;
 if not coalesce(officehub_private.chat_member(k,auth.uid()),false) or not coalesce(officehub_private.chat_member(k,target),false) or mid is null or not exists(select 1 from public.messages where id=mid and conversation_id=k and sender_id=auth.uid()) then raise exception 'Message alerts require a saved message and conversation recipients' using errcode='42501';end if;
 return new;
end$$;
create trigger officehub_chat_alert_guard before insert on public.notifications for each row execute function public.officehub_guard_chat_alert();
revoke all on function public.officehub_can_view_chat_alert(public.notifications) from public,anon;
grant execute on function public.officehub_can_view_chat_alert(public.notifications) to authenticated;
revoke all on function public.officehub_guard_chat_alert() from public,anon,authenticated;
commit;
