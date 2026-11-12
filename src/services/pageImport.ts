import {lazy, type ComponentType} from 'react';

export function isPageDownloadError(error:unknown):boolean {
 const message=error instanceof Error?error.message:String(error);
 return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Loading chunk .+ failed|Unable to preload CSS/i.test(message);
}

/** Retry only downloads. Never retry application exceptions or reload a draft. */
export async function retryPageImport<T>(load:()=>Promise<T>,wait=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms)),retry=(error:unknown,attempt:number)=>load()):Promise<T>{
 let read=load;
 for(let attempt=0;;attempt++){
  try{return await read();}catch(error){
   if(attempt>=2||!isPageDownloadError(error))throw error;
   await wait(attempt===0?300:900);
   read=()=>retry(error,attempt+1);
  }
 }
}
export function pageRetryUrl(error:unknown,exportName:string,attempt:number,origin:string):string|null {
 const message=error instanceof Error?error.message:String(error);
 const address=message.match(/https?:\/\/[^\s'"<>]+/)?.[0];
 if(!address||!/^[A-Za-z][A-Za-z0-9]*$/.test(exportName))return null;
 const url=new URL(address);
 // Never import a foreign URL or mistake a failed dependency for the page.
 if(url.origin!==origin||!new RegExp(`^/assets/${exportName}-[A-Za-z0-9_-]+\\.js$`).test(url.pathname))return null;
 url.searchParams.set('officehub_retry',String(attempt));return url.href;
}
export function lazyPage<Key extends string,Module extends Record<Key,ComponentType<any>>>(load:()=>Promise<Module>,exportName:Key){
 return lazy<Module[Key]>(async()=>{
  const module=await retryPageImport(load,undefined,async(error,attempt)=>{
   // Browsers remember a failed module URL. A bounded query retry fetches it
   // again without reloading OfficeHub or losing another screen's draft.
   const url=pageRetryUrl(error,exportName,attempt,window.location.origin);
   return url?import(/* @vite-ignore */ url):load();
  });
  return {default:module[exportName]};
 });
}
