// Permanent, administrator-authorized Auth deletion. Never delete a profile first.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:cors});
const missing=(error:any)=>error?.status===404||error?.code==='user_not_found';
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return reply({error:'Method not allowed'},405);
 try {
  const bearer=req.headers.get('authorization')||'';
  if(!/^Bearer [^\s]+$/.test(bearer))return reply({error:'Please sign in again.'},401);
  const url=Deno.env.get('SUPABASE_URL')||'',key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
  if(!url||!key)return reply({error:'Account deletion is unavailable.'},503);
  const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:identity,error:identityError}=await admin.auth.getUser(bearer.slice(7));
  if(identityError||!identity.user)return reply({error:'Your session expired. Please sign in again.'},401);
  // Uses trusted Auth roles plus the migration's fixed legacy-administrator snapshot.
  // Public profile edits cannot grant this capability.
  const {data:allowed,error:permissionError}=await admin.rpc('officehub_account_delete_allowed',{p_actor:identity.user.id});
  if(permissionError)return reply({error:'Account deletion permissions could not be verified.'},503);
  if(allowed!==true)return reply({error:'Administrator permission is required to delete accounts.'},403);
  const raw=await req.text();if(raw.length>1024)return reply({error:'Request too large'},413);
  let body:any;try{body=JSON.parse(raw);}catch{return reply({error:'Invalid request'},400);}
  if(!body||Array.isArray(body)||Object.keys(body).some(k=>!['userId','confirmEmail'].includes(k))
    ||typeof body.userId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.userId)
    ||typeof body.confirmEmail!=='string'||!body.confirmEmail.trim()||body.confirmEmail.length>254)return reply({error:'Select a user and type their email to confirm deletion.'},400);
  const id=body.userId,email=body.confirmEmail.trim().toLowerCase();
  if(id===identity.user.id)return reply({error:'You cannot delete your own signed-in account.'},400);
  const {data:target,error:targetError}=await admin.auth.admin.getUserById(id);
  if(targetError&&!missing(targetError))return reply({error:'The selected account could not be verified.'},503);
  if(target.user&&target.user.email?.trim().toLowerCase()!==email)return reply({error:'The confirmation email does not match the selected account.'},409);
  if(!target.user&&!missing(targetError))return reply({error:'The selected account could not be verified.'},503);
  if(target.user){
   const {error}=await admin.auth.admin.deleteUser(id,false);
   if(error)return reply({error:'Supabase could not delete this account. Linked records or owned storage files may need attention. The member has not been removed from this screen.'},409);
  }
  // A lost response can be retried by the OLD UUID without touching a new account
  // that has since registered the same email.
  const [{data:remaining,error:remainingError},{data:profile,error:profileError}]=await Promise.all([
   admin.auth.admin.getUserById(id),admin.from('profiles').select('id').eq('id',id).maybeSingle(),
  ]);
  if(remaining.user||!missing(remainingError)||profileError||profile)return reply({error:'Deletion could not yet be confirmed. Refresh the staff list and retry.'},503);
  return reply({success:true,userId:id,deletedEmail:email,emailReleased:true});
 }catch{return reply({error:'Account deletion could not be confirmed. Please reconnect and retry.'},503);}
});
