import {DocumentActionError,graphDocumentRequest} from './documentActions.ts';
export type MicrosoftFileIdentity={id:string;webUrl:string;file?:object;folder?:object;deleted?:object;resolvedUrl?:string;parentReference?:{driveId?:string};sharepointIds?:{listItemUniqueId?:string}};
const guid=(value:unknown)=>typeof value==='string' && /^\{?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}?$/i.test(value)?value.replace(/[{}]/g,'').toLowerCase():null;
function parsed(value:string){try{const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||url.port)return null;return url;}catch{return null;}}
function path(url:URL){try{return url.pathname.split('/').map(segment=>{const decoded=decodeURIComponent(segment);if(/[\\/]/.test(decoded)||decoded==='.'||decoded==='..')throw Error();return decoded.normalize('NFC');}).join('/').replace(/\/$/,'').toLowerCase();}catch{return null;}}
export function matchLegacyDocument(savedUrl:string,drive:string,rootUrl:string,files:MicrosoftFileIdentity[]){
 const saved=parsed(savedUrl),root=parsed(rootUrl);if(!saved||!root||saved.origin!==root.origin)throw new DocumentActionError(409,'The saved link does not belong to the configured Microsoft library.');
 const rootPath=path(root),savedPath=path(saved);if(!rootPath||!savedPath)throw new DocumentActionError(409,'The saved Microsoft link is invalid.');
 const source=guid(saved.searchParams.get('sourcedoc'));let proof:'sharepoint_guid'|'exact_web_url';
 if(saved.searchParams.has('sourcedoc')){
  if(!source||savedPath!==rootPath.slice(0,rootPath.lastIndexOf('/'))+'/_layouts/15/doc.aspx')throw new DocumentActionError(409,'The saved Microsoft document identity is invalid.');proof='sharepoint_guid';
 }else{if(!savedPath.startsWith(rootPath+'/'))throw new DocumentActionError(409,'The saved link is outside the configured Microsoft library.');proof='exact_web_url';}
 const matches=new Map<string,MicrosoftFileIdentity>();
 for(const file of files){
  if(!file.id||!file.file||file.folder||file.deleted||file.parentReference?.driveId!==drive)continue;
  const canonical=parsed(file.webUrl),canonicalPath=canonical&&path(canonical);
  if(!canonical||canonical.origin!==root.origin||!canonicalPath)continue;
  const layoutPath=rootPath.slice(0,rootPath.lastIndexOf('/'))+'/_layouts/15/doc.aspx';
  const canonicalGuid=canonicalPath===layoutPath?guid(canonical.searchParams.get('sourcedoc')):null;
  const metadataGuid=guid(file.sharepointIds?.listItemUniqueId);
  if(!canonicalPath.startsWith(rootPath+'/')&&!canonicalGuid)continue;
  if(canonicalGuid&&metadataGuid&&canonicalGuid!==metadataGuid)continue;
  const resolved=file.resolvedUrl&&parsed(file.resolvedUrl);
  const exactResolved=resolved&&resolved.origin===root.origin&&path(resolved)===savedPath;
  if(proof==='sharepoint_guid'?(metadataGuid||canonicalGuid)===source:exactResolved)matches.set(file.id,file);
 }
 if(matches.size!==1)throw new DocumentActionError(409,matches.size?'More than one Microsoft item matches this link. An administrator must review it.':'Microsoft could not confirm this saved link. The record has been kept for review.');
 return {file:[...matches.values()][0],proof};
}
export async function readMicrosoftLibraryIdentities(fetcher:typeof fetch,token:string,drive:string,savedUrls:string[]=[]){
 const base=`drives/${encodeURIComponent(drive)}`;
 const driveResponse=await graphDocumentRequest(fetcher,token,`${base}?$select=id`);
 if(!driveResponse.ok||(await driveResponse.json()).id!==drive)throw new DocumentActionError(502,'Microsoft library access could not be verified.');
 const rootResponse=await graphDocumentRequest(fetcher,token,`${base}/root?$select=id,webUrl`);
 if(!rootResponse.ok)throw new DocumentActionError(502,'Microsoft library location could not be verified.');
 const root=await rootResponse.json();if(!parsed(root.webUrl))throw new DocumentActionError(502,'Microsoft library location is invalid.');
 const files=new Map<string,MicrosoftFileIdentity>(),started=Date.now();let next=`${base}/root/delta?$select=id,webUrl,file,folder,deleted,parentReference,sharepointIds&$top=200`;
 for(let page=0;page<20;page++){
  if(Date.now()-started>60000)throw new DocumentActionError(504,'Microsoft link inspection took too long. No links were repaired; retry later.');
  const response=await graphDocumentRequest(fetcher,token,next);
  if(!response.ok)throw new DocumentActionError(502,'Microsoft did not complete link inspection. No links were repaired.');
  const body=await response.json();if(!Array.isArray(body.value))throw new DocumentActionError(502,'Microsoft returned an invalid library response.');
  for(const file of body.value){if(file.deleted)files.delete(file.id);else files.set(file.id,file);}
  if(!body['@odata.nextLink']){
    const exactFiles:MicrosoftFileIdentity[]=[];const rootUrl=parsed(root.webUrl)!,rootPath=path(rootUrl)!;
    for(const savedUrl of [...new Set(savedUrls)]){
      const saved=parsed(savedUrl),savedPath=saved&&path(saved);
      if(!saved||saved.origin!==rootUrl.origin||saved.searchParams.has('sourcedoc')||!savedPath?.startsWith(rootPath+'/'))continue;
      if(Date.now()-started>60000)throw new DocumentActionError(504,'Microsoft link inspection took too long. No links were repaired.');
      const rootSegments=rootUrl.pathname.split('/').filter(Boolean).length;
      const relative=saved.pathname.split('/').filter(Boolean).slice(rootSegments).map(segment=>encodeURIComponent(decodeURIComponent(segment))).join('/');
      const exact=await graphDocumentRequest(fetcher,token,`${base}/root:/${relative}?$select=id,webUrl,file,folder,parentReference,sharepointIds`);
      if(exact.status===404)continue;
      if(!exact.ok)throw new DocumentActionError(502,'Microsoft could not verify an exact saved file path. No links were repaired.');
      exactFiles.push({...await exact.json(),resolvedUrl:savedUrl});
    }
    return {rootUrl:root.webUrl,files:[...files.values(),...exactFiles]};
  }
  const link=new URL(body['@odata.nextLink']);const allowed=[`/v1.0/drives/${drive}/root/delta`,`/v1.0/drives/${drive}/items/root/delta`];
  if(link.protocol!=='https:'||link.hostname!=='graph.microsoft.com'||link.port||!allowed.includes(decodeURIComponent(link.pathname)))throw new DocumentActionError(502,'Microsoft returned an unexpected library continuation.');
  next=link.pathname.slice('/v1.0/'.length)+link.search;
 }
 throw new DocumentActionError(409,'The Microsoft library needs a larger administrator review. No links were repaired.');
}
export async function reconcileLegacyDocuments(input:{isAdmin:boolean;documents:{id:string;web_url:string}[];inspect:()=>Promise<{rootUrl:string;files:MicrosoftFileIdentity[]}>;drive:string;confirm:(doc:{id:string;web_url:string},file:MicrosoftFileIdentity,proof:string)=>Promise<void>}){
 if(!input.isAdmin)throw new DocumentActionError(403,'Only an administrator can repair older Microsoft links.');
 if(!input.documents.length)return {repaired:0,unresolved:[] as {id:string;reason:string}[]};
 const inspected=await input.inspect();let repaired=0;const unresolved:{id:string;reason:string}[]=[];
 for(const doc of input.documents){try{const result=matchLegacyDocument(doc.web_url,input.drive,inspected.rootUrl,inspected.files);await input.confirm(doc,result.file,result.proof);repaired++;}catch(error){unresolved.push({id:doc.id,reason:error instanceof DocumentActionError?error.message:'This OfficeHub record changed during repair. Refresh and retry.'});}}
 return {repaired,unresolved};
}
