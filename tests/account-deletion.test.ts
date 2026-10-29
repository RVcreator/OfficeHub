import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transformSync} from 'esbuild';
import {portalStore,setTableData,saveStaffToLocalStorage} from '../src/services/store';
import {supabase} from '../src/services/supabaseClient';
const actor='10000000-0000-4000-8000-000000000001',target='10000000-0000-4000-8000-000000000002';
const email='fixture@example.invalid';
const request=(body:any={userId:target,confirmEmail:email},auth=true)=>new Request('https://example.invalid/delete',{method:'POST',headers:auth?{authorization:'Bearer fixture-token'}:{},body:JSON.stringify(body)});
async function harness(options:any={}){
 let deleted=!!options.alreadyDeleted;const calls:any[]=[];
 const client={auth:{getUser:async()=>({data:{user:options.invalidSession?null:{id:actor}},error:null}),admin:{
 getUserById:async(id:string)=>{assert.equal(id,target);return deleted?{data:{user:null},error:{status:404}}:{data:{user:{id,email}},error:null};},
 deleteUser:async(id:string,soft:boolean)=>{calls.push({id,soft});if(options.deleteFailure)return {error:{message:'storage failure'}};deleted=true;return {error:null};},
 }},rpc:async(name:string,args:any)=>{assert.equal(name,'officehub_account_delete_allowed');assert.equal(args.p_actor,actor);return {data:options.denied?false:true,error:options.permissionFailure?{}:null};},
 from:(table:string)=>{assert.equal(table,'profiles');const q:any={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:options.profileRemains?{id:target}:null,error:null})};return q;}};
 let handle:any;const source=(await readFile(new URL('../supabase/functions/admin-delete-user/index.ts',import.meta.url),'utf8')).replace(/^import .*;$/gm,'');
 new Function('createClient','Deno',transformSync(source,{loader:'ts',format:'cjs',target:'es2022'}).code)(()=>client,{serve:(fn:any)=>{handle=fn;},env:{get:(key:string)=>key==='SUPABASE_URL'?'https://example.invalid':key==='SUPABASE_SERVICE_ROLE_KEY'?'fixture-key':''}});
 return {handle,calls};
}
test('hard deletion requires a verified administrator and exact account confirmation',async()=>{
 for(const [options,body,auth,status] of [
  [{invalidSession:true},undefined,true,401],[{denied:true},undefined,true,403],[{permissionFailure:true},undefined,true,503],
  [{},{userId:actor,confirmEmail:email},true,400],[{},{userId:target,confirmEmail:'someone-else@example.invalid'},true,409],
  [{},{userId:target,confirmEmail:email,force:true},true,400],[{},undefined,false,401],
 ] as any[]){const h=await harness(options);assert.equal((await h.handle(request(body,auth))).status,status);assert.deepEqual(h.calls,[]);}
});
test('actual handler permanently deletes Auth and verifies profile cascade before success',async()=>{
 const h=await harness();const response=await h.handle(request());assert.equal(response.status,200);
 assert.deepEqual(h.calls,[{id:target,soft:false}]);assert.deepEqual(await response.json(),{success:true,userId:target,deletedEmail:email,emailReleased:true});
});
test('failed deletion and incomplete cascade never report success or delete profiles separately',async()=>{
 for(const options of [{deleteFailure:true},{profileRemains:true}]){const h=await harness(options);assert.notEqual((await h.handle(request())).status,200);assert.equal(h.calls.length,1);}
});
test('retry after an already deleted UUID never deletes a new account with the reused email',async()=>{
 const h=await harness({alreadyDeleted:true});assert.equal((await h.handle(request())).status,200);assert.deepEqual(h.calls,[]);
});
test('client retains staff on failure and removes only the confirmed UUID on success',async()=>{
 const originalSession=supabase.auth.getSession,descriptor=Object.getOwnPropertyDescriptor(supabase,'functions');
 const storage=new Map<string,string>();const previousStorage=globalThis.localStorage;
 (globalThis as any).localStorage={getItem:(key:string)=>storage.get(key),setItem:(key:string,value:string)=>storage.set(key,value),removeItem:(key:string)=>storage.delete(key)};
 const old={id:target,name:'Old fixture',email},replacement={id:'10000000-0000-4000-8000-000000000003',name:'New fixture',email};
 try {
  setTableData('currentUser',{id:actor} as any);setTableData('staff',[old,replacement] as any);
  (supabase.auth as any).getSession=async()=>({data:{session:{access_token:'fixture-token'}},error:null});
  const invoke=(fn:any)=>Object.defineProperty(supabase,'functions',{configurable:true,value:{invoke:fn}});
  invoke(async()=>({data:null,error:{message:'denied'}}));await assert.rejects(portalStore.removeStaffMember(target,email),/not confirmed/);assert.equal(storage.has('wipahs_registered_staff'),false);
  invoke(async(name:string,options:any)=>{assert.equal(name,'admin-delete-user');assert.deepEqual(options.body,{userId:target,confirmEmail:email});return {data:{success:true,userId:target,deletedEmail:email,emailReleased:true},error:null};});
  await portalStore.removeStaffMember(target,email);const saved=JSON.parse(storage.get('wipahs_registered_staff')!);assert.equal(saved.length,1);assert.equal(saved[0].id,replacement.id);
  saveStaffToLocalStorage([old,replacement] as any);assert.deepEqual(JSON.parse(storage.get('wipahs_registered_staff')!).map((user:any)=>user.id),[replacement.id],'a stale snapshot cannot cache a confirmed deleted UUID');
 }finally{supabase.auth.getSession=originalSession;if(descriptor)Object.defineProperty(supabase,'functions',descriptor);else delete (supabase as any).functions;(globalThis as any).localStorage=previousStorage;}
});

test('successful staff snapshots cannot resurrect a deleted user from local cache',async()=>{
 const previousFrom=supabase.from,previousStorage=globalThis.localStorage;
 const storage=new Map([['wipahs_registered_staff',JSON.stringify([{id:target,email,name:'Deleted fixture'}])]]);
 (globalThis as any).localStorage={getItem:(key:string)=>storage.get(key),setItem:(key:string,value:string)=>storage.set(key,value),removeItem:(key:string)=>storage.delete(key)};
 try {
  (supabase as any).from=()=>({select(){return this;},order:async()=>({data:[],error:null})});
  assert.deepEqual(await portalStore.getStaff(),[]);
  await portalStore.syncStaffFromSupabase();assert.deepEqual(JSON.parse(storage.get('wipahs_registered_staff')!),[]);
 }finally{supabase.from=previousFrom;(globalThis as any).localStorage=previousStorage;}
});
