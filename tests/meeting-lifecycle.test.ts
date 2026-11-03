import {test} from 'node:test';import assert from 'node:assert/strict';import type {Meeting} from '../src/types';
import {meetingResponseDeadline,canRespondToMeeting,isMeetingUpcoming,isMeetingDormant} from '../src/utils/meetingLifecycle';import {isMeetingArchived,TWO_DAYS_MS} from '../src/utils/archiveUtils';
const meeting={id:'lifecycle',date:'2026-11-03',startTime:'10:00 AM',endTime:'11:00 AM',status:'Scheduled',recurrence:'None'} as Meeting;
test('RSVP ends at EAT meeting end, dormant is exactly the next 48 hours, and upcoming excludes expired records',()=>{
 const end=Date.parse('2026-11-03T11:00:00+03:00');assert.equal(meetingResponseDeadline(meeting),end);
 assert.equal(canRespondToMeeting(meeting,end-1),true);assert.equal(canRespondToMeeting(meeting,end),false);assert.equal(isMeetingUpcoming(meeting,end),false);
 assert.equal(isMeetingDormant(meeting,end),true);assert.equal(isMeetingDormant(meeting,end+TWO_DAYS_MS-1),true);assert.equal(isMeetingArchived(meeting,{nowMs:end+TWO_DAYS_MS-1}),false);
 assert.equal(isMeetingDormant(meeting,end+TWO_DAYS_MS),false);assert.equal(isMeetingArchived(meeting,{nowMs:end+TWO_DAYS_MS}),true);
 assert.equal(canRespondToMeeting({...meeting,status:'Cancelled'},end-1),false);assert.equal(canRespondToMeeting({...meeting,status:'Completed'},end-1),false);
});
test('overnight allocation, missing end duration, seconds and invalid schedules use the same cutoff',()=>{
 assert.equal(meetingResponseDeadline({...meeting,startTime:'11:30 PM',endTime:'12:30 AM'}),Date.parse('2026-11-04T00:30:00+03:00'));
 assert.equal(meetingResponseDeadline({...meeting,endTime:'TBD',durationMinutes:90}),Date.parse('2026-11-03T11:30:00+03:00'));
 assert.equal(meetingResponseDeadline({...meeting,startTime:'10:00:00',endTime:'11:00:30'}),Date.parse('2026-11-03T11:00:30+03:00'));
 assert.equal(meetingResponseDeadline({...meeting,date:'2026-02-31'}),null);assert.equal(canRespondToMeeting({...meeting,startTime:'TBD',time:'TBD',endTime:'TBD'}),false);
});
