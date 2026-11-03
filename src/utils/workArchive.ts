import type {Approval,Decision,Notice} from '../types';
export const TWO_WEEKS_MS=14*24*60*60*1000;
export function workArchiveDeadline(timestamp?:string):number|null{
 if(!timestamp)return null;
 // Only accept an explicit timezone (or a legacy date-only value in EAT).
 const value=/^\d{4}-\d{2}-\d{2}$/.test(timestamp)?timestamp+'T00:00:00+03:00':timestamp;
 if(!/(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(value))return null;
 const time=Date.parse(value);return Number.isFinite(time)?time+TWO_WEEKS_MS:null;
}
export function isApprovalArchived(record:Approval,nowMs=Date.now()):boolean{
 const deadline=workArchiveDeadline(record.archiveReadyAt);
 return record.status==='Approved'&&deadline!==null&&nowMs>=deadline;
}
export function isDecisionArchived(record:Decision,nowMs=Date.now()):boolean{
 const deadline=workArchiveDeadline(record.archiveReadyAt);
 return ['Approved','Adopted','Implemented'].includes(record.status)&&deadline!==null&&nowMs>=deadline;
}
export function isNoticeArchived(record:Notice,userId:string,nowMs=Date.now()):boolean{
 const deadline=workArchiveDeadline(record.acknowledgedAtBy?.[userId]);
 return Boolean(userId)&&record.acknowledgedBy.includes(userId)&&deadline!==null&&nowMs>=deadline;
}
