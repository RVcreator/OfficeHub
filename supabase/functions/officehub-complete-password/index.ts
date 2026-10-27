// Complete a self-service password change; never clear flags from a timestamp alone.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {completePassword,passwordCors} from '../_shared/passwordCompletion.ts';
const env=(key:string)=>Deno.env.get(key)||'';
Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:passwordCors});
  const url=env('SUPABASE_URL'),key=env('SUPABASE_SERVICE_ROLE_KEY');
  if(!url || !key) return Response.json({error:'Account service unavailable'},{status:503,headers:passwordCors});
  const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  return completePassword(req,{
    user:async(token)=>{const {data,error}=await admin.auth.getUser(token);return error?null:data.user;},
    changePassword:async(token,password)=>{
      // User-scoped Auth endpoint enforces password policy and rejects reusing the current password.
      const result=await fetch(url+'/auth/v1/user',{method:'PUT',headers:{apikey:key,authorization:'Bearer '+token,'content-type':'application/json'},
        body:JSON.stringify({password}),signal:AbortSignal.timeout(15000)});
      if(result.ok) return {};
      const error=await result.json().catch(()=>({}));
      return {error:typeof error.msg==='string'?error.msg:typeof error.message==='string'?error.message:'Password update was rejected. Please choose another password.'};
    },
    confirm:async(id,resetId,resetAt)=>{
      const {data,error}=await admin.rpc('officehub_confirm_password_change',{p_user:id,p_reset_id:resetId,p_reset_at:resetAt});
      return error?null:data;
    },
  });
});
