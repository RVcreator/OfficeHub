import {isRecurringMeeting,nextMeetingDate} from './meetingRecurrence';
import type {Meeting} from '../types';
import {getMeetingScheduledTimestamp,isMeetingArchived} from './archiveUtils';
export function meetingResponseDeadline(meeting:Meeting,nowMs=Date.now()):number|null{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(meeting.date||''))return null;
 if(isRecurringMeeting(meeting)){
  const today=new Date(nowMs+10800000).toISOString().slice(0,10);
  let date=nextMeetingDate(meeting,today);
  if(!date)return null;
  let end=getMeetingScheduledTimestamp({...meeting,date,recurrence:'None'});
  if(end!==null&&end<=nowMs){date=nextMeetingDate(meeting,new Date(Date.parse(date+'T00:00:00Z')+86400000).toISOString().slice(0,10));end=date?getMeetingScheduledTimestamp({...meeting,date,recurrence:'None'}):null;}
  return end;
 }
 return getMeetingScheduledTimestamp({...meeting,recurrence:'None'});
}
export function canRespondToMeeting(meeting:Meeting,nowMs=Date.now()):boolean{
 const end=meetingResponseDeadline(meeting,nowMs);
 return end!==null&&nowMs<end&&!['Cancelled','Completed'].includes(meeting.status);
}
export function isMeetingUpcoming(meeting:Meeting,nowMs=Date.now()):boolean{return canRespondToMeeting(meeting,nowMs);}
export function isMeetingDormant(meeting:Meeting,nowMs=Date.now()):boolean{
 const end=meetingResponseDeadline(meeting,nowMs);return end!==null&&nowMs>=end&&!isMeetingArchived(meeting,{nowMs});
}

export function canEditMeetingSchedule(meeting:Meeting,nowMs=Date.now()):boolean{
 const end=meetingResponseDeadline(meeting,nowMs);return !['Cancelled','Completed'].includes(meeting.status)&&(end===null||nowMs<end);
}
