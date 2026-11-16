import {test} from 'node:test';import assert from 'node:assert/strict';
import {openMicrosoftAttachment,attachmentSource,microsoftAttachmentUrl,revokeStaleAttachmentGrants} from '../supabase/functions/_shared/microsoftAttachments';
import {openMicrosoftAttachmentUrl} from '../src/services/microsoftAttachmentOpen';
import {supabase} from '../src/services/supabaseClient';
const source='storage://officehub-records/task/task/member/file';
function fixture(extra:any={}){
 const calls:any[]=[],saved:any[]=[],grants:any[]=[];let binding:any=null;
 const item={id:'item',file:{},parentReference:{driveId:'drive'},size:14,webUrl:'https://wipahstz.sharepoint.com/sites/OfficeHub/Shared%20Documents/Original.docx'};
 const fetcher:typeof fetch=async(input,init)=>{
  const url=new URL(String(input)),method=init?.method||'GET',body=typeof init?.body==='string'?JSON.parse(init.body):init?.body;calls.push({path:decodeURIComponent(url.pathname),method,body});
  if(url.pathname.endsWith('/root/children'))return Response.json({id:'folder',name:'OfficeHub Attachments',folder:{}});
  if(method==='PUT'){assert.equal(await (body as Blob).text(),'original bytes');return Response.json(item);}
  if(url.pathname.includes('/users/'))return Response.json({id:'microsoft-member',userPrincipalName:'member@wipahs.org'});
  if(url.pathname.endsWith('/invite'))return Response.json({value:[{id:'permission',roles:['read'],grantedToV2:{user:{id:'microsoft-member'}}}]});
  if(method==='DELETE')return new Response(null,{status:204});return Response.json(item);
 };
 const deps={source,userId:'member',email:'member@wipahs.org',drive:'drive',fetcher,token:async()=>{calls.push({token:true});return 'server-only';},authorize:async()=>{calls.push({authorize:true});return{name:'Original.docx',download:async()=>new Blob(['original bytes'])};},readBinding:async()=>binding,saveBinding:async b=>{saved.push(b);binding=b;return b;},saveGrant:async id=>{grants.push(id);},stillAuthorized:async()=>true,...extra};
 return {deps,calls,saved,grants};
}
test('Microsoft opening uploads exact bytes once, verifies identity, grants only signed-in reader and reuses the item',async()=>{
 const f=fixture();const r=await openMicrosoftAttachment(f.deps);assert.match(r.webUrl,/sharepoint.com.*web=1/);assert.equal(f.calls[0].authorize,true);assert.equal(f.saved.length,1);assert.deepEqual(f.grants,['pending:microsoft-member','permission']);
 const invitation=f.calls.find(c=>c.path?.endsWith('/invite')).body;assert.deepEqual(invitation,{recipients:[{objectId:'microsoft-member'}],roles:['read'],requireSignIn:true,sendInvitation:false,retainInheritedPermissions:false});
 await openMicrosoftAttachment(f.deps);assert.equal(f.calls.filter(c=>c.method==='PUT').length,1,'retry never creates another Microsoft copy');
});
test('all parent types and chat use saved references only; arbitrary URLs and malformed paths cannot choose Microsoft files',()=>{
 for(const kind of ['task','approval','meeting','notice'])assert.equal(attachmentSource(`storage://officehub-records/${kind}/record/user/file`).bucket,'officehub-records');
 assert.equal(attachmentSource('storage://officehub-chat/conversation/user/file').bucket,'officehub-chat');
 for(const bad of ['https://evil.invalid','blob:local','storage://officehub-records/task/a/../b','storage://officehub-records/task/a/user/file/extra','storage://officehub-records/unknown/a/user/file'])assert.throws(()=>attachmentSource(bad));
 for(const url of ['javascript:alert(1)','https://wipahstz.sharepoint.com.evil.invalid/file','https://user@wipahstz.sharepoint.com/file'])assert.throws(()=>microsoftAttachmentUrl(url));
});
test('denied or revoked record access never grants Microsoft access or exposes a URL',async()=>{
 const denied=fixture({authorize:async()=>{throw Error('No membership');}});await assert.rejects(openMicrosoftAttachment(denied.deps),/No membership/);assert.equal(denied.calls.length,0);
 const revoked=fixture({stillAuthorized:async()=>false});await assert.rejects(openMicrosoftAttachment(revoked.deps),/no longer/);assert.equal(revoked.calls.some(c=>c.path?.endsWith('/invite')),false);
 let checks=0;const raced=fixture({stillAuthorized:async()=>++checks===1});await assert.rejects(openMicrosoftAttachment(raced.deps),/no longer/);assert.equal(raced.calls.at(-1).method,'DELETE');assert.equal(raced.grants.length,2,'failed remote revocations remain discoverable by worker');
});
test('Microsoft errors, wrong drives, wrong recipients and unconfirmed permissions never report success',async()=>{
 const badDrive=fixture({readBinding:async()=>({drive_id:'other',item_id:'item'})});await assert.rejects(openMicrosoftAttachment(badDrive.deps),/drive has changed/);assert.equal(badDrive.calls.length,1);
 for(const permission of [{id:'p',roles:['write'],grantedToV2:{user:{id:'microsoft-member'}}},{id:'p',roles:['read'],grantedToV2:{user:{id:'someone-else'}}},{id:'p',roles:['read'],link:{scope:'anonymous'}},{error:{code:'denied'}}]){
  const f=fixture(),request=f.deps.fetcher;f.deps.fetcher=async(input,init)=>String(input).endsWith('/invite')?Response.json({value:[permission]}):request(input,init);
  await assert.rejects(openMicrosoftAttachment(f.deps),/did not confirm/);assert.deepEqual(f.grants,['pending:microsoft-member']);
 }
 const failed=fixture({saveGrant:async()=>{throw Error('offline');}});await assert.rejects(openMicrosoftAttachment(failed.deps),/could not be recorded/);assert.equal(failed.calls.some(c=>c.path?.endsWith('/invite')),false);
 let writes=0;const finalize=fixture({saveGrant:async()=>{if(++writes===2)throw Error('offline');}});await assert.rejects(openMicrosoftAttachment(finalize.deps),/could not be recorded/);assert.equal(finalize.calls.at(-1).method,'DELETE');
 const unavailable=fixture({fetcher:async()=>new Response(null,{status:503})});await assert.rejects(openMicrosoftAttachment(unavailable.deps));assert.equal(unavailable.saved.length,0);
});
test('revocation worker only removes saved stale permissions and retains failures for retry',async()=>{
 const removed:any[]=[],requests:any[]=[];const grant={source_url:source,user_id:'member',permission_id:'permission',drive_id:'drive',item_id:'item'};
 const result=await revokeStaleAttachmentGrants({list:async()=>[grant,{...grant,user_id:'other',permission_id:'retry'}],token:async()=>'secret',remove:async g=>{removed.push(g);},fetcher:async(input,init)=>{requests.push({input,init});return new Response(null,{status:String(input).endsWith('retry')?429:204});}});
 assert.equal(result,'retry');assert.deepEqual(removed,[grant]);assert.equal(requests.every(r=>r.init.method==='DELETE'),true);
 assert.equal(await revokeStaleAttachmentGrants({list:async()=>[],token:async()=>{throw Error('must not run');},remove:async()=>{}}),'idle');
});
test('client opens only confirmed SharePoint links and preserves actionable failure text',async()=>{
 const descriptor=Object.getOwnPropertyDescriptor(supabase,'functions');let result:any={data:{success:true,webUrl:'https://wipahstz.sharepoint.com/sites/OfficeHub/file?web=1'},error:null};
 Object.defineProperty(supabase,'functions',{configurable:true,value:{invoke:async(name,options)=>{assert.equal(name,'sharepoint-document-action');assert.deepEqual(options.body,{action:'open_attachment',attachmentUrl:source});return result;}}});
 try{assert.match(await openMicrosoftAttachmentUrl(source),/sharepoint.com/);result={data:{success:true,webUrl:'https://evil.invalid/file'},error:null};await assert.rejects(openMicrosoftAttachmentUrl(source),/valid document link/);result={data:{error:'Microsoft unavailable'},error:{}};await assert.rejects(openMicrosoftAttachmentUrl(source),/Microsoft unavailable/);}finally{if(descriptor)Object.defineProperty(supabase,'functions',descriptor);else delete (supabase as any).functions;}
});
test('ambiguous sharing responses remain tracked and cleanup targets only the verified pending user',async()=>{
 const methods:any[]=[],removed:any[]=[];const grant={source_url:source,user_id:'member',permission_id:'pending:microsoft-member',drive_id:'drive',item_id:'item'};
 const result=await revokeStaleAttachmentGrants({list:async()=>[grant],token:async()=>'secret',remove:async g=>{removed.push(g);},fetcher:async(input,init)=>{
  methods.push({url:String(input),method:init?.method});if(init?.method==='DELETE')return new Response(null,{status:204});
  return Response.json({value:[{id:'mine',roles:['read'],grantedToV2:{user:{id:'microsoft-member'}}},{id:'other',roles:['read'],grantedToV2:{user:{id:'different'}}},{id:'inherited',roles:['read'],inheritedFrom:{},grantedToV2:{user:{id:'microsoft-member'}}}]});
 }});assert.equal(result,'revoked');assert.equal(methods.filter(m=>m.method==='DELETE').length,1);assert.ok(methods[1].url.endsWith('/mine'));assert.deepEqual(removed,[grant]);
});
