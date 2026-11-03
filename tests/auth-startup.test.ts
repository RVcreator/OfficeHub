import {test} from 'node:test';import assert from 'node:assert/strict';
import {createAuthStartupDeadline} from '../src/services/authStartup';
import {createReadFetch} from '../src/services/readFetch';
const tick=(ms=20)=>new Promise(resolve=>setTimeout(resolve,ms));
test('a missing authentication event ends the loading gate without trusting cached credentials',async()=>{
 let failures=0;const deadline=createAuthStartupDeadline(()=>{failures++},5);await tick();assert.equal(failures,1);deadline.complete();await tick();assert.equal(failures,1);
});
test('completed authentication and unmounted StrictMode effects do not later show false errors',async()=>{
 let failures=0;const completed=createAuthStartupDeadline(()=>failures++,5);completed.complete();const disposed=createAuthStartupDeadline(()=>failures++,5);disposed.dispose();await tick();assert.equal(failures,0);
});
test('stalled account reads including response bodies time out while authentication writes are never automatically cancelled',async()=>{
 const stuck=createReadFetch((async()=>new Promise(()=>{})) as typeof fetch,5);
 await assert.rejects(stuck('https://fixture.invalid/auth/v1/user'),/Account verification timed out/);
 const stream=createReadFetch((async()=>new Response(new ReadableStream({start(){}}))) as typeof fetch,5);
 await assert.rejects(stream('https://fixture.invalid/auth/v1/user'),/Account verification timed out/);
 let aborted=false;const writes=createReadFetch((async(_url,init)=>{init?.signal?.addEventListener('abort',()=>{aborted=true});await tick();return new Response('{}')}) as typeof fetch,5);
 await writes('https://fixture.invalid/auth/v1/token',{method:'POST'});assert.equal(aborted,false);
});
