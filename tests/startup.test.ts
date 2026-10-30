import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createReadFetch} from '../src/services/readFetch';
import {initStoreOnce,portalStore,setTableData,subscribeTable} from '../src/services/store';

test('database read deadline aborts a stalled response body; writes and auth retain their original behaviour',async()=>{
 let aborted=false;
 const fetcher:any=async(_input:any,options:any)=>{options.signal.addEventListener('abort',()=>aborted=true);return {arrayBuffer:()=>new Promise(()=>{}),status:200,headers:new Headers()};};
 await assert.rejects(createReadFetch(fetcher,15)('https://fixture.supabase.co/rest/v1/tasks'),/timed out/);assert.equal(aborted,true);
 for(const [url,init] of [['https://fixture.supabase.co/rest/v1/tasks',{method:'POST'}],['https://fixture.supabase.co/auth/v1/user',{}]] as const){
  const response=new Response('{}');let received:any;
  const wrapped=createReadFetch((async(_input:any,options:any)=>{received=options;return response;}) as any,15);
  assert.equal(await wrapped(url,init),response);assert.equal(received,init);
 }
});

test('startup publishes fast sections independently and ignores late results after an account change',async()=>{
 const names=['getStaff','getTasks','getNotices','getMeetings','getApprovals','getDepartments','getSharePointDocs'] as const;
 const original=Object.fromEntries(names.map(name=>[name,portalStore[name]]));
 let releaseStaff!:(value:any)=>void,releaseApprovals!:(value:any)=>void;
 let taskPublishes=0;const stop=subscribeTable('tasks',()=>taskPublishes++);
 try{
  await portalStore.logoutUser(false);
  for(const name of names)(portalStore as any)[name]=async()=>[];
  (portalStore as any).getStaff=()=>new Promise(resolve=>releaseStaff=resolve);
  (portalStore as any).getApprovals=()=>new Promise(resolve=>releaseApprovals=resolve);
  (portalStore as any).getTasks=async()=>[{id:'fast-task'}];
  portalStore.setAuthSession({isAuthenticated:true,userId:'startup-a',mustChangePassword:false});
  const first=initStoreOnce();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(taskPublishes,1,'tasks publish while staff and approvals remain pending');
  releaseStaff([]);releaseApprovals([]);await first;
  await portalStore.logoutUser(false);
  let releaseTasks!:(value:any)=>void;
  (portalStore as any).getStaff=async()=>[];(portalStore as any).getApprovals=async()=>[];
  (portalStore as any).getTasks=()=>new Promise(resolve=>releaseTasks=resolve);
  portalStore.setAuthSession({isAuthenticated:true,userId:'startup-a',mustChangePassword:false});
  const second=initStoreOnce();await new Promise(resolve=>setImmediate(resolve));
  const before=taskPublishes;
  portalStore.setAuthSession({isAuthenticated:true,userId:'startup-b',mustChangePassword:false});
  releaseTasks([{id:'wrong-account-task'}]);await second;assert.equal(taskPublishes,before);
 }finally{
  portalStore.setAuthSession({isAuthenticated:false,userId:null,mustChangePassword:false});
  stop();for(const name of names)(portalStore as any)[name]=original[name];
 }
});
