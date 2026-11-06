import type {Task} from '../types';
/** Ignore an older response for a still-visible task; absence still revokes/removes it. */
export function confirmedTaskSnapshot(incoming:Task[],current:Task[]):Task[]{
 const known=new Map(current.map(t=>[t.id,t]));
 return incoming.map(t=>{
  const existing=known.get(t.id);if(!existing)return t;
  const base=(existing.deliveryVersion??0)>(t.deliveryVersion??0)?existing:t;
  if((existing.generalUpdateVersion??0)===(t.generalUpdateVersion??0))return base;
  const update=(existing.generalUpdateVersion??0)>(t.generalUpdateVersion??0)?existing:t;
  if(update===base)return base;
  return {...base,update:update.update,generalUpdateVersion:update.generalUpdateVersion};
 });
}
