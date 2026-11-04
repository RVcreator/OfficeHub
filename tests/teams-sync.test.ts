import {test} from 'node:test';import assert from 'node:assert/strict';
import {eventFields,syncTeamsJob,processTeamsSync,type TeamsJob} from '../supabase/functions/_shared/teamsMeetingSync';
const fixture=():TeamsJob=>({meeting_id:'fixture',revision:1,lease_token:'lease',transaction_id:'stable-transaction',event_id:null,owner_id:null,online_id:null,applied_hash:null,legacy_event_id:null,legacy_join_url:null,payload:{cancelled:false,title:'Planning',description:'Agenda <review>',start:'2099-11-05T10:00:00+03:00',end:'2099-11-05T11:00:00+03:00',organizer_email:'owner@wipahs.org',chair_email:'chair@wipahs.org',attendees:[{email:'owner@wipahs.org',name:'Owner'},{email:'chair@wipahs.org',name:'Chair'},{email:'member@wipahs.org',name:'Member'}]}});
function microsoft(){
 let event:any=null,online:any={id:'online',participants:{attendees:[]}};const calls:{path:string;method:string;body:any}[]=[];
 const request:typeof fetch=async(input,init)=>{
  const u=new URL(String(input)),path=decodeURIComponent(u.pathname.replace('/v1.0','')),method=init?.method||'GET',body=init?.body?JSON.parse(String(init.body)):null;calls.push({path,method,body});
  if(path==='/users/owner@wipahs.org')return Response.json({id:'owner-id',userPrincipalName:'owner@wipahs.org'});
  if(path==='/users/chair@wipahs.org'||path==='/users/member@wipahs.org')return Response.json({id:path.includes('chair')?'chair-id':'member-id',userPrincipalName:path.slice(7)});
  if(path==='/users/owner-id/events'&&method==='POST'){event={...body,id:'event',organizer:{emailAddress:{address:'owner@wipahs.org'}},onlineMeeting:{joinUrl:'https://teams.microsoft.com/real'},'@odata.etag':'etag'};return Response.json(event);}
  if(path==='/users/owner-id/events/event'){
   if(method==='PATCH')event={...event,...body};return Response.json(event);
  }
  if(path==='/users/owner-id/onlineMeetings'&&u.searchParams.has('$filter'))return Response.json({value:[online]});
  if(path==='/users/owner-id/onlineMeetings/online'){if(method==='PATCH')online={...online,...body};return Response.json(online);}
  if(path==='/users/owner-id/events/event/cancel'){event.isCancelled=true;return new Response(null,{status:202});}
  throw Error('Unexpected Microsoft path '+path);
 };
 return {request,calls,get event(){return event;},set event(value){event=value;},get online(){return online;}};
}
test('Teams invitations use every saved attendee, UTC times, escaped text and stable transaction ID',async()=>{
 const job=fixture(),ms=microsoft(),checkpoints:any[]=[];
 const result=await syncTeamsJob(job,{request:ms.request,token:'server-token',checkpoint:async b=>{checkpoints.push(b);}});
 const create=ms.calls.find(c=>c.method==='POST')!;assert.equal(create.body.transactionId,job.transaction_id);assert.equal(create.body.start.dateTime,'2099-11-05T07:00:00.000Z');assert.deepEqual(create.body.attendees.map((a:any)=>a.emailAddress.address),['chair@wipahs.org','member@wipahs.org']);assert.match(create.body.body.content,/&lt;review&gt;/);assert.equal(result.event_id,'event');assert.equal(checkpoints[0].event_id,'event');
 assert.deepEqual(ms.online.participants.attendees.map((a:any)=>a.role),['coorganizer','attendee']);assert.equal(checkpoints[1].online_id,'online');
});
test('retry and unchanged save reuse the event and do not resend calendar updates',async()=>{
 const ms=microsoft(),job=fixture();const result=await syncTeamsJob(job,{request:ms.request,token:'token',checkpoint:async()=>{}});Object.assign(job,result);ms.calls.length=0;
 await syncTeamsJob(job,{request:ms.request,token:'token',checkpoint:async()=>{}});
 assert.equal(ms.calls.some(c=>c.method==='POST'||c.method==='PATCH'),false);
});
test('attendee removal and host change update the same meeting, preserve the Teams body and demote the previous chair',async()=>{
 const ms=microsoft(),job=fixture();Object.assign(job,await syncTeamsJob(job,{request:ms.request,token:'token',checkpoint:async()=>{}}));ms.event.body.content+='<div>MICROSOFT TEAMS BLOB</div>';ms.calls.length=0;
 job.payload.chair_email='member@wipahs.org';job.payload.description='Updated description';job.payload.attendees=job.payload.attendees.filter(a=>a.email!=='chair@wipahs.org');
 await syncTeamsJob(job,{request:ms.request,token:'token',checkpoint:async()=>{}});
 assert.equal(ms.calls.some(c=>c.path.endsWith('/events')&&c.method==='POST'),false);assert.match(ms.event.body.content,/MICROSOFT TEAMS BLOB/);assert.match(ms.event.body.content,/Updated description/);assert.deepEqual(ms.event.attendees.map((a:any)=>a.emailAddress.address),['member@wipahs.org']);assert.equal(ms.online.participants.attendees[0].role,'coorganizer');
});
test('permission failures preserve the created binding and block retries without fake success or links',async()=>{
 const ms=microsoft(),job=fixture(),checkpoints:any[]=[];
 const request:typeof fetch=(u,i)=>String(u).includes('/onlineMeetings')?Promise.resolve(Response.json({error:'private details'},{status:403})):ms.request(u,i);
 const writes:any[]=[];const outcome=await processTeamsSync({rpc:async(name,args)=>{writes.push({name,args});if(name==='officehub_claim_teams_sync')return job;return null;},token:async()=>'token',request});
 assert.equal(outcome,'blocked');const checkpoint=writes.find(w=>w.name==='officehub_checkpoint_teams_sync');assert.equal(checkpoint.args.p_binding.event_id,'event');const finish=writes.find(w=>w.name==='officehub_finish_teams_sync');assert.equal(finish.args.p_blocked,true);assert.match(finish.args.p_error,/Teams co-organizer permission/);assert.doesNotMatch(JSON.stringify(writes),/private details|wipahs1234|meetup-/);
});
test('legacy meetings require organizer and join-link proof before binding or mutation',async()=>{
 const ms=microsoft(),job=fixture();Object.assign(job,await syncTeamsJob(job,{request:ms.request,token:'token',checkpoint:async()=>{}}));job.event_id=null;job.online_id=null;job.legacy_event_id='event';job.legacy_join_url='https://teams.microsoft.com/other';ms.calls.length=0;
 await assert.rejects(()=>syncTeamsJob(job,{request:ms.request,token:'token',checkpoint:async()=>{throw Error('must not checkpoint');}}),/does not match/);assert.equal(ms.calls.some(c=>c.method!=='GET'),false);
});
test('cancellation targets only the saved organizer event and tolerates an already removed event',async()=>{
 const ms=microsoft(),job=fixture();Object.assign(job,await syncTeamsJob(job,{request:ms.request,token:'token',checkpoint:async()=>{}}));job.payload.cancelled=true;ms.calls.length=0;
 await syncTeamsJob(job,{request:ms.request,token:'token',checkpoint:async()=>{}});assert.equal(ms.calls.filter(c=>c.path.endsWith('/cancel')).length,1);
 await syncTeamsJob(job,{request:ms.request,token:'token',checkpoint:async()=>{}});assert.equal(ms.calls.filter(c=>c.path.endsWith('/cancel')).length,1);
 assert.throws(()=>eventFields({...fixture(),payload:{...fixture().payload,attendees:[{email:'attacker@example.invalid',name:'Wrong tenant'}]}}),/verified/);
});
