import React,{useState,useEffect,useRef} from 'react';
import {FileText,Download,ExternalLink} from 'lucide-react';
import {supabase} from '../services/supabaseClient';
import {CHAT_BUCKET,chatStoragePath} from '../services/chatAttachments';
import type {MessageAttachment} from '../types';

/** Fetch with the current member's session; no public or long-lived signed links. */
export function PrivateChatAttachment({attachment}:{attachment:MessageAttachment}){
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const lock=useRef(false),urls=useRef<string[]>([]);
  useEffect(()=>()=>{urls.current.forEach(url=>URL.revokeObjectURL(url));},[]);
  const open=async(download:boolean)=>{
    if(lock.current)return;lock.current=true;setBusy(true);setError('');
    // Open synchronously so the browser does not block a delayed new tab.
    const tab=download?null:window.open('about:blank','_blank');
    if(tab)tab.opener=null;
    try{
      const path=chatStoragePath(attachment.url);if(!path)throw new Error('The file link is unavailable.');
      const {data,error}=await supabase.storage.from(CHAT_BUCKET).download(path);
      if(error||!data)throw new Error('Could not open this file. Check your connection and conversation access, then try again.');
      let url:string;
      if(!download&&['docx','xlsx'].includes(attachment.type)){
        const {parseUploadedFile,getAttachmentTabUrl}=await import('../utils/fileParser');
        const parsed=await parseUploadedFile(new File([data],attachment.name,{type:data.type}));
        url=getAttachmentTabUrl(parsed);
      }else url=URL.createObjectURL(data);
      urls.current.push(url);
      if(tab){
        // The preview has a sandboxed origin and cannot execute uploaded scripts
        // or read the portal's session, including for parsed Office documents.
        const preview=URL.createObjectURL(new Blob([`<!doctype html><html><head><title>OfficeHub file preview</title></head><body style="margin:0"><iframe sandbox style="border:0;width:100%;height:100vh" src="${url}"></iframe></body></html>`],{type:'text/html'}));
        urls.current.push(preview);tab.location.href=preview;
      }else {const a=document.createElement('a');a.href=url;a.download=attachment.name;a.click();}
    }catch(e){tab?.close();setError(e instanceof Error?e.message:'Could not open this file.');}
    finally{lock.current=false;setBusy(false);}
  };
  return <div className="rounded-lg border border-current/20 p-2 max-w-[320px]">
    <div className="flex items-center gap-2 min-w-0"><FileText className="w-5 h-5 shrink-0"/><span className="text-xs font-semibold truncate">{attachment.name}</span></div>
    <p className="text-[10px] opacity-80 mt-1">{attachment.size}</p>
    <div className="flex gap-3 mt-2 text-xs"><button type="button" disabled={busy} onClick={()=>void open(false)} className="flex items-center gap-1 hover:underline disabled:opacity-50"><ExternalLink className="w-3 h-3"/>{busy?'Opening…':'Open file'}</button><button type="button" aria-label={`Download ${attachment.name}`} disabled={busy} onClick={()=>void open(true)}><Download className="w-3.5 h-3.5"/></button></div>
    {error&&<p role="alert" className="text-xs mt-2">{error}</p>}
  </div>;
}
