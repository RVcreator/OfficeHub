import { Task, Meeting } from '../types';

export const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

export interface ArchiveCheckOptions {
  nowMs?: number;
}

function resolveNowMs(options?: ArchiveCheckOptions): number {
  if (options && typeof options === 'object' && typeof options.nowMs === 'number' && Number.isFinite(options.nowMs)) {
    return options.nowMs;
  }
  return Date.now();
}

/**
 * Shared archive check for tasks.
 * A task qualifies for archive (and must be excluded from all main task views) once:
 * status is 'Done' or 'Cancelled' AND completedAt/cancelledAt is more than 2 days in the past.
 */
export function isTaskArchived(
  task: Task & { completedAt?: string; cancelledAt?: string },
  options?: ArchiveCheckOptions
): boolean {
  if (!task || (task.status !== 'Done' && task.status !== 'Cancelled')) {
    return false;
  }
  const dateStr =
    task.completedAt ||
    task.cancelledAt ||
    task.rating?.ratedAt ||
    task.createdAt ||
    task.dueDate;
  if (!dateStr) return false;
  const time = new Date(dateStr).getTime();
  if (isNaN(time)) return false;
  return resolveNowMs(options) - time > TWO_DAYS_MS;
}

/**
 * Parses 12-hour ("10:00 AM", "02:30 PM") or 24-hour ("14:30", "09:05:00") time strings.
 * Returns null for empty or non-time strings (e.g. "TBD", "1 Hour").
 */
export function parseMeetingTimeOfDay(
  timeStr?: string | null
): { hours: number; minutes: number; seconds: number } | null {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const clean = timeStr.trim();
  if (!clean) return null;

  const match = clean.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const seconds = match[3] ? parseInt(match[3], 10) : 0;
  const meridiem = match[4] ? match[4].toUpperCase() : null;

  if (minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59) {
    return null;
  }

  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    if (meridiem === 'PM' && hours < 12) hours += 12;
    if (meridiem === 'AM' && hours === 12) hours = 0;
  } else {
    if (hours === 24 && minutes === 0 && seconds === 0) {
      return { hours: 23, minutes: 59, seconds: 59 };
    }
    if (hours < 0 || hours > 23) return null;
  }

  return { hours, minutes, seconds };
}

/**
 * Computes the scheduled timestamp (ms) when a meeting is set to take place / conclude.
 * Anchored to the meeting's scheduled date and time regardless of join or completion status.
 */
export function getMeetingScheduledTimestamp(
  meeting: Meeting & { recurrenceEndDate?: string; recurrence_end_date?: string }
): number | null {
  if (!meeting) return null;

  const isRecurring = Boolean(meeting.recurrence && meeting.recurrence !== 'None');
  const explicitSeriesEnd = (meeting.recurrenceEndDate || meeting.recurrence_end_date || '').trim();
  const rawDate = (isRecurring && explicitSeriesEnd ? explicitSeriesEnd : meeting.date || '').trim();

  if (!rawDate) return null;

  const ymdMatch = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const monthIndex = parseInt(ymdMatch[2], 10) - 1;
    const day = parseInt(ymdMatch[3], 10);

    const parsedStart =
      parseMeetingTimeOfDay(meeting.startTime) ||
      parseMeetingTimeOfDay(meeting.time);
    const parsedEnd = parseMeetingTimeOfDay(meeting.endTime);

    const chosenTime = parsedEnd || parsedStart || { hours: 18, minutes: 0, seconds: 0 };

    let dayOffset = 0;
    if (parsedStart && parsedEnd) {
      const startTotalSec = parsedStart.hours * 3600 + parsedStart.minutes * 60 + parsedStart.seconds;
      const endTotalSec = parsedEnd.hours * 3600 + parsedEnd.minutes * 60 + parsedEnd.seconds;
      if (endTotalSec < startTotalSec) {
        dayOffset = 1;
      }
    }

    const dt = new Date(
      year,
      monthIndex,
      day + dayOffset,
      chosenTime.hours,
      chosenTime.minutes,
      chosenTime.seconds,
      0
    );
    const ts = dt.getTime();
    return Number.isNaN(ts) ? null : ts;
  }

  const parsedIso = Date.parse(rawDate);
  return Number.isNaN(parsedIso) ? null : parsedIso;
}

/**
 * Shared archive check for meetings.
 * Meetings are automatically pushed to archive 2 days (48 hours) after they are set to be,
 * regardless of whether anyone joined the meeting or what its status/RSVP state is.
 */
export function isMeetingArchived(
  meeting: Meeting & {
    recurrenceEndDate?: string;
    recurrence_end_date?: string;
    completedAt?: string;
    cancelledAt?: string;
  },
  options?: ArchiveCheckOptions
): boolean {
  if (!meeting) return false;

  const nowMs = resolveNowMs(options);
  const scheduledMs = getMeetingScheduledTimestamp(meeting);

  if (scheduledMs !== null) {
    return nowMs - scheduledMs >= TWO_DAYS_MS;
  }

  const fallbackRef = meeting.cancelledAt || meeting.completedAt;
  if (!fallbackRef) return false;
  const fallbackMs = Date.parse(fallbackRef);
  if (Number.isNaN(fallbackMs)) return false;
  return nowMs - fallbackMs >= TWO_DAYS_MS;
}

/**
 * Shared check for whether a user is an organizer, chair, or invitee of a meeting.
 * Used identically by active meeting views and personal archive so archived meetings
 * disappear from the Meeting section and appear in the user's Archive with zero gap.
 */
export function isUserInvolvedInMeeting(
  meeting: Meeting,
  user?: { id?: string; email?: string } | null
): boolean {
  if (!meeting || !user) return false;
  const uid = (user.id || '').trim();
  const email = (user.email || '').trim().toLowerCase();

  if (uid && (meeting.organizerId === uid || meeting.chairId === uid)) {
    return true;
  }
  if (email && meeting.chairEmail && meeting.chairEmail.trim().toLowerCase() === email) {
    return true;
  }
  if (Array.isArray(meeting.attendees)) {
    return meeting.attendees.some((a) => {
      if (uid && a.userId === uid) return true;
      if (email && a.email && a.email.trim().toLowerCase() === email) return true;
      return false;
    });
  }
  return false;
}

/**
 * Returns true if the meeting belongs in the user's active Meeting/Calendar views
 * (i.e. user is involved AND the meeting has not yet reached the 2-day post-scheduled archive cutoff).
 */
export function isMeetingVisibleInActiveSection(
  meeting: Meeting,
  user?: { id?: string; email?: string } | null,
  options?: ArchiveCheckOptions
): boolean {
  return isUserInvolvedInMeeting(meeting, user) && !isMeetingArchived(meeting, options);
}
