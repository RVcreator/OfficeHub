/** Share one pending write for identical action arguments; completed actions are never cached. */
export function createMutationGate(){
 const pending=new Map<string,Promise<unknown>>();
 return {run<T>(key:string,action:()=>Promise<T>):Promise<T>{
  const existing=pending.get(key);if(existing)return existing as Promise<T>;
  const result=Promise.resolve().then(action).finally(()=>{if(pending.get(key)===result)pending.delete(key);});
  pending.set(key,result);return result;
 }};
}
