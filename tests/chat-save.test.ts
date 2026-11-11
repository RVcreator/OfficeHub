import {test} from 'node:test';import assert from 'node:assert/strict';
import {confirmChatSave} from '../src/services/chatSave';
const message={id:'stable',senderId:'sender',conversationId:'chat',text:'Draft'} as any;
const saved={id:'stable',sender_id:'sender',conversation_id:'chat',text:'Draft'};
test('save confirmation recovers committed messages after a lost response and duplicate retry',async()=>{
 for(const error of [Error('Failed to fetch'),{code:'23505'},{code:'57014'}]){
  let writes=0;assert.equal(await confirmChatSave(message,async()=>{writes++;return {data:null,error};},async()=>({data:saved,error:null})),saved);assert.equal(writes,1);
 }
});
test('a stalled save unlocks after its deadline; it never resends or accepts someone else’s row',async()=>{
 let signal:AbortSignal|undefined,calls=0;
 await assert.rejects(confirmChatSave(message,s=>{signal=s;calls++;return new Promise(()=>{});},async()=>({data:null,error:null}),10),/draft is kept/);
 assert.equal(signal?.aborted,true);assert.equal(calls,1);
 for(const row of [{...saved,sender_id:'other'},{...saved,conversation_id:'other'},{...saved,text:'Different draft'}])await assert.rejects(confirmChatSave(message,async()=>({data:null,error:{code:'23505'}}),async()=>({data:row,error:null})),/could not be confirmed/);
 await assert.rejects(confirmChatSave(message,async()=>({data:null,error:{code:'42501'}}),async()=>({data:null,error:null})),/permission/);
});
