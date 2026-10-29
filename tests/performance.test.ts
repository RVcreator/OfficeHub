import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createReadQueue,createRefreshGate,createReconnect,shouldReconcile} from '../src/services/syncPolicy';
import {tableSnapshot,sameValue} from '../src/services/storeSnapshot';
import {portalStore,setTableData,subscribeTable} from '../src/services/store';
import {supabase} from '../src/services/supabaseClient';

test('selected store snapshots stay stable across unrelated messages and renew when tasks change',()=>{
 const state={tasks:[{id:'a'}],messages:[] as string[]};const read=tableSnapshot(()=>state,['tasks']);const first=read();
 state.messages=['new'];assert.equal(read(),first);
 state.tasks=[{id:'b'}];assert.notEqual(read(),first);
 assert.equal(sameValue([{id:'a',children:[1,2]}],[{id:'a',children:[1,2]}]),true);
 assert.equal(sameValue({optional:undefined},{other:undefined}),false);
});
test('actual store publishes a semantic task change once and ignores equivalent fresh arrays',()=>{
 let changes=0;const stop=subscribeTable('tasks',()=>changes++);
 try{setTableData('tasks',[{id:'perf-a',title:'Original'}] as any);const baseline=changes;
 setTableData('tasks',[{id:'perf-a',title:'Original'}] as any);assert.equal(changes,baseline);
 setTableData('tasks',[{id:'perf-a',title:'Changed'}] as any);assert.equal(changes,baseline+1);
 }finally{stop();}
});
test('slow refreshes never overlap and a burst arriving in-flight gets a trailing read',async()=>{
 const gate=createRefreshGate();let release!:()=>void,active=0,max=0,calls=0;
 const task=async()=>{calls++;active++;max=Math.max(max,active);if(calls===1)await new Promise<void>(r=>release=r);active--;};
 const first=gate.run('notifications',task);const burst=Array.from({length:20},()=>gate.run('notifications',task));
 assert.equal(calls,1);release();await Promise.all([first,...burst]);assert.equal(calls,2);assert.equal(max,1);
 await assert.rejects(gate.run('notifications',async()=>{throw Error('offline');}),/offline/);
 await gate.run('notifications',task);assert.equal(calls,3);
});
test('healthy fallback is once a minute, degraded fallback 15 seconds, and hidden/offline tabs do not poll',()=>{
 assert.equal(shouldReconcile(59_999,0,true,true,true),false);assert.equal(shouldReconcile(60_000,0,true,true,true),true);
 assert.equal(shouldReconcile(14_999,0,false,true,true),false);assert.equal(shouldReconcile(15_000,0,false,true,true),true);
 assert.equal(shouldReconcile(120_000,0,false,false,true),false);assert.equal(shouldReconcile(120_000,0,false,true,false),false);
});
test('reconnect bursts produce only one cancellable timer with bounded backoff',()=>{
 const tasks=new Map<number,()=>void>(),delays:number[]=[];let id=0,connections=0;
 const reconnect=createReconnect((fn,ms)=>{delays.push(ms);tasks.set(++id,fn);return id;},key=>{tasks.delete(key as number);},()=>connections++);
 reconnect.request();reconnect.request();assert.equal(tasks.size,1);assert.deepEqual(delays,[1000]);
 const fn=tasks.get(1)!;tasks.delete(1);fn();assert.equal(connections,1);
 reconnect.request();assert.equal(delays[1],2000);reconnect.reset();assert.equal(tasks.size,0);
 reconnect.request();assert.equal(delays[2],1000);reconnect.reset();
});
test('task, notice and meeting child queries are limited to the loaded parent IDs',async()=>{
 const original=supabase.from;const seen:any[]=[];
 (supabase as any).from=(table:string)=>{
 const child=table==='task_subtasks'||table==='notice_acknowledgements'||table==='meeting_attendees';
 const q:any={};for(const method of ['select','order','range'])q[method]=()=>q;
 q.in=(column:string,ids:string[])=>{seen.push({table,column,ids});return q;};
 q.then=(yes:any,no:any)=>Promise.resolve({data:child?[]:[{id:'parent-only',created_at:'2026-10-29',date:'2026-10-29'}],error:null}).then(yes,no);return q;};
 try{await portalStore.getTasks();await portalStore.getNotices();await portalStore.getMeetings();
 assert.deepEqual(seen,[{table:'task_subtasks',column:'task_id',ids:['parent-only']},{table:'notice_acknowledgements',column:'notice_id',ids:['parent-only']},{table:'meeting_attendees',column:'meeting_id',ids:['parent-only']}]);
 }finally{supabase.from=original;}
});

test('concurrent data consumers receive the newest trailing result without parallel requests',async()=>{
 const reads=createReadQueue();let finish!:(v:number)=>void,calls=0;
 const first=reads.run('tasks-user-A',()=>{calls++;return new Promise<number>(r=>finish=r);});
 const second=reads.run('tasks-user-A',async()=>{calls++;return 2;});
 const third=reads.run('tasks-user-A',async()=>{calls++;return 3;});
 assert.equal(calls,1);finish(1);assert.deepEqual(await Promise.all([first,second,third]),[3,3,3]);assert.equal(calls,2);
 assert.equal(await reads.run('tasks-user-B',async()=>4),4);
});
