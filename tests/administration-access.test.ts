import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {transformSync} from 'esbuild';
import {emptyAdministrationAccess,administrationAccessFromServer,canViewAdministration,canManageAdministration,isAdministrationTab} from '../src/services/administrationAccess';
import {portalStore,setTableData} from '../src/services/store';import {supabase} from '../src/services/supabaseClient';
test('administration UI trusts only a ready, matching-user server decision',()=>{
 const valid=administrationAccessFromServer({user_id:'staff',can_view:true,can_manage:false,automatic:false},'staff');assert.equal(canViewAdministration(valid,'staff'),true);assert.equal(canManageAdministration(valid,'staff'),false);
 for(const access of [emptyAdministrationAccess(),{...valid,status:'loading'},{...valid,status:'error'},{...valid,userId:'other'},{...valid,canView:'true'}])assert.equal(canViewAdministration(access as any,'staff'),false);
 assert.throws(()=>administrationAccessFromServer({user_id:'other',can_view:true,can_manage:true},'staff'),/could not be verified/);assert.throws(()=>administrationAccessFromServer({user_id:'staff',can_view:'true',can_manage:true},'staff'));
 for(const tab of ['departments','users','roles-permissions','audit-log'])assert.equal(isAdministrationTab(tab),true);for(const tab of ['tasks','meetings','documents','dashboard'])assert.equal(isAdministrationTab(tab),false);
});
async function handlerFor(name:string,permission:any){
 const source=(await readFile(new URL('../supabase/functions/'+name+'/index.ts',import.meta.url),'utf8')).replace(/^import .*;$/gm,'');let handler:any,writes=0,checks=0;
 const client={auth:{getUser:async()=>({data:{user:{id:'verified-actor',email:'adminish@example.invalid',app_metadata:{role:'Admin',department:'IT'}}},error:null}),admin:{createUser:async()=>{writes++;return {data:null,error:{message:'fixture only'}}},updateUserById:async()=>{writes++;return {error:null}},getUserById:async()=>{writes++;return {data:{user:null},error:{message:'fixture only'}}}}},rpc:async(name:string,args:any)=>{assert.equal(name,'officehub_administration_manager_allowed');assert.deepEqual(args,{p_actor:'verified-actor'});checks++;return permission;},from:()=>{const q:any={select:()=>q,eq:()=>q,single:async()=>({data:{id:'verified-actor',role:'System Administrator',department:'Hospitality',name:'Fixture'},error:null})};return q;}};
 new Function('createClient','serve','Deno',transformSync(source,{loader:'ts',format:'cjs',target:'es2022'}).code)(()=>client,(fn:any)=>{handler=fn;},{env:{get:(key:string)=>key==='SUPABASE_URL'?'https://fixture.invalid':key==='SUPABASE_SERVICE_ROLE_KEY'?'fixture-key':''}});
 return {run:()=>handler(new Request('https://fixture.invalid',{method:'POST',headers:{authorization:'Bearer fixture'},body:JSON.stringify({userId:'target',email:'target@example.invalid',name:'Fixture',tempPassword:'Fixture-only-not-real'})})),stats:()=>({writes,checks})};
}
test('actual account handlers reject broad titles, editable metadata and substring departments without server permission',async()=>{
 for(const name of ['admin-create-user','admin-reset-password'])for(const permission of [{data:false,error:null},{data:true,error:{message:'offline'}},{data:'true',error:null}]){
  const fixture=await handlerFor(name,permission);const response=await fixture.run();assert.equal(response.status,403);assert.deepEqual(fixture.stats(),{writes:0,checks:1});
 }
});
test('actual account handlers use the verified actor permission rather than the target account or title',async()=>{
 for(const name of ['admin-create-user','admin-reset-password']){const fixture=await handlerFor(name,{data:true,error:null});const response=await fixture.run();assert.notEqual(response.status,403);assert.equal(fixture.stats().checks,1);}
});
test('rejected role-permission writes leave the saved matrix unchanged',async()=>{
 const role={id:'role-fixture',roleTitle:'Fixture',department:'IT',description:'',userCount:0,permissions:[{module:'Tasks',view:true,create:false,edit:false,approve:false}]};setTableData('roles',[role]);const original=supabase.from;
 (supabase as any).from=()=>{const q:any={update:()=>q,eq:()=>q,select:()=>q,single:async()=>({data:null,error:{message:'Permission denied'}})};return q;};
 try{await assert.rejects(portalStore.updateRolePermission(role.id,'Tasks','edit',true),/Permission denied/);assert.equal(role.permissions[0].edit,false);}finally{supabase.from=original;setTableData('roles',[]);}
});
test('administration grants require a confirmed matching server response',async()=>{
 const original=supabase.rpc;let read=false;(supabase as any).rpc=async(name:string)=>{if(name!=='officehub_set_administration_access')read=true;return {data:{success:true,user_id:'different',enabled:true},error:null}};
 try{await assert.rejects(portalStore.setAdministrationGrant('chosen',true),/not confirmed/);assert.equal(read,false);}finally{supabase.rpc=original;}
});
