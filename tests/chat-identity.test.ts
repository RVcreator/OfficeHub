import {test} from 'node:test';import assert from 'node:assert/strict';
import {chatIdentity} from '../src/utils/chatIdentity';
import type {ChatConversation,StaffUser} from '../src/types';
test('DM header follows the other member for both viewers despite a stale shared title',()=>{
 const staff=[{id:'one',name:'Rija',role:'Admin',status:'Online',avatar:'one.png'},{id:'two',name:'Colleague',role:'Staff',status:'Offline',avatar:'two.png'}] as StaffUser[];
 for(const participantIds of [['one','two'],['two','one']]){
  const dm={name:'Rija — Admin',type:'direct',participantIds} as ChatConversation;
  const first=chatIdentity(dm,'one',staff);assert.equal(first.title,'Colleague — Staff');assert.equal(first.partner?.status,'Offline');assert.equal(first.partner?.avatar,'two.png');
  const second=chatIdentity(dm,'two',staff);assert.equal(second.title,'Rija — Admin');assert.equal(second.partner?.status,'Online');
  assert.deepEqual(chatIdentity(dm,'one',staff.filter(s=>s.id==='one')),{title:'Direct message',partner:null});
 }
 assert.deepEqual(chatIdentity({name:'Group title',type:'group',participantIds:['one','two']} as ChatConversation,'one',staff),{title:'Group title',partner:null});
});
