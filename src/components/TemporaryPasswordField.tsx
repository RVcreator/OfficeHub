import React,{useEffect,useRef,useState} from 'react';
import {CheckCircle2,Copy} from 'lucide-react';

/** Never report a successful credential handoff before the clipboard confirms it. */
export function TemporaryPasswordField({password}:{password:string}) {
 const [copied,setCopied]=useState(false),[copying,setCopying]=useState(false),[error,setError]=useState(false);
 const generation=useRef(0);
 useEffect(()=>{generation.current++;setCopied(false);setCopying(false);setError(false);return ()=>{generation.current++;};},[password]);
 useEffect(()=>{if(!copied)return;const timer=setTimeout(()=>setCopied(false),2000);return ()=>clearTimeout(timer);},[copied]);
 const copy=async()=>{
  const current=generation.current;setCopied(false);setCopying(true);setError(false);
  try {await navigator.clipboard.writeText(password);if(current===generation.current)setCopied(true);}
  catch {if(current===generation.current)setError(true);}
  finally {if(current===generation.current)setCopying(false);}
 };
 return <div className="space-y-2">
  <label className="block text-xs font-medium text-slate-700" htmlFor="issued-temporary-password">Temporary password</label>
  <div className="p-3 bg-slate-50 border border-slate-200 rounded-md flex min-w-0 items-center gap-2">
   <input id="issued-temporary-password" type="text" readOnly value={password} autoComplete="off" spellCheck={false} onFocus={event=>event.currentTarget.select()} className="min-w-0 flex-1 bg-transparent text-sm font-bold text-slate-800 font-mono" />
   <button type="button" disabled={copying} onClick={copy} className="inline-flex shrink-0 items-center gap-1 text-xs px-2.5 py-1 bg-white border border-slate-200 rounded font-medium disabled:opacity-60">
    {copied?<CheckCircle2 className="w-3.5 h-3.5 text-emerald-600"/>:<Copy className="w-3.5 h-3.5 text-slate-500"/>}
    <span>{copied?'Copied':copying?'Copying…':'Copy'}</span>
   </button>
  </div>
  {error&&<p role="alert" className="text-xs text-amber-800">Copy failed. Select the temporary password above and copy it manually.</p>}
 </div>;
}
