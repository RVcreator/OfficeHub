import {createMicrosoftFolder,graphDocumentRequest,DocumentActionError} from './documentActions.ts';
export type MicrosoftAttachmentBinding={source_url:string;drive_id:string;item_id:string;web_url:string};
type Grant={source_url:string;user_id:string;permission_id:string;drive_id:string;item_id:string};
export function attachmentSource(value:unknown){
 if(typeof value!=='string'||value.length>600)throw new DocumentActionError(400,'Choose a saved attachment.');
 const match=/^storage:\/\/(officehub-records|officehub-chat)\/([A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+){2,3})$/.exec(value);
 if(!match||(match[1]==='officehub-records'?match[2].split('/').length!==4:match[2].split('/').length!==3))throw new DocumentActionError(400,'Choose a saved attachment.');
 if(match[1]==='officehub-records'&&!['task','approval','meeting','notice'].includes(match[2].split('/')[0]))throw new DocumentActionError(400,'Unknown attachment type.');
 return {url:value,bucket:match[1],path:match[2]};
}
export function microsoftAttachmentUrl(value:unknown){
 try{const u=new URL(String(value));if(u.protocol==='https:'&&u.hostname==='wipahstz.sharepoint.com'&&!u.username&&!u.password&&!u.port){u.searchParams.set('web','1');return u.href;}}catch{}
 throw new DocumentActionError(502,'Microsoft did not return a valid file link.');
}
export async function openMicrosoftAttachment(d:{source:unknown;userId:string;email:string;drive:string;fetcher:typeof fetch;token:()=>Promise<string>;
 authorize:()=>Promise<{name:string;download:()=>Promise<Blob>}>;
 readBinding:()=>Promise<MicrosoftAttachmentBinding|null>;saveBinding:(b:MicrosoftAttachmentBinding)=>Promise<MicrosoftAttachmentBinding>;
 saveGrant:(permissionId:string)=>Promise<void>;stillAuthorized:()=>Promise<boolean>}){
 const source=attachmentSource(d.source);
 // Authoritative record access and original metadata precede ANY Microsoft activity.
 const file=await d.authorize();
 if(!/^[^\s@]+@wipahs\.org$/i.test(d.email))throw new DocumentActionError(403,'A verified organisation account is required.');
 let binding=await d.readBinding();
 if(binding&&binding.drive_id!==d.drive)throw new DocumentActionError(409,'The saved Microsoft drive has changed. Contact IT.');
 const token=await d.token(),base=`drives/${encodeURIComponent(d.drive)}`;
 const request=(p:string,init:RequestInit={})=>graphDocumentRequest(d.fetcher,token,p,init);
 if(!binding){
  const blob=await file.download();if(blob.size>10485760)throw new DocumentActionError(413,'The attachment exceeds 10 MB.');
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source.url)))).map(b=>b.toString(16).padStart(2,'0')).join('');
  const name=file.name.replace(/[\x00-\x1f"*:<>?\/\\|#%]/g,'_').replace(/[. ]+$/,'').slice(-150)||'Attachment';
  const folder=await createMicrosoftFolder(d.fetcher,token,d.drive,'OfficeHub Attachments');
  const response=await request(`${base}/items/${encodeURIComponent(folder.id)}:/${encodeURIComponent(hash+'-'+name)}:/content`,{method:'PUT',headers:{'Content-Type':blob.type||'application/octet-stream'},body:blob});
  if(!response.ok)throw new DocumentActionError(response.status===429?429:502,'Microsoft could not save the original file. Your OfficeHub attachment is unchanged; retry later.');
  const item=await response.json();
  // SharePoint can promote Office metadata into the file after accepting the
  // original upload, changing its ZIP size. Identity and a valid reported size
  // confirm the response; byte-for-byte size equality would reject valid Word files.
  if(!item.id||!item.file||item.folder||item.deleted||item.parentReference?.driveId!==d.drive||!Number.isSafeInteger(item.size)||item.size<0)throw new DocumentActionError(502,'Microsoft did not confirm the original file.');
  binding=await d.saveBinding({source_url:source.url,drive_id:d.drive,item_id:item.id,web_url:microsoftAttachmentUrl(item.webUrl)});
 }
 // Refresh the canonical URL from the server-owned item; never accept a caller URL.
 const inspection=await request(`${base}/items/${encodeURIComponent(binding.item_id)}?$select=id,file,folder,deleted,parentReference,webUrl`);
 if(inspection.status===404)throw new DocumentActionError(409,'This Microsoft copy was removed. The original is still available with Download; contact IT to reconcile it.');
 if(!inspection.ok)throw new DocumentActionError(502,'Microsoft file access could not be verified. Retry later.');
 const item=await inspection.json();
 if(item.id!==binding.item_id||!item.file||item.folder||item.deleted||item.parentReference?.driveId!==d.drive)throw new DocumentActionError(409,'Microsoft file identity could not be verified.');
 const webUrl=microsoftAttachmentUrl(item.webUrl);
 const account=await request(`users/${encodeURIComponent(d.email)}?$select=id,mail,userPrincipalName`);
 if(!account.ok)throw new DocumentActionError(403,'Your Microsoft account could not be verified. Contact IT.');
 const msUser=await account.json();
 if(!msUser.id||![msUser.mail,msUser.userPrincipalName].some(v=>typeof v==='string'&&v.toLowerCase()===d.email.toLowerCase()))throw new DocumentActionError(403,'Your Microsoft account could not be verified.');
 if(!await d.stillAuthorized())throw new DocumentActionError(403,'You no longer have access to this attachment.');
 // Record intent BEFORE granting: even an ambiguous network/DB failure remains
 // discoverable for revocation. The sentinel records the verified Microsoft user.
 try{await d.saveGrant('pending:'+msUser.id);}catch{throw new DocumentActionError(503,'Microsoft access could not be recorded. Retry before opening this file.');}
 const shared=await request(`${base}/items/${encodeURIComponent(binding.item_id)}/invite`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({recipients:[{objectId:msUser.id}],roles:['read'],requireSignIn:true,sendInvitation:false,retainInheritedPermissions:false})});
 const result=await shared.json();const permission=result.value?.[0],identity=permission?.grantedToV2?.user||permission?.grantedTo?.user||permission?.grantedToIdentitiesV2?.[0]?.user;
 const matchingRecipient=identity?.id===msUser.id||(permission?.invitation?.signInRequired===true&&permission.invitation.email?.toLowerCase()===d.email.toLowerCase());
 if(shared.status!==200||result.value?.length!==1||!permission?.id||permission.error||permission.link||(permission.grantedToIdentitiesV2?.length||0)>1||!matchingRecipient||permission.roles?.length!==1||permission.roles[0]!=='read')throw new DocumentActionError(502,'Microsoft did not confirm your read access. No file link was opened; retry or contact IT.');
 // Persist the exact grant so the protected worker can revoke it after membership changes.
 try{await d.saveGrant(permission.id);}catch{
  try{await request(`${base}/items/${encodeURIComponent(binding.item_id)}/permissions/${encodeURIComponent(permission.id)}`,{method:'DELETE'});}catch{/* The saved intent remains for the worker. */}
  throw new DocumentActionError(503,'Microsoft access could not be recorded. Retry before opening this file.');
 }
 if(!await d.stillAuthorized()){
  const removed=await request(`${base}/items/${encodeURIComponent(binding.item_id)}/permissions/${encodeURIComponent(permission.id)}`,{method:'DELETE'});
  // Leave the recorded grant for the worker if Microsoft could not remove it now.
  void removed;throw new DocumentActionError(403,'You no longer have access to this attachment.');
 }
 return {success:true,webUrl};
}
export async function revokeStaleAttachmentGrants(d:{list:()=>Promise<Grant[]>;token:()=>Promise<string>;remove:(g:Grant)=>Promise<void>;fetcher?:typeof fetch}){
 const grants=(await d.list()).slice(0,3);if(!grants.length)return 'idle';const token=await d.token();
 const results=await Promise.allSettled(grants.map(async g=>{
  const base=`https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(g.drive_id)}/items/${encodeURIComponent(g.item_id)}/permissions`;
  const request=(url:string,method:string)=>(d.fetcher||fetch)(url,{method,headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(5000)});
  let ids=[g.permission_id];
  if(g.permission_id.startsWith('pending:')){
   const response=await request(base+'?$top=100','GET');
   if(response.status===404){await d.remove(g);return;}
   if(!response.ok)throw new Error('Microsoft revocation pending');
   const data=await response.json();if(!Array.isArray(data.value)||data['@odata.nextLink']||data.value.some(p=>p.invitation&&!p.grantedToV2?.user?.id&&!p.grantedTo?.user?.id))throw new Error('Microsoft permission inspection incomplete');
   ids=data.value.filter(p=>!p.link&&!p.inheritedFrom&&p.roles?.length===1&&p.roles[0]==='read'&&(p.grantedToV2?.user?.id||p.grantedTo?.user?.id)===g.permission_id.slice(8)).map(p=>p.id);
  }
  for(const id of ids){const r=await request(base+'/'+encodeURIComponent(id),'DELETE');if(r.status!==204&&r.status!==404)throw new Error('Microsoft revocation pending');}
  await d.remove(g);
 }));return results.every(r=>r.status==='fulfilled')?'revoked':'retry';
}
