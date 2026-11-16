import React,{useRef,useState} from 'react';
import {Loader2,Paperclip,Plus,Trash2,Users,X} from 'lucide-react';
import type {MessageAttachment,Priority,StaffUser,Task} from '../types';
import {StaffPickerTree} from './StaffPickerTree';
import {ownsTask} from '../utils/recordPermissions';
import {parseUploadedFile} from '../utils/fileParser';
import {taskAssigneeIds,taskAssigneeChanges} from '../services/taskEditing';

const field='w-full px-3 py-2 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-1 focus:ring-[#00ad1d] text-xs text-slate-900';
export function TaskEditor({task,staff,currentUser,onSave,onCancel,onBusyChange}:{task:Task;staff:StaffUser[];currentUser:StaffUser;onSave:(updates:Partial<Task>)=>Promise<void>;onCancel:()=>void;onBusyChange:(busy:boolean)=>void}){
 const [title,setTitle]=useState(task.title),[description,setDescription]=useState(task.description||''),[priority,setPriority]=useState<Priority>(task.priority),[dueDate,setDueDate]=useState(task.dueDate||'');
 const [attachments,setAttachments]=useState<MessageAttachment[]>(task.attachments||[]),[filesChanged,setFilesChanged]=useState(false);
 const [ids,setIds]=useState(()=>taskAssigneeIds(task));
 const [choosePeople,setChoosePeople]=useState(!['department','organization'].includes(task.assignmentType||''));
 const [assignmentChanged,setAssignmentChanged]=useState(false),[error,setError]=useState<string|null>(null),[saving,setSaving]=useState(false),[preparing,setPreparing]=useState(false);
 const inFlight=useRef(false);const canAssign=ownsTask(task,currentUser);
 const assigneeName=(id:string)=>staff.find(s=>s.id===id)?.name||(id===task.assignedToId?task.assignedToName:'Unavailable staff member');
 const selectIds=(next:string[])=>{if(inFlight.current)return;setIds(next);setAssignmentChanged(true);};
 const addFiles=async(e:React.ChangeEvent<HTMLInputElement>)=>{
  const input=e.currentTarget,files=Array.from(input.files||[]);input.value='';if(!files.length||inFlight.current)return;
  if(attachments.length+files.length>10){setError('Attach up to 10 files.');return;}
  if(files.some(f=>f.size>10*1024*1024)||files.reduce((n,f)=>n+f.size,0)>20*1024*1024){setError('Each file must be 10 MB or smaller; add no more than 20 MB at a time.');return;}
  inFlight.current=true;setPreparing(true);onBusyChange(true);setError(null);
  try{const added:MessageAttachment[]=[];for(const file of files)added.push(await parseUploadedFile(file));setAttachments(previous=>[...previous,...added]);setFilesChanged(true);}
  catch(e){setError(e instanceof Error?e.message:'The files could not be prepared. Choose them again.');}
  finally{inFlight.current=false;setPreparing(false);onBusyChange(false);}
 };
 const save=async(e:React.FormEvent)=>{
  e.preventDefault();if(inFlight.current)return;setError(null);
  if(!title.trim()||!dueDate){setError('Enter a task title and due date.');return;}
  let updates:Partial<Task>={title:title.trim(),description:description.trim(),priority,dueDate};
  try{if(canAssign&&assignmentChanged&&choosePeople)updates={...updates,...taskAssigneeChanges(ids,staff,task.createdById)};}catch(e){setError((e as Error).message);return;}
  if(filesChanged)updates.attachments=attachments;
  inFlight.current=true;setSaving(true);onBusyChange(true);
  try{await onSave(updates);}catch(e){setError(e instanceof Error?e.message:'Changes were not saved. Please try again.');}
  finally{inFlight.current=false;setSaving(false);onBusyChange(false);}
 };
 return <form aria-label="Edit task" onSubmit={save} className="p-5 overflow-y-auto space-y-4 text-xs flex-1 bg-slate-50/50">
  <div className="p-3 bg-teal-50 border border-teal-200 rounded-lg"><p className="font-bold text-teal-900">Editing Task Details</p><p className="text-[11px] text-teal-700 mt-0.5">Changes are saved together when you select Save Changes.</p></div>
  <fieldset disabled={saving||preparing} className="space-y-4 min-w-0">
   <label className="font-bold text-slate-700 block">Task Title *<input required value={title} onChange={e=>setTitle(e.target.value)} className={field+' mt-1 font-semibold'}/></label>
   <label className="font-bold text-slate-700 block">Description<textarea aria-label="Description" rows={3} value={description} onChange={e=>setDescription(e.target.value)} className={field+' mt-1 font-normal'}/></label>
   <div className="grid grid-cols-2 gap-3"><label className="font-bold text-slate-700">Priority<select aria-label="Priority" value={priority} onChange={e=>setPriority(e.target.value as Priority)} className={field+' mt-1'}>{['Urgent','High','Medium','Low'].map(v=><option key={v}>{v}</option>)}</select></label><label className="font-bold text-slate-700">Due Date *<input required type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)} className={field+' mt-1'}/></label></div>
   <section aria-label="Task assignees" className="space-y-2">
    <h3 className="font-bold text-slate-700 flex items-center gap-1.5"><Users className="w-4 h-4 text-emerald-600"/>Assignees</h3>
    {canAssign?<>
     {['department','organization'].includes(task.assignmentType||'')&&<label className="block text-slate-600">Assignment<select aria-label="Assignment audience" className={field+' mt-1'} value={choosePeople?'people':'keep'} onChange={e=>{setChoosePeople(e.target.value==='people');setAssignmentChanged(e.target.value==='people');}}><option value="keep">Keep current {task.assignmentType==='department'?'department':'organisation'} assignment</option><option value="people">Choose individual assignees</option></select></label>}
     {choosePeople&&<><p className="text-[11px] text-slate-500">Select one or more people. Remove a selection to unassign them.</p><div inert={saving||preparing}><StaffPickerTree mode="multiple" staff={staff.filter(s=>!s.deactivated||ids.includes(s.id))} selectedUserIds={ids} onChange={selectIds}/></div><div className="flex flex-wrap gap-1.5">{ids.map(id=><span key={id} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-900"><span>{assigneeName(id)}</span><button type="button" aria-label={'Remove assignee '+(assigneeName(id))} onClick={()=>selectIds(ids.filter(value=>value!==id))} className="p-1 hover:bg-emerald-100 rounded"><X className="w-3 h-3"/></button></span>)}</div><p className="text-[11px] text-slate-500">{ids.length} selected · At least one assignee is required.</p></>}
    </>:<p className="text-slate-500">{task.assignedToName||'Assigned team'}. Only the task creator can change assignees.</p>}
   </section>
   <section aria-label="Task attachments" className="space-y-2">
    <div className="flex items-center justify-between gap-2"><h3 className="font-bold text-slate-700 flex items-center gap-1.5"><Paperclip className="w-4 h-4 text-emerald-600"/>Attachments ({attachments.length})</h3><label className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-[#008f18] rounded border border-emerald-200 cursor-pointer font-semibold"><Plus className="w-3 h-3"/>Add files<input aria-label="Add task attachments" type="file" multiple onChange={addFiles} className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.webp,.svg,.gif"/></label></div>
    {attachments.map(file=><div key={file.id} className="flex items-center justify-between gap-3 p-2.5 rounded-lg border border-slate-200 bg-white"><span className="min-w-0 truncate font-medium text-slate-800" title={file.name}>{file.name}</span><button type="button" aria-label={'Remove attachment '+file.name} onClick={()=>{setAttachments(previous=>previous.filter(a=>a.id!==file.id));setFilesChanged(true);}} className="p-2 shrink-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition"><Trash2 className="w-3.5 h-3.5"/></button></div>)}
    {!attachments.length&&<p className="text-slate-400 italic">No documents attached.</p>}<p className="text-[11px] text-slate-500">Up to 10 files · 10 MB per file</p>
   </section>
  </fieldset>
  {preparing&&<p role="status" className="text-emerald-800 flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin"/>Preparing files…</p>}
  {error&&<p role="alert" className="p-3 rounded-lg border border-rose-200 bg-rose-50 text-rose-800">{error} Your draft is still here.</p>}
  <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200"><button type="button" disabled={saving||preparing} onClick={onCancel} className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-600 border border-slate-300 rounded text-xs font-medium disabled:opacity-50">Cancel</button><button type="submit" disabled={saving||preparing} className="px-4 py-2 bg-[#00ad1d] hover:bg-[#008f18] text-white rounded text-xs font-bold shadow-2xs disabled:opacity-60 flex items-center gap-1.5">{saving&&<Loader2 className="w-3.5 h-3.5 animate-spin"/>}{saving?'Saving…':'Save Changes'}</button></div>
 </form>;
}
