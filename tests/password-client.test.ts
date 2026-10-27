import {test} from 'node:test';
import assert from 'node:assert/strict';
import {portalStore,setTableData,saveStaffToLocalStorage} from '../src/services/store';
import {supabase,updatePasswordWithSupabase,invokeCreateStaffUserEdgeFunction} from '../src/services/supabaseClient';
const id='10000000-0000-4000-8000-000000000001';
const user:any={id,name:'Test Staff',email:'test@wipahs.org',app_metadata:{must_change_password:true,password_changed_at:'old'}};
const originalSession=supabase.auth.getSession,originalRefresh=supabase.auth.refreshSession,originalFrom=supabase.from;
const functions=Object.getOwnPropertyDescriptor(supabase,'functions');
function mockSession(valid=true){(supabase.auth as any).getSession=async()=>({data:{session:valid?{access_token:'test-token',user}:null},error:null});}
function mockInvoke(fn:any){Object.defineProperty(supabase,'functions',{configurable:true,value:{invoke:fn}});}
function restore(){supabase.auth.getSession=originalSession;supabase.auth.refreshSession=originalRefresh;supabase.from=originalFrom;if(functions)Object.defineProperty(supabase,'functions',functions);else delete (supabase as any).functions;}
test('client rejects expired sessions and failed completion instead of inventing success',async()=>{
 try {mockSession(false);assert.ok((await updatePasswordWithSupabase('Example-only-password')).error);
 mockSession();mockInvoke(async()=>({data:null,error:{message:'denied'}}));assert.ok((await updatePasswordWithSupabase('Example-only-password')).error);
 mockInvoke(async()=>({data:{success:true,userId:'someone-else',app_metadata:{must_change_password:false,password_changed_at:'now'}},error:null}));assert.ok((await updatePasswordWithSupabase('Example-only-password')).error);
 } finally {restore();}
});
test('client only returns the server-confirmed self completion and refreshes claims',async()=>{
 let refreshed=0;try {mockSession();(supabase.auth as any).refreshSession=async()=>{refreshed++;return {data:{},error:null};};mockInvoke(async(name:string,options:any)=>{
 assert.equal(name,'officehub-complete-password');assert.deepEqual(Object.keys(options.body),['newPassword']);
 return {data:{success:true,userId:id,app_metadata:{must_change_password:false,password_changed_at:'server-time'}},error:null};});
 const result=await updatePasswordWithSupabase('Example-only-password');assert.equal(result.error,null);assert.equal(result.data?.app_metadata.password_changed_at,'server-time');assert.equal(refreshed,1);
 } finally {restore();}
});
test('failed administrator reset never falls back to a fake profile-only password',async()=>{
 try {mockSession();mockInvoke(async()=>({data:null,error:{message:'denied'}}));(supabase as any).from=()=>{throw new Error('Unexpected database fallback');};
 await assert.rejects(portalStore.resetUserPassword(id,'Example-only-temp'),/reset failed/);
 } finally {restore();}
});
test('first-time account creation cannot succeed locally or retry a failed provision',async()=>{
 let invokes=0;try {mockSession(false);assert.ok((await invokeCreateStaffUserEdgeFunction({email:user.email,tempPassword:'Example-only-temp',name:'Test',role:'Staff',department:'IT',organisation:'WIPAHS'})).error);
 mockSession();mockInvoke(async()=>{invokes++;return {data:{error:'profile save failed'},error:null};});
 await assert.rejects(portalStore.addStaffMember({...user,role:'Staff Member',organisation:'WIPAHS',department:'IT'}),/profile save failed/);assert.equal(invokes,1);
 } finally {restore();}
});
test('old local completion markers cannot bypass a later reset or session restoration',()=>{
 const storage=new Map<string,string>([['wipahs_password_verified_users',JSON.stringify([id,user.email])]]);
 const old=(globalThis as any).localStorage;(globalThis as any).localStorage={getItem:(key:string)=>storage.get(key),setItem:(k:string,v:string)=>storage.set(k,v),removeItem:(k:string)=>storage.delete(k)};
 try {assert.equal(portalStore.shouldForcePasswordChange(user,{...user,app_metadata:{must_change_password:false,password_changed_at:'old'}},{isSessionRestore:true}),true);
 saveStaffToLocalStorage([{...user,temporaryPassword:'never-cache-this'}]);assert.ok(!storage.get('wipahs_registered_staff')?.includes('never-cache-this'));
 } finally {(globalThis as any).localStorage=old;}
});
test('recovery requirement remains latched through later auth events until confirmed completion',async()=>{
 const storage=new Map<string,string>();const old=(globalThis as any).sessionStorage;(globalThis as any).sessionStorage={getItem:(k:string)=>storage.get(k),setItem:(k:string,v:string)=>storage.set(k,v),removeItem:(k:string)=>storage.delete(k)};
 try {const completed={...user,app_metadata:{must_change_password:false,password_changed_at:'server'}};
 setTableData('currentUser',completed);portalStore.requirePasswordRecovery(id);
 assert.equal(portalStore.shouldForcePasswordChange(completed,completed,{isSessionRestore:true}),true);
 await portalStore.completeForcedPasswordChange(completed);
 assert.equal(portalStore.shouldForcePasswordChange(completed,completed,{isSessionRestore:true}),false);
 } finally {(globalThis as any).sessionStorage=old;}
});
