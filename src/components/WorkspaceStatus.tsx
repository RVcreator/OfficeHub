import React from 'react';
import {usePortalStore} from '../services/store';
/** Loading announcements have a stable one-line slot, independent of the shell. */
export function WorkspaceStatus(){
 const {startupSections,notificationError,actions}=usePortalStore(['startupSections','notificationError']);
 const pending=Object.entries(startupSections).filter(([,state])=>state==='loading').map(([name])=>name);
 const failed=Object.entries(startupSections).filter(([,state])=>state==='error').map(([name])=>name);
 const message=pending.length?`Loading ${pending.join(', ')}… You can continue using OfficeHub.`:'';
 return <>
  {notificationError&&<div role="alert" className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900">{notificationError}</div>}
  <div className="h-5 mb-3 text-xs text-slate-500"><p role="status" className="truncate" title={message}>{message}</p></div>
  {failed.length>0&&<div role="alert" className="mb-3 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Could not load {failed.join(', ')}. Check your connection. <button onClick={()=>void actions.retryStartupSections()} className="font-semibold underline">Retry workspace data</button></div>}
 </>;
}
