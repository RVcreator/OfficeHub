import {test} from 'node:test';import assert from 'node:assert/strict';import {createMutationGate} from '../src/services/mutationGate';
import {portalStore,setTableData} from '../src/services/store';import {supabase} from '../src/services/supabaseClient';
test('identical pending writes share one result; later intentional actions and failed retries remain available',async()=>{
 const gate=createMutationGate();let calls=0,release!:(value:number)=>void;
 const action=()=>{calls++;return new Promise<number>(r=>release=r);};
 const a=gate.run('same',action),b=gate.run('same',action);assert.equal(a,b);await Promise.resolve();assert.equal(calls,1);release(7);assert.deepEqual(await Promise.all([a,b]),[7,7]);
 assert.equal(await gate.run('same',async()=>++calls),2);
 await assert.rejects(gate.run('same',async()=>{throw new Error('offline');}),/offline/);assert.equal(await gate.run('same',async()=>++calls),3);
 const x=gate.run('one',async()=>1),y=gate.run('two',async()=>2);assert.deepEqual(await Promise.all([x,y]),[1,2]);
});
test('the actual subtask action coalesces double clicks into one confirmed write',async()=>{
 const from=supabase.from;let writes=0,release!:(value:any)=>void;
 setTableData('tasks',[{id:'gate-task',subtasks:[{id:'gate-subtask',completed:false}]}] as any);
 (supabase as any).from=()=>{const q:any={};q.update=()=>{writes++;return q;};for(const key of ['eq','select'])q[key]=()=>q;q.single=()=>new Promise(r=>release=r);return q;};
 try{
  const a=portalStore.toggleSubtask('gate-task','gate-subtask'),b=portalStore.toggleSubtask('gate-task','gate-subtask');assert.equal(a,b);await Promise.resolve();assert.equal(writes,1);
  release({data:{id:'gate-subtask',task_id:'gate-task',title:'Checklist',completed:true},error:null});await Promise.all([a,b]);assert.equal(writes,1);
 }finally{supabase.from=from;}
});
