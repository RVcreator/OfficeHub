import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {transformSync} from 'esbuild';
import {attachmentSource} from '../supabase/functions/_shared/microsoftAttachments';import {DocumentActionError} from '../supabase/functions/_shared/documentActions';
async function fixture(user:any,allowed=true){
 let handler:any,clients=0,graph=0,downloads=0;const reads:any[]=[];
 const source='storage://officehub-records/task/task/member/file';
 const caller={auth:{getUser:async()=>({data:{user},error:user?null:Error('denied')})},rpc:async(name,args)=>{reads.push({name,args});return {data:allowed,error:null};},from:(table)=>{
  reads.push({table});const q:any={select:()=>q,eq:()=>q,single:async()=>({data:table==='profiles'?{id:user?.id,app_metadata:{}}:{attachments:[{name:'Server original.docx',url:source}]},error:null})};return q;
 },storage:{from:()=>({download:async()=>{downloads++;return{data:new Blob(['original']),error:null};}})}};
 const deps:any={createClient:()=>{clients++;return caller;},attachmentSource,DocumentActionError,getMsGraphAppToken:async()=>{throw Error('unexpected');},openMicrosoftAttachment:async d=>{graph++;assert.equal(d.userId,user.id);assert.equal(d.email,user.email);const f=await d.authorize();assert.equal(f.name,'Server original.docx');await f.download();return{success:true,webUrl:'https://wipahstz.sharepoint.com/file'};}};
 let code=await readFile(new URL('../supabase/functions/sharepoint-document-action/index.ts',import.meta.url),'utf8');code=code.replace(/^import .*;\r?\n/gm,'');
 const run=new Function('deps','Deno',`const {${Object.keys(deps).join(',')}}=deps;`+transformSync(code,{loader:'ts',target:'es2022'}).code);
 run(deps,{env:{get:key=>key==='MS_DRIVE_ID'?'configured-drive':'configured'},serve:fn=>handler=fn});
 const request=(body:any)=>handler(new Request('https://fixture.invalid',{method:'POST',headers:{Authorization:'Bearer user-session'},body:JSON.stringify(body)}));
 return{request,reads,state:()=>({clients,graph,downloads}),source};
}
const user={id:'member',email:'member@wipahs.org',email_confirmed_at:'2026-01-01',app_metadata:{}};
test('actual document handler rejects anonymous, unfinished sign-ins and caller-supplied Microsoft identities',async()=>{
 for(const account of [null,{...user,email_confirmed_at:null},{...user,app_metadata:{must_change_password:true}}]){
  const f=await fixture(account);const r=await f.request({action:'open_attachment',attachmentUrl:f.source});assert.ok([401,403].includes(r.status));assert.equal(f.state().graph,0);
 }
 const f=await fixture(user);for(const extra of [{driveId:'other'},{itemId:'other'},{email:'other@wipahs.org'},{name:'Spoof.docx'}]){const r=await f.request({action:'open_attachment',attachmentUrl:f.source,...extra});assert.equal(r.status,400);}assert.equal(f.state().graph,0);
});
test('actual adapter uses current caller RLS, saved filename and authenticated original bytes',async()=>{
 const f=await fixture(user);const r=await f.request({action:'open_attachment',attachmentUrl:f.source});assert.equal(r.status,200);assert.equal(f.state().downloads,1);assert.deepEqual(f.reads.find(r=>r.name),{name:'officehub_can_read_record_file',args:{p_path:'task/task/member/file'}});assert.ok(f.reads.some(r=>r.table==='tasks'));
 const denied=await fixture(user,false);const failure=await denied.request({action:'open_attachment',attachmentUrl:denied.source});assert.equal(failure.status,403);assert.equal(denied.state().downloads,0);assert.equal((await failure.json()).webUrl,undefined);
});
