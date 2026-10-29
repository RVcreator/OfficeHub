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
test('visible idle stays Away, hidden tabs leave, and returning becomes active',async()=>{
 const b=browser(),beats:boolean[]=[],publications:unknown[]=[],left:string[]=[];
 const controller=startPresence({heartbeat:async(_s,a)=>{beats.push(a);},snapshot:async()=>[],leave:async s=>{left.push(s);}},rows=>publications.push(rows),b.env);
 await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(beats,[true]);
 b.doc.visibilityState='hidden';b.doc.dispatchEvent(new Event('visibilitychange'));
 await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(beats,[true]);assert.ok(left.includes('session'));
 b.pulse();await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(beats,[true],'background timers cannot recreate an Away session');
 b.advance(PRESENCE_IDLE_MS);b.doc.visibilityState='visible';b.doc.dispatchEvent(new Event('visibilitychange'));
 await new Promise(resolve=>setImmediate(resolve));assert.equal(beats.at(-1),true,'returning to the tab is activity');
 b.advance(PRESENCE_IDLE_MS);await controller.sync();assert.equal(beats.at(-1),false);
 b.win.dispatchEvent(new Event('keydown'));await new Promise(resolve=>setImmediate(resolve));assert.equal(beats.at(-1),true);
 b.network(false);await controller.sync();assert.equal(publications.at(-1),null);
 b.advance(PRESENCE_IDLE_MS);b.network(true);b.win.dispatchEvent(new Event('online'));await new Promise(resolve=>setImmediate(resolve));assert.equal(beats.at(-1),false,'network recovery alone is not user activity');
 await controller.stop();const count=beats.length;b.win.dispatchEvent(new Event('keydown'));b.pulse();await controller.sync();
 assert.equal(beats.length,count);assert.ok(left.includes('session'));
});

test('a tab opened in the background never announces an idle connection',async()=>{
 const b=browser();b.doc.visibilityState='hidden';let beats=0,leaves=0;
 const controller=startPresence({heartbeat:async()=>{beats++;},snapshot:async()=>[],leave:async()=>{leaves++;}},()=>{},b.env);
 await new Promise(resolve=>setImmediate(resolve));b.pulse();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(beats,0);assert.ok(leaves>=1);await controller.stop();
});

test('pagehide stays withdrawn until pageshow, including an in-flight heartbeat',async()=>{
 const b=browser(),events:string[]=[];let release!:()=>void;
 const pending=new Promise<void>(resolve=>{release=resolve;});let published=0;
 const controller=startPresence({heartbeat:async()=>{await pending;events.push('heartbeat');},snapshot:async()=>[],leave:async()=>{events.push('leave');}},()=>{published++;},b.env);
 b.win.dispatchEvent(new Event('pagehide'));release();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(events.at(-1),'leave');assert.equal(published,1,'only the withdrawn snapshot is published');
 const count=events.filter(e=>e==='heartbeat').length;b.pulse();await new Promise(resolve=>setImmediate(resolve));assert.equal(events.filter(e=>e==='heartbeat').length,count);
 b.win.dispatchEvent(new Event('pageshow'));await new Promise(resolve=>setImmediate(resolve));assert.equal(events.at(-1),'heartbeat');await controller.stop();
});
test('an in-flight response cannot republish after logout',async()=>{
 const b=browser();let release!:()=>void;const pending=new Promise<void>(resolve=>{release=resolve;});let published=0,left=0;
 const controller=startPresence({heartbeat:async()=>pending,snapshot:async()=>[],leave:async()=>{left++;}},()=>{published++;},b.env);
 await controller.stop();release();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(published,0);assert.ok(left>=1);
});
