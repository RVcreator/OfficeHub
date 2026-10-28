import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TWO_DAYS_MS,
  parseMeetingTimeOfDay,
  getMeetingScheduledTimestamp,
  isMeetingArchived,
  isUserInvolvedInMeeting,
  isMeetingVisibleInActiveSection,
} from '../src/utils/archiveUtils';
import { detectMeetingConflicts } from '../src/utils/meetingConflict';
import { mapMeetingRow, mapMeetingToRow } from '../src/services/supabaseMappers';
import { portalStore } from '../src/services/store';
import type { Meeting, StaffUser } from '../src/types';

const makeUser = (id: string, name: string, email: string, department = 'IT'): StaffUser => ({
  id,
  name,
  email,
  role: 'Staff',
  organisation: 'WIPAHS',
  department,
  status: 'Online',
  avatar: '',
  phone: '',
  activityScore: 90,
  tasksCount: 0,
  lastActive: '2026-10-27T08:00:00.000Z',
});

const ORGANIZER = makeUser('82f2bd3b-2f09-4e4a-9438-5c26e203cf30', 'Rija Virani', 'rija@wipahs.org');
const ATTENDEE = makeUser('0a9edd24-62bd-40ff-a486-fd1c95724b8e', 'Marketing Officer', 'marketing@wipahs.org', 'Marketing');
const CHAIR = makeUser('22222222-3333-4444-8555-666666666666', 'Board Chair', 'chair@wipahs.org', 'Top management');
const UNRELATED = makeUser('99999999-8888-4777-8666-555555555555', 'Finance Clerk', 'finance@wipahs.org', 'Finance');

function makeMeeting(id: string, overrides: Partial<Meeting> = {}): Meeting {
  return {
    id,
    title: `Meeting ${id}`,
    department: 'IT',
    date: '2026-10-24',
    time: '10:00',
    startTime: '10:00 AM',
    endTime: '11:00 AM',
    organizerId: ORGANIZER.id,
    organizerName: ORGANIZER.name,
    chairId: CHAIR.id,
    chairName: CHAIR.name,
    chairEmail: CHAIR.email,
    attendees: [
      { userId: ORGANIZER.id, name: ORGANIZER.name, email: ORGANIZER.email, status: 'Accepted' },
      { userId: ATTENDEE.id, name: ATTENDEE.name, email: ATTENDEE.email, status: 'Pending' },
    ],
    agenda: ['Agenda'],
    meetingType: 'Microsoft Teams',
    teamsJoinUrl: 'https://teams.microsoft.com/l/meetup-join/test',
    status: 'Scheduled',
    recurrence: 'None',
    ...overrides,
  };
}

test('parseMeetingTimeOfDay handles 12h AM/PM, 24h HH:MM(:SS), and invalid placeholders', () => {
  assert.deepEqual(parseMeetingTimeOfDay('10:00 AM'), { hours: 10, minutes: 0, seconds: 0 });
  assert.deepEqual(parseMeetingTimeOfDay('12:00 AM'), { hours: 0, minutes: 0, seconds: 0 });
  assert.deepEqual(parseMeetingTimeOfDay('12:30 PM'), { hours: 12, minutes: 30, seconds: 0 });
  assert.deepEqual(parseMeetingTimeOfDay('02:45 pm'), { hours: 14, minutes: 45, seconds: 0 });
  assert.deepEqual(parseMeetingTimeOfDay('14:15:30'), { hours: 14, minutes: 15, seconds: 30 });
  assert.equal(parseMeetingTimeOfDay('TBD'), null);
  assert.equal(parseMeetingTimeOfDay('1 Hour'), null);
  assert.equal(parseMeetingTimeOfDay(''), null);
});

test('meetings move to archive 2 days after scheduled time whether joined or not', () => {
  const nowMs = new Date(2026, 9, 27, 12, 0, 0, 0).getTime();

  const unjoinedOld = makeMeeting('unjoined-old', {
    date: '2026-10-24',
    startTime: '10:00 AM',
    endTime: '11:00 AM',
    status: 'Scheduled',
    attendees: [{ userId: ATTENDEE.id, name: ATTENDEE.name, email: ATTENDEE.email, status: 'Pending' }],
  });
  const joinedInProgressOld = makeMeeting('in-progress-old', {
    date: '2026-10-24',
    startTime: '02:00 PM',
    endTime: '03:00 PM',
    status: 'In Progress',
  });
  const completedRecentlyButScheduledOld = Object.assign(
    makeMeeting('completed-old', { date: '2026-10-24', startTime: '04:00 PM', endTime: '05:00 PM', status: 'Completed' }),
    { completedAt: new Date(2026, 9, 27, 11, 30, 0, 0).toISOString() }
  );
  const cancelledOld = makeMeeting('cancelled-old', { date: '2026-10-24', status: 'Cancelled' });

  const unjoinedYesterday = makeMeeting('unjoined-yesterday', { date: '2026-10-26', status: 'Scheduled' });
  const completedYesterday = makeMeeting('completed-yesterday', { date: '2026-10-26', status: 'Completed' });
  const upcoming = makeMeeting('upcoming', { date: '2026-10-29', status: 'Scheduled' });

  assert.equal(isMeetingArchived(unjoinedOld, { nowMs }), true);
  assert.equal(isMeetingArchived(joinedInProgressOld, { nowMs }), true);
  assert.equal(isMeetingArchived(completedRecentlyButScheduledOld, { nowMs }), true);
  assert.equal(isMeetingArchived(cancelledOld, { nowMs }), true);

  assert.equal(isMeetingArchived(unjoinedYesterday, { nowMs }), false);
  assert.equal(isMeetingArchived(completedYesterday, { nowMs }), false);
  assert.equal(isMeetingArchived(upcoming, { nowMs }), false);
});

test('48-hour boundary, overnight meetings, missing endTime, and recurrence', () => {
  const mtg = makeMeeting('boundary', { date: '2026-10-25', startTime: '10:00 AM', endTime: '11:00 AM' });
  const scheduledEndMs = getMeetingScheduledTimestamp(mtg)!;

  assert.equal(scheduledEndMs, new Date(2026, 9, 25, 11, 0, 0, 0).getTime());
  assert.equal(isMeetingArchived(mtg, { nowMs: scheduledEndMs + TWO_DAYS_MS - 1 }), false);
  assert.equal(isMeetingArchived(mtg, { nowMs: scheduledEndMs + TWO_DAYS_MS }), true);

  const overnight = makeMeeting('overnight', { date: '2026-10-25', startTime: '11:30 PM', endTime: '12:30 AM' });
  assert.equal(getMeetingScheduledTimestamp(overnight), new Date(2026, 9, 26, 0, 30, 0, 0).getTime());

  const placeholderEnd = makeMeeting('placeholder', { date: '2026-10-24', startTime: '09:15 AM', endTime: 'TBD' });
  assert.equal(getMeetingScheduledTimestamp(placeholderEnd), new Date(2026, 9, 24, 9, 15, 0, 0).getTime());

  const nowMs = new Date(2026, 9, 27, 12, 0, 0, 0).getTime();
  const weeklySingle = makeMeeting('weekly', { date: '2026-10-24', recurrence: 'Weekly' });
  assert.equal(isMeetingArchived(weeklySingle, { nowMs }), true);

  const weeklyFutureSeries = Object.assign(makeMeeting('weekly-series', { date: '2026-10-24', recurrence: 'Weekly' }), {
    recurrenceEndDate: '2026-11-15',
  });
  assert.equal(isMeetingArchived(weeklyFutureSeries, { nowMs }), false);
});

test('archived meetings disappear from active Meeting section and appear in Personal Archive', () => {
  const nowMs = new Date(2026, 9, 27, 15, 0, 0, 0).getTime();
  const oldUnjoined = makeMeeting('old-unjoined', { date: '2026-10-24', status: 'Scheduled' });
  const oldJoined = makeMeeting('old-joined', { date: '2026-10-25', startTime: '01:00 PM', endTime: '02:00 PM', status: 'Completed' });
  const recentUnjoined = makeMeeting('recent-unjoined', { date: '2026-10-26', startTime: '03:00 PM', endTime: '04:00 PM', status: 'Scheduled' });
  const futureScheduled = makeMeeting('future-scheduled', { date: '2026-10-28', status: 'Scheduled' });
  const all = [oldUnjoined, oldJoined, recentUnjoined, futureScheduled];

  for (const user of [ORGANIZER, ATTENDEE, CHAIR]) {
    assert.deepEqual(
      all.filter((m) => isMeetingVisibleInActiveSection(m, user, { nowMs })).map((m) => m.id),
      ['recent-unjoined', 'future-scheduled']
    );
    assert.deepEqual(
      portalStore.getUserArchive(user.id, [], all, { nowMs }).meetings.map((m) => m.id),
      ['old-unjoined', 'old-joined']
    );
  }

  assert.equal(all.filter((m) => isMeetingVisibleInActiveSection(m, UNRELATED, { nowMs })).length, 0);
  assert.equal(portalStore.getUserArchive(UNRELATED.id, [], all, { nowMs }).meetings.length, 0);

  const emailOnly = makeMeeting('email-invite', {
    date: '2026-10-20',
    organizerId: ORGANIZER.id,
    chairId: ORGANIZER.id,
    chairEmail: ORGANIZER.email,
    attendees: [{ userId: '', name: 'Marketing', email: 'MARKETING@wipahs.org', status: 'Pending' }],
  });
  assert.equal(isUserInvolvedInMeeting(emailOnly, ATTENDEE), true);
  assert.equal(isMeetingVisibleInActiveSection(emailOnly, ATTENDEE, { nowMs }), false);
});

test('conflict detector skips archived meetings and Supabase mapper preserves time fields', () => {
  const archived = makeMeeting('conflict-archived', { date: '2020-01-10', startTime: '10:00 AM', endTime: '11:00 AM', status: 'Scheduled' });
  assert.deepEqual(
    detectMeetingConflicts('2020-01-10', '10:15 AM', '10:45 AM', [ORGANIZER.id, ATTENDEE.id], [archived], [ORGANIZER, ATTENDEE]),
    []
  );

  const row = mapMeetingToRow(makeMeeting('map-1', { time: '14:30', startTime: '02:30 PM', endTime: '03:30 PM' }));
  const mapped = mapMeetingRow(row, []);
  assert.equal(mapped.time, '14:30');
  assert.equal(mapped.startTime, '02:30 PM');
  assert.equal(mapped.endTime, '03:30 PM');
});
