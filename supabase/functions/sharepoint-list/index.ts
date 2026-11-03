import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Content-Type':'application/json'};
Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers});
  const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers});
  try {
    const authorization=req.headers.get('Authorization') || '';
    const caller=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
    const {data:{user},error}=await caller.auth.getUser(authorization.replace(/^Bearer\s+/i,''));
    if(error || !user)return reply(401,{error:'Sign in to view documents'});
    const body=req.method==='POST'?await req.json():{};
    const projectId=body.projectId || new URL(req.url).searchParams.get('projectId');
    const rows=[];
    for(let offset=0;;offset+=500){
      let query=caller.from('sharepoint_documents').select('*').is('deleted_at',null).order('id').range(offset,offset+499);
      if(projectId)query=query.eq('project_id',projectId);
      const {data,error}=await query;
      if(error)return reply(503,{error:'Document listing could not be refreshed'});
      rows.push(...data);
      if(data.length<500)break;
    }
    return reply(200,{success:true,documents:rows});
  }catch{return reply(503,{error:'Document listing could not be refreshed'});}
});
