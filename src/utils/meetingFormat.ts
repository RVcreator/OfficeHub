import type {Meeting} from '../types';
export const isPhysicalMeeting=(meeting:Pick<Meeting,'meetingType'>)=>meeting.meetingType==='In-Person Boardroom';
export const meetingFormatLabel=(meeting:Pick<Meeting,'meetingType'>)=>isPhysicalMeeting(meeting)?'Physical meeting':meeting.meetingType||'Microsoft Teams';
