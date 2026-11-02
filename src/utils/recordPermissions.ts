import type {Approval,Meeting,StaffUser,Task} from '../types';
import {departmentName,sameOrganisation} from './departmentDirectory';
type Member=Pick<StaffUser,'id'|'organisation'|'department'>;
export function canViewApproval(a:Approval,u:Member){return a.requestedById===u.id||Boolean(a.approverIds?.includes(u.id));}
export function canResolveApproval(a:Approval,u:Member){return Boolean(a.approverIds?.includes(u.id))&&['Pending','Under Review'].includes(a.status);}
export function canViewTask(t:Task,u:Member){
 if(t.createdById===u.id||t.assignedToId===u.id||t.assignedToIds?.includes(u.id))return true;
 if(t.assignmentType==='department'&&sameOrganisation(t.organisation,u.organisation))return (t.assignedDepartments?.length?t.assignedDepartments:[t.department]).some(d=>departmentName(d,u.organisation).toLowerCase()===departmentName(u.department,u.organisation).toLowerCase());
 if(t.assignmentType==='organization')return (t.assignedOrganisations?.length?t.assignedOrganisations:[t.organisation]).some(org=>sameOrganisation(org,u.organisation));
 return (t as Task&{accessUserId?:string}).accessUserId===u.id;
}
export function ownsTask(t:Task,u:Member){return t.createdById===u.id;}
export function canViewMeeting(m:Meeting,u:Member){return m.organizerId===u.id||m.chairId===u.id||Boolean(m.attendees?.some(a=>a.userId===u.id));}
export function canManageMeeting(m:Meeting,u:Member){return m.organizerId===u.id||m.chairId===u.id;}
