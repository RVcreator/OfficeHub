import type {Meeting} from '../types';
import {getMeetingScheduledTimestamp,parseMeetingTimeOfDay} from './archiveUtils';
const EAT=3*60*60*1000;
/** New forms use the next quarter hour in Tanzania, rather than an expired fixed morning slot. */
export function newMeetingDefaults(date?:string,now=Date.now()){
 const today=new Date(now+EAT).toISOString().slice(0,10);
 if(date&&date!==today)return {date,start:'10:00',end:'11:00'};
 const next=new Date(Math.floor((now+EAT)/(15*60000))*15*60000+15*60000);
 return {date:next.toISOString().slice(0,10),start:next.toISOString().slice(11,16),end:new Date(next.getTime()+60*60000).toISOString().slice(11,16)};
}
export function newMeetingTimeError(meeting:Pick<Meeting,'date'|'startTime'|'endTime'|'time'|'durationMinutes'>,now=Date.now()):string|null{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(meeting.date)||!parseMeetingTimeOfDay(meeting.startTime||meeting.time))return 'Choose a valid meeting date and start time.';
 if(meeting.endTime&&!parseMeetingTimeOfDay(meeting.endTime))return 'Choose a valid meeting end time.';
 const end=getMeetingScheduledTimestamp({...meeting,recurrence:'None'} as Meeting);
 if(end===null)return 'Choose a valid meeting date and time.';
 if(end<=now)return 'This meeting time has already ended in Tanzania (EAT). Choose a later time or a future date.';
 const start=parseMeetingTimeOfDay(meeting.startTime||meeting.time)!;
 const beginning=Date.parse(meeting.date+'T00:00:00+03:00')+(start.hours*3600+start.minutes*60+start.seconds)*1000;
 if(end<=beginning)return 'The meeting must have a positive duration. Choose a different end time.';
 return null;
}
