// Bound read-only database requests, including response bodies. Never time out or
// retry writes here: a cancelled write could already have committed on the server.
export function createReadFetch(fetcher:typeof fetch,timeoutMs=10_000):typeof fetch {
 return async(input,init)=>{
  const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
  const method=(init?.method||(input instanceof Request?input.method:'GET')).toUpperCase();
  if(!['GET','HEAD'].includes(method)||!new URL(url).pathname.startsWith('/rest/v1/'))return fetcher(input,init);
  const controller=new AbortController(),parent=init?.signal||(input instanceof Request?input.signal:undefined);
  const abort=()=>controller.abort(parent?.reason);if(parent?.aborted)abort();else parent?.addEventListener('abort',abort,{once:true});
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{
   const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('Database read timed out. Please retry.'));},timeoutMs);});
   const read=(async()=>{
    const response=await fetcher(input,{...init,signal:controller.signal});
    const body=await response.arrayBuffer();
    return new Response([204,205,304].includes(response.status)||method==='HEAD'?null:body,{status:response.status,statusText:response.statusText,headers:response.headers});
   })();
   return await Promise.race([read,deadline]);
  }finally{clearTimeout(timer);parent?.removeEventListener('abort',abort);}
 };
}
