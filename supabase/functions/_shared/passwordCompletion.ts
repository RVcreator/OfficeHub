export type PasswordAccount = {id:string;email?:string;app_metadata?:Record<string,unknown>};
export interface PasswordCompletionDependencies {
  user(token:string):Promise<PasswordAccount | null>;
  changePassword(token:string,password:string):Promise<{error?:string}>;
  confirm(id:string,resetId:string|null,resetAt:string|null):Promise<{userId:string;app_metadata:Record<string,unknown>} | null>;
}
export const passwordCors = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const response=(body:unknown,status=200)=>Response.json(body,{status,headers:passwordCors});
/** A caller cannot clear a requirement without a successful Auth password write. */
export async function completePassword(req:Request,deps:PasswordCompletionDependencies):Promise<Response> {
  if(req.method==='OPTIONS') return new Response('ok',{headers:passwordCors});
  if(req.method!=='POST') return response({error:'Method not allowed'},405);
  const bearer=req.headers.get('authorization') || '';
  if(!/^Bearer [^\s]+$/.test(bearer)) return response({error:'Please sign in again.'},401);
  try {
    const token=bearer.slice(7),user=await deps.user(token);
    if(!user) return response({error:'Your session expired. Please sign in again.'},401);
    const raw=await req.text();
    if(raw.length>2048) return response({error:'Request too large'},413);
    let body:any;
    try {body=JSON.parse(raw);} catch {return response({error:'Invalid request'},400);}
    if(!body || typeof body!=='object' || Array.isArray(body) || Object.keys(body).some(k=>k!=='newPassword')
      || typeof body.newPassword!=='string' || body.newPassword.length<8 || body.newPassword.length>128) {
      return response({error:'Enter a new password between 8 and 128 characters.'},400);
    }
    const changed=await deps.changePassword(token,body.newPassword);
    if(changed.error) return response({error:changed.error},400);
    // Do not clear a reset issued while this request was running.
    const latest=await deps.user(token);
    if(!latest || latest.id!==user.id) return response({error:'Please sign in again.'},401);
    if(latest.app_metadata?.password_reset_at!==user.app_metadata?.password_reset_at
      || latest.app_metadata?.password_reset_id!==user.app_metadata?.password_reset_id) {
      return response({error:'A newer password reset was issued. Please sign in with the latest temporary password.'},409);
    }
    const confirmed=await deps.confirm(user.id,typeof latest.app_metadata?.password_reset_id==='string'?latest.app_metadata.password_reset_id:null,
      typeof latest.app_metadata?.password_reset_at==='string'?latest.app_metadata.password_reset_at:null);
    if(!confirmed || confirmed.userId!==user.id || confirmed.app_metadata.must_change_password!==false || !confirmed.app_metadata.password_changed_at) {
      return response({error:'Your password changed, but account confirmation failed. Please sign in again or choose another new password and retry.'},503);
    }
    return response({success:true,...confirmed});
  } catch {
    return response({error:'Password change could not be confirmed. Please check your connection and try again.'},503);
  }
}
