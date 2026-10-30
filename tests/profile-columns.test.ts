import {test} from 'node:test';
import assert from 'node:assert/strict';
import {supabase,fetchPublicProfiles,fetchProfileById} from '../src/services/supabaseClient';
import {PROFILE_SELECT_COLUMNS} from '../src/services/profileColumns';

test('profile fallback and verified account reads request explicit credential-free columns',async()=>{
 const original=supabase.from,calls:{table:string;selection?:string}[]=[];
 (supabase as any).from=(table:string)=>{
  const call={table,selection:''};calls.push(call);
  const result=table==='profiles_public'?{data:null,error:{message:'fixture view unavailable'}}:{data:[{id:'fixture',email:'fixture@example.invalid'}],error:null};
  const q:any={select:(selection:string)=>{call.selection=selection;return q;},order:()=>q,eq:()=>q,single:async()=>({data:result.data?.[0],error:null}),then:(yes:any,no:any)=>Promise.resolve(result).then(yes,no)};return q;
 };
 try{
  assert.equal((await fetchPublicProfiles()).data?.[0].id,'fixture');
  assert.equal((await fetchProfileById('fixture')).data?.id,'fixture');
  const direct=calls.filter(call=>call.table==='profiles');assert.equal(direct.length,2);
  for(const call of direct){assert.equal(call.selection,PROFILE_SELECT_COLUMNS);assert.equal(call.selection?.split(',').includes('temporary_password'),false);assert.equal(call.selection?.includes('*'),false);}
 }finally{supabase.from=original;}
});
