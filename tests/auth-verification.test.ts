import {test} from 'node:test';import assert from 'node:assert/strict';
import {retryAccountRead,isTransientVerificationError} from '../src/services/authVerification';
import {createDeferredAuthHandler} from '../src/services/deferredAuth';
const tick=()=>new Promise(resolve=>setTimeout(resolve,15));
test('temporary account reads retry once; account denials and profile mismatches never retry',async()=>{
 let calls=0;assert.equal(await retryAccountRead(async()=>{if(++calls===1)throw {status:503};return 'fresh';},()=>true,async()=>{}),'fresh');assert.equal(calls,2);
 for(const error of [{status:401},{status:403},{status:404},Error('Staff profile does not match')]){
  calls=0;await assert.rejects(retryAccountRead(async()=>{calls++;throw error;},()=>true,async()=>{}));assert.equal(calls,1);
 }
 calls=0;await assert.rejects(retryAccountRead(async()=>{calls++;throw Error('Failed to fetch');},()=>true,async()=>{}));assert.equal(calls,2);
 assert.equal(isTransientVerificationError({status:429}),true);
 calls=0;await assert.rejects(retryAccountRead(async()=>{calls++;throw Error('Network failed');},()=>false,async()=>{}));assert.equal(calls,1);
});
test('same-session focus storms coalesce without invalidating verification; timeout cancellation is recoverable',async()=>{
 let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);let calls=0,accepted=0;
 const handler=createDeferredAuthHandler(async(_event:string,_session:string,current)=>{calls++;await gate;if(current())accepted++;},()=>assert.fail(),(_e,s)=>s);
 handler.handle('INITIAL_SESSION','same');await tick();
 for(let n=0;n<10;n++)handler.handle('TOKEN_REFRESHED','same');
 await tick();assert.equal(calls,1);handler.cancel();release();await tick();assert.equal(accepted,0);
 handler.handle('TOKEN_REFRESHED','same');await tick();assert.equal(calls,2);assert.equal(accepted,1);
 handler.dispose();handler.handle('SIGNED_IN','other');await tick();assert.equal(calls,2);
});
