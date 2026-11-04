import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
import {getMsGraphAppToken} from '../_shared/msGraphToken.ts';
import {processTeamsSync} from '../_shared/teamsMeetingSync.ts';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'};
const reply=(status:number,body:unknown)=>Response.json(body,{status,headers:cors});
export async function handler(req:Request){
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return reply(405,{error:'POST required'});
 try{
  const authorization=req.headers.get('authorization')||'';
  const url=Deno.env.get('SUPABASE_URL')!;
  const caller=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
  const {data:{user},error}=await caller.auth.getUser(authorization.replace(/^Bearer\s+/i,''));
  if(error||!user)return reply(401,{error:'Verified sign-in required'});
  const raw=await req.text();if(raw.length>1024)return reply(413,{error:'Request too large'});
  let input:any;try{input=JSON.parse(raw);}catch{return reply(400,{error:'Invalid request'});}
  if(!input||typeof input.meetingId!=='string'||!input.meetingId||input.meetingId.length>250||Object.keys(input).some(k=>!['meetingId','retry'].includes(k))||input.retry!==undefined&&typeof input.retry!=='boolean')return reply(400,{error:'Saved meeting ID required'});
  const admin=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
  const {data:allowed,error:permissionError}=await admin.rpc('officehub_teams_sync_authorized',{p_actor:user.id,p_meeting:input.meetingId});
  if(permissionError||allowed!==true)return reply(403,{error:'Only the meeting organizer or chair can sync it'});
  if(input.retry){const {error}=await caller.rpc('officehub_retry_teams_sync',{p_meeting:input.meetingId});if(error)return reply(409,{error:'The meeting could not be prepared for retry'});}
  const rpc=async(name:string,args:Record<string,unknown>={})=>{const {data,error}=await admin.rpc(name,args);if(error)throw new Error('Meeting queue unavailable');return data;};
  const outcome=await processTeamsSync({rpc,token:getMsGraphAppToken},input.meetingId);
  return reply(200,{outcome});
 }catch{return reply(503,{error:'Microsoft sync is temporarily unavailable. The saved meeting remains queued.'});}
}
Deno.serve(handler);
