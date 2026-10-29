/** Stable snapshots avoid unrelated React subscriptions and unchanged publications. */
export function sameValue(a: unknown,b: unknown): boolean {
 if(Object.is(a,b)) return true;
 if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;
 if(Array.isArray(a)!==Array.isArray(b))return false;
 const ak=Object.keys(a),bk=Object.keys(b);
 return ak.length===bk.length&&ak.every(k=>Object.prototype.hasOwnProperty.call(b,k)&&sameValue((a as any)[k],(b as any)[k]));
}
export function tableSnapshot<T extends object>(read:()=>T,keys:readonly (keyof T)[]) {
 let previous:unknown[]|undefined;
 return ()=>{const state=read(),next=keys.map(k=>state[k]);
  if(!previous||next.some((v,i)=>!Object.is(v,previous![i])))previous=next;
  return previous;
 };
}
