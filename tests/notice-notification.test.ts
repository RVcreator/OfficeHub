import {test} from 'node:test';import assert from 'node:assert/strict';
import {visibleNotifications,NotificationChimeTracker,noticeDeliveryKey} from '../src/services/notificationDelivery';
import {portalStore} from '../src/services/store';import {supabase} from '../src/services/supabaseClient';
const notice=(id:string,extra:any={})=>({id,type:'notice',targetUserId:'recipient',actorId:'actor',read:false,metadata:{noticeId:'n',acknowledgedByUserId:'actor'},...extra} as any);
test('notice delivery identity survives random retry IDs and reconnects without another chime',()=>{
 const a=notice('a'),b=notice('b'),other=notice('c',{metadata:{noticeId:'n',acknowledgedByUserId:'different'}});
 assert.equal(noticeDeliveryKey(a),noticeDeliveryKey(b));
 assert.equal(visibleNotifications([a,b,other],{id:'recipient'},new Set()).length,2);
 assert.equal(visibleNotifications([a,b],{id:'recipient'},new Set(['b'])).length,0);
 assert.equal(visibleNotifications([notice('copy',{metadata:{...a.metadata,duplicateOf:'a'}})],{id:'recipient'},new Set()).length,0);
 const sounds=new NotificationChimeTracker();assert.equal(sounds.observe([], 'recipient'),false);
 assert.equal(sounds.observe([a],'recipient'),true);assert.equal(sounds.observe([b],'recipient'),false);assert.equal(sounds.observe([other],'recipient'),true);
});
test('a duplicate insert recovers the existing notification instead of publishing another row',async()=>{
 const original=supabase.from;let duplicate=false;const saved={id:'canonical',type:'notice',target_user_id:'recipient',actor_id:'actor',metadata:{noticeId:'n',acknowledgedByUserId:'actor'},read:false};
 (supabase as any).from=()=>{const q:any={insert:()=>{duplicate=true;return q;},select:()=>q,eq:()=>q,is:()=>q,single:async()=>duplicate?(duplicate=false,{data:null,error:{code:'23505'}}):{data:saved,error:null}};return q;};
 try{const result=await portalStore.addNotification(notice('random'));assert.equal(result?.id,'canonical');}finally{supabase.from=original;}
});
