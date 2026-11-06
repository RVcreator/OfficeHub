import {test} from 'node:test';
import assert from 'node:assert/strict';
import {confirmedTaskSnapshot} from '../src/services/taskSnapshot';
import {mapTaskRow,TASK_SELECT_COLUMNS} from '../src/services/supabaseMappers';
import {portalStore,setTableData,getTaskSnapshot} from '../src/services/store';
import {supabase} from '../src/services/supabaseClient';

test('saved updates survive stale reads independently of completion versions, including cleared notes',()=>{
 const note={text:'Saved',authorId:'member',authorName:'Member',updatedAt:'2026-11-06T09:00:00Z'};
 const current={id:'note',deliveryVersion:2,generalUpdateVersion:3,update:note} as any;
 const stale={...current,deliveryVersion:4,generalUpdateVersion:2,update:undefined};
 const merged=confirmedTaskSnapshot([stale],[current])[0];assert.equal(merged.deliveryVersion,4);assert.equal(merged.update,note);assert.equal(merged.generalUpdateVersion,3);
 const cleared={...current,generalUpdateVersion:4,update:undefined};assert.equal(confirmedTaskSnapshot([current],[cleared])[0].update,undefined);
 const newerNote={...current,deliveryVersion:1,generalUpdateVersion:5,update:{...note,text:'Newer'}};
 const independent=confirmedTaskSnapshot([newerNote],[cleared])[0];assert.equal(independent.deliveryVersion,2);assert.equal(independent.update?.text,'Newer');
 assert.deepEqual(confirmedTaskSnapshot([],[current]),[],'removal or revoked access still removes the task');
 assert.equal(mapTaskRow({id:'note',general_update:note,general_update_version:3}).update,note);
 assert.ok(TASK_SELECT_COLUMNS.includes('general_update_version'));
});

test('task note is published only after server confirmation; failure preserves the saved note and conflicts expose latest',async()=>{
 const rpc=supabase.rpc,uid='10000000-0000-4000-8000-000000000001';
 const previous={text:'Previous',authorId:uid,authorName:'Member',updatedAt:'2026-11-06T08:00:00Z'};
 setTableData('authSession',{userId:uid,isAuthenticated:true,mustChangePassword:false} as any);
 setTableData('tasks',[{id:'note',subtasks:[],generalUpdateVersion:1,update:previous}] as any);
 let result:any={data:null,error:Error('Network failed')};let args:any;
 (supabase as any).rpc=(name:string,body:any)=>{assert.equal(name,'officehub_save_task_update');args=body;return {abortSignal:(signal:AbortSignal)=>{assert.ok(signal);return Promise.resolve(result);}};};
 try {
  await assert.rejects(portalStore.updateTaskGeneralUpdate('note','Draft',uid,'Spoofed',previous),/Network failed/);
  assert.deepEqual(getTaskSnapshot('note')?.update,previous);
  const saved={...previous,text:'Draft',authorName:'Server name'};result={data:{conflict:false,update:saved,version:2},error:null};
  await portalStore.updateTaskGeneralUpdate('note','Draft',uid,'Spoofed',previous);
  assert.deepEqual(args.p_expected,previous);assert.equal(args.p_text,'Draft');assert.equal(args.authorName,undefined);
  assert.deepEqual(getTaskSnapshot('note')?.update,saved);
  const newer={...saved,text:'Another member update'};result={data:{conflict:true,update:newer,version:3},error:null};
  await assert.rejects(portalStore.updateTaskGeneralUpdate('note','Stale draft',uid,'Member',saved),(err:any)=>err.code==='task_update_conflict'&&err.latestUpdate.text===newer.text);
  assert.deepEqual(getTaskSnapshot('note')?.update,newer);
  result={data:{conflict:false},error:null};await assert.rejects(portalStore.updateTaskGeneralUpdate('note','Draft'),/did not confirm/);
 }finally{supabase.rpc=rpc;setTableData('tasks',[]);setTableData('authSession',{isAuthenticated:false,userId:null,mustChangePassword:false} as any);}
});
