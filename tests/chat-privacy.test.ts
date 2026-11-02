import {test} from 'node:test';import assert from 'node:assert/strict';
import {portalStore,setTableData,subscribeTable} from '../src/services/store';import {supabase} from '../src/services/supabaseClient';import type {ChatConversation,StaffUser} from '../src/types';
const actor={id:'10000000-0000-4000-8000-000000000001',name:'Fixture',email:'fixture@example.invalid'} as StaffUser;
const own={id:'own',type:'direct',name:'Own chat',participantIds:[actor.id,'other']} as ChatConversation;
test('store filters unrelated chats and messages and purges history after membership disappears',async()=>{
 const from=supabase.from;
 (supabase as any).from=()=>{const q:any={};for(const key of ['select','order','eq','in'])q[key]=()=>q;q.then=(resolve:any,reject:any)=>Promise.resolve({data:null,error:{message:'fixture offline'}}).then(resolve,reject);return q;};
 try{
  setTableData('currentUser',actor);setTableData('conversations',[own,{id:'private-others',participantIds:['other','third']} as ChatConversation]);
  setTableData('messages',[{id:'mine',conversationId:'own'},{id:'not-mine',conversationId:'private-others'}] as any);
  assert.deepEqual((await portalStore.getConversations()).map(c=>c.id),['own']);assert.deepEqual((await portalStore.getMessages()).map(m=>m.id),['mine']);
  setTableData('conversations',[{...own,participantIds:['other']}]);assert.deepEqual(await portalStore.getConversations(),[]);assert.deepEqual(await portalStore.getMessages(),[]);
 }finally{supabase.from=from;}
});
test('denied chat creation/member updates/deletion cannot publish success',async()=>{
 const rpc=supabase.rpc,from=supabase.from;setTableData('currentUser',actor);setTableData('conversations',[own]);let publishes=0;
 const stop=subscribeTable('conversations',()=>publishes++);
 (supabase as any).rpc=async()=>({data:null,error:{message:'denied membership'}});
 (supabase as any).from=()=>{const q:any={};for(const key of ['delete','eq','select'])q[key]=()=>q;q.single=async()=>({data:null,error:{message:'denied deletion'}});return q;};
 try{
  await assert.rejects(portalStore.addConversation(own),/denied membership/);await assert.rejects(portalStore.updateConversation('own',{participantIds:['outsider']}),/denied membership/);await assert.rejects(portalStore.deleteConversation('own'),/denied deletion/);assert.equal(publishes,0);
 }finally{stop();supabase.rpc=rpc;supabase.from=from;}
});
test('sending requires conversation membership and the real sender before any network call',async()=>{
 const from=supabase.from;let called=false;(supabase as any).from=()=>{called=true;throw new Error('unexpected request');};setTableData('currentUser',actor);setTableData('conversations',[own]);
 try{
  await assert.rejects(portalStore.sendMessage({conversationId:'outsider',senderId:actor.id} as any),/Only conversation members/);
  await assert.rejects(portalStore.sendMessage({conversationId:'own',senderId:'system'} as any),/your own account/);assert.equal(called,false);
 }finally{supabase.from=from;}
});
