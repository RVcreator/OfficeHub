import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cachePresence,effectivePresence,isPresenceActive,startPresence,PRESENCE_IDLE_MS,PRESENCE_TTL_MS} from '../src/services/presence';
const user={id:'user',outOfOffice:false};
test('saved Online and calendar meetings cannot manufacture activity',()=>{
 assert.equal(effectivePresence({...user,status:'Online'} as any,new Map(),1000),'Offline');
});
test('idle, hidden, disconnected and clock-skewed activity are not Online',()=>{
 assert.equal(isPresenceActive(0,1000,true,true),true);
 assert.equal(isPresenceActive(0,PRESENCE_IDLE_MS,true,true),false);
 assert.equal(isPresenceActive(0,1000,false,true),false);
 assert.equal(isPresenceActive(0,1000,true,false),false);
 assert.equal(isPresenceActive(2000,1000,true,true),false);
});
test('fresh server presence expires locally even if refreshes fail',()=>{
 const cache=cachePresence([{user_id:'user',status:'Online',fresh_seconds:40,out_of_office:false}],1000);
 assert.equal(effectivePresence(user,cache,40_999),'Online');
 assert.equal(effectivePresence(user,cache,41_000),'Offline');
});
test('office availability takes priority and a fresh server change clears stale profile flags',()=>{
 const cache=cachePresence([{user_id:'user',status:'Out of Office',fresh_seconds:0,out_of_office:true}],1000);
 assert.equal(effectivePresence(user,cache,2000),'Out of Office');
 const back=cachePresence([{user_id:'user',status:'Offline',fresh_seconds:0,out_of_office:false}],1000);
 assert.equal(effectivePresence({...user,outOfOffice:true},back,2000),'Offline');
 assert.equal(effectivePresence({...user,deactivated:true},cache,2000),'Offline');
 assert.equal(effectivePresence({...user,outOfOffice:true},new Map(),2000),'Out of Office');
});
function browser() {
 let now=0,online=true,timer:()=>void=()=>{};
 const win:any=new EventTarget();win.setInterval=(fn:any)=>{timer=fn;return 1;};win.clearInterval=()=>{};
 const doc:any=new EventTarget();doc.visibilityState='visible';
 return {win,doc,env:{window:win,document:doc,online:()=>online,now:()=>now,sessionId:'session'},advance:(ms:number)=>{now+=ms;},network:(value:boolean)=>{online=value;},pulse:()=>timer()};
}
test('engine publishes Online/Away activity and removes listeners on stop',async()=>{
 const b=browser(),beats:boolean[]=[],publications:unknown[]=[],left:string[]=[];
 const controller=startPresence({heartbeat:async(_s,a)=>{beats.push(a);},snapshot:async()=>[],leave:async s=>{left.push(s);}},rows=>publications.push(rows),b.env);
 await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(beats,[true]);
 b.doc.visibilityState='hidden';b.doc.dispatchEvent(new Event('visibilitychange'));
 await new Promise(resolve=>setImmediate(resolve));assert.equal(beats.at(-1),false);
 b.doc.visibilityState='visible';b.advance(PRESENCE_IDLE_MS);await controller.sync();assert.equal(beats.at(-1),false);
 b.win.dispatchEvent(new Event('keydown'));await new Promise(resolve=>setImmediate(resolve));assert.equal(beats.at(-1),true);
 b.network(false);await controller.sync();assert.equal(publications.at(-1),null);
 await controller.stop();const count=beats.length;b.win.dispatchEvent(new Event('keydown'));b.pulse();await controller.sync();
 assert.equal(beats.length,count);assert.ok(left.includes('session'));
});
test('an in-flight response cannot republish after logout',async()=>{
 const b=browser();let release!:()=>void;const pending=new Promise<void>(resolve=>{release=resolve;});let published=0,left=0;
 const controller=startPresence({heartbeat:async()=>pending,snapshot:async()=>[],leave:async()=>{left++;}},()=>{published++;},b.env);
 await controller.stop();release();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(published,0);assert.ok(left>=1);
});
