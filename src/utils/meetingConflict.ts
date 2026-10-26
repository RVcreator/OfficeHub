import { Meeting, StaffUser } from '../types';

export interface MeetingConflict {
  userId: string;
  userName: string;
  userAvatar?: string;
  conflictingMeetingId: string;
  conflictingMeetingTitle: string;
  date: string;
  startTime: string;
  endTime: string;
}

/**
 * Parses various time formats ("10:00 AM", "2:30 PM", "14:30", "09:00") into minutes from midnight.
 */
export function parseTimeToMinutes(timeStr?: string): number {
  if (!timeStr) return 0;
  const trimmed = timeStr.trim();

  // Check 12-hour format with AM/PM
  const match12 = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (match12) {
    let hours = parseInt(match12[1], 10);
    const minutes = parseInt(match12[2], 10);
    const meridiem = match12[3] ? match12[3].toUpperCase() : null;

    if (meridiem === 'PM' && hours < 12) hours += 12;
    if (meridiem === 'AM' && hours === 12) hours = 0;

    return hours * 60 + minutes;
  }

  // Fallback to simple split
  const parts = trimmed.split(':');
  if (parts.length >= 2) {
    const hours = parseInt(parts[0], 10) || 0;
    const minutes = parseInt(parts[1], 10) || 0;
    return hours * 60 + minutes;
  }

  return 0;
}

/**
 * Checks if two time intervals [startA, endA] and [startB, endB] overlap.
 */
export function isTimeOverlapping(
  startA: number,
  endA: number,
  startB: number,
  endB: number
): boolean {
  // If end is before or equal to start, treat as 60-min default duration
  const adjustedEndA = endA <= startA ? startA + 60 : endA;
  const adjustedEndB = endB <= startB ? startB + 60 : endB;

  return Math.max(startA, startB) < Math.min(adjustedEndA, adjustedEndB);
}

/**
 * Converts any time string ("10:00 AM", "2:30 PM", "14:30", "9:05", "14:30:00") into 24-hour "HH:MM" format.
 */
export function convertTo24HourTime(timeStr?: string): string {
  if (!timeStr) return '10:00';
  const clean = timeStr.trim();
  // If already 24-hour HH:MM or H:MM (with optional seconds)
  const match24 = clean.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (match24) {
    const hours = parseInt(match24[1], 10);
    const minutes = match24[2];
    return `${hours.toString().padStart(2, '0')}:${minutes}`;
  }
  // If 12-hour format with AM/PM (e.g. "2:30 PM", "10:00 AM", "02:30PM")
  const match12 = clean.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (match12) {
    let hours = parseInt(match12[1], 10);
    const minutes = match12[2];
    const ampm = (match12[3] || '').toUpperCase();
    if (ampm === 'PM' && hours < 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;
    return `${hours.toString().padStart(2, '0')}:${minutes}`;
  }
  return '10:00';
}

/**
 * Converts a 24-hour "HH:MM" or arbitrary time string to 12-hour format "HH:MM AM/PM".
 */
export function convertTo12HourTime(timeStr?: string): string {
  if (!timeStr) return '10:00 AM';
  const clean = timeStr.trim();
  const match24 = clean.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (match24) {
    let hours = parseInt(match24[1], 10);
    const minutes = match24[2];
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${hours.toString().padStart(2, '0')}:${minutes} ${ampm}`;
  }
  return clean;
}

/**
 * Detects scheduling conflicts for a set of invitees against their existing accepted or pending meetings.
 * Only considers meetings on the same date where status !== 'Cancelled' and invitee has NOT declined.
 */
export function detectMeetingConflicts(
  targetDate: string,
  targetStartTime: string,
  targetEndTime: string,
  attendeeIds: string[],
  existingMeetings: Meeting[],
  staffList: StaffUser[],
  excludeMeetingId?: string
): MeetingConflict[] {
  if (!targetDate || !targetStartTime || attendeeIds.length === 0) {
    return [];
  }

  const targetStartMin = parseTimeToMinutes(targetStartTime);
  const targetEndMin = parseTimeToMinutes(targetEndTime || targetStartTime) || (targetStartMin + 60);

  const conflicts: MeetingConflict[] = [];

  for (const userId of attendeeIds) {
    const staffMember = staffList.find(s => s.id === userId);
    const userName = staffMember?.name || userId;
    const userAvatar = staffMember?.avatar;

    for (const meeting of existingMeetings) {
      // Ignore the meeting itself when editing, and ignore cancelled meetings
      if (excludeMeetingId && meeting.id === excludeMeetingId) continue;
      if (meeting.status === 'Cancelled') continue;
      if (meeting.date !== targetDate) continue;

      // Check if user is in this meeting as organizer or attendee
      const isOrganizer = meeting.organizerId === userId;
      const attendeeRecord = meeting.attendees.find(a => a.userId === userId || a.name === userName);

      if (!isOrganizer && !attendeeRecord) continue;

      // Ignore meetings the invitee has already declined
      if (attendeeRecord && attendeeRecord.status === 'Declined') {
        continue;
      }

      const existingStartMin = parseTimeToMinutes(meeting.startTime || meeting.time);
      const existingEndMin = parseTimeToMinutes(meeting.endTime || meeting.startTime || meeting.time);

      if (isTimeOverlapping(targetStartMin, targetEndMin, existingStartMin, existingEndMin)) {
        conflicts.push({
          userId,
          userName,
          userAvatar,
          conflictingMeetingId: meeting.id,
          conflictingMeetingTitle: meeting.title,
          date: meeting.date,
          startTime: meeting.startTime || meeting.time || '10:00 AM',
          endTime: meeting.endTime || '11:00 AM',
        });
        // One conflict per user is sufficient for warning, but we can capture the first/strongest
        break;
      }
    }
  }

  return conflicts;
}
