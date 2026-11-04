import React,{useEffect,useState} from 'react';
import {usePortalStore} from '../services/store';
import {canManageAdministration} from '../services/administrationAccess';
export function AdministrationAccessPanel(){
 const {administrationAccess,administrationGrants,staff,currentUser,actions}=usePortalStore(['administrationAccess','administrationGrants','staff','currentUser']);
 const allowed=canManageAdministration(administrationAccess,currentUser.id);
 const [selected,setSelected]=useState(''),[saving,setSaving]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{if(allowed)void actions.getAdministrationGrants().catch(error=>setMessage(error.message));},[allowed,actions]);
 const assign=async(userId:string,enabled:boolean)=>{
  if(!allowed||saving||!userId)return;setSaving(true);setMessage('');
  try{await actions.setAdministrationGrant(userId,enabled);setSelected('');setMessage(enabled?'Administration viewing access granted.':'Administration viewing access removed.');}
  catch(error){setMessage(error instanceof Error?error.message:'The assignment could not be saved.');}finally{setSaving(false);}
 };
 if(!allowed)return null;
 const choices=staff.filter(person=>!person.deactivated&&!administrationGrants.some(grant=>grant.user_id===person.id));
 return <section aria-label="Administration access" className="bg-white rounded-lg border border-slate-200 p-4 sm:p-5 space-y-4">
  <div><h2 className="text-base font-bold text-slate-900">Administration access</h2><p className="text-xs text-slate-500 mt-1">Top management has automatic access. Add other people below to let them view administrative pages. Account, role and access changes stay with access managers.</p></div>
  {message&&<p role="status" className="text-sm text-slate-700">{message}</p>}
  <div className="flex flex-col sm:flex-row gap-2"><label className="flex-1 min-w-0 text-xs font-semibold text-slate-700">Staff member<select aria-label="Staff member for administration access" value={selected} onChange={event=>setSelected(event.target.value)} disabled={saving} className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 bg-white text-xs"><option value="">Choose a staff member</option>{choices.map(person=><option key={person.id} value={person.id}>{person.name} — {person.organisation} · {person.department}</option>)}</select></label><button type="button" disabled={saving||!selected} onClick={()=>void assign(selected,true)} className="sm:self-end px-3 py-2 rounded-md bg-[#00ad1d] text-white text-xs font-semibold disabled:opacity-50">{saving?'Saving…':'Grant Administration view'}</button></div>
  <ul className="divide-y divide-slate-100">{administrationGrants.map(grant=>{const person=staff.find(member=>member.id===grant.user_id);return <li key={grant.user_id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-xs"><div><p className="font-semibold text-slate-800">{person?.name||'Staff member'}</p><p className="text-slate-500 mt-0.5">{grant.automatic?'Top management — automatic':grant.can_manage?'Access manager':grant.active===false?'View Administration — inactive account':'View Administration'}</p></div>{!grant.automatic&&!grant.can_manage&&<button type="button" disabled={saving} onClick={()=>void assign(grant.user_id,false)} className="px-3 py-1.5 rounded-md border border-slate-200 text-rose-700">Remove access</button>}</li>;})}</ul>
 </section>;
}
