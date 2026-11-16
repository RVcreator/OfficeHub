import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mapTaskRow,mapTaskToRow,mapApprovalRow,mapApprovalToRow,mapMeetingRow,mapMeetingToRow,mapNoticeRow,mapNoticeToRow,TASK_SELECT_COLUMNS,NOTICE_SELECT_COLUMNS} from '../src/services/supabaseMappers';
import {uploadRecordAttachments,recordFilePath,isMicrosoftFileLink} from '../src/services/recordAttachments';
import {supabase} from '../src/services/supabaseClient';
import {portalStore,setTableData,getTaskSnapshot} from '../src/services/store';
test('all record types retain shared file references through database round trips',()=>{
 const attachments=[{id:'file',name:'Original.txt',size:'5 B',type:'file',url:'storage://officehub-records/task/t/member/file'}];
 for(const [read,write] of [[mapTaskRow,mapTaskToRow],[mapApprovalRow,mapApprovalToRow],[mapMeetingRow,mapMeetingToRow],[mapNoticeRow,mapNoticeToRow]] as any){
  assert.deepEqual(read({id:'t',attachments}).attachments,attachments);
  assert.deepEqual(write({attachments}).attachments,attachments);
  assert.deepEqual(read({id:'t'}).attachments,[]);
  assert.equal(Object.hasOwn(write({title:'unchanged'}),'attachments'),false);
 }
 assert.match(TASK_SELECT_COLUMNS,/attachments/);assert.match(NOTICE_SELECT_COLUMNS,/attachments/);
});
test('failed original uploads never insert tasks, approvals, notices or meetings, or overwrite a saved task',async()=>{
 const from=supabase.from,rpc=supabase.rpc,storageFrom=supabase.storage.from;let writes=0;
 const uid='10000000-0000-4000-8000-000000000001';
 setTableData('currentUser',{id:uid,name:'Fixture',department:'IT',organisation:'WIPAHS',role:'Staff'} as any);
 setTableData('tasks',[{id:'existing',title:'Saved title',subtasks:[],attachments:[]}] as any);
 (supabase as any).from=()=>{writes++;throw new Error('Unexpected database write');};
 (supabase as any).rpc=()=>{writes++;throw new Error('Unexpected meeting write');};
 (supabase.storage as any).from=()=>({upload:async()=>({error:{message:'Offline'}})});
 const attachments:any=[{id:'f',name:'Original.txt',size:'5 B',type:'file',url:'data:text/plain;base64,aGVsbG8='}];
 try{
  for(const action of [()=>portalStore.addTask({title:'Draft',attachments} as any),()=>portalStore.addApproval({title:'Draft',approverIds:[uid],attachments} as any),()=>portalStore.addNotice({title:'Draft',attachments} as any),()=>portalStore.addMeeting({title:'Draft',date:'2030-12-01',startTime:'11:00',endTime:'12:00',attendees:[],attachments} as any),()=>portalStore.updateTask('existing',{attachments})]){
   await assert.rejects(action(),/record has not been saved/);
  }
  assert.equal(writes,0);assert.deepEqual(getTaskSnapshot('existing')?.attachments,[]);
 }finally{supabase.from=from;supabase.rpc=rpc;supabase.storage.from=storageFrom;setTableData('tasks',[]);}
});
test('original bytes upload before publication for every record kind; failures cannot become successful metadata',async()=>{
 const from=supabase.storage.from;const uploads:any[]=[];
 (supabase.storage as any).from=(bucket:string)=>({upload:async(path:string,blob:Blob,options:any)=>{uploads.push({bucket,path,text:await blob.text(),options});return {error:null};}});
 const file:any={id:'f',name:'Original.txt',size:'5 B',type:'file',url:'data:text/plain;base64,aGVsbG8=',textContent:'private extracted text',sheetData:[['private']]};
 try{
  for(const kind of ['task','approval','meeting','notice'] as const){
   const [saved]=await uploadRecordAttachments([file],kind,'record','member');
   assert.match(saved.url,new RegExp(`^storage://officehub-records/${kind}/record/member/`));
   assert.equal(uploads.at(-1).text,'hello');assert.equal(uploads.at(-1).bucket,'officehub-records');assert.equal(uploads.at(-1).options.upsert,false);
   assert.equal(Object.hasOwn(saved,'textContent'),false);assert.equal(Object.hasOwn(saved,'sheetData'),false);
   const before=uploads.length;assert.deepEqual(await uploadRecordAttachments([saved],kind,'record','member'),[saved]);assert.equal(uploads.length,before);
   await assert.rejects(uploadRecordAttachments([saved],kind,'different','member'),/another record/);
  }
  await assert.rejects(uploadRecordAttachments([{...file,url:'#'}],'approval','record','member'),/attach Original.txt again/);
  await assert.rejects(uploadRecordAttachments(Array(11).fill(file),'task','record','member'),/up to 10/);
  (supabase.storage as any).from=()=>({upload:async()=>({error:{message:'offline'}})});
  await assert.rejects(uploadRecordAttachments([file],'task','record','member'),/record has not been saved/);
  assert.equal(recordFilePath('https://evil.invalid/file'),null);
  assert.equal(isMicrosoftFileLink('https://wipahstz.sharepoint.com/sites/file'),true);
  assert.equal(isMicrosoftFileLink('https://wipahstz.sharepoint.com.evil.invalid/file'),false);
  assert.equal(isMicrosoftFileLink('https://user@wipahstz.sharepoint.com/file'),false);
 }finally{supabase.storage.from=from;}
});


test('uploads use at most three concurrent requests, retain selection order and finish before metadata publication',async()=>{
 const original=supabase.storage.from;let active=0,max=0,started=0;
 const releases:Array<()=>void>=[];
 (supabase.storage as any).from=()=>({upload:async()=>{started++;active++;max=Math.max(max,active);await new Promise<void>(r=>releases.push(r));active--;return {error:null};}});
 const files=Array.from({length:6},(_,i)=>({id:'parallel-'+i,name:i+'.txt',size:'5 B',type:'file',url:'data:text/plain;base64,aGVsbG8='} as any));
 try{
  let done=false;const result=uploadRecordAttachments(files,'task','parallel','member').then(rows=>{done=true;return rows;});
  await new Promise(r=>setImmediate(r));assert.equal(started,3);assert.equal(done,false);
  releases.splice(0).forEach(r=>r());await new Promise(r=>setImmediate(r));assert.equal(started,6);assert.equal(done,false);
  releases.splice(0).forEach(r=>r());const rows=await result;
  assert.equal(max,3);assert.equal(active,0);assert.deepEqual(rows.map(r=>r.id),files.map(f=>f.id));
 }finally{supabase.storage.from=original;}
});

test('a failed upload stops queued files and drains in-flight requests before permitting a retry',async()=>{
 const original=supabase.storage.from;let started=0;const releases:Array<()=>void>=[];
 (supabase.storage as any).from=()=>({upload:async()=>{const i=started++;if(i===0)return {error:Error('offline')};await new Promise<void>(r=>releases.push(r));return {error:null};}});
 // A failure in the first wave must not launch any queued files.
 const files=Array.from({length:6},(_,i)=>({id:'drain-'+i,name:i+'.txt',size:'5 B',type:'file',url:'data:text/plain;base64,aGVsbG8='} as any));
 try{
  let settled=false;const job=uploadRecordAttachments(files,'task','drain','member');
  const rejected=assert.rejects(job,/record has not been saved/).then(()=>{settled=true;});
  await new Promise(r=>setImmediate(r));assert.equal(started,3);assert.equal(settled,false);releases.forEach(r=>r());await rejected;assert.equal(started,3);assert.equal(settled,true);
  (supabase.storage as any).from=()=>({upload:async()=>({error:null})});assert.equal((await uploadRecordAttachments(files,'task','drain','member')).length,6);
 }finally{supabase.storage.from=original;}
});
