import type {StaffUser,Task} from '../types';
export function taskAssigneeIds(task:Task):string[]{const primary=!['department','organization'].includes(task.assignmentType||'')&&task.assignedToId?[task.assignedToId]:[];return [...new Set([...primary,...(task.assignedToIds||[])])];}
export function taskAssigneeChanges(ids:string[],staff:StaffUser[],creatorId:string):Partial<Task>{
 const unique=[...new Set(ids)];if(!unique.length)throw new Error('Select at least one assignee.');
 const people=unique.map(id=>staff.find(s=>s.id===id));
 if(people.some(s=>!s||s.deactivated))throw new Error('Choose active staff members from the directory.');
 const selected=people as StaffUser[],first=selected[0];
 return {assignedToId:first.id,assignedToIds:unique,assignedToName:selected.map(s=>s.name).join(', '),assignedToNames:selected.map(s=>s.name),assignedToAvatar:first.avatar||'',assignmentType:unique.length===1&&first.id===creatorId?'personal':'specific_people',assignedDepartments:[],assignedOrganisations:[],organisation:first.organisation,department:first.department,type:unique.length===1&&first.id===creatorId?'personal':'departmental'};
}
