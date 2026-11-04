export class TeamsSyncError extends Error {
 constructor(message:string,public blocked=false){super(message);}
}
export interface TeamsJob {
 meeting_id:string;revision:number;lease_token:string;transaction_id:string;
 event_id:string|null;owner_id:string|null;online_id:string|null;applied_hash:string|null;
 legacy_event_id:string|null;legacy_join_url:string|null;
 payload:{cancelled:boolean;title:string;description:string;start:string;end:string;organizer_email:string;chair_email:string;attendees:{email:string;name:string}[]};
}
type Rpc=(name:string,args?:Record<string,unknown>)=>Promise<any>;
const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const email=(value:string)=>{const result=String(value||'').trim().toLowerCase();if(!/^[a-z0-9._%+-]+@wipahs\.org$/.test(result))throw new TeamsSyncError('A meeting member needs a verified @wipahs.org Microsoft account.',true);return result;};
export function eventFields(job:TeamsJob){
 const p=job.payload;
 if(p.attendees.length>150)throw new TeamsSyncError('This meeting exceeds the supported OfficeHub invitation limit. Schedule it in Outlook.',true);
 if(!Number.isFinite(Date.parse(p.start))||!Number.isFinite(Date.parse(p.end))||Date.parse(p.end)<=Date.parse(p.start))throw new TeamsSyncError('The meeting needs a valid start and end time.',true);
 const organizer=email(p.organizer_email);
 const attendees=[...new Map(p.attendees.map(a=>[email(a.email),{emailAddress:{address:email(a.email),name:a.name},type:'required'}])).values()].filter(a=>a.emailAddress.address!==organizer).sort((a,b)=>a.emailAddress.address.localeCompare(b.emailAddress.address));
 return {subject:p.title,body:{contentType:'HTML',content:`<div data-officehub-details="true"><p>${escapeHtml(p.description||'OfficeHub meeting').replace(/\n/g,'<br>')}</p></div>`},start:{dateTime:new Date(p.start).toISOString(),timeZone:'UTC'},end:{dateTime:new Date(p.end).toISOString(),timeZone:'UTC'},attendees};
}
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const addresses=(list:any[]=[])=>list.map(a=>String(a.emailAddress?.address||'').toLowerCase()).sort();
async function fingerprint(value:unknown){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(n=>n.toString(16).padStart(2,'0')).join('');}
export async function syncTeamsJob(job:TeamsJob,dependencies:{request:typeof fetch;token:string;deadline?:number;checkpoint:(binding:Record<string,unknown>)=>Promise<void>}){
 const {request,token,checkpoint}=dependencies;
 const deadline=Math.min(Date.now()+90000,dependencies.deadline??Infinity); // Stop before the database lease.
 const graph=async(path:string,method='GET',body?:unknown,etag?:string):Promise<any>=>{
  if(Date.now()>=deadline)throw new TeamsSyncError('Microsoft sync took too long. The saved changes will be retried.');
  let response:Response;try{response=await request('https://graph.microsoft.com/v1.0'+path,{method,headers:{authorization:'Bearer '+token,'content-type':'application/json',Prefer:'IdType="ImmutableId", include-unknown-enum-members',...(etag?{'If-Match':etag}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(12000)});}catch{throw new TeamsSyncError('Microsoft did not respond. OfficeHub will retry the saved changes.');}
  if(!response.ok){
   const target=path.includes('/onlineMeetings')?'Teams co-organizer':'Microsoft calendar';
   if(response.status===401||response.status===403)throw new TeamsSyncError(`${target} permission is not configured for this organizer. An administrator must check the Microsoft application permissions and access policy.`,true);
   if(response.status===404)throw new TeamsSyncError('The saved Microsoft meeting or account could not be found. An administrator must reconcile its link.',true);
   if(response.status===400)throw new TeamsSyncError(`${target} rejected this meeting update. Check the members and Microsoft configuration.`,true);
   throw new TeamsSyncError(`Microsoft could not confirm the meeting update (${response.status}). The saved changes will be retried.`);
  }
  return response.status===204||response.status===202?null:response.json();
 };
 let owner=job.owner_id,eventId=job.event_id,onlineId=job.online_id;
 const p=job.payload;
 if(p.cancelled){
  if(!eventId&&!job.legacy_event_id)return {cancelled:true};
  if(!owner){const user=await graph('/users/'+encodeURIComponent(email(p.organizer_email))+'?$select=id');owner=user.id;}
  const path='/users/'+encodeURIComponent(owner!)+'/events/'+encodeURIComponent(eventId||job.legacy_event_id!);
  // A previous successful cancellation followed by a lost acknowledgement is safe.
  try{const existing=await graph(path+'?$select=id,isCancelled');if(!existing.isCancelled)await graph(path+'/cancel','POST',{comment:'This meeting was cancelled in OfficeHub.'});}catch(error){if(!(error instanceof TeamsSyncError&&error.message.startsWith('The saved Microsoft meeting')))throw error;}
  return {cancelled:true};
 }
 const fields=eventFields(job),hash=await fingerprint({...fields,chair:email(p.chair_email)});
 if(!p.attendees.some(a=>email(a.email)===email(p.chair_email)))throw new TeamsSyncError('The selected host must be in the saved attendee list.',true);
 if(Date.parse(p.end)<=Date.now())throw new TeamsSyncError('This meeting has ended. OfficeHub will not send new Microsoft invitations for it.',true);
 if(!owner){const user=await graph('/users/'+encodeURIComponent(email(p.organizer_email))+'?$select=id');if(!user?.id)throw new TeamsSyncError('The organizer has no Microsoft account.',true);owner=user.id;}
 let event:any;
 if(!eventId&&job.legacy_event_id){
  event=await graph('/users/'+encodeURIComponent(owner!)+'/events/'+encodeURIComponent(job.legacy_event_id));
  if(!job.legacy_join_url||event.onlineMeeting?.joinUrl!==job.legacy_join_url||String(event.organizer?.emailAddress?.address||'').toLowerCase()!==email(p.organizer_email))throw new TeamsSyncError('This older meeting link does not match its saved Microsoft organizer. An administrator must reconcile it.',true);
  eventId=event.id;await checkpoint({event_id:eventId,owner_id:owner,join_url:event.onlineMeeting.joinUrl});
 }
 const base='/users/'+encodeURIComponent(owner!)+'/events/';
 if(!eventId){
  // Exchange transactionId deduplicates a retried create after an uncertain response.
  event=await graph('/users/'+encodeURIComponent(owner!)+'/events','POST',{...fields,isOnlineMeeting:true,onlineMeetingProvider:'teamsForBusiness',transactionId:job.transaction_id});
  if(!event?.id||!event.onlineMeeting?.joinUrl)throw new TeamsSyncError('Microsoft has not confirmed a Teams link yet. The saved meeting will be retried.');
  eventId=event.id;await checkpoint({event_id:eventId,owner_id:owner,join_url:event.onlineMeeting.joinUrl});
 }else{
  event=event||await graph(base+encodeURIComponent(eventId));
  if(String(event.organizer?.emailAddress?.address||'').toLowerCase()!==email(p.organizer_email))throw new TeamsSyncError('The Microsoft organizer does not match this OfficeHub meeting.',true);
  if(event.isCancelled)throw new TeamsSyncError('This meeting was cancelled in Microsoft. Create a new meeting to schedule it again.',true);
  if(job.applied_hash!==hash){
   const patch:any={};
   if(event.subject!==fields.subject)patch.subject=fields.subject;
   const microsoftUtc=(v:any)=>Date.parse(v?.dateTime+(v?.timeZone==='UTC'&&!/[zZ]|[+-]\d\d:\d\d$/.test(v.dateTime)?'Z':''));
   if(microsoftUtc(event.start)!==Date.parse(p.start)||microsoftUtc(event.end)!==Date.parse(p.end)){patch.start=fields.start;patch.end=fields.end;}
   if(!same(addresses(event.attendees),addresses(fields.attendees)))patch.attendees=fields.attendees;
   // Preserve Microsoft's Teams meeting blob when updating the description.
   const block=/<div data-officehub-details="true">[\s\S]*?<\/div>/;
   const existingBody=event.body?.content||'';
   const body=block.test(existingBody)?existingBody.replace(block,()=>fields.body.content):fields.body.content+existingBody;
   if(body!==existingBody)patch.body={contentType:'HTML',content:body};
   if(Object.keys(patch).length)event=await graph(base+encodeURIComponent(eventId),'PATCH',patch,event['@odata.etag']);
  }
 }
 const join=event.onlineMeeting?.joinUrl;
 if(!join)throw new TeamsSyncError('Microsoft has not returned a Teams meeting link. The saved meeting will be retried.');
 if(!onlineId){
  const filter=encodeURIComponent("JoinWebUrl eq '"+join.replace(/'/g,"''")+"'");
  const online=await graph('/users/'+encodeURIComponent(owner!)+'/onlineMeetings?$filter='+filter);
  if(online.value?.length!==1||!online.value[0].id)throw new TeamsSyncError('The Teams meeting is not available for co-organizer setup yet. OfficeHub will retry.');
  onlineId=online.value[0].id;await checkpoint({event_id:eventId,owner_id:owner,online_id:onlineId,join_url:join});
 }
 const meetingPath='/users/'+encodeURIComponent(owner!)+'/onlineMeetings/'+encodeURIComponent(onlineId!);
 const online=await graph(meetingPath);
 // Resolve tenant identities; no arbitrary email/address supplied by the browser.
 const candidates=p.attendees.filter(a=>email(a.email)!==email(p.organizer_email)),people:any[]=[];
 for(let offset=0;offset<candidates.length;offset+=10)people.push(...await Promise.all(candidates.slice(offset,offset+10).map(async a=>{
  const address=email(a.email),identity=await graph('/users/'+encodeURIComponent(address)+'?$select=id,userPrincipalName');
  if(!identity?.id)throw new TeamsSyncError('A meeting attendee has no Microsoft tenant account.',true);
  return {identity:{user:{id:identity.id}},upn:identity.userPrincipalName||address,role:address===email(p.chair_email)?'coorganizer':'attendee'};
 })));
 const canonical=(values:any[]=[])=>values.map(a=>({id:a.identity?.user?.id,role:a.role||'attendee'})).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
 if(!same(canonical(online.participants?.attendees),canonical(people)))await graph(meetingPath,'PATCH',{participants:{attendees:people}});
 const verified=await graph(base+encodeURIComponent(eventId)+'?$select=id,attendees,onlineMeeting,organizer');
 if(!same(addresses(verified.attendees),addresses(fields.attendees))||verified.onlineMeeting?.joinUrl!==join)throw new TeamsSyncError('Microsoft has not confirmed the full invitation list yet. OfficeHub will retry.');
 const verifiedOnline=await graph(meetingPath);
 if(!same(canonical(verifiedOnline.participants?.attendees),canonical(people)))throw new TeamsSyncError('Microsoft has not confirmed the host roles yet. OfficeHub will retry.');
 return {event_id:eventId,owner_id:owner,online_id:onlineId,join_url:join,applied_hash:hash,cancelled:false};
}
export async function processTeamsSync(deps:{rpc:Rpc;token:()=>Promise<string>;request?:typeof fetch},meetingId:string|null=null){
 const job=await deps.rpc('officehub_claim_teams_sync',{p_meeting:meetingId}) as TeamsJob|null;
 if(!job)return 'idle';
 const deadline=Date.now()+90000;
 const args={p_meeting:job.meeting_id,p_lease:job.lease_token};
 try{
  const binding=await syncTeamsJob(job,{request:deps.request||fetch,token:await deps.token(),deadline,checkpoint:async binding=>{await deps.rpc('officehub_checkpoint_teams_sync',{...args,p_binding:binding});}});
  await deps.rpc('officehub_finish_teams_sync',{...args,p_revision:job.revision,p_binding:binding,p_error:null,p_blocked:false});return 'synced';
 }catch(error){
  const safe=error instanceof TeamsSyncError?error:new TeamsSyncError('Microsoft meeting sync is unavailable. The saved changes will be retried.');
  await deps.rpc('officehub_finish_teams_sync',{...args,p_revision:job.revision,p_binding:{},p_error:safe.message,p_blocked:safe.blocked});return safe.blocked?'blocked':'retry';
 }
}
