import type {Task} from '../types';
/** Ignore an older response for a still-visible task; absence still revokes/removes it. */
export function confirmedTaskSnapshot(incoming:Task[],current:Task[]):Task[]{
 const known=new Map(current.map(t=>[t.id,t]));
 return incoming.map(t=>{const existing=known.get(t.id);return existing&&(existing.deliveryVersion??0)>(t.deliveryVersion??0)?existing:t;});
}
