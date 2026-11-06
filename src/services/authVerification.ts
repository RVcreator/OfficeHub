/** Retry only temporary read failures. Credential/profile denials are never retried. */
export function isTransientVerificationError(error: any): boolean {
  const status=Number(error?.status||error?.statusCode||0);
  if(status)return status===408||status===429||status>=500;
  return /fetch|network|timed? ?out|connection/i.test(String(error?.message||''));
}
export async function retryAccountRead<T>(read:()=>Promise<T>,current:()=>boolean,wait=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms))):Promise<T>{
  try{return await read();}catch(error){
    if(!current()||!isTransientVerificationError(error))throw error;
    await wait(400);
    if(!current())throw error;
    return read();
  }
}
