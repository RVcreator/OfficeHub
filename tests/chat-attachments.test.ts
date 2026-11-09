import {test} from 'node:test';import assert from 'node:assert/strict';
import {mapMessageRow,MESSAGE_SELECT_COLUMNS} from '../src/services/supabaseMappers';
import {uploadChatAttachments,chatStoragePath} from '../src/services/chatAttachments';
import {supabase} from '../src/services/supabaseClient';
test('saved chat attachments survive loading and realtime projections without embedding file bytes',()=>{
 const attachment={id:'a',name:'Photo.jpg',size:'1 KB',type:'image',url:'storage://officehub-chat/chat/user/file'};
 assert.deepEqual(mapMessageRow({id:'m',message_attachments:[attachment]}).attachments,[attachment]);
 assert.match(MESSAGE_SELECT_COLUMNS,/message_attachments\(id,name,size,type,url\)/);assert.doesNotMatch(MESSAGE_SELECT_COLUMNS,/text_content/);
 assert.equal(chatStoragePath(attachment.url),'chat/user/file');assert.equal(chatStoragePath('https://evil.invalid/file'),null);
});
test('attachment upload persists original bytes privately; missing files and failed uploads stop the send',async()=>{
 const from=supabase.storage.from;const uploaded:any[]=[];
 (supabase.storage as any).from=(bucket:string)=>({upload:async(path:string,blob:Blob,options:any)=>{uploaded.push({bucket,path,text:await blob.text(),options});return {error:null};}});
 try{
  const file={id:'file',name:'Example.txt',size:'1 KB',type:'file',url:'data:text/plain;base64,aGVsbG8='} as any;
  const result=await uploadChatAttachments([file],'chat','member');assert.equal(uploaded[0].text,'hello');assert.equal(uploaded[0].bucket,'officehub-chat');assert.match(uploaded[0].path,/^chat\/member\//);assert.equal(uploaded[0].options.upsert,false);assert.match(result[0].url,/^storage:\/\/officehub-chat\//);
  await assert.rejects(uploadChatAttachments([{...file,url:'blob:missing'}],'chat','member'),/attach Example.txt again/);
  (supabase.storage as any).from=()=>({upload:async()=>({error:{message:'offline'}})});
  await assert.rejects(uploadChatAttachments([file],'chat','member'),/not been sent/);
 }finally{supabase.storage.from=from;}
});
