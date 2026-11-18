import type {Meeting} from '../types';

const dayMs=86400000;
export function isRecurringMeeting(meeting:Pick<Meeting,'recurrence'|'status'>):boolean {
  return ['Daily','Weekly','Monthly'].includes(meeting.recurrence||'') && !['Cancelled','Completed'].includes(meeting.status);
}
export function meetingOccursOn(meeting:Pick<Meeting,'date'|'recurrence'>,date:string):boolean {
  const start=Date.parse(meeting.date+'T00:00:00Z'),target=Date.parse(date+'T00:00:00Z');
  if(!Number.isFinite(start)||!Number.isFinite(target)||new Date(start).toISOString().slice(0,10)!==meeting.date||new Date(target).toISOString().slice(0,10)!==date||target<start)return false;
  const days=(target-start)/dayMs;
  if(meeting.recurrence==='Daily')return true;
  if(meeting.recurrence==='Weekly')return days%7===0;
  if(meeting.recurrence==='Monthly')return date.slice(8)===meeting.date.slice(8);
  return date===meeting.date;
}
/** The calendar expands only visible days; the saved series and attendee IDs stay unchanged. */
export function meetingsOnDate(meetings:Meeting[],date:string):Meeting[]{
  return meetings.filter(m=>meetingOccursOn(m,date));
}
export function nextMeetingDate(meeting:Pick<Meeting,'date'|'recurrence'>,fromDate:string):string|null {
  const from=Date.parse(fromDate+'T00:00:00Z'),anchor=Date.parse(meeting.date+'T00:00:00Z');
  if(!Number.isFinite(from)||!Number.isFinite(anchor))return null;
  for(let i=0;i<=366;i++){
    const date=new Date(Math.max(from,anchor)+i*dayMs).toISOString().slice(0,10);
    if(meetingOccursOn(meeting,date))return date;
  }
  return null;
}
