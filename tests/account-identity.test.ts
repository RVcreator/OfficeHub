import {test} from 'node:test';
import assert from 'node:assert/strict';
import {portalStore,setTableData} from '../src/services/store';
import {supabase} from '../src/services/supabaseClient';
import {functionError} from '../src/services/functionError';
import {completePassword} from '../supabase/functions/_shared/passwordCompletion';
const id='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
test('an orphan sign-in cannot borrow another profile with the same email',async()=>{
 setTableData('staff',[{id:other,email:'same@example.invalid'}] as any);const original=supabase.from;
 (supabase as any).from=()=>{const q:any={select:()=>q,eq:(key:string,value:string)=>{assert.equal(key,'id');assert.equal(value,id);return q;},maybeSingle:async()=>({data:null,error:null})};return q;};
 try{await assert.rejects(portalStore.syncAuthenticatedUserProfile({id,email:'same@example.invalid'}),/no matching staff profile/);}finally{supabase.from=original;}
});
test('verified sign-in requires matching UUID and canonical email',async()=>{
 const original=supabase.from;let email='wrong@example.invalid';
 (supabase as any).from=()=>{const q:any={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:{id,email,name:'Fixture'},error:null})};return q;};
 try{await assert.rejects(portalStore.syncAuthenticatedUserProfile({id,email:'right@example.invalid'}),/do not match/);
 email='right@example.invalid';assert.equal((await portalStore.syncAuthenticatedUserProfile({id,email,app_metadata:{must_change_password:true}})).id,id);
 }finally{supabase.from=original;}
});
test('completion refuses a missing staff profile before changing any password',async()=>{
 let writes=0;const response=await completePassword(new Request('https://fixture.invalid',{method:'POST',headers:{authorization:'Bearer fixture'},body:JSON.stringify({newPassword:'Fixture-only-new!'})}),{
 user:async()=>({id,email:'fixture@example.invalid'}),accountReady:async()=> 'No verified staff profile',changePassword:async()=>{writes++;return {};},confirm:async()=>null});
 assert.equal(response.status,409);assert.equal(writes,0);
});
test('the client preserves actionable server errors from failed function responses',async()=>{
 assert.equal(await functionError({context:new Response(JSON.stringify({error:'Identity mismatch. No password changed.'}),{status:409})},null,'generic'),'Identity mismatch. No password changed.');
});
test('profile editing cannot silently change the sign-in email',async()=>{
 setTableData('staff',[{id,email:'original@example.invalid'}] as any);
 await assert.rejects(portalStore.updateStaffMember(id,{email:'different@example.invalid'}),/Sign-in email cannot/);
});
