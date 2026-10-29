export const HEALTHY_SYNC_MS=60_000;
export const FALLBACK_SYNC_MS=15_000;
export function shouldReconcile(now:number,last:number,healthy:boolean,visible:boolean,online:boolean){
 return visible&&online&&now-last>=(healthy?HEALTHY_SYNC_MS:FALLBACK_SYNC_MS);
}
/** One request per resource; an event arriving during a request gets one trailing refresh. */
export function createRefreshGate(){
 const pending=new Map<string,{dirty:boolean;next:()=>Promise<unknown>;promise:Promise<void>}>();
 return {run(key:string,task:()=>Promise<unknown>):Promise<void>{
  const existing=pending.get(key);
  if(existing){existing.dirty=true;existing.next=task;return existing.promise;}
  const entry={dirty:false,next:task,promise:Promise.resolve()};
  pending.set(key,entry);
  entry.promise=(async()=>{try{do{entry.dirty=false;await entry.next();}while(entry.dirty);}finally{pending.delete(key);}})();
  return entry.promise;
 }};
}
export function createReconnect(schedule:(run:()=>void,ms:number)=>unknown,cancel:(id:unknown)=>void,connect:()=>void){
 let timer:unknown,attempt=0;
 return {
  request(){if(timer!==undefined)return;const delay=Math.min(30_000,1000*2**attempt++);timer=schedule(()=>{timer=undefined;connect();},delay);},
  reset(){if(timer!==undefined)cancel(timer);timer=undefined;attempt=0;},
 };
}

/** Concurrent consumers share the final result, including a trailing invalidation. */
export function createReadQueue(){
 const pending=new Map<string,{dirty:boolean;next:()=>Promise<any>;promise:Promise<any>}>();
 return {run<T>(key:string,read:()=>Promise<T>):Promise<T>{
  const existing=pending.get(key);
  if(existing){existing.dirty=true;existing.next=read;return existing.promise;}
  const entry={dirty:false,next:read,promise:Promise.resolve(undefined as any)};
  pending.set(key,entry);
  entry.promise=(async()=>{try{let result:T;do{entry.dirty=false;result=await entry.next();}while(entry.dirty);return result;}finally{pending.delete(key);}})();
  return entry.promise;
 }};
}
