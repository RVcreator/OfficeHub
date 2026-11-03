import React from 'react';
import type {Approval,Decision,Notice} from '../types';

export function ArchivedWorkRecords({approvals,decisions,notices,kind}:{approvals:Approval[];decisions:Decision[];notices:Notice[];kind:string}){
 const sections=[
  {key:'approvals',label:'Approvals',rows:approvals.map(a=>({id:a.id,title:a.title,status:a.status,body:a.description,detail:`Requested by ${a.requestedByName||a.requestedBy}. Approved by ${a.approvedBy||'selected approver'}.`,date:a.archiveReadyAt,notes:a.notes,files:a.attachments?.map(f=>f.name)}))},
  {key:'decisions',label:'Decisions',rows:decisions.map(d=>({id:d.id,title:d.title,status:d.status,body:d.summary,detail:`Recorded by ${d.decidedBy} · ${d.department}`,date:d.archiveReadyAt,notes:undefined,files:undefined}))},
  {key:'notices',label:'Notices',rows:notices.map(n=>({id:n.id,title:n.title,status:'Acknowledged',body:n.content,detail:`From ${n.authorName} · ${n.department}`,date:undefined,notes:undefined,files:n.attachments?.map(f=>f.name)}))}
 ];
 return <>{sections.filter(s=>(kind==='all'||kind===s.key)&&s.rows.length>0).map(section=><section key={section.key} className="space-y-2" aria-label={`Archived ${section.label}`}>
  <h4 className="sticky top-0 z-10 rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-bold text-slate-800">Archived {section.label} ({section.rows.length})</h4>
  {section.rows.map(record=><details key={record.id} className="rounded-lg border border-slate-200 bg-white p-3.5 text-xs" data-archived-work-id={record.id}>
   <summary className="cursor-pointer font-semibold text-slate-900"><span>{record.title}</span><span className="ml-3 rounded bg-emerald-50 px-2 py-1 text-[10px] text-emerald-800">{record.status}</span></summary>
   <div className="mt-3 space-y-2"><p className="whitespace-pre-wrap break-words text-slate-700">{record.body}</p><p className="text-slate-500">{record.detail}</p>
    {record.date&&<p className="text-slate-500">Approved / completed: {new Date(record.date).toLocaleString('en-GB',{timeZone:'Africa/Dar_es_Salaam'})} EAT</p>}
    {record.notes&&<p className="whitespace-pre-wrap text-slate-600">Notes: {record.notes}</p>}
    {record.files&&record.files.length>0&&<p className="text-slate-500">Attachments retained: {record.files.join(', ')}</p>}
   </div>
  </details>)}
 </section>)}</>;
}
