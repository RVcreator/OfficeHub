-- Original file bytes stay in a private bucket, never in message list responses.
begin;
insert into storage.buckets(id,name,public,file_size_limit) values('officehub-chat','officehub-chat',false,10485760)
on conflict(id) do update set public=false,file_size_limit=10485760;
create policy officehub_chat_file_read on storage.objects for select to authenticated using(
 bucket_id='officehub-chat' and public.officehub_can_view_chat(split_part(name,'/',1))
);
create policy officehub_chat_file_upload on storage.objects for insert to authenticated with check(
 bucket_id='officehub-chat' and split_part(name,'/',2)=auth.uid()::text
 and array_length(string_to_array(name,'/'),1)=3
 and public.officehub_can_view_chat(split_part(name,'/',1))
);

-- A failed attachment insert rolls the message and its preview back too.
create or replace function public.officehub_send_attached_message(p_message jsonb,p_attachments jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a jsonb;path text;result jsonb;k text:=p_message->>'conversation_id'; total bigint:=0;bytes bigint;
begin
 if auth.uid() is null or not public.officehub_can_view_chat(k) or (p_message->>'sender_id') is distinct from auth.uid()::text then
  raise exception 'Only conversation members may send as themselves' using errcode='42501';
 end if;
 if jsonb_typeof(p_attachments) is distinct from 'array' or jsonb_array_length(p_attachments) not between 1 and 10 then raise exception 'Send 1 to 10 files';end if;
 insert into public.messages(id,conversation_id,sender_id,sender_name,text,timestamp)
 values(p_message->>'id',k,auth.uid(),'',coalesce(p_message->>'text',''),now()::text);
 for a in select value from jsonb_array_elements(p_attachments) loop
  if left(a->>'url',25) is distinct from 'storage://officehub-chat/' then raise exception 'A private file upload is required';end if;
  path:=substr(a->>'url',26);
  if split_part(path,'/',1) is distinct from k or split_part(path,'/',2) is distinct from auth.uid()::text or array_length(string_to_array(path,'/'),1)<>3 then raise exception 'File does not belong to this sender and conversation' using errcode='42501';end if;
  select (metadata->>'size')::bigint into bytes from storage.objects where bucket_id='officehub-chat' and name=path;
  if bytes is null or bytes>10485760 then raise exception 'File upload is missing or exceeds 10 MB';end if;
  total:=total+bytes;if total>20971520 then raise exception 'Send no more than 20 MB at a time';end if;
  if coalesce(length(a->>'name'),0) not between 1 and 255 or a->>'type' not in ('image','pdf','docx','xlsx','file') then raise exception 'Invalid file details';end if;
  insert into public.message_attachments(id,message_id,name,size,type,url)
  values(a->>'id',p_message->>'id',a->>'name',a->>'size',a->>'type',a->>'url');
 end loop;
 select to_jsonb(m)||jsonb_build_object('message_attachments',(select jsonb_agg(to_jsonb(f)-'text_content') from public.message_attachments f where f.message_id=m.id)) into result from public.messages m where m.id=p_message->>'id';
 return result;
end$$;
revoke all on function public.officehub_send_attached_message(jsonb,jsonb) from public,anon;
grant execute on function public.officehub_send_attached_message(jsonb,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
