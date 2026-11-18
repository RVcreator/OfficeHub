import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Meeting} from '../src/types';
import {meetingOccursOn,meetingsOnDate,nextMeetingDate} from '../src/utils/meetingRecurrence';
import {canRespondToMeeting,isMeetingDormant,canEditMeetingSchedule} from '../src/utils/meetingLifecycle';
import {isMeetingArchived} from '../src/utils/archiveUtils';
import {buildCalendarInvite} from '../src/services/teamsSharePointService';
import {calendarIcs} from '../supabase/functions/_shared/officehubCalendar';
import {graphRecurrence,sameRecurrence} from '../supabase/functions/_shared/meetingRecurrence';
const meeting={id:'series',title:'Planning',organizerName:'Fixture',date:'2026-01-31',time:'10:00',endTime:'11:00',status:'Scheduled',recurrence:'Monthly',attendees:[]} as Meeting;
test('visible calendar days expand daily, weekly and monthly series without changing saved IDs or dates',()=>{
 assert.equal(meetingOccursOn(meeting,'2026-02-28'),false);
 assert.equal(meetingOccursOn(meeting,'2026-03-31'),true);
 assert.equal(nextMeetingDate(meeting,'2026-02-01'),'2026-03-31');
 assert.equal(meetingOccursOn({...meeting,recurrence:'Daily'},'2027-01-01'),true);
 assert.equal(meetingOccursOn({...meeting,recurrence:'Weekly'},'2026-02-07'),true);
 assert.equal(meetingOccursOn({...meeting,recurrence:'Weekly'},'2026-02-08'),false);
 assert.equal(meetingOccursOn(meeting,'2025-12-31'),false);
 assert.equal(meetingOccursOn({...meeting,date:'2026-02-31'},'2026-03-31'),false);
 assert.equal(meetingsOnDate([meeting],'2026-03-31')[0],meeting);
});
test('active series remain editable and responsive years after their anchor; cancelled/completed and single meetings keep their cutoff',()=>{
 const now=Date.parse('2028-06-15T12:00:00+03:00');
 for(const recurrence of ['Daily','Weekly','Monthly'] as const){
  const m={...meeting,recurrence};assert.equal(isMeetingArchived(m,{nowMs:now}),false);assert.equal(isMeetingDormant(m,now),false);assert.equal(canRespondToMeeting(m,now),true);assert.equal(canEditMeetingSchedule(m,now),true);
 }
 for(const status of ['Cancelled','Completed']){const m={...meeting,status} as Meeting;assert.equal(canRespondToMeeting(m,now),false);assert.equal(canEditMeetingSchedule(m,now),false);assert.equal(isMeetingArchived(m,{nowMs:now}),true);}
 assert.equal(isMeetingArchived({...meeting,recurrence:'None'},{nowMs:now}),true);
});
test('downloaded calendar rules and Graph patterns retain EAT day across UTC midnight and are removed when recurrence is disabled',()=>{
 for(const recurrence of ['Daily','Weekly','Monthly'] as const){assert.match(buildCalendarInvite({...meeting,recurrence}),new RegExp('RRULE:FREQ='+recurrence.toUpperCase()));}
 assert.doesNotMatch(buildCalendarInvite({...meeting,recurrence:'None'}),/RRULE/);
 const start='2026-11-17T22:00:00Z';const rule=graphRecurrence('Weekly',start)!;
 assert.deepEqual(rule.pattern.daysOfWeek,['wednesday']);assert.equal(rule.range.startDate,'2026-11-18');assert.equal(sameRecurrence({...rule,pattern:{...rule.pattern,daysOfWeek:['Wednesday']}},rule),true);
 assert.equal(sameRecurrence(null,rule),false);assert.equal(graphRecurrence('None',start),null);assert.throws(()=>graphRecurrence('Yearly',start));
 const ics=calendarIcs({version:1,id:'series',title:'Weekly',description:'Repeats weekly',location:'Office',start,end:'2026-11-17T23:00:00Z',sequence:2,method:'CANCEL',organizerName:'Fixture',recurrence:'Weekly'});
 assert.match(ics,/METHOD:CANCEL/);assert.match(ics,/RRULE:FREQ=WEEKLY/);
 assert.match(ics,/DTSTART;TZID=Africa\/Dar_es_Salaam:20261118T010000/);
 assert.match(ics,/TZOFFSETTO:\+0300/);
});
