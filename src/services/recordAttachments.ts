import {supabase} from './supabaseClient';
import {loadAttachmentFromStorage,dataUrlToBlob} from '../utils/attachmentStorage';
import type {MessageAttachment} from '../types';
export const RECORD_BUCKET='officehub-records';
export type RecordFileKind='task'|'approval'|'meeting'|'notice';
type FileInput=Omit<MessageAttachment,'id'>&{id?:string};
export function recordFilePath(url:string):string|null{
 const prefix=`storage://${RECORD_BUCKET}/`;return url.startsWith(prefix)?url.slice(prefix.length):null;
}
export function isMicrosoftFileLink(url:string):boolean{
 try{const u=new URL(url);return u.protocol==='https:'&&u.hostname==='wipahstz.sharepoint.com'&&!u.username&&!u.password;}catch{return false;}
}
/** Persist original bytes before publishing a record, never a browser-only blob URL. */
export async function uploadRecordAttachments(files:FileInput[],kind:RecordFileKind,recordId:string,userId:string):Promise<MessageAttachment[]>{
 if(files.length>10)throw new Error('Attach up to 10 files.');
 if(!/^[A-Za-z0-9_-]+$/.test(recordId))throw new Error('A valid record is required.');
 const staged=await Promise.all(files.map(async file=>{
  const path=recordFilePath(file.url);
  if(path){if(!path.startsWith(`${kind}/${recordId}/`))throw new Error('This attachment belongs to another record.');return {file};}
  if(isMicrosoftFileLink(file.url))return {file};
  const cached=file.id?await loadAttachmentFromStorage(file.id):null;
  const blob=cached?.blob||(file.url.startsWith('data:')?dataUrlToBlob(file.url):null);
  if(!blob)throw new Error(`Please attach ${file.name} again; its original file was not saved.`);
  if(blob.size>10*1024*1024)throw new Error('Each attachment must be 10 MB or smaller.');
  return {file,blob};
 }));
 if(staged.reduce((n,x)=>n+(x.blob?.size||0),0)>20*1024*1024)throw new Error('Attach no more than 20 MB at a time.');
 const result:MessageAttachment[]=new Array(staged.length);
 let next=0,failed=false;
 let failure:unknown;
 // Bound network pressure while independent files upload together. Drain every
 // started upload on failure before allowing a retry or publishing metadata.
 async function worker(){while(!failed&&next<staged.length){
  const index=next++,{file,blob}=staged[index];
  try{
  let url=file.url;
  if(blob){
   const path=`${kind}/${recordId}/${userId}/${crypto.randomUUID()}`;
   const {error}=await supabase.storage.from(RECORD_BUCKET).upload(path,blob,{contentType:file.mimeType||blob.type||'application/octet-stream',upsert:false});
   if(error)throw new Error(`Could not upload ${file.name}. The record has not been saved; please try again.`);
   url=`storage://${RECORD_BUCKET}/${path}`;
  }
  result[index]={id:file.id||crypto.randomUUID(),name:file.name,size:file.size,type:file.type,url};
  }catch(error){if(!failed){failure=error;failed=true;}}
 }}
 await Promise.all(Array.from({length:Math.min(3,staged.length)},()=>worker()));
 if(failed)throw failure;
 return result;
}
