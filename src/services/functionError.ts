/** Preserve the server's actionable error without logging credentials or request bodies. */
export async function functionError(error:any,data:any,fallback:string):Promise<string>{
 if(typeof data?.error==='string')return data.error;
 try{const body=await error?.context?.clone?.().json();if(typeof body?.error==='string')return body.error;}catch{}
 return fallback;
}
