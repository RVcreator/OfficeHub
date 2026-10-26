import { graphMessage, processOne } from '../_shared/officehubEmailWorker.ts';

const env = (key: string) => Deno.env.get(key) || '';
const json = (body: unknown,status=200) => Response.json(body,{status});

export async function handler(req: Request): Promise<Response> {
  const service = env('SUPABASE_SERVICE_ROLE_KEY');
  const url=env('SUPABASE_URL');
  if (!service || !url) return json({error:'Worker is not configured'},503);
  // Gateway JWT validation alone would also accept regular user sessions.
  // This function is reserved for the scheduler/service role and has no CORS.
  const callerAuthorization=req.headers.get('authorization') || '';
  if(!callerAuthorization.startsWith('Bearer ')) return json({error:'Unauthorized'},401);
  let schedulerAuthorized=false;
  const schedulerKey=env('OFFICEHUB_EMAIL_WORKER_SECRET');
  const callerSchedulerKey=req.headers.get('x-officehub-worker-key') || '';
  if(schedulerKey && callerSchedulerKey) {
    const expected=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(schedulerKey)));
    const received=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(callerSchedulerKey)));
    let difference=0;
    for(let i=0;i<expected.length;i++) difference |= expected[i]^received[i];
    schedulerAuthorized=difference===0;
  }
  if(!schedulerAuthorized) try {
    // PostgREST validates the JWT. This RPC is executable only by service_role;
    // never decode and trust an unverified role claim in the function itself.
    const authorization=await fetch(url+'/rest/v1/rpc/officehub_email_authorize',{
      method:'POST',headers:{apikey:service,authorization:callerAuthorization,'content-type':'application/json'},
      body:'{}',signal:AbortSignal.timeout(10000),
    });
    if(!authorization.ok || await authorization.json()!==true) return json({error:'Unauthorized'},401);
  } catch { return json({error:'Worker authorization unavailable'},503); }
  if(req.method!=='POST') return json({error:'Method not allowed'},405);
  const raw=await req.text();
  if(raw.length>1024) return json({error:'Request too large'},413);
  let input: {dryRun?: boolean};
  try { input=raw ? JSON.parse(raw) : {}; }
  catch { return json({error:'Invalid JSON'},400); }
  if(!input || typeof input!=='object' || Array.isArray(input)
    || Object.keys(input).some(k=>k!=='dryRun')
    || (input.dryRun!==undefined && typeof input.dryRun!=='boolean')) return json({error:'Invalid request'},400);
  const tenant=env('MS_TENANT_ID'), client=env('MS_CLIENT_ID'), secret=env('MS_CLIENT_SECRET');
  if(!url || !tenant || !client || !secret) return json({error:'Worker is not configured'},503);
  // A test invocation is read-only unless dryRun:false is explicitly provided.
  if(input.dryRun!==false) return json({configured:true,dryRun:true,sender:'officehub@wipahs.org'});
  const rpc=async(name:string,args:Record<string,unknown>={}) => {
    const response=await fetch(url+'/rest/v1/rpc/'+name,{
      method:'POST',headers:{'apikey':service,'authorization':'Bearer '+service,'content-type':'application/json'},
      body:JSON.stringify(args),signal:AbortSignal.timeout(10000),
    });
    if(!response.ok) throw new Error('Email queue operation failed');
    return response.json();
  };
  const token=async() => {
    const response=await fetch('https://login.microsoftonline.com/'+encodeURIComponent(tenant)+'/oauth2/v2.0/token',{
      method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({client_id:client,client_secret:secret,scope:'https://graph.microsoft.com/.default',grant_type:'client_credentials'}),
      signal:AbortSignal.timeout(15000),
    });
    if(!response.ok) throw new Error('Microsoft authentication unavailable');
    const result=await response.json();
    if(typeof result.access_token!=='string' || !result.access_token) throw new Error('Microsoft authentication unavailable');
    return result.access_token as string;
  };
  try {
    const outcome=await processOne({rpc,token,send:async(job,accessToken)=>fetch(
      'https://graph.microsoft.com/v1.0/users/officehub%40wipahs.org/sendMail',{
        method:'POST',headers:{authorization:'Bearer '+accessToken,'content-type':'application/json'},
        body:JSON.stringify(graphMessage(job)),signal:AbortSignal.timeout(15000),
      })});
    return json({outcome});
  } catch {
    // Never log tokens, response bodies, email content, or user addresses.
    return json({error:'Email queue processing failed; inspect queue status before retrying'},500);
  }
}

Deno.serve(handler);
