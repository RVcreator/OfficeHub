import {test} from 'node:test';import assert from 'node:assert/strict';
import {matchLegacyDocument,readMicrosoftLibraryIdentities,reconcileLegacyDocuments} from '../supabase/functions/_shared/documentReconciliation';
const root='https://tenant.sharepoint.com/sites/OfficeHub/Shared%20Documents',guid='10000000-0000-4000-8000-000000000001';
const file={id:'immutable-file',file:{},webUrl:root+'/Projects/Marketing/renamed.xlsx',parentReference:{driveId:'drive'},sharepointIds:{listItemUniqueId:guid}};
const source=`https://tenant.sharepoint.com/sites/OfficeHub/_layouts/15/Doc.aspx?sourcedoc=%7B${guid}%7D&file=old.xlsx`;
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status});
test('stable SharePoint GUID resolves renamed files and duplicate rows to the same immutable ID',()=>{
 const result=matchLegacyDocument(source,'drive',root,[file]);assert.equal(result.file.id,'immutable-file');assert.equal(result.proof,'sharepoint_guid');
 assert.equal(matchLegacyDocument(source,'drive',root,[file,file]).file.id,file.id);
});
test('direct links require an exact canonical library path, never a matching basename elsewhere',()=>{
 assert.equal(matchLegacyDocument(file.webUrl,'drive',root,[{...file,resolvedUrl:file.webUrl}]).proof,'exact_web_url');
 assert.throws(()=>matchLegacyDocument(root+'/Operations/renamed.xlsx','drive',root,[file]),/could not confirm/);
 assert.throws(()=>matchLegacyDocument(root+'/renamed.xlsx','drive',root,[file]),/could not confirm/);
});
test('foreign sites, malformed IDs, folders, deleted files and ambiguous GUIDs cannot acquire a link',()=>{
 for(const url of [source.replace('tenant.sharepoint.com','evil.invalid'),source.replace('/OfficeHub/','/Other/'),source.replace(guid,'not-a-guid'),root+'/../other.xlsx','https://tenant.sharepoint.com/sites/Other/file.xlsx'])assert.throws(()=>matchLegacyDocument(url,'drive',root,[file]));
 for(const invalid of [{...file,parentReference:{driveId:'other'}},{...file,folder:{}},{...file,deleted:{}},{...file,file:undefined},{...file,webUrl:root.replace('OfficeHub','Other')+'/file.xlsx'}])assert.throws(()=>matchLegacyDocument(source,'drive',root,[invalid]),/could not confirm/);
 assert.throws(()=>matchLegacyDocument(source,'drive',root,[file,{...file,id:'another-file'}]),/More than one/);
});
test('an ordinary owner cannot turn a hand-written URL into Microsoft delete authority',async()=>{
 let reads=0,writes=0;await assert.rejects(reconcileLegacyDocuments({isAdmin:false,documents:[{id:'forged',web_url:source}],drive:'drive',inspect:async()=>{reads++;return {rootUrl:root,files:[file]}},confirm:async()=>{writes++}}),/Only an administrator/);assert.equal(reads,0);assert.equal(writes,0);
});
test('complete metadata inspection follows only the configured Graph drive and performs GET requests only',async()=>{
 const calls:any[]=[];const next='https://graph.microsoft.com/v1.0/drives/drive/root/delta?token=safe';
 const responses=[json({id:'drive'}),json({id:'root',webUrl:root}),json({value:[file],'@odata.nextLink':next}),json({value:[{...file,deleted:{}}]})];
 const result=await readMicrosoftLibraryIdentities((async(url,options)=>{calls.push({url,options});return responses.shift()!}) as typeof fetch,'token','drive');assert.equal(result.files.length,0);assert.equal(calls.length,4);assert.ok(calls.every(call=>!call.options.method||call.options.method==='GET'));assert.ok(calls.every(call=>!String(call.url).includes('/content')&&!String(call.url).includes('/permissions')));
 for(const link of ['https://evil.invalid/v1.0/drives/drive/root/delta?token=x','https://graph.microsoft.com/v1.0/drives/other/root/delta?token=x']){let n=0;await assert.rejects(readMicrosoftLibraryIdentities((async()=>++n===1?json({id:'drive'}):n===2?json({id:'root',webUrl:root}):json({value:[file],'@odata.nextLink':link})) as typeof fetch,'token','drive'),/unexpected/);assert.equal(n,3);}
});
test('repair waits for full inspection, preserves unresolved records and never deletes or shares a file',async()=>{
 const saved:string[]=[];const result=await reconcileLegacyDocuments({isAdmin:true,documents:[{id:'one',web_url:source},{id:'two',web_url:source},{id:'missing',web_url:root+'/missing.xlsx'}],drive:'drive',inspect:async()=>({rootUrl:root,files:[file]}),confirm:async(doc,actual,proof)=>{assert.equal(actual.id,file.id);assert.equal(proof,'sharepoint_guid');saved.push(doc.id)}});
 assert.deepEqual(saved,['one','two']);assert.equal(result.repaired,2);assert.equal(result.unresolved[0].id,'missing');
 await assert.rejects(reconcileLegacyDocuments({isAdmin:true,documents:[{id:'one',web_url:source}],drive:'drive',inspect:async()=>{throw Error('incomplete scan')},confirm:async()=>assert.fail('must not write before complete scan')}),/incomplete scan/);
});

test('Microsoft Office-viewer canonical URLs are accepted only with a matching stable GUID',()=>{
 assert.equal(matchLegacyDocument(source,'drive',root,[{...file,webUrl:source}]).file.id,file.id);
 assert.equal(matchLegacyDocument(source,'drive',root,[{...file,webUrl:source,sharepointIds:undefined}]).file.id,file.id);
 assert.throws(()=>matchLegacyDocument(source,'drive',root,[{...file,webUrl:source.replace(guid,'20000000-0000-4000-8000-000000000002')}]),/could not confirm/);
});
test('exact saved file-path lookup verifies a Microsoft item even when its canonical URL is an Office viewer',async()=>{
 const calls:any[]=[];const responses=[json({id:'drive'}),json({id:'root',webUrl:root}),json({value:[]}),json({...file,webUrl:source})];
 const inspected=await readMicrosoftLibraryIdentities((async(url)=>{calls.push(url);return responses.shift()!}) as typeof fetch,'token','drive',[file.webUrl]);
 assert.equal(matchLegacyDocument(file.webUrl,'drive',root,inspected.files).file.id,file.id);assert.match(calls[3],/root:\/Projects\/Marketing\/renamed.xlsx/);
});
