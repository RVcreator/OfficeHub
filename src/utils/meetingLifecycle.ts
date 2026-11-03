import type {Meeting} from '../types';
import {getMeetingScheduledTimestamp,isMeetingArchived} from './archiveUtils';
export function meetingResponseDeadline(meeting:Meeting):number|null{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(meeting.date||''))return null;
 return getMeetingScheduledTimestamp({...meeting,recurrence:'None'});
}
export function canRespondToMeeting(meeting:Meeting,nowMs=Date.now()):boolean{
 const end=meetingResponseDeadline(meeting);
 return end!==null&&nowMs<end&&!['Cancelled','Completed'].includes(meeting.status);
}
export function isMeetingUpcoming(meeting:Meeting,nowMs=Date.now()):boolean{return canRespondToMeeting(meeting,nowMs);}
export function isMeetingDormant(meeting:Meeting,nowMs=Date.now()):boolean{
 const end=meetingResponseDeadline(meeting);return end!==null&&nowMs>=end&&!isMeetingArchived(meeting,{nowMs});
}

export function canEditMeetingSchedule(meeting:Meeting,nowMs=Date.now()):boolean{
 const end=meetingResponseDeadline(meeting);return !['Cancelled','Completed'].includes(meeting.status)&&(end===null||nowMs<end);
}
