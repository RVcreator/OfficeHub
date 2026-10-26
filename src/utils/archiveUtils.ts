import { Task, Meeting } from '../types';

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

/**
 * Shared archive check for tasks.
 * A task qualifies for archive (and must be excluded from all main task views) once:
 * status is 'Done' or 'Cancelled' AND completedAt/cancelledAt is more than 2 days in the past.
 */
export function isTaskArchived(task: Task & { completedAt?: string; cancelledAt?: string }): boolean {
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
  return Date.now() - time > TWO_DAYS_MS;
}

/**
 * Shared archive check for meetings.
 * - Non-recurring meeting: qualifies for archive once its date/time has passed AND more than 2 days have elapsed since it was hosted.
 * - Recurring meeting: must NOT be archived until more than 2 days have passed since the entire recurrence SERIES ends (not after each individual occurrence).
 */
export function isMeetingArchived(meeting: Meeting & { recurrenceEndDate?: string; recurrence_end_date?: string; completedAt?: string; cancelledAt?: string }): boolean {
  if (!meeting) return false;

  const isRecurring = meeting.recurrence && meeting.recurrence !== 'None';
  
  if (isRecurring) {
    // NOTE: Recurring meetings cannot be accurately archived without a persisted recurrence end date.
    // They will remain in the main view until explicitly cancelled or modified.
    return false;
  }

  // Non-recurring meeting rule: qualifies for archive once its date/time has passed AND more than 2 days have elapsed since it was hosted.
  const hostDateStr = meeting.date ? `${meeting.date}T${meeting.endTime || meeting.startTime || '18:00'}` : null;
  const statusTimeRef = meeting.completedAt || meeting.cancelledAt || hostDateStr;
  if (!statusTimeRef) return false;
  const time = new Date(statusTimeRef).getTime();
  if (isNaN(time)) return false;
  return Date.now() - time > TWO_DAYS_MS;
}
