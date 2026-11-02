import {test} from 'node:test';import assert from 'node:assert/strict';
import {confirmedTaskSnapshot} from '../src/services/taskSnapshot';import {portalStore,setTableData} from '../src/services/store';import {supabase} from '../src/services/supabaseClient';import {mapTaskRow,TASK_SELECT_COLUMNS} from '../src/services/supabaseMappers';
test('older task snapshots cannot undo a confirmed completion; newer explicit reopens and removals win',()=>{
 const done={id:'shared',status:'Done',deliveryVersion:2} as any,old={...done,status:'In Progress',deliveryVersion:1},reopened={...old,deliveryVersion:3};
 assert.equal(confirmedTaskSnapshot([old],[done])[0],done);assert.equal(confirmedTaskSnapshot([reopened],[done])[0],reopened);assert.deepEqual(confirmedTaskSnapshot([],[done]),[]);
 assert.equal(mapTaskRow({id:'shared',delivery_event_version:7}).deliveryVersion,7);assert.ok(TASK_SELECT_COLUMNS.includes('delivery_event_version'));
});
test('status conflict publishes the newer server state and refuses to show the requested stale status',async()=>{
 const rpc=supabase.rpc,from=supabase.from;setTableData('tasks',[{id:'shared',status:'In Progress',deliveryVersion:1,subtasks:[]}] as any);
 let args:any;(supabase as any).rpc=async(name:string,body:any)=>{assert.equal(name,'officehub_set_task_status');args=body;return {data:{task:{id:'shared',status:'Done',delivery_event_version:2,pending_rating:true},conflict:true},error:null};};
 (supabase as any).from=()=>{const q:any={};for(const method of ['select','order','range'])q[method]=()=>q;q.then=(ok:any,no:any)=>Promise.resolve({error:{message:'fixture offline'},data:null}).then(ok,no);return q;};
 try{
  await assert.rejects(portalStore.updateTaskStatus('shared','In Progress',{expectedVersion:1,reopen:true}),/latest status is now shown/);
  const saved=(await portalStore.getTasks())[0];assert.equal(saved.status,'Done');assert.equal(saved.deliveryVersion,2);assert.equal(args.p_expected_version,1);assert.equal(args.p_reopen,true);
  setTableData('tasks',[{id:'shared',status:'To Do',deliveryVersion:1}] as any);assert.equal((await portalStore.getTasks())[0].status,'Done','late reads cannot revert the store');
 }finally{supabase.rpc=rpc;supabase.from=from;}
});
