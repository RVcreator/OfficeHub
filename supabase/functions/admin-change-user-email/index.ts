import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
import {getMsGraphAppToken} from '../_shared/msGraphToken.ts';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'};
const reply=(status:number,body:unknown)=>Response.json(body,{status,headers:cors});
const normal=(value:unknown)=>typeof value==='string'?value.trim().toLowerCase():'';
export async function handler(req:Request){
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return reply(405,{error:'POST required'});
 try{
  const authorization=req.headers.get('authorization')||'';
  const url=Deno.env.get('SUPABASE_URL')!;
  const caller=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{auth:{persistSession:false}});
  const {data:{user},error}=await caller.auth.getUser(authorization.replace(/^Bearer\s+/i,''));
  if(error||!user)return reply(401,{error:'Verified sign-in required'});
  const admin=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
  const permission=await admin.rpc('officehub_administration_manager_allowed',{p_actor:user.id});
  if(permission.error||permission.data!==true)return reply(403,{error:'Only an account administrator can change a sign-in email'});
  const raw=await req.text();if(raw.length>1024)return reply(413,{error:'Request too large'});
  let input:any;try{input=JSON.parse(raw);}catch{return reply(400,{error:'Invalid request'});}
  if(!input||Object.keys(input).some(k=>!['userId','expectedEmail','email'].includes(k))||!/^\w{8}-\w{4}-\w{4}-\w{4}-\w{12}$/.test(input.userId||''))return reply(400,{error:'Saved member ID required'});
  const email=normal(input.email),expected=normal(input.expectedEmail);
  if(!/^[a-z0-9._%+-]+@wipahs\.org$/.test(email)||!expected)return reply(400,{error:'A valid @wipahs.org address and current email are required'});
  const target=await admin.auth.admin.getUserById(input.userId);
  const profile=await admin.from('profiles').select('id,email').eq('id',input.userId).single();
  if(target.error||!target.data.user||profile.error||normal(profile.data?.email)!==normal(target.data.user.email))return reply(409,{error:'The sign-in account and staff profile need administrator reconciliation'});
  if(normal(target.data.user.email)!==expected)return reply(409,{error:'This member changed since you opened the form. Refresh and try again.'});
  if(email!==expected){
   const duplicate=await admin.from('profiles').select('id').ilike('email',email);
   if(duplicate.error)return reply(503,{error:'Could not check the staff directory'});
   if(duplicate.data?.some((row:any)=>row.id!==input.userId))return reply(409,{error:'This email is already assigned to another member'});
   // Verify the exact address exists in this tenant before confirming a correction.
   const response=await fetch('https://graph.microsoft.com/v1.0/users/'+encodeURIComponent(email)+'?$select=id,userPrincipalName,mail',{headers:{Authorization:'Bearer '+await getMsGraphAppToken()},signal:AbortSignal.timeout(12000)});
   if(response.status===404)return reply(400,{error:'This address was not found in Microsoft. Check the work email.'});
   if(!response.ok)return reply(503,{error:'Microsoft could not verify the work email. Please try again.'});
   const microsoft=await response.json();
   if(!microsoft.id||![normal(microsoft.userPrincipalName),normal(microsoft.mail)].includes(email))return reply(400,{error:'Use the exact work email shown in Microsoft'});
   const saved=await admin.auth.admin.updateUserById(input.userId,{email,email_confirm:true});
   if(saved.error)return reply(409,{error:saved.error.code==='email_exists'?'This email is already registered to a sign-in account':'The email correction was not saved. Check for an existing account using this email.'});
  }
  const verified=await admin.from('profiles').select('id,email').eq('id',input.userId).single();
  const identity=await admin.auth.admin.getUserById(input.userId);
  if(verified.error||identity.error||normal(verified.data?.email)!==email||normal(identity.data.user?.email)!==email)return reply(503,{error:'The correction could not be confirmed. Refresh before trying again.'});
  return reply(200,{success:true,userId:input.userId,email});
 }catch{return reply(503,{error:'Email correction is temporarily unavailable. Refresh before retrying.'});}
}
Deno.serve(handler);
