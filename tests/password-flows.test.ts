import {test} from 'node:test';
import assert from 'node:assert/strict';
import {passwordChangeRequired,retainPasswordRequirement} from '../src/services/passwordPolicy';
import {mapStaffRow} from '../src/services/supabaseMappers';
import {completePassword,type PasswordCompletionDependencies} from '../supabase/functions/_shared/passwordCompletion';
const account={id:'user',email:'staff@wipahs.org',app_metadata:{must_change_password:true,password_changed_at:'old',password_reset_at:'new',password_reset_id:'reset'}};
test('stale sign-in events cannot dismiss an already required password screen',()=>{
 const previous={isAuthenticated:true,userId:'user',mustChangePassword:true};
 assert.equal(retainPasswordRequirement('user',false,previous),true);
 assert.equal(retainPasswordRequirement('other',false,previous),false);
 assert.equal(retainPasswordRequirement('user',false,{...previous,mustChangePassword:false}),false);
});
const request=(body:unknown={newPassword:'New-example-only-2026!'})=>new Request('https://example/complete',{method:'POST',headers:{authorization:'Bearer valid-token'},body:JSON.stringify(body)});
function harness(){
 const calls:string[]=[];
 const deps:PasswordCompletionDependencies={user:async()=>structuredClone(account),changePassword:async()=>{calls.push('password');return {};},confirm:async()=>{calls.push('confirm');return {userId:account.id,app_metadata:{...account.app_metadata,must_change_password:false,password_changed_at:'server-time'}};}};
 return {deps,calls};
}
test('new resets override old completion timestamps, user metadata and cleared profile metadata',()=>{
 assert.equal(passwordChangeRequired({...account,user_metadata:{must_change_password:false,password_changed_at:'old'}},{mustChangePassword:false,app_metadata:{must_change_password:false,password_changed_at:'old'}}),true);
});
test('first login survives session restore; profile top-level requirement is mapped',()=>{
 assert.equal(passwordChangeRequired({app_metadata:{must_change_password:true}}),true);
 const profile=mapStaffRow({id:'user',must_change_password:true,app_metadata:{must_change_password:false,password_changed_at:'old'}});
 assert.equal(profile.mustChangePassword,true);assert.equal(passwordChangeRequired({app_metadata:{}},profile),true);
});
test('confirmed server completion wins over stale profile flags; recovery still requires the screen',()=>{
 assert.equal(passwordChangeRequired({app_metadata:{must_change_password:false}},{mustChangePassword:true}),false);
 assert.equal(passwordChangeRequired({app_metadata:{must_change_password:false}},null,true),true);
});
test('clearing a requirement requires a password, not an old timestamp or supplied user ID',async()=>{
 for(const body of [{timestamp:'now'},{newPassword:'valid-example',userId:'someone-else'},{}]) {
  const h=harness();assert.equal((await completePassword(request(body),h.deps)).status,400);assert.deepEqual(h.calls,[]);
 }
});
test('invalid sessions cannot change any password or flag',async()=>{
 const h=harness();h.deps.user=async()=>null;assert.equal((await completePassword(request(),h.deps)).status,401);assert.deepEqual(h.calls,[]);
});
test('password policy failure never clears requirements',async()=>{
 const h=harness();h.deps.changePassword=async()=>({error:'New password must differ from the old password'});
 const r=await completePassword(request(),h.deps);assert.equal(r.status,400);assert.deepEqual(h.calls,[]);
});
test('success is returned only after real password, Auth flag and profile writes',async()=>{
 const h=harness();const r=await completePassword(request(),h.deps);assert.equal(r.status,200);assert.deepEqual(h.calls,['password','confirm']);
 const body=await r.json();assert.equal(body.app_metadata.must_change_password,false);assert.equal(body.app_metadata.password_reset_id,'reset');assert.equal(body.userId,'user');assert.ok(!JSON.stringify(body).includes('New-example'));
});
test('failed atomic confirmation cannot report success',async()=>{
 const h=harness();h.deps.confirm=async()=>null;assert.equal((await completePassword(request(),h.deps)).status,503);assert.deepEqual(h.calls,['password']);
});
test('a reset issued during password completion is never cleared',async()=>{
 const h=harness();let reads=0;h.deps.user=async()=>({...account,app_metadata:{...account.app_metadata,password_reset_id:++reads===1?'reset':'new-reset'}});
 assert.equal((await completePassword(request(),h.deps)).status,409);assert.deepEqual(h.calls,['password']);
});
test('network failure never reports a changed password',async()=>{
 const h=harness();h.deps.changePassword=async()=>{throw new Error('network');};assert.equal((await completePassword(request(),h.deps)).status,503);assert.deepEqual(h.calls,[]);
});
