import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transformSync} from 'esbuild';
async function handlerFor(path:string,client:any,verification?:any){
 const source=(await readFile(new URL('../supabase/functions/'+path+'/index.ts',import.meta.url),'utf8')).replace(/^import .*;$/gm,'');
 let handler:any;const compiled=transformSync(source,{loader:'ts',target:'es2022',format:'cjs'}).code;
 const verifiedClient={rpc:async()=>({data:true,error:null}),...client};
 let clients=0;
 const verificationClient=verification||{auth:{signInWithPassword:async()=>({data:{user:{id:'target'},session:{access_token:'fixture-only',user:{id:'target'}}},error:null}),signOut:async()=>({error:null})}};
 new Function('createClient','serve','Deno',compiled)(()=>++clients===1?verifiedClient:verificationClient,(fn:any)=>{handler=fn;},{env:{get:(k:string)=>k==='SUPABASE_URL'?'https://example.supabase.co':k==='SUPABASE_SERVICE_ROLE_KEY'?'test-key':''}});
 return handler;
}
const request=(body:any)=>new Request('https://example/reset',{method:'POST',headers:{authorization:'Bearer user-token'},body:JSON.stringify(body)});
test('actual reset handler renews the requirement and removes the previous completion',async()=>{
 const writes:any[]=[];let profiles=0;
 const client={auth:{getUser:async()=>({data:{user:{id:'admin'}},error:null}),admin:{getUserById:async()=>({data:{user:{id:'target',email:'test@wipahs.org',app_metadata:{must_change_password:false,password_changed_at:'old',custom:'keep'}}},error:null}),updateUserById:async(id:string,body:any)=>{writes.push({id,body});return {error:null};}}},from:()=>{
 const index=++profiles;const q:any={select:()=>q,eq:()=>q,update:(body:any)=>{writes.push({profile:body});return q;},single:async()=>({data:index===1?{role:'Admin',department:'IT'}:index===2?{id:'target',email:'test@wipahs.org',app_metadata:{custom:'profile-keep',password_changed_at:'old'}}:{id:'target'},error:null})};return q;
 }};
 const handler=await handlerFor('admin-reset-password',client);const r=await handler(request({userId:'target',customPassword:'Example-only-temp'}));assert.equal(r.status,200);
 assert.equal(writes[0].body.app_metadata.must_change_password,true);assert.equal(writes[0].body.app_metadata.password_changed_at,null);assert.ok(writes[0].body.app_metadata.password_reset_id);assert.equal(writes[0].body.app_metadata.custom,'keep');
 assert.equal(writes[1].profile.must_change_password,true);assert.equal(writes[1].profile.temporary_password,null);assert.equal(writes[1].profile.app_metadata.password_changed_at,null);
});
test('failed Auth reset never writes a profile or reports success',async()=>{
 let queries=0;const client={auth:{getUser:async()=>({data:{user:{id:'admin'}},error:null}),admin:{getUserById:async()=>({data:{user:{id:'target',email:'test@wipahs.org',app_metadata:{}}},error:null}),updateUserById:async()=>({error:{message:'rejected'}})}},from:()=>{queries++;const q:any={select:()=>q,eq:()=>q,single:async()=>({data:{id:'target',email:'test@wipahs.org',role:'Admin',department:'IT'},error:null})};return q;}};
 const handler=await handlerFor('admin-reset-password',client);const r=await handler(request({userId:'target',customPassword:'Example-only-temp'}));assert.equal(r.status,500);assert.equal(queries,2);
});
test('existing-account creation error never silently resets that account',async()=>{
 let updates=0;const client={auth:{getUser:async()=>({data:{user:{id:'admin'}},error:null}),admin:{createUser:async(body:any)=>{assert.equal(body.app_metadata.must_change_password,true);return {data:null,error:{message:'User already registered'}};},updateUserById:async()=>{updates++;return {error:null};}}},from:()=>{const q:any={select:()=>q,eq:()=>q,single:async()=>({data:{id:'target',email:'test@wipahs.org',role:'Admin',department:'IT'},error:null})};return q;}};
 const handler=await handlerFor('admin-create-user',client);const r=await handler(request({email:'test@wipahs.org',name:'Test',role:'Staff',department:'IT',organisation:'WIPAHS',tempPassword:'Example-only-temp'}));assert.equal(r.status,400);assert.equal(updates,0);
});

test('mismatched sign-in email or missing profile cannot change a real Auth password',async()=>{
 for(const missing of [false,true]){
  let queries=0,writes=0;
  const client={auth:{getUser:async()=>({data:{user:{id:'admin'}},error:null}),admin:{getUserById:async()=>({data:{user:{id:'target',email:'actual@example.invalid'}},error:null}),updateUserById:async()=>{writes++;return {error:null};}}},from:()=>{
   const n=++queries,q:any={select:()=>q,eq:()=>q,single:async()=>({data:n===1?{role:'Admin',department:'IT'}:missing?null:{id:'target',email:'display@example.invalid'},error:null})};return q;}};
  const handler=await handlerFor('admin-reset-password',client),r=await handler(request({userId:'target',expectedEmail:'display@example.invalid'}));
  assert.equal(r.status,409);assert.equal(writes,0);
 }
});


function successfulResetClient(){
 return {auth:{getUser:async()=>({data:{user:{id:'admin'}},error:null}),admin:{getUserById:async()=>({data:{user:{id:'target',email:'fixture@example.invalid',app_metadata:{}}},error:null}),updateUserById:async()=>({error:null})}},from:()=>{const q:any={select:()=>q,eq:()=>q,update:()=>q,single:async()=>({data:{id:'target',email:'fixture@example.invalid',app_metadata:{}},error:null})};return q;}};
}
test('reset returns the issued password only after a matching-user sign-in and local cleanup',async()=>{
 const order:string[]=[];const password='Synthetic-verification-only!';
 const verifier={auth:{signInWithPassword:async(body:any)=>{assert.deepEqual(body,{email:'fixture@example.invalid',password});order.push('sign-in');return {data:{user:{id:'target'},session:{access_token:'fixture-only',user:{id:'target'}}},error:null};},signOut:async(options:any)=>{assert.deepEqual(options,{scope:'local'});order.push('local-sign-out');return {error:null};}}};
 const run=await handlerFor('admin-reset-password',successfulResetClient(),verifier),response=await run(request({userId:'target',customPassword:password}));
 assert.equal(response.status,200);assert.deepEqual(order,['sign-in','local-sign-out']);assert.equal((await response.json()).message,password);
});
test('reset verification failures never disclose a password or claim success',async()=>{
 for(const mode of ['invalid-password','wrong-account','missing-token','network','cleanup-failed']){
  let cleanups=0;const password='Synthetic-mismatch-only!';
  const verifier={auth:{signInWithPassword:async()=>{
   if(mode==='network')throw Error('unavailable');
   return {error:mode==='invalid-password'?Error('invalid credentials'):null,data:{user:{id:mode==='wrong-account'?'other':'target'},session:mode==='invalid-password'||mode==='missing-token'?null:{access_token:'fixture-only',user:{id:mode==='wrong-account'?'other':'target'}}}};
  },signOut:async(options:any)=>{assert.deepEqual(options,{scope:'local'});cleanups++;return {error:mode==='cleanup-failed'?Error('offline'):null};}}};
  const run=await handlerFor('admin-reset-password',successfulResetClient(),verifier),response=await run(request({userId:'target',customPassword:password}));
  assert.equal(response.status,503,mode);const text=await response.text();assert.ok(!text.includes(password));assert.ok(!text.includes('fixture-only'));assert.equal(JSON.parse(text).success,undefined);assert.equal(cleanups,['wrong-account','cleanup-failed'].includes(mode)?1:0);
 }
});
