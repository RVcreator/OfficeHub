import {supabase} from './supabaseClient';
import {loadAttachmentFromStorage,dataUrlToBlob} from '../utils/attachmentStorage';
import type {MessageAttachment} from '../types';

export const CHAT_BUCKET='officehub-chat';
export const CHAT_FILE_LIMIT=10*1024*1024;
export async function uploadChatAttachments(files:MessageAttachment[],conversationId:string,userId:string):Promise<MessageAttachment[]>{
  if(files.length>10)throw new Error('Send up to 10 files at a time.');
  const blobs=await Promise.all(files.map(async file=>{
    const cached=await loadAttachmentFromStorage(file.id);
    const blob=cached?.blob||(file.url.startsWith('data:')?dataUrlToBlob(file.url):null);
    if(!blob)throw new Error(`Please attach ${file.name} again; its original file is unavailable.`);
    if(blob.size>CHAT_FILE_LIMIT)throw new Error('Each chat file must be 10 MB or smaller.');
    return blob;
  }));
  if(blobs.reduce((n,b)=>n+b.size,0)>20*1024*1024)throw new Error('Send no more than 20 MB of files at a time.');
  const uploaded:MessageAttachment[]=[];
  for(let i=0;i<files.length;i++){
    const file=files[i],path=`${conversationId}/${userId}/${crypto.randomUUID()}`;
    const {error}=await supabase.storage.from(CHAT_BUCKET).upload(path,blobs[i],{contentType:file.mimeType||blobs[i].type||'application/octet-stream',upsert:false});
    if(error)throw new Error(`Could not upload ${file.name}. Your message has not been sent; please try again.`);
    uploaded.push({id:file.id,name:file.name,size:file.size,type:file.type,url:`storage://${CHAT_BUCKET}/${path}`});
  }
  return uploaded;
}
export function chatStoragePath(url:string):string|null{
  const prefix=`storage://${CHAT_BUCKET}/`;
  return url.startsWith(prefix)?url.slice(prefix.length):null;
}
