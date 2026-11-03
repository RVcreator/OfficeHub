import {test} from 'node:test';
import assert from 'node:assert/strict';
import {recycleMicrosoftFile,inspectMicrosoftFile,deleteConfirmedDocument,createMicrosoftFolder,folderSegment} from '../supabase/functions/_shared/documentActions';
const json=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status});
const item={id:'item',name:'File.pdf',file:{},eTag:'"version-one"',parentReference:{driveId:'drive'}};
test('Microsoft deletion checks drive and immutable file identity, then uses the inspected version',async()=>{
 const calls:any[]=[];
 await recycleMicrosoftFile((async(url,options)=>{calls.push([url,options]);return calls.length===1?json({id:'drive'}):calls.length===2?json(item):new Response(null,{status:204});}) as typeof fetch,'token','drive','item');
 assert.equal(calls.length,3);assert.equal(calls[2][1].method,'DELETE');assert.equal(calls[2][1].headers['If-Match'],'"version-one"');assert.doesNotMatch(calls[2][0],/name|root:/);
});
test('authorization/prepare and Microsoft confirmation must precede local removal',async()=>{
 const order:string[]=[];
 await deleteConfirmedDocument({prepare:async()=>{order.push('authorize')},recycle:async()=>{order.push('Microsoft')},finish:async()=>{order.push('OfficeHub')}});
 assert.deepEqual(order,['authorize','Microsoft','OfficeHub']);
 for(const fail of ['prepare','recycle']){
  let finished=false,remote=false;
  await assert.rejects(deleteConfirmedDocument({prepare:async()=>{if(fail==='prepare')throw Error('denied')},recycle:async()=>{remote=true;throw Error('Microsoft rejected')},finish:async()=>{finished=true}}));
  assert.equal(finished,false);assert.equal(remote,fail!=='prepare');
 }
});
test('Microsoft failures and changed versions never commit OfficeHub deletion',async()=>{
 for(const status of [401,403,409,412,429,500]){
  let count=0,finished=false;
  await assert.rejects(deleteConfirmedDocument({prepare:async()=>{},recycle:()=>recycleMicrosoftFile((async()=>++count===1?json({id:'drive'}):count===2?json(item):new Response(null,{status})) as typeof fetch,'token','drive','item'),finish:async()=>{finished=true}}));
  assert.equal(finished,false);
 }
 await assert.rejects(recycleMicrosoftFile((async()=>{throw Error('timeout')}) as typeof fetch,'token','drive','item'),/did not respond/);
});
test('a missing item is an idempotent retry only after the configured drive is verified',async()=>{
 let count=0;await recycleMicrosoftFile((async()=>++count===1?json({id:'drive'}):new Response(null,{status:404})) as typeof fetch,'token','drive','item');assert.equal(count,2);
 await assert.rejects(recycleMicrosoftFile((async()=>new Response(null,{status:404})) as typeof fetch,'token','drive','item'),/drive access/);
 let contacted=false;await assert.rejects(recycleMicrosoftFile((async()=>{contacted=true;return json({})}) as typeof fetch,'token','drive',''),/no confirmed/);assert.equal(contacted,false);
});
test('folders, changed IDs and other drives are never recycled',async()=>{
 for(const invalid of [{...item,id:'other'},{...item,folder:{}},{...item,file:undefined},{...item,parentReference:{driveId:'other'}}]){
  let count=0;await assert.rejects(recycleMicrosoftFile((async()=>++count===1?json({id:'drive'}):json(invalid)) as typeof fetch,'token','drive','item'),/identity/);assert.equal(count,2);
 }
});
test('a local finalization failure can retry without a second Microsoft deletion',async()=>{
 let calls=0;const remote=()=>recycleMicrosoftFile((async()=>++calls%2===1?json({id:'drive'}):new Response(null,{status:404})) as typeof fetch,'token','drive','item');
 await assert.rejects(deleteConfirmedDocument({prepare:async()=>{},recycle:remote,finish:async()=>{throw Error('database unavailable')}}));
 let finished=false;await deleteConfirmedDocument({prepare:async()=>{},recycle:remote,finish:async()=>{finished=true}});assert.equal(finished,true);assert.equal(calls,4);
});
test('sync returns confirmed Microsoft metadata and folder creation checks its actual type',async()=>{
 let count=0;const file=await inspectMicrosoftFile((async()=>++count===1?json({id:'drive'}):json({...item,lastModifiedDateTime:'2026-11-03T10:00:00Z'})) as typeof fetch,'token','drive','item');assert.equal(file.lastModifiedDateTime,'2026-11-03T10:00:00Z');
 count=0;const folder=await createMicrosoftFolder((async()=>++count===1?new Response(null,{status:409}):json({id:'folder-id',name:'Reports',folder:{}})) as typeof fetch,'token','drive','Reports');assert.equal(folder.id,'folder-id');
 await assert.rejects(createMicrosoftFolder((async()=>json({id:'wrong',name:'Reports',file:{}})) as typeof fetch,'token','drive','Reports'),/different Microsoft item/);
 for(const value of ['../secret','one/two','one\\two','', 'name.'])assert.throws(()=>folderSegment(value));
});
