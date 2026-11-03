import {test} from 'node:test';import assert from 'node:assert/strict';
import {newMeetingDefaults,newMeetingTimeError} from '../src/utils/newMeetingSchedule';
test('afternoon forms start at the next EAT quarter hour instead of an expired morning slot',()=>{
 const now=Date.parse('2026-11-03T12:07:00Z');assert.deepEqual(newMeetingDefaults(undefined,now),{date:'2026-11-03',start:'15:15',end:'16:15'});
 assert.deepEqual(newMeetingDefaults('2026-11-04',now),{date:'2026-11-04',start:'10:00',end:'11:00'});
 assert.deepEqual(newMeetingDefaults(undefined,Date.parse('2026-11-03T20:59:00Z')),{date:'2026-11-04',start:'00:00',end:'01:00'});
});
test('ended allocations get an actionable error while upcoming and ongoing allocations remain valid',()=>{
 const now=Date.parse('2026-11-03T12:07:00Z');const m={date:'2026-11-03',startTime:'10:00',endTime:'11:00',time:'10:00',durationMinutes:60};
 assert.match(newMeetingTimeError(m,now)||'',/already ended.*Tanzania/);assert.equal(newMeetingTimeError({...m,startTime:'15:00',endTime:'16:00'},now),null);
 assert.equal(newMeetingTimeError({...m,date:'2026-11-04'},now),null);assert.match(newMeetingTimeError({...m,date:'2026-02-30'},now)||'',/valid/);
 assert.match(newMeetingTimeError({...m,startTime:'16:00',endTime:'16:00'},now)||'',/positive duration/);
 assert.equal(newMeetingTimeError({...m,startTime:'23:00',endTime:'01:00'},now),null);
});
