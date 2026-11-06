import {test} from 'node:test';import assert from 'node:assert/strict';
import {calendarIcs,type CalendarPayload} from '../supabase/functions/_shared/officehubCalendar';
import {graphRequest} from '../supabase/functions/_shared/officehubEmailWorker';
import {buildCalendarInvite,buildTeamsAdaptiveCard} from '../src/services/teamsSharePointService';
import {detectMeetingConflicts} from '../src/utils/meetingConflict';
import {mapMeetingRow,mapMeetingToRow} from '../src/services/supabaseMappers';
import type {Meeting,StaffUser} from '../src/types';
const meeting={id:'physical-test',title:'Planning, review',date:'2026-11-04',startTime:'10:15 AM',endTime:'11:45 AM',meetingType:'In-Person Boardroom',location:'Boardroom; first floor',organizerId:'one',organizerName:'Organizer',status:'Scheduled',attendees:[{userId:'two',name:'Invitee',status:'Pending'}]} as Meeting;
const event:CalendarPayload={version:1,id:meeting.id,title:meeting.title,description:'No online room\nAttend in person',location:meeting.location!,start:'2026-11-04T07:15:00Z',end:'2026-11-04T08:45:00Z',sequence:5,method:'REQUEST',organizerName:'Organizer'};
test('physical calendar download uses actual EAT times, venue and busy status without Teams details',()=>{
 const ics=buildCalendarInvite(meeting);assert.match(ics,/DTSTART:20261104T071500Z/);assert.match(ics,/DTEND:20261104T084500Z/);assert.match(ics,/LOCATION:Boardroom\\; first floor/);assert.match(ics,/TRANSP:OPAQUE/);assert.doesNotMatch(ics,/Teams Link|teams\.microsoft|Join URL/);
 const online=buildCalendarInvite({...meeting,meetingType:'Microsoft Teams',teamsJoinUrl:'https://teams.example.invalid/join'});assert.match(online.replace(/\r\n /g,''),/https:\/\/teams.example.invalid\/join/);
 const card=JSON.stringify(buildTeamsAdaptiveCard('meeting',meeting));assert.match(card,/Physical meeting/);assert.doesNotMatch(card,/Action.OpenUrl|Passcode|Auto-generated|teams.microsoft/);
});
test('physical invitations reserve pending attendees in OfficeHub conflict detection',(t)=>{
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-11-04T07:00:00Z')});
 const conflicts=detectMeetingConflicts(meeting.date,'10:30','11:00',['two'],[meeting],[{id:'two',name:'Invitee'} as StaffUser]);assert.equal(conflicts.length,1);
 assert.equal(detectMeetingConflicts(meeting.date,'12:00','13:00',['two'],[meeting],[]).length,0);
 assert.equal(mapMeetingRow({id:'m',meeting_type:meeting.meetingType,location:meeting.location}).location,meeting.location);assert.equal(mapMeetingToRow(meeting).location,meeting.location);
});
test('calendar requests and cancellations share a stable UID and use valid MIME through Mail.Send',()=>{
 const job={id:'11111111-2222-4333-8444-555555555555',lease_token:'lease',attempts:1,recipient_email:'test@wipahs.org',recipient_name:'Test',subject:'Physical meeting',body_text:'Attend in person',calendar_payload:event};
 const request=graphRequest(job);assert.equal(request.contentType,'text/plain');const mime=Buffer.from(request.body,'base64').toString('utf8');assert.match(mime,/text\/calendar; charset=utf-8; method=REQUEST/);assert.match(mime,/To: <test@wipahs.org>/);assert.doesNotMatch(mime,/teams.microsoft/);
 const requestIcs=calendarIcs(event,'test@wipahs.org'),cancelIcs=calendarIcs({...event,sequence:6,method:'CANCEL'},'test@wipahs.org');
 assert.equal(requestIcs.match(/UID:[^\r]+/)?.[0],cancelIcs.match(/UID:[^\r]+/)?.[0]);assert.match(cancelIcs,/METHOD:CANCEL/);assert.match(cancelIcs,/STATUS:CANCELLED/);assert.match(cancelIcs,/SEQUENCE:6/);
 assert.equal(graphRequest({...job,calendar_payload:null}).contentType,'application/json','Normal mail stays JSON');
});
test('calendar text cannot inject properties, unicode lines fold correctly and invalid recipients fail closed',()=>{
 const ics=calendarIcs({...event,title:'Name\r\nATTENDEE:evil@example.invalid',description:'مراجعة '.repeat(60)},'test@wipahs.org');assert.doesNotMatch(ics,/\r\nATTENDEE:evil/);
 assert.ok(ics.split('\r\n').every(line=>Buffer.byteLength(line,'utf8')<=75));
 assert.throws(()=>calendarIcs(event,'external@example.invalid'));assert.throws(()=>calendarIcs({...event,end:event.start},'test@wipahs.org'));
});
