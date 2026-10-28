import { UserAvatar } from './UserAvatar';
import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Video,
  Plus,
  Calendar,
  Clock,
  Download,
  Users,
  CheckCircle2,
  XCircle,
  Clock3,
  HelpCircle,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  Gift,
  UserCheck,
  AlertTriangle,
  Search,
  Eye,
  X,
  CalendarDays,
  CalendarRange,
  LayoutGrid,
  Columns3,
  Pencil,
  Trash2,
  ShieldCheck,
  RotateCcw,
  Sparkles,
  CheckSquare,
  Tag,
  FileText,
  FileSpreadsheet,
  File,
  Image,
  ExternalLink,
  MessageSquare,
  Paperclip,
  Loader2
} from 'lucide-react';
import { Department, Meeting, StaffUser, RsvpStatus, MeetingAttendee, Task, MessageAttachment, Priority } from '../types';
import { usePortalStore } from '../services/store';
import { downloadCalendarInvite } from '../services/teamsSharePointService';
import { formatStaffDisplayName, formatStaffDisplayOrgDept } from '../utils/staffHierarchy';
import { detectMeetingConflicts } from '../utils/meetingConflict';
import { isMeetingArchived, isUserInvolvedInMeeting } from '../utils/archiveUtils';
import { StaffPickerTree } from './StaffPickerTree';
import { parseUploadedFile, getAttachmentTabUrl, downloadAttachment } from '../utils/fileParser';
import { CalendarOccasionDots } from './CalendarOccasionDots';
import { getCalendarOccasions } from '../utils/calendarOccasions';

// Robust time format conversion helpers for <input type="time">
function convertTo24HourTime(timeStr?: string): string {
  if (!timeStr) return '14:00';
  const clean = timeStr.trim();
  if (/^\d{1,2}:\d{2}$/.test(clean)) {
    const [h, m] = clean.split(':');
    return `${h.padStart(2, '0')}:${m}`;
  }
  const match = clean.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (match) {
    let hours = parseInt(match[1], 10);
    const minutes = match[2];
    const ampm = (match[3] || '').toUpperCase();
    if (ampm === 'PM' && hours < 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;
    return `${hours.toString().padStart(2, '0')}:${minutes}`;
  }
  return '14:00';
}

function convertTo12HourTime(time24?: string): string {
  if (!time24) return '10:00 AM';
  const match = time24.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return time24;
  let hours = parseInt(match[1], 10);
  const minutes = match[2];
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours.toString().padStart(2, '0')}:${minutes} ${ampm}`;
}

export const renderRsvpBadge = (status: RsvpStatus, size: 'sm' | 'md' = 'sm') => {
  switch (status) {
    case 'Accepted':
      return (
        <span
          className={`inline-flex items-center gap-1 rounded-full font-bold border shrink-0 ${
            size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'
          } bg-emerald-50 text-emerald-700 border-emerald-200`}
        >
          <CheckCircle2 className={size === 'sm' ? 'w-3 h-3 text-emerald-600' : 'w-3.5 h-3.5 text-emerald-600'} />
          <span>Accepted</span>
        </span>
      );
    case 'Declined':
      return (
        <span
          className={`inline-flex items-center gap-1 rounded-full font-bold border shrink-0 ${
            size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'
          } bg-rose-50 text-rose-700 border-rose-200`}
        >
          <XCircle className={size === 'sm' ? 'w-3 h-3 text-rose-600' : 'w-3.5 h-3.5 text-rose-600'} />
          <span>Declined</span>
        </span>
      );
    case 'Proposed New Time':
      return (
        <span
          className={`inline-flex items-center gap-1 rounded-full font-bold border shrink-0 ${
            size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'
          } bg-amber-50 text-amber-800 border-amber-300 animate-pulse`}
        >
          <Clock3 className={size === 'sm' ? 'w-3 h-3 text-amber-600' : 'w-3.5 h-3.5 text-amber-600'} />
          <span>Proposed New Time</span>
        </span>
      );
    case 'Pending':
    default:
      return (
        <span
          className={`inline-flex items-center gap-1 rounded-full font-bold border shrink-0 ${
            size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'
          } bg-slate-100 text-slate-600 border-slate-200`}
        >
          <HelpCircle className={size === 'sm' ? 'w-3 h-3 text-slate-400' : 'w-3.5 h-3.5 text-slate-400'} />
          <span>Pending</span>
        </span>
      );
  }
};

const InlineMeetingRsvp: React.FC<{
  meeting: Meeting;
  userAttendee: MeetingAttendee;
  onOpenProposal: (m: Meeting) => void;
  compact?: boolean;
}> = ({ meeting, userAttendee, onOpenProposal, compact = false }) => {
  const { actions } = usePortalStore();
  const [comment, setComment] = useState<string>(userAttendee.note || userAttendee.comment || '');
  const [errorMsg, setErrorMsg] = useState('');
  const [savedSuccess, setSavedSuccess] = useState<string | null>(null);
  const commentInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setComment(userAttendee.note || userAttendee.comment || '');
  }, [userAttendee.note, userAttendee.comment]);

  const handleAccept = async () => {
    setErrorMsg('');
    await actions.respondToMeeting(meeting.id, 'Accepted', {
      note: comment.trim() || undefined,
      comment: comment.trim() || undefined
    });
    setSavedSuccess('Accepted');
    setTimeout(() => setSavedSuccess(null), 3500);
  };

  const handleDeclineClick = async () => {
    if (!comment.trim()) {
      setErrorMsg('A note explaining why you are declining is required.');
      commentInputRef.current?.focus();
      return;
    }
    setErrorMsg('');
    await actions.respondToMeeting(meeting.id, 'Declined', {
      note: comment.trim(),
      comment: comment.trim()
    });
    setSavedSuccess('Declined');
    setTimeout(() => setSavedSuccess(null), 3500);
  };

  const handleUpdateNoteOnly = async () => {
    if (userAttendee.status === 'Declined' && !comment.trim()) {
      setErrorMsg('Decline reason cannot be empty.');
      commentInputRef.current?.focus();
      return;
    }
    setErrorMsg('');
    await actions.respondToMeeting(meeting.id, userAttendee.status, {
      note: comment.trim() || undefined,
      comment: comment.trim() || undefined
    });
    setSavedSuccess('Note updated');
    setTimeout(() => setSavedSuccess(null), 3500);
  };

  const hasCommentChanged = comment.trim() !== (userAttendee.note || userAttendee.comment || '').trim();
  const isDeclined = userAttendee.status === 'Declined';
  const isAccepted = userAttendee.status === 'Accepted';

  return (
    <div className={`${compact ? 'p-2.5' : 'p-3'} bg-slate-50/95 rounded-lg border ${errorMsg ? 'border-rose-400 ring-2 ring-rose-200' : 'border-slate-200'} space-y-2`}>
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-slate-700">Your RSVP:</span>
        <div className="flex items-center gap-1.5">
          {renderRsvpBadge(userAttendee.status, compact ? 'sm' : 'md')}
          {savedSuccess && (
            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded animate-in fade-in">
              ✓ {savedSuccess}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
        <button
          type="button"
          onClick={handleAccept}
          className={`${compact ? 'py-1 px-1.5 text-[10px]' : 'py-1.5 px-2 text-xs'} font-bold rounded border flex items-center justify-center gap-1 transition shadow-2xs cursor-pointer ${
            isAccepted
              ? 'bg-emerald-600 text-white border-emerald-600'
              : 'bg-white hover:bg-emerald-50 text-emerald-800 border-emerald-300'
          }`}
          title="Accept invitation (note is optional)"
        >
          <CheckCircle2 className={`${compact ? 'w-3 h-3' : 'w-3.5 h-3.5'}`} />
          <span>Accept</span>
        </button>

        <button
          type="button"
          onClick={handleDeclineClick}
          className={`${compact ? 'py-1 px-1.5 text-[10px]' : 'py-1.5 px-2 text-xs'} font-bold rounded border flex items-center justify-center gap-1 transition shadow-2xs cursor-pointer ${
            isDeclined
              ? 'bg-rose-600 text-white border-rose-600'
              : 'bg-white hover:bg-rose-50 text-rose-800 border-rose-300'
          }`}
          title="Decline invitation (requires a note explaining why)"
        >
          <XCircle className={`${compact ? 'w-3 h-3' : 'w-3.5 h-3.5'}`} />
          <span>Decline</span>
        </button>

        <button
          type="button"
          onClick={() => onOpenProposal(meeting)}
          className={`${compact ? 'py-1 px-1.5 text-[10px]' : 'py-1.5 px-2 text-xs'} font-bold rounded border flex items-center justify-center gap-1 transition shadow-2xs cursor-pointer ${
            userAttendee.status === 'Proposed New Time'
              ? 'bg-amber-600 text-white border-amber-600'
              : 'bg-white hover:bg-amber-50 text-amber-900 border-amber-300'
          }`}
          title="Propose a new date or time"
        >
          <Clock3 className={`${compact ? 'w-3 h-3' : 'w-3.5 h-3.5'}`} />
          <span>Propose Time</span>
        </button>
      </div>

      {/* Inline RSVP Comment Section */}
      <div className="pt-1.5 border-t border-slate-200/80 space-y-1">
        <div className="flex items-center justify-between text-[11px]">
          <label className="font-semibold text-slate-700 flex items-center gap-1">
            <MessageSquare className="w-3 h-3 text-slate-500" />
            <span>RSVP Note / Comment:</span>
          </label>
          <span className="text-[10px]">
            {errorMsg ? (
              <span className="text-rose-600 font-bold">* Reason required to decline</span>
            ) : isDeclined ? (
              <span className="text-rose-600 font-medium">* Decline reason</span>
            ) : (
              <span className="text-slate-400">Optional for accept, required for decline</span>
            )}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <input
            ref={commentInputRef}
            type="text"
            value={comment}
            onChange={(e) => {
              setComment(e.target.value);
              if (errorMsg) setErrorMsg('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (isDeclined || errorMsg) {
                  handleDeclineClick();
                } else if (hasCommentChanged && userAttendee.status !== 'Pending') {
                  handleUpdateNoteOnly();
                } else {
                  handleAccept();
                }
              }
            }}
            placeholder={
              errorMsg
                ? 'Type reason for declining (required)...'
                : isDeclined
                ? 'Reason for declining (required)...'
                : 'Add comment/note (e.g. joining online, why declining)...'
            }
            className={`flex-1 px-2.5 py-1 text-xs bg-white rounded-md border ${
              errorMsg
                ? 'border-rose-500 ring-2 ring-rose-200 bg-rose-50/50 text-rose-900 placeholder:text-rose-400'
                : 'border-slate-300 focus:border-[#00ad1d] text-slate-800'
            } focus:outline-none transition`}
          />

          {hasCommentChanged && userAttendee.status !== 'Pending' && (
            <button
              type="button"
              onClick={handleUpdateNoteOnly}
              className="px-2.5 py-1 bg-slate-700 hover:bg-slate-800 text-white font-bold text-xs rounded transition shadow-2xs shrink-0 cursor-pointer"
              title="Save updated note"
            >
              Update Note
            </button>
          )}
        </div>

        {errorMsg && (
          <p className="text-[10px] text-rose-600 font-bold flex items-center gap-1 animate-in fade-in">
            <span>⚠️ {errorMsg}</span>
          </p>
        )}

        {(userAttendee.note || userAttendee.comment) && !errorMsg && !hasCommentChanged && (
          <p className="text-[10px] text-slate-500 truncate">
            {isDeclined ? (
              <span className="text-rose-700 font-semibold">Decline reason: </span>
            ) : isAccepted ? (
              <span className="text-emerald-700 font-semibold">Saved note: </span>
            ) : (
              <span className="text-slate-600 font-medium">Note: </span>
            )}
            <em className="text-slate-700">"{userAttendee.note || userAttendee.comment}"</em>
          </p>
        )}
      </div>
    </div>
  );
};

const renderMeetingAttachments = (
  attachments: MessageAttachment[] | undefined,
  options?: {
    compact?: boolean;
    canDelete?: boolean;
    onDelete?: (id: string) => void;
  }
) => {
  if (!attachments || attachments.length === 0) return null;
  const compact = options?.compact;

  return (
    <div className={`space-y-1.5 ${compact ? 'pt-1' : 'pt-2'}`}>
      <div className="flex items-center gap-1.5 text-slate-600 font-semibold text-[11px]">
        <Paperclip className="w-3.5 h-3.5 text-purple-600 shrink-0" />
        <span>Attached Documents & Files ({attachments.length}):</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {attachments.map(att => {
          const tabUrl = getAttachmentTabUrl(att);
          const ext = (att.name || '').split('.').pop()?.toLowerCase() || '';
          const isPdf = att.type === 'pdf' || ext === 'pdf';
          const isSheet = att.type === 'xlsx' || ['xls', 'xlsx', 'csv'].includes(ext);
          const isImg = att.type === 'image' || ['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif'].includes(ext);

          return (
            <div
              key={att.id}
              className={`inline-flex items-center gap-1.5 ${
                compact ? 'px-2 py-1 text-[10px]' : 'px-2.5 py-1 text-xs'
              } rounded-md bg-white border border-purple-200/90 shadow-2xs hover:border-purple-300 transition group`}
            >
              <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 ${
                isPdf ? 'text-rose-600' :
                isSheet ? 'text-emerald-600' :
                isImg ? 'text-purple-600' :
                'text-blue-600'
              }`}>
                {isPdf ? <FileText className="w-3.5 h-3.5" /> :
                 isSheet ? <FileSpreadsheet className="w-3.5 h-3.5" /> :
                 isImg ? <Image className="w-3.5 h-3.5" /> :
                 <File className="w-3.5 h-3.5" />}
              </div>

              <a
                href={tabUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-slate-800 hover:text-purple-700 truncate max-w-[160px] sm:max-w-[220px]"
                title={`Open ${att.name}`}
              >
                {att.name}
              </a>

              <span className="text-[10px] text-slate-400 shrink-0">({att.size})</span>

              <a
                href={tabUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-0.5 text-slate-400 hover:text-purple-700 rounded"
                title="Open in new browser tab"
              >
                <ExternalLink className="w-3 h-3" />
              </a>

              <button
                type="button"
                onClick={() => downloadAttachment(att)}
                className="p-0.5 text-slate-400 hover:text-slate-700 rounded cursor-pointer"
                title="Download attachment"
              >
                <Download className="w-3 h-3" />
              </button>

              {options?.canDelete && options.onDelete && (
                <button
                  type="button"
                  onClick={() => options.onDelete!(att.id)}
                  className="p-0.5 text-slate-400 hover:text-rose-600 rounded font-bold cursor-pointer"
                  title="Remove attachment"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const isStaffBirthdayOnDate = (birthday?: string, dateStr?: string): boolean => {
  if (!birthday || !dateStr) return false;
  const cleanDate = dateStr.trim();
  const dateSuffix = cleanDate.slice(5); // "MM-DD"
  const cleanBirthday = birthday.trim().replace(/\//g, '-');
  if (cleanBirthday.endsWith(dateSuffix) || cleanBirthday.slice(5) === dateSuffix || cleanBirthday.slice(-5) === dateSuffix) {
    return true;
  }
  const dp = cleanDate.split('-');
  const bp = cleanBirthday.split('-');
  if (dp.length === 3) {
    const dMonth = parseInt(dp[1], 10);
    const dDay = parseInt(dp[2], 10);
    let bMonth = 0;
    let bDay = 0;
    if (bp.length === 3) {
      bMonth = parseInt(bp[0].length === 4 ? bp[1] : bp[0], 10);
      bDay = parseInt(bp[0].length === 4 ? bp[2] : bp[1], 10);
    } else if (bp.length === 2) {
      bMonth = parseInt(bp[0], 10);
      bDay = parseInt(bp[1], 10);
    }
    if (dMonth && dDay && bMonth === dMonth && bDay === dDay) return true;
  }
  return false;
};

export const MeetingsTeamsView: React.FC<{
  onOpenScheduleModal: () => void;
  onOpenQuickAction?: (tab: 'task' | 'meeting' | 'notice' | 'sharepoint', assignee?: StaffUser | null, date?: string) => void;
  initialMode?: 'list' | 'calendar';
  selectedMeetingId?: string | null;
  onSelectTask?: (taskId: string) => void;
  onSelectMeeting?: (meetingId: string) => void;
}> = ({ onOpenScheduleModal, onOpenQuickAction, initialMode = 'list', selectedMeetingId, onSelectTask, onSelectMeeting }) => {
  const { meetings, staff, currentUser, actions, tasks, departments } = usePortalStore();

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>(initialMode);
  const [calendarSubView, setCalendarSubView] = useState<'day' | 'week' | 'month' | 'year'>('month');
  const [departmentFilter, setDepartmentFilter] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedMeetingId, setCopiedMeetingId] = useState<string | null>(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string>(todayStr);
  const icsFileRef = useRef<HTMLInputElement>(null);

  // Selected meeting for full detail modal
  const [detailMeetingId, setDetailMeetingId] = useState<string | null>(null);

  // Selected task for full detail modal
  const [selectedTaskDetail, setSelectedTaskDetail] = useState<Task | null>(null);

  // Hover state for calendar activities
  const [hoveredActivity, setHoveredActivity] = useState<{
    item: Meeting | Task;
    type: 'meeting' | 'task';
    x: number;
    y: number;
  } | null>(null);

  // Auto-open meeting details if selectedMeetingId provided
  React.useEffect(() => {
    if (selectedMeetingId) {
      setDetailMeetingId(selectedMeetingId);
    }
  }, [selectedMeetingId]);

  // Active live meeting sync on mount and while user views the meetings/calendar tab
  const [archiveTick, setArchiveTick] = useState<number>(() => Date.now());
  useEffect(() => {
    actions.triggerLiveMeetingSync?.();
    const interval = setInterval(() => {
      actions.triggerLiveMeetingSync?.();
    }, 4000);
    const archiveTimer = setInterval(() => {
      setArchiveTick(Date.now());
    }, 60000);
    return () => {
      clearInterval(interval);
      clearInterval(archiveTimer);
    };
  }, [actions]);

  // Propose New Time modal state
  const [proposingMeeting, setProposingMeeting] = useState<Meeting | null>(null);
  const [proposedDate, setProposedDate] = useState('');
  const [proposedStartTime, setProposedStartTime] = useState('14:00');
  const [proposedEndTime, setProposedEndTime] = useState('15:00');
  const [proposalNote, setProposalNote] = useState('');

  // Edit Meeting modal state
  const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDepartment, setEditDepartment] = useState<string>('Top management');
  const [editDate, setEditDate] = useState('');
  const [editStartTime, setEditStartTime] = useState('10:00 AM');
  const [editEndTime, setEditEndTime] = useState('11:00 AM');
  const [editDescription, setEditDescription] = useState('');
  const [editAgenda, setEditAgenda] = useState<string[]>([]);
  const [newAgendaInput, setNewAgendaInput] = useState('');
  const [editAttendees, setEditAttendees] = useState<string[]>([]);
  const [editRecurrence, setEditRecurrence] = useState<NonNullable<Meeting['recurrence']>>('None');
  const [editChairId, setEditChairId] = useState<string>(currentUser.id);
  const [editAttachments, setEditAttachments] = useState<MessageAttachment[]>([]);
  const [isUploadingEditFile, setIsUploadingEditFile] = useState(false);

  // Delete confirmation state
  const [deletingMeeting, setDeletingMeeting] = useState<Meeting | null>(null);

  // Quick-create Popover State (Google Calendar style click-to-schedule)
  const quickCreateRef = useRef<HTMLDivElement>(null);
  const [quickCreate, setQuickCreate] = useState<{
    isOpen: boolean;
    dateStr: string;
    x: number;
    y: number;
    type: 'meeting' | 'task';
  } | null>(null);

  // Quick Create Meeting Fields
  const [quickMeetingTitle, setQuickMeetingTitle] = useState('');
  const [quickMeetingDate, setQuickMeetingDate] = useState('');
  const [quickMeetingStartTime, setQuickMeetingStartTime] = useState('10:00');
  const [quickMeetingEndTime, setQuickMeetingEndTime] = useState('11:00');
  const [quickMeetingDepartment, setQuickMeetingDepartment] = useState<string>('Top management');
  const [quickMeetingAttendeeIds, setQuickMeetingAttendeeIds] = useState<string[]>([]);
  const [isCreatingQuickMeeting, setIsCreatingQuickMeeting] = useState(false);

  // Quick Create Task Fields
  const [quickTaskTitle, setQuickTaskTitle] = useState('');
  const [quickTaskDueDate, setQuickTaskDueDate] = useState('');
  const [quickTaskAssigneeId, setQuickTaskAssigneeId] = useState<string>(currentUser.id);
  const [quickTaskDepartment, setQuickTaskDepartment] = useState<string>(currentUser.department || 'Top management');
  const [quickTaskPriority, setQuickTaskPriority] = useState<Priority>('Medium');
  const [isCreatingQuickTask, setIsCreatingQuickTask] = useState(false);

  // Close quick-create on outside click or Escape key
  useEffect(() => {
    if (!quickCreate?.isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (quickCreateRef.current && !quickCreateRef.current.contains(e.target as Node)) {
        setQuickCreate(null);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setQuickCreate(null);
      }
    };

    const timer = setTimeout(() => {
      window.addEventListener('mousedown', handleClickOutside);
    }, 10);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [quickCreate?.isOpen]);

  const handleDayCellClick = (e: React.MouseEvent, dateStr: string) => {
    e.stopPropagation();
    setSelectedCalendarDate(dateStr);

    const popoverWidth = 350;
    const popoverHeight = 440;

    let x = e.clientX + 10;
    let y = e.clientY + 10;

    if (x + popoverWidth > window.innerWidth - 16) {
      x = Math.max(16, e.clientX - popoverWidth - 10);
    }
    if (y + popoverHeight > window.innerHeight - 16) {
      y = Math.max(16, e.clientY - popoverHeight - 10);
    }

    x = Math.max(16, Math.min(x, window.innerWidth - popoverWidth - 16));
    y = Math.max(16, Math.min(y, window.innerHeight - popoverHeight - 16));

    setQuickMeetingTitle('');
    setQuickMeetingDate(dateStr);
    setQuickMeetingStartTime('10:00');
    setQuickMeetingEndTime('11:00');
    setQuickMeetingDepartment(currentUser.department || 'Top management');
    setQuickMeetingAttendeeIds([currentUser.id]);

    setQuickTaskTitle('');
    setQuickTaskDueDate(dateStr);
    setQuickTaskAssigneeId(currentUser.id);
    const assigned = staff.find(s => s.id === currentUser.id);
    setQuickTaskDepartment(assigned?.department || currentUser.department || 'Top management');
    setQuickTaskPriority('Medium');

    setQuickCreate({
      isOpen: true,
      dateStr,
      x,
      y,
      type: quickCreate?.type || 'meeting',
    });
  };

  const handleMoreOptions = () => {
    if (!quickCreate) return;
    const type = quickCreate.type;
    const targetDate = type === 'meeting' ? (quickMeetingDate || quickCreate.dateStr) : (quickTaskDueDate || quickCreate.dateStr);
    setQuickCreate(null);
    if (onOpenQuickAction) {
      onOpenQuickAction(type, null, targetDate);
    } else {
      onOpenScheduleModal();
    }
  };

  const handleQuickCreateMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickCreate || !quickMeetingTitle.trim()) return;
    setIsCreatingQuickMeeting(true);
    try {
      const attendeesList: MeetingAttendee[] = staff
        .filter(s => quickMeetingAttendeeIds.includes(s.id) || s.id === currentUser.id)
        .map(s => ({
          userId: s.id,
          name: s.name,
          email: s.email,
          status: s.id === currentUser.id ? 'Accepted' : 'Pending',
          avatar: s.avatar,
        }));

      if (!attendeesList.some(a => a.userId === currentUser.id)) {
        attendeesList.unshift({
          userId: currentUser.id,
          name: currentUser.name,
          email: currentUser.email,
          status: 'Accepted',
          avatar: currentUser.avatar,
        });
      }

      const time24 = convertTo24HourTime(quickMeetingStartTime);
      const start12h = convertTo12HourTime(time24);
      const end12h = convertTo12HourTime(quickMeetingEndTime);

      await actions.addMeeting({
        title: quickMeetingTitle.trim(),
        department: quickMeetingDepartment,
        date: quickMeetingDate || quickCreate.dateStr,
        startTime: start12h,
        endTime: end12h,
        time: time24, // 24-hour HH:MM format e.g. "14:30"
        meetingType: 'Microsoft Teams',
        agenda: ['Meeting discussion'],
        attendees: attendeesList,
        chairId: currentUser.id,
        chairName: currentUser.name,
        chairEmail: currentUser.email,
        recurrence: 'None',
        attachments: [],
      });
      setQuickCreate(null);
    } finally {
      setIsCreatingQuickMeeting(false);
    }
  };

  const handleQuickCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickCreate || !quickTaskTitle.trim()) return;
    setIsCreatingQuickTask(true);
    try {
      const assigned = staff.find(s => s.id === quickTaskAssigneeId) || currentUser;
      await actions.addTask({
        title: quickTaskTitle.trim(),
        description: '',
        department: quickTaskDepartment || assigned.department || 'Top management',
        organisation: assigned.organisation || 'WIPAHS',
        priority: quickTaskPriority,
        status: 'To Do',
        assignedToId: assigned.id,
        assignedToName: assigned.name,
        assignedToIds: [assigned.id],
        assignedToNames: [assigned.name],
        assignmentType: 'personal',
        dueDate: quickTaskDueDate || quickCreate.dateStr,
        subtasks: [],
        tags: ['Calendar', quickTaskPriority],
        attachments: [],
      });
      setQuickCreate(null);
    } finally {
      setIsCreatingQuickTask(false);
    }
  };

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const getHourFromTimeString = (timeStr?: string): number => {
    if (!timeStr) return 9;
    const str = timeStr.trim().toUpperCase();
    if (str.includes('AM') || str.includes('PM')) {
      const isPM = str.includes('PM');
      const clean = str.replace(/AM|PM/g, '').trim();
      const parts = clean.split(':');
      let h = parseInt(parts[0], 10) || 9;
      if (isPM && h < 12) h += 12;
      if (!isPM && h === 12) h = 0;
      return h;
    }
    const parts = str.split(':');
    const h = parseInt(parts[0], 10);
    return isNaN(h) ? 9 : h;
  };

  const formatHourLabel = (hour24: number): string => {
    if (hour24 === 0) return '12 AM';
    if (hour24 === 12) return '12 PM';
    if (hour24 > 12) return `${hour24 - 12} PM`;
    return `${hour24} AM`;
  };

  const timeSlots = useMemo(() => [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20], []);

  const getStartOfWeek = (d: Date): Date => {
    const date = new Date(d);
    const day = date.getDay(); // 0 is Sunday
    const diff = date.getDate() - day;
    return new Date(date.setDate(diff));
  };

  const handlePrev = () => {
    if (calendarSubView === 'day') {
      const prev = new Date(currentDate);
      prev.setDate(prev.getDate() - 1);
      setCurrentDate(prev);
      const dateStr = `${prev.getFullYear()}-${(prev.getMonth() + 1).toString().padStart(2, '0')}-${prev.getDate().toString().padStart(2, '0')}`;
      setSelectedCalendarDate(dateStr);
    } else if (calendarSubView === 'week') {
      const prev = new Date(currentDate);
      prev.setDate(prev.getDate() - 7);
      setCurrentDate(prev);
    } else if (calendarSubView === 'month') {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    } else if (calendarSubView === 'year') {
      setCurrentDate(new Date(currentDate.getFullYear() - 1, 0, 1));
    }
  };

  const handleNext = () => {
    if (calendarSubView === 'day') {
      const next = new Date(currentDate);
      next.setDate(next.getDate() + 1);
      setCurrentDate(next);
      const dateStr = `${next.getFullYear()}-${(next.getMonth() + 1).toString().padStart(2, '0')}-${next.getDate().toString().padStart(2, '0')}`;
      setSelectedCalendarDate(dateStr);
    } else if (calendarSubView === 'week') {
      const next = new Date(currentDate);
      next.setDate(next.getDate() + 7);
      setCurrentDate(next);
    } else if (calendarSubView === 'month') {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    } else if (calendarSubView === 'year') {
      setCurrentDate(new Date(currentDate.getFullYear() + 1, 0, 1));
    }
  };

  const handleToday = () => {
    const now = new Date();
    setCurrentDate(now);
    setSelectedCalendarDate(todayStr);
  };

  const handleHourSlotClick = (e: React.MouseEvent, dateStr: string, hour24: number) => {
    e.stopPropagation();
    setSelectedCalendarDate(dateStr);

    const popoverWidth = 350;
    const popoverHeight = 440;

    let x = e.clientX + 10;
    let y = e.clientY + 10;

    if (x + popoverWidth > window.innerWidth - 16) {
      x = Math.max(16, e.clientX - popoverWidth - 10);
    }
    if (y + popoverHeight > window.innerHeight - 16) {
      y = Math.max(16, e.clientY - popoverHeight - 10);
    }

    x = Math.max(16, Math.min(x, window.innerWidth - popoverWidth - 16));
    y = Math.max(16, Math.min(y, window.innerHeight - popoverHeight - 16));

    const startHourStr = hour24.toString().padStart(2, '0') + ':00';
    const endHourStr = ((hour24 + 1) % 24).toString().padStart(2, '0') + ':00';

    setQuickMeetingTitle('');
    setQuickMeetingDate(dateStr);
    setQuickMeetingStartTime(startHourStr);
    setQuickMeetingEndTime(endHourStr);
    setQuickMeetingDepartment(currentUser.department || 'Top management');
    setQuickMeetingAttendeeIds([currentUser.id]);

    setQuickTaskTitle('');
    setQuickTaskDueDate(dateStr);
    setQuickTaskAssigneeId(currentUser.id);
    setQuickTaskDepartment(currentUser.department || 'Top management');
    setQuickTaskPriority('Medium');

    setQuickCreate({
      isOpen: true,
      dateStr,
      x,
      y,
      type: 'meeting',
    });
  };

  const filteredMeetings = useMemo(() => {
    return meetings.filter(m => {
      if (isMeetingArchived(m, { nowMs: archiveTick })) return false;
      if (!isUserInvolvedInMeeting(m, currentUser)) return false;
      if (departmentFilter !== 'All' && m.department !== departmentFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = m.title.toLowerCase().includes(q);
        const matchDept = (m.department || '').toLowerCase().includes(q);
        const matchChair = (m.chairName || '').toLowerCase().includes(q);
        const matchDesc = (m.description || '').toLowerCase().includes(q);
        const matchAttendee = m.attendees.some(a => a.name.toLowerCase().includes(q));
        if (!matchTitle && !matchDept && !matchChair && !matchDesc && !matchAttendee) return false;
      }
      return true;
    });
  }, [meetings, departmentFilter, searchQuery, currentUser, archiveTick]);

  const calendarHeaderTitle = useMemo(() => {
    if (calendarSubView === 'day') {
      return currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    }
    if (calendarSubView === 'week') {
      const start = getStartOfWeek(currentDate);
      const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
      const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      return `${startStr} – ${endStr}`;
    }
    if (calendarSubView === 'year') {
      return `${currentDate.getFullYear()}`;
    }
    return currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });
  }, [calendarSubView, currentDate]);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay();

  // Week days calculation
  const weekDays = useMemo(() => {
    const start = getStartOfWeek(currentDate);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      const dateStr = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
      const dayMeetings = filteredMeetings.filter(m => m.date === dateStr);
      const dayTasks = tasks.filter(t => t.dueDate === dateStr && (
        t.assignedToId === currentUser.id || 
        t.createdById === currentUser.id || 
        (t.assignedToIds && t.assignedToIds.includes(currentUser.id)) ||
        (t.assignedDepartments && t.assignedDepartments.includes(currentUser.department))
      ));
      const dayBirthdays = staff.filter(s => isStaffBirthdayOnDate(s.birthday, dateStr));
      return {
        date: d,
        dateStr,
        dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
        dayNum: d.getDate(),
        isToday: dateStr === todayStr,
        isSelected: dateStr === selectedCalendarDate,
        meetings: dayMeetings,
        tasks: dayTasks,
        birthdays: dayBirthdays,
      };
    });
  }, [currentDate, filteredMeetings, tasks, staff, currentUser, todayStr, selectedCalendarDate]);

  // Year overview 12 months calculation
  const yearMonths = useMemo(() => {
    const currentYear = currentDate.getFullYear();
    return Array.from({ length: 12 }, (_, monthIdx) => {
      const monthDate = new Date(currentYear, monthIdx, 1);
      const daysCount = new Date(currentYear, monthIdx + 1, 0).getDate();
      const firstDay = new Date(currentYear, monthIdx, 1).getDay();
      const monthLabel = monthDate.toLocaleDateString('en-US', { month: 'long' });

      const days = [];
      const monthTasks: Task[] = [];
      for (let p = 0; p < firstDay; p++) {
        days.push({ dayNum: null, dateStr: '', isPadding: true, tasks: [] as Task[], meetings: [] as Meeting[], birthdays: [] as StaffUser[] });
      }
      for (let d = 1; d <= daysCount; d++) {
        const dateStr = `${currentYear}-${(monthIdx + 1).toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
        const dayMeetings = filteredMeetings.filter(m => m.date === dateStr);
        const dayTasks = tasks.filter(t => t.dueDate === dateStr && (
          t.assignedToId === currentUser.id || 
          t.createdById === currentUser.id || 
          (t.assignedToIds && t.assignedToIds.includes(currentUser.id)) ||
          (t.assignedDepartments && t.assignedDepartments.includes(currentUser.department))
        ));
        const dayBirthdays = staff.filter(s => isStaffBirthdayOnDate(s.birthday, dateStr));

        if (dayTasks.length > 0) {
          monthTasks.push(...dayTasks);
        }

        days.push({
          dayNum: d,
          dateStr,
          isPadding: false,
          isToday: dateStr === todayStr,
          isSelected: dateStr === selectedCalendarDate,
          hasMeetings: dayMeetings.length > 0,
          hasTasks: dayTasks.length > 0,
          hasBirthdays: dayBirthdays.length > 0,
          meetingsCount: dayMeetings.length,
          tasksCount: dayTasks.length,
          birthdaysCount: dayBirthdays.length,
          tasks: dayTasks,
          meetings: dayMeetings,
          birthdays: dayBirthdays,
        });
      }

      return {
        monthIdx,
        monthLabel,
        days,
        monthTasks,
      };
    });
  }, [currentDate, filteredMeetings, tasks, staff, currentUser, todayStr, selectedCalendarDate]);

  // Year statistics
  const yearStats = useMemo(() => {
    const currentYear = currentDate.getFullYear();
    const yearPrefix = `${currentYear}-`;
    const yearMeetings = filteredMeetings.filter(m => m.date && m.date.startsWith(yearPrefix)).length;
    const yearTasks = tasks.filter(t => t.dueDate && t.dueDate.startsWith(yearPrefix)).length;
    const yearBirthdays = staff.filter(s => s.birthday).length;
    return { yearMeetings, yearTasks, yearBirthdays };
  }, [currentDate, filteredMeetings, tasks, staff]);

  // Sync mode if prop changes
  React.useEffect(() => {
    setViewMode(initialMode);
  }, [initialMode]);

  const userTasksDueOnSelectedDate = useMemo(() => {
    return tasks.filter(t => t.dueDate === selectedCalendarDate && (
      t.assignedToId === currentUser.id || 
      t.createdById === currentUser.id || 
      (t.assignedToIds && t.assignedToIds.includes(currentUser.id)) ||
      (t.assignedDepartments && t.assignedDepartments.includes(currentUser.department))
    ));
  }, [tasks, selectedCalendarDate, currentUser]);

  const selectedDayBirthdays = useMemo(() => {
    if (!selectedCalendarDate) return [];
    return staff.filter(s => isStaffBirthdayOnDate(s.birthday, selectedCalendarDate));
  }, [staff, selectedCalendarDate]);

  const handleImportIcs = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;
      const events = text.split('BEGIN:VEVENT');
      let importedCount = 0;
      events.slice(1).forEach(ev => {
        const getField = (field: string) => {
          const match = ev.match(new RegExp(`${field}:(.*)`, 'i'));
          return match ? match[1].trim() : '';
        };
        const summary = getField('SUMMARY') || 'Imported Calendar Meeting';
        const description = getField('DESCRIPTION') || '';
        const dtstart = getField('DTSTART');
        let dateStr = new Date().toISOString().split('T')[0];
        let timeStr = '10:00 AM';
        if (dtstart && dtstart.length >= 8) {
          const y = dtstart.slice(0, 4);
          const m = dtstart.slice(4, 6);
          const d = dtstart.slice(6, 8);
          dateStr = `${y}-${m}-${d}`;
        }
        actions.addMeeting({
          title: summary,
          department: currentUser.department || 'Executive & Admin',
          date: dateStr,
          time: convertTo24HourTime(timeStr),
          startTime: timeStr,
          endTime: '11:00 AM',
          description: description || 'Imported from Outlook / Gmail / .ics calendar',
          agenda: ['External synced calendar event'],
          attendees: [{ userId: currentUser.id, name: currentUser.name, email: currentUser.email, status: 'Accepted', avatar: currentUser.avatar }],
          chairId: currentUser.id,
          chairName: currentUser.name,
          chairEmail: currentUser.email,
          meetingType: 'Microsoft Teams',
          recurrence: 'None',
        });
        importedCount++;
      });
      alert(`Successfully imported ${importedCount} meeting(s) from Outlook / Gmail (.ics) calendar!`);
      e.target.value = '';
    };
    reader.readAsText(file);
  };

  const handleCopyLink = (meeting: Meeting) => {
    if (meeting.teamsJoinUrl) {
      navigator.clipboard.writeText(meeting.teamsJoinUrl);
      setCopiedMeetingId(meeting.id);
      setTimeout(() => setCopiedMeetingId(null), 2000);
    }
  };

  // Open propose new time modal with auto-format
  const handleOpenProposalModal = (meeting: Meeting) => {
    const existingAttendee = meeting.attendees.find(
      a => a.userId === currentUser.id || a.email === currentUser.email || a.name === currentUser.name
    );
    setProposingMeeting(meeting);
    setProposedDate(existingAttendee?.proposedDate || meeting.date || new Date().toISOString().split('T')[0]);
    setProposedStartTime(convertTo24HourTime(existingAttendee?.proposedTime || meeting.startTime || meeting.time || '14:00'));
    setProposedEndTime(convertTo24HourTime(existingAttendee?.proposedEndTime || meeting.endTime || '15:00'));
    setProposalNote(existingAttendee?.proposalNote || existingAttendee?.note || '');
  };

  const handleSubmitProposal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!proposingMeeting) return;

    actions.respondToMeeting(proposingMeeting.id, 'Proposed New Time', {
      proposedDate,
      proposedTime: convertTo12HourTime(proposedStartTime),
      proposedEndTime: convertTo12HourTime(proposedEndTime),
      note: proposalNote.trim() || undefined,
    });

    setProposingMeeting(null);
  };

  // Open Edit Meeting Modal
  const handleOpenEditMeeting = (meeting: Meeting) => {
    setEditingMeeting(meeting);
    setEditTitle(meeting.title);
    setEditDepartment(meeting.department || 'Top management');
    setEditDate(meeting.date);
    setEditStartTime(meeting.startTime || meeting.time || '10:00 AM');
    setEditEndTime(meeting.endTime || '11:00 AM');
    setEditDescription(meeting.description || '');
    setEditAgenda(meeting.agenda ? [...meeting.agenda] : []);
    setNewAgendaInput('');
    setEditAttendees(meeting.attendees.map(a => a.userId));
    setEditRecurrence(meeting.recurrence || 'None');
    setEditChairId(meeting.chairId || meeting.organizerId || currentUser.id);
    setEditAttachments(meeting.attachments ? [...meeting.attachments] : []);
  };

  const handleEditMeetingFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setIsUploadingEditFile(true);
    try {
      const files = Array.from(e.target.files);
      const parsedList: MessageAttachment[] = [];
      for (const file of files) {
        const att = await parseUploadedFile(file);
        parsedList.push(att);
      }
      setEditAttachments(prev => [...prev, ...parsedList]);
    } catch (err) {
      console.error('Error attaching file in edit meeting:', err);
    } finally {
      setIsUploadingEditFile(false);
      e.target.value = '';
    }
  };

  const handleDetailAttachFile = async (e: React.ChangeEvent<HTMLInputElement>, meeting: Meeting) => {
    if (!e.target.files || e.target.files.length === 0) return;
    try {
      const files = Array.from(e.target.files);
      const parsedList: MessageAttachment[] = [];
      for (const file of files) {
        const att = await parseUploadedFile(file);
        parsedList.push(att);
      }
      const existing = meeting.attachments || [];
      const updated = [...existing, ...parsedList];
      actions.updateMeeting(meeting.id, { attachments: updated });
    } catch (err) {
      console.error('Error attaching file to meeting:', err);
    } finally {
      e.target.value = '';
    }
  };

  const handleDetailRemoveFile = (meeting: Meeting, attachmentId: string) => {
    const existing = meeting.attachments || [];
    const updated = existing.filter(a => a.id !== attachmentId);
    actions.updateMeeting(meeting.id, { attachments: updated });
  };

  // Dynamic conflict detection during edit
  const editConflicts = useMemo(() => {
    if (!editingMeeting) return [];
    return detectMeetingConflicts(
      editDate,
      editStartTime,
      editEndTime,
      editAttendees,
      meetings,
      staff,
      editingMeeting.id
    );
  }, [editDate, editStartTime, editEndTime, editAttendees, meetings, staff, editingMeeting]);

  const handleSaveEditMeeting = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMeeting || !editTitle.trim()) return;

    const chairStaff = staff.find(s => s.id === editChairId) || currentUser;

    // Retain RSVP status for existing attendees, or initialize new ones as Pending
    const updatedAttendeesList: MeetingAttendee[] = editAttendees.map(attId => {
      const existing = editingMeeting.attendees.find(a => a.userId === attId);
      const s = staff.find(staffMember => staffMember.id === attId);
      if (existing) {
        return existing;
      }
      return {
        userId: attId,
        name: s?.name || attId,
        email: s?.email || '',
        status: attId === editingMeeting.organizerId ? 'Accepted' : 'Pending',
        avatar: s?.avatar,
      };
    });

    // Make sure organizer is in attendee list if not already
    if (!updatedAttendeesList.some(a => a.userId === editingMeeting.organizerId)) {
      const orgStaff = staff.find(s => s.id === editingMeeting.organizerId) || currentUser;
      updatedAttendeesList.unshift({
        userId: orgStaff.id,
        name: orgStaff.name,
        email: orgStaff.email,
        status: 'Accepted',
        avatar: orgStaff.avatar,
      });
    }

    actions.updateMeeting(editingMeeting.id, {
      title: editTitle.trim(),
      department: editDepartment,
      date: editDate,
      startTime: editStartTime,
      endTime: editEndTime,
      time: editStartTime,
      description: editDescription.trim(),
      agenda: editAgenda,
      chairId: chairStaff.id,
      chairName: chairStaff.name,
      chairEmail: chairStaff.email,
      recurrence: editRecurrence,
      attendees: updatedAttendeesList,
      attachments: editAttachments,
    });

    setEditingMeeting(null);
  };

  const handleConfirmDelete = () => {
    if (deletingMeeting) {
      actions.deleteMeeting(deletingMeeting.id);
      setDeletingMeeting(null);
      if (detailMeetingId === deletingMeeting.id) {
        setDetailMeetingId(null);
      }
    }
  };

  // Helper: get attendee summary counts for a meeting
  const getRsvpSummary = (meeting: Meeting) => {
    let accepted = 0;
    let declined = 0;
    let proposed = 0;
    let pending = 0;

    // Filter out organizer when summarizing invitees' responses
    const invitees = meeting.attendees.filter(a => a.userId !== meeting.organizerId);

    invitees.forEach(a => {
      if (a.status === 'Accepted') accepted++;
      else if (a.status === 'Declined') declined++;
      else if (a.status === 'Proposed New Time') proposed++;
      else pending++;
    });

    return { accepted, declined, proposed, pending, total: invitees.length };
  };

  // Days in month for calendar + previous & next month overlap days
  const prevMonthDate = new Date(year, month - 1, 1);
  const prevMonthYear = prevMonthDate.getFullYear();
  const prevMonthNum = prevMonthDate.getMonth() + 1;
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const prevMonthOverlapDays = Array.from({ length: firstDayOfMonth }, (_, i) => {
    const dayNum = daysInPrevMonth - firstDayOfMonth + 1 + i;
    const dateStr = `${prevMonthYear}-${prevMonthNum.toString().padStart(2, '0')}-${dayNum.toString().padStart(2, '0')}`;
    const dayMeetings = filteredMeetings.filter(m => m.date === dateStr);
    const dayTasks = tasks.filter(t => t.dueDate === dateStr && (
      t.assignedToId === currentUser.id || 
      t.createdById === currentUser.id || 
      (t.assignedToIds && t.assignedToIds.includes(currentUser.id)) ||
      (t.assignedDepartments && t.assignedDepartments.includes(currentUser.department))
    ));
    const dayBirthdays = staff.filter(s => isStaffBirthdayOnDate(s.birthday, dateStr));
    return {
      dayNum,
      dateStr,
      meetings: dayMeetings,
      tasks: dayTasks,
      birthdays: dayBirthdays,
      isCurrentMonth: false,
      isPrevMonth: true,
      monthLabel: prevMonthDate.toLocaleString('default', { month: 'short' })
    };
  });

  const currentMonthDays = Array.from({ length: daysInMonth }, (_, i) => {
    const dayNum = i + 1;
    const dateStr = `${year}-${(month + 1).toString().padStart(2, '0')}-${dayNum.toString().padStart(2, '0')}`;
    const dayMeetings = filteredMeetings.filter(m => m.date === dateStr);
    const dayTasks = tasks.filter(t => t.dueDate === dateStr && (
      t.assignedToId === currentUser.id || 
      t.createdById === currentUser.id || 
      (t.assignedToIds && t.assignedToIds.includes(currentUser.id)) ||
      (t.assignedDepartments && t.assignedDepartments.includes(currentUser.department))
    ));
    const dayBirthdays = staff.filter(s => isStaffBirthdayOnDate(s.birthday, dateStr));
    return {
      dayNum,
      dateStr,
      meetings: dayMeetings,
      tasks: dayTasks,
      birthdays: dayBirthdays,
      isCurrentMonth: true,
      monthLabel: '' as string | undefined
    };
  });

  const totalCurrentCells = firstDayOfMonth + daysInMonth;
  const totalGridCells = Math.max(35, Math.ceil(totalCurrentCells / 7) * 7);
  const nextMonthDaysCount = totalGridCells - totalCurrentCells;
  const nextMonthDate = new Date(year, month + 1, 1);
  const nextMonthYear = nextMonthDate.getFullYear();
  const nextMonthNum = nextMonthDate.getMonth() + 1;

  const nextMonthOverlapDays = Array.from({ length: nextMonthDaysCount }, (_, i) => {
    const dayNum = i + 1;
    const dateStr = `${nextMonthYear}-${nextMonthNum.toString().padStart(2, '0')}-${dayNum.toString().padStart(2, '0')}`;
    const dayMeetings = filteredMeetings.filter(m => m.date === dateStr);
    const dayTasks = tasks.filter(t => t.dueDate === dateStr && (
      t.assignedToId === currentUser.id || 
      t.createdById === currentUser.id || 
      (t.assignedToIds && t.assignedToIds.includes(currentUser.id)) ||
      (t.assignedDepartments && t.assignedDepartments.includes(currentUser.department))
    ));
    const dayBirthdays = staff.filter(s => isStaffBirthdayOnDate(s.birthday, dateStr));
    return {
      dayNum,
      dateStr,
      meetings: dayMeetings,
      tasks: dayTasks,
      birthdays: dayBirthdays,
      isCurrentMonth: false,
      isNextMonth: true,
      monthLabel: nextMonthDate.toLocaleString('default', { month: 'short' })
    };
  });

  const fullCalendarGrid = [...prevMonthOverlapDays, ...currentMonthDays, ...nextMonthOverlapDays];

  const monthName = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  // Detail modal meeting instance (exclude archived meetings from active views)
  const selectedDetailMeeting = detailMeetingId
    ? meetings.find(m => m.id === detailMeetingId && !isMeetingArchived(m, { nowMs: archiveTick }))
    : null;

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Conferencing & Collaboration
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded bg-purple-50 text-purple-700 font-bold border border-purple-200">
              Microsoft Teams & Outlook (.ics)
            </span>
          </div>
          <h1 className="text-xl font-bold text-[#19232d]">
            {viewMode === 'calendar' ? 'Office Calendar & Sessions' : 'Meetings, RSVP & Conferencing'}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time invitee RSVP responses, proposed time negotiations, and organizer controls with conflict detection.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5 text-xs">
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 rounded font-medium transition ${
                viewMode === 'list'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              List View
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`px-3 py-1.5 rounded font-medium transition ${
                viewMode === 'calendar'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Calendar
            </button>
          </div>

          <input
            type="file"
            accept=".ics"
            ref={icsFileRef}
            onChange={handleImportIcs}
            className="hidden"
          />
          <button
            onClick={() => icsFileRef.current?.click()}
            className="px-3 py-2 rounded-md bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 shadow-xs transition"
            title="Import calendar from Outlook, Gmail, or .ics file"
          >
            <Download className="w-3.5 h-3.5 text-blue-600" />
            <span>Import Calendar (.ics)</span>
          </button>

          <button
            onClick={onOpenScheduleModal}
            className="px-3.5 py-2 rounded-md bg-[#00ad1d] hover:bg-[#009218] text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Schedule Meeting</span>
          </button>
        </div>
      </div>

      {/* Calendar Mode */}
      {viewMode === 'calendar' ? (
        <div className="space-y-4">
          <div className="bg-white rounded-lg border border-slate-200 p-5 shadow-xs">
            {/* Calendar Sub-header with Navigation & View Mode Switcher */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <span className="p-1.5 rounded-md bg-[#00ad1d]/10 text-[#008f18]">
                  <Calendar className="w-5 h-5" />
                </span>
                <div>
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <span>{calendarHeaderTitle}</span>
                  </h2>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500 mt-0.5">
                    <span>East Africa Time (EAT) • {filteredMeetings.length} meetings, {tasks.length} tasks</span>
                    <span className="hidden sm:inline-flex items-center gap-3 pl-2 border-l border-slate-200 text-[10px]">
                       <span className="inline-flex items-center gap-1.5" title="Khushali (Celebratory occasion e.g. Eid, Wiladat)">
                         <span className="w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white ring-2 ring-emerald-500/50 inline-block shrink-0 shadow-sm" />
                         <span className="font-medium text-slate-700">Khushali</span>
                       </span>
                       <span className="inline-flex items-center gap-1.5" title="Wafaat (Solemn / Commemoration occasion e.g. Ashura, Shahadat)">
                         <span className="w-3.5 h-3.5 rounded-full bg-slate-900 border-2 border-slate-200 ring-2 ring-slate-900/50 inline-block shrink-0 shadow-sm" />
                         <span className="font-medium text-slate-700">Wafaat</span>
                       </span>
                       <span className="inline-flex items-center gap-1.5" title="Official Tanzania Public Holiday">
                         <span className="w-4.5 h-4.5 rounded-full inline-flex items-center justify-center shadow-sm border border-emerald-800 overflow-hidden bg-white shrink-0">
                           <svg viewBox="0 0 900 600" className="w-full h-full object-cover">
                             <rect width="900" height="600" fill="#00a3dd" />
                             <polygon points="0,0 900,0 0,600" fill="#1eb53a" />
                             <polygon points="0,200 700,600 900,600 900,400 200,0 0,0" fill="#fcd116" />
                             <polygon points="0,240 640,600 900,600 900,360 260,0 0,0" fill="#000000" />
                           </svg>
                         </span>
                         <span className="font-medium text-slate-700">Tanzania Holiday</span>
                       </span>
                       <span className="inline-flex items-center gap-1.5" title="UN Designated Day (e.g. World Water Day, Health Day, Women Day)">
                         <span className="w-4 h-4 rounded-full inline-flex items-center justify-center text-[9px] bg-sky-600 text-white shadow-sm border-2 border-white ring-1 ring-sky-500/50 shrink-0">🌐</span>
                         <span className="font-medium text-slate-700">UN Designated Day</span>
                       </span>
                     </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                {/* Navigation: Today, Prev, Next */}
                <div className="flex items-center gap-1 bg-slate-50 p-0.5 rounded-md border border-slate-200">
                  <button
                    type="button"
                    onClick={handleToday}
                    className="px-2.5 py-1 text-xs font-semibold text-slate-700 hover:text-slate-900 hover:bg-white rounded transition shadow-2xs cursor-pointer"
                  >
                    Today
                  </button>
                  <div className="w-[1px] h-3.5 bg-slate-200" />
                  <button
                    type="button"
                    onClick={handlePrev}
                    className="p-1 text-slate-600 hover:text-slate-900 hover:bg-white rounded transition cursor-pointer"
                    title="Previous"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleNext}
                    className="p-1 text-slate-600 hover:text-slate-900 hover:bg-white rounded transition cursor-pointer"
                    title="Next"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                {/* Sub-view switcher: Day | Week | Month | Year */}
                <div className="oh-calendar-tabs grid grid-cols-2 sm:flex rounded-md border border-slate-200 bg-slate-50 p-0.5 text-xs">
                  {[
                    { id: 'day', label: 'Day', icon: Clock },
                    { id: 'week', label: 'Week', icon: Columns3 },
                    { id: 'month', label: 'Month', icon: LayoutGrid },
                    { id: 'year', label: 'Year', icon: CalendarRange }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setCalendarSubView(tab.id as any)}
                      className={`px-2.5 py-1 rounded font-semibold flex items-center gap-1 transition cursor-pointer ${
                        calendarSubView === tab.id
                          ? 'bg-white text-slate-900 shadow-2xs font-bold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <tab.icon className="w-3.5 h-3.5 text-[#00ad1d]" />
                      <span>{tab.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* DAY VIEW */}
            {calendarSubView === 'day' && (
              <div className="mt-4 space-y-4">
                {/* Day Header Banner */}
                <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[#00ad1d] text-white flex flex-col items-center justify-center font-bold shrink-0 shadow-xs">
                      <span className="text-[10px] uppercase leading-none">
                        {currentDate.toLocaleDateString('en-US', { weekday: 'short' })}
                      </span>
                      <span className="text-base leading-tight">
                        {currentDate.getDate()}
                      </span>
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">
                        {currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                      </h3>
                      <p className="text-xs text-slate-500">
                        {filteredMeetings.filter(m => m.date === selectedCalendarDate).length} meetings scheduled • {userTasksDueOnSelectedDate.length} tasks due
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {getCalendarOccasions(selectedCalendarDate).map(occ => (
                      <div
                        key={occ.id}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border shadow-2xs ${occ.badgeBgClass} ${occ.badgeTextClass}`}
                      >
                        <span className={`w-2 h-2 rounded-full ${occ.dotColorClass} shrink-0`} />
                        <span>{occ.name}</span>
                        {occ.hijriDateStr && (
                          <span className="text-[10px] opacity-80 font-normal">({occ.hijriDateStr})</span>
                        )}
                      </div>
                    ))}

                    {selectedDayBirthdays.length > 0 && (
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-pink-50 border border-pink-200 text-pink-900 text-xs shadow-2xs">
                        <Gift className="w-4 h-4 text-rose-600 shrink-0" />
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold">Staff Birthday:</span>
                          {selectedDayBirthdays.map(b => (
                            <span key={b.id} className="font-semibold text-rose-700">
                              {b.name} ({b.department})
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Day All-Day / Due Tasks Tray */}
                {userTasksDueOnSelectedDate.length > 0 && (
                  <div className="p-3.5 bg-emerald-50/60 rounded-lg border border-emerald-200 space-y-2.5 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-[#00ad1d]" />
                        <span>Tasks Due Today ({userTasksDueOnSelectedDate.length})</span>
                      </h4>
                      <span className="text-[10px] text-emerald-700 font-medium">Hover for summary • Click to view task</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                      {userTasksDueOnSelectedDate.map(t => (
                        <div
                          key={t.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTaskDetail(t);
                            if (onSelectTask) onSelectTask(t.id);
                          }}
                          onMouseEnter={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setHoveredActivity({ item: t, type: 'task', x: rect.left, y: rect.bottom + 4 });
                          }}
                          onMouseLeave={() => setHoveredActivity(null)}
                          className="p-1.5 rounded-md bg-emerald-100/90 hover:bg-emerald-200 text-emerald-900 border border-emerald-300/80 truncate font-bold text-xs flex items-center justify-between gap-1.5 shadow-2xs hover:scale-[1.01] transition cursor-pointer"
                        >
                          <span className="truncate">✓ {t.title}</span>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded shrink-0 font-bold ${
                            t.priority === 'Urgent' || t.priority === 'High' ? 'bg-rose-200 text-rose-900' : 'bg-emerald-200/80 text-emerald-900'
                          }`}>
                            {t.priority}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Day Timeline Hours */}
                <div className="border border-slate-200 rounded-lg overflow-hidden bg-white divide-y divide-slate-100">
                  {timeSlots.map(hour => {
                    const slotMeetings = filteredMeetings.filter(m => {
                      if (m.date !== selectedCalendarDate) return false;
                      const h = getHourFromTimeString(m.startTime || m.time);
                      return h === hour;
                    });

                    return (
                      <div
                        key={hour}
                        onClick={(e) => handleHourSlotClick(e, selectedCalendarDate, hour)}
                        className="flex items-stretch min-h-[72px] hover:bg-slate-50/80 transition group cursor-pointer"
                      >
                        {/* Hour Label Column */}
                        <div className="w-20 sm:w-24 p-2.5 border-r border-slate-100 text-right shrink-0 bg-slate-50/40 select-none">
                          <span className="text-xs font-semibold text-slate-500 group-hover:text-slate-900">
                            {formatHourLabel(hour)}
                          </span>
                        </div>

                        {/* Events Content Area */}
                        <div className="flex-1 p-2 space-y-2 relative">
                          {slotMeetings.length === 0 ? (
                            <div className="h-full flex items-center opacity-0 group-hover:opacity-100 transition text-[11px] text-slate-400 gap-1 pl-2">
                              <Plus className="w-3.5 h-3.5 text-[#00ad1d]" />
                              <span>Click to schedule meeting at {formatHourLabel(hour)}</span>
                            </div>
                          ) : (
                            slotMeetings.map(m => {
                              const summary = getRsvpSummary(m);
                              const isCreator = m.organizerId === currentUser.id;

                              return (
                                <div
                                  key={m.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDetailMeetingId(m.id);
                                    if (onSelectMeeting) onSelectMeeting(m.id);
                                  }}
                                  className="p-3 bg-purple-50 hover:bg-purple-100/80 border border-purple-200 rounded-lg transition shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer"
                                >
                                  <div className="space-y-1 min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className="px-2 py-0.5 bg-purple-200/70 text-purple-900 font-bold text-[10px] rounded uppercase">
                                        {m.department}
                                      </span>
                                      <span className="text-xs font-bold text-purple-800">
                                        {m.startTime || m.time} – {m.endTime || '1 Hour'}
                                      </span>
                                      {isCreator && (
                                        <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                                          Organizer
                                        </span>
                                      )}
                                    </div>
                                    <h4 className="text-xs font-bold text-slate-900 truncate">{m.title}</h4>
                                    <div className="flex items-center gap-3 text-[11px] text-slate-600">
                                      <span>Chair: <strong>{m.chairName || 'Staff'}</strong></span>
                                      <span>•</span>
                                      <span>{summary.accepted} Accepted, {summary.pending} Pending</span>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2 shrink-0">
                                    <a
                                      href={m.teamsJoinUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="px-2.5 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded text-xs font-semibold inline-flex items-center gap-1 shadow-2xs"
                                    >
                                      <Video className="w-3.5 h-3.5" />
                                      <span>Join</span>
                                    </a>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setDetailMeetingId(m.id);
                                      }}
                                      className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded text-xs font-medium inline-flex items-center gap-1 shadow-2xs"
                                    >
                                      <Eye className="w-3.5 h-3.5" />
                                      <span>Details</span>
                                    </button>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* WEEK VIEW */}
            {calendarSubView === 'week' && (
              <div className="mt-4 border border-slate-200 rounded-lg overflow-x-auto bg-white" tabIndex={0} role="region" aria-label="Weekly calendar; scroll horizontally to see all days">
                <p className="sticky left-0 w-fit p-2 text-[11px] text-slate-500 xl:hidden">Scroll sideways to see all days</p>
                <div className="min-w-[56rem]">
                {/* 7 Day Column Headers */}
                <div className="grid grid-cols-8 border-b border-slate-200 bg-slate-50 text-center divide-x divide-slate-200">
                  {/* Time label corner */}
                  <div className="p-2 text-[10px] font-bold text-slate-400 flex items-center justify-center uppercase">
                    Time (EAT)
                  </div>

                  {weekDays.map(day => (
                    <div
                      key={day.dateStr}
                      onClick={() => {
                        setSelectedCalendarDate(day.dateStr);
                        setCurrentDate(day.date);
                      }}
                      className={`p-2.5 transition cursor-pointer ${
                        day.isSelected ? 'bg-[#00ad1d]/10' : 'hover:bg-slate-100/80'
                      }`}
                    >
                      <p className="text-[11px] font-semibold text-slate-500 uppercase">{day.dayName}</p>
                      <p className="mt-0.5">
                        <span className={`inline-flex items-center justify-center w-7 h-7 text-xs font-bold rounded-full ${
                          day.isToday
                            ? 'bg-[#00ad1d] text-white shadow-xs'
                            : 'text-slate-800'
                        }`}>
                          {day.dayNum}
                        </span>
                      </p>

                      {/* Shia Events & Tanzania Holiday Markers in Week Column Header */}
                      <div className="mt-0.5 flex items-center justify-center">
                        <CalendarOccasionDots dateStr={day.dateStr} size="xs" align="center" />
                      </div>

                      {/* Birthday badge in header */}
                      {day.birthdays.length > 0 && (
                        <div className="mt-1 flex items-center justify-center">
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 text-[9px] font-bold border border-rose-200 shadow-2xs truncate max-w-full"
                            title={`Birthday: ${day.birthdays.map(b => b.name).join(', ')}`}
                          >
                            <Gift className="w-2.5 h-2.5 text-rose-600 shrink-0" />
                            <span className="truncate">{day.birthdays[0].name}</span>
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* All-Day / Due Tasks Row in Week View */}
                <div className="grid grid-cols-8 border-b border-slate-200 bg-emerald-50/25 divide-x divide-slate-200 min-h-[44px]">
                  <div className="p-1.5 text-[10px] font-bold text-emerald-800 flex items-center justify-center uppercase bg-emerald-50/60 select-none text-center leading-tight">
                    Due Tasks
                  </div>
                  {weekDays.map(day => (
                    <div key={`week-tasks-${day.dateStr}`} className="p-1 space-y-1">
                      {day.tasks.length === 0 ? (
                        <span className="text-[10px] text-slate-300 italic block text-center py-1.5">—</span>
                      ) : (
                        day.tasks.map(t => (
                          <div
                            key={t.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTaskDetail(t);
                              if (onSelectTask) onSelectTask(t.id);
                            }}
                            onMouseEnter={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              setHoveredActivity({ item: t, type: 'task', x: rect.left, y: rect.bottom + 4 });
                            }}
                            onMouseLeave={() => setHoveredActivity(null)}
                            className="p-1 rounded bg-emerald-100/90 hover:bg-emerald-200 text-emerald-900 border border-emerald-300/80 truncate font-bold text-[9px] flex items-center justify-between gap-1 shadow-2xs hover:scale-[1.02] transition cursor-pointer"
                          >
                            <span className="truncate">✓ {t.title}</span>
                            <span className="text-[8px] text-emerald-700 shrink-0 font-semibold">{t.priority}</span>
                          </div>
                        ))
                      )}
                    </div>
                  ))}
                </div>

                {/* Week Hourly Matrix */}
                <div className="divide-y divide-slate-100 max-h-[640px] overflow-y-auto">
                  {timeSlots.map(hour => (
                    <div key={hour} className="grid grid-cols-8 divide-x divide-slate-100 min-h-[58px]">
                      {/* Hour label */}
                      <div className="p-1.5 text-right text-[11px] font-semibold text-slate-400 bg-slate-50/50 select-none">
                        {formatHourLabel(hour)}
                      </div>

                      {/* 7 Days Columns for this hour */}
                      {weekDays.map(day => {
                        const cellMeetings = day.meetings.filter(m => {
                          const h = getHourFromTimeString(m.startTime || m.time);
                          return h === hour;
                        });

                        return (
                          <div
                            key={`${day.dateStr}-${hour}`}
                            onClick={(e) => handleHourSlotClick(e, day.dateStr, hour)}
                            className="p-1 relative hover:bg-slate-50 transition cursor-pointer group space-y-1"
                          >
                            {cellMeetings.map(m => (
                              <div
                                key={m.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDetailMeetingId(m.id);
                                  if (onSelectMeeting) onSelectMeeting(m.id);
                                }}
                                onMouseEnter={(e) => {
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  setHoveredActivity({ item: m, type: 'meeting', x: rect.left, y: rect.bottom + 4 });
                                }}
                                onMouseLeave={() => setHoveredActivity(null)}
                                className="p-1.5 rounded bg-purple-100/90 hover:bg-purple-200 text-purple-900 border border-purple-300 text-[10px] font-bold shadow-2xs space-y-0.5 cursor-pointer"
                              >
                                <p className="truncate leading-tight">{m.title}</p>
                                <p className="text-[9px] text-purple-700 font-mono font-medium">{m.startTime || m.time}</p>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
                </div>
              </div>
            )}

            {/* MONTH VIEW */}
            {calendarSubView === 'month' && (
              <div className="mt-4 overflow-x-auto" tabIndex={0} role="region" aria-label="Monthly calendar; scroll horizontally to see all days">
                <p className="sticky left-0 w-fit mb-2 text-[11px] text-slate-500 md:hidden">Scroll sideways to see all days</p>
                <div className="grid grid-cols-7 gap-2 text-center min-w-[40rem]">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                    <div key={day} className="text-xs font-bold text-slate-400 py-1">
                      {day}
                    </div>
                  ))}

                  {fullCalendarGrid.map((item, idx) => {
                    const isSelected = selectedCalendarDate === item.dateStr;
                    const isToday = item.dateStr === todayStr;
                    const hasEvents = item.meetings.length > 0 || item.tasks.length > 0;
                    const hasBirthdays = item.birthdays && item.birthdays.length > 0;
                    const hasAnyActivity = hasEvents || hasBirthdays;
                    const isOverlapDay = !item.isCurrentMonth;
                    
                    return (
                      <div
                        key={`${item.dateStr}-${idx}`}
                        onClick={(e) => handleDayCellClick(e, item.dateStr)}
                        className={`min-h-24 p-2 rounded-md border text-left flex flex-col justify-between transition cursor-pointer select-none ${
                          isSelected
                            ? 'border-[#00ad1d] bg-[#00ad1d]/10 ring-2 ring-[#00ad1d] shadow-2xs'
                            : isToday
                            ? 'border-2 border-[#00ad1d] bg-emerald-50 text-emerald-900 font-bold shadow-xs'
                            : isOverlapDay
                            ? 'border-slate-200/90 bg-slate-100/70 text-slate-400 opacity-80 shadow-[inset_0_2px_4px_rgba(0,0,0,0.06)] hover:opacity-100 hover:bg-slate-100'
                            : hasBirthdays
                            ? 'border-pink-200 bg-pink-50/40 hover:border-pink-300'
                            : hasEvents
                            ? 'border-purple-200 bg-purple-50/40 hover:border-purple-300'
                            : 'border-slate-100 bg-slate-50/50 hover:bg-slate-100/80'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className={`text-xs ${
                            isToday 
                              ? 'bg-[#00ad1d] text-white px-1.5 py-0.5 rounded font-bold' 
                              : isOverlapDay 
                              ? 'font-semibold text-slate-400 text-[10px]' 
                              : 'font-semibold text-slate-700'
                          }`}>
                            {isOverlapDay ? `${item.monthLabel} ${item.dayNum}` : item.dayNum}
                          </span>
                          
                          <div className="flex items-center gap-1">
                            {/* Shia Islamic & Tanzania Holiday Background Markers */}
                            <CalendarOccasionDots dateStr={item.dateStr} size="sm" />

                            {hasBirthdays && (
                              <span
                                className="inline-flex items-center justify-center p-0.5 rounded-full bg-rose-100 text-rose-600 border border-rose-200 hover:bg-rose-200 transition shadow-2xs"
                                title={`Birthday: ${item.birthdays.map(b => `${b.name} (${b.role || 'Staff'})`).join(', ')}`}
                              >
                                <Gift className="w-3 h-3 text-rose-600" />
                              </span>
                            )}
                            {hasEvents && (
                              <span className={`w-1.5 h-1.5 rounded-full ${isOverlapDay ? 'bg-slate-400' : 'bg-purple-600'}`}></span>
                            )}
                          </div>
                        </div>

                        {/* Interactive Badges for Birthdays, Meetings & Tasks */}
                        {hasAnyActivity && (
                          <div className="space-y-1 mt-1.5 w-full text-[9px] overflow-hidden">
                            {hasBirthdays && item.birthdays.map(b => (
                              <div
                                key={b.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                }}
                                className="p-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-900 border border-rose-200 truncate font-semibold text-[9px] flex items-center gap-1 shadow-2xs transition"
                                title={`Birthday: ${b.name} (${b.role || 'Staff'} • ${b.department})`}
                              >
                                <Gift className="w-2.5 h-2.5 text-rose-600 shrink-0" />
                                <span className="truncate">{b.name}</span>
                              </div>
                            ))}

                            {item.meetings.map(m => (
                              <div
                                key={m.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDetailMeetingId(m.id);
                                  if (onSelectMeeting) onSelectMeeting(m.id);
                                }}
                                onMouseEnter={(e) => {
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  setHoveredActivity({ item: m, type: 'meeting', x: rect.left, y: rect.bottom + 4 });
                                }}
                                onMouseLeave={() => setHoveredActivity(null)}
                                className="p-1 rounded bg-purple-100/90 hover:bg-purple-200 text-purple-900 border border-purple-300/80 truncate font-bold text-[9px] flex items-center justify-between gap-1 shadow-2xs hover:scale-[1.02] transition cursor-pointer"
                              >
                                <span className="truncate">{m.title}</span>
                                <span className="text-[8px] text-purple-700 shrink-0 font-mono">{m.startTime || m.time}</span>
                              </div>
                            ))}

                            {item.tasks.map(t => (
                              <div
                                key={t.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedTaskDetail(t);
                                  if (onSelectTask) onSelectTask(t.id);
                                }}
                                onMouseEnter={(e) => {
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  setHoveredActivity({ item: t, type: 'task', x: rect.left, y: rect.bottom + 4 });
                                }}
                                onMouseLeave={() => setHoveredActivity(null)}
                                className="p-1 rounded bg-emerald-100/90 hover:bg-emerald-200 text-emerald-900 border border-emerald-300/80 truncate font-bold text-[9px] flex items-center justify-between gap-1 shadow-2xs hover:scale-[1.02] transition cursor-pointer"
                              >
                                <span className="truncate">✓ {t.title}</span>
                                <span className="text-[8px] text-emerald-700 shrink-0 font-semibold">{t.priority}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* YEAR VIEW */}
            {calendarSubView === 'year' && (
              <div className="mt-4 space-y-5">
                {/* Year Metrics Overview Card */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-4 bg-purple-50 rounded-lg border border-purple-200 flex items-center justify-between shadow-2xs">
                    <div>
                      <p className="text-[11px] font-semibold text-purple-700 uppercase">Meetings in {currentDate.getFullYear()}</p>
                      <p className="text-2xl font-bold text-purple-950 mt-0.5">{yearStats.yearMeetings}</p>
                      <p className="text-[10px] text-purple-600 mt-0.5">Scheduled sessions across departments</p>
                    </div>
                    <Video className="w-8 h-8 text-purple-400 shrink-0" />
                  </div>

                  <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-200 flex items-center justify-between shadow-2xs">
                    <div>
                      <p className="text-[11px] font-semibold text-emerald-700 uppercase">Tasks with Deadlines</p>
                      <p className="text-2xl font-bold text-emerald-950 mt-0.5">{yearStats.yearTasks}</p>
                      <p className="text-[10px] text-emerald-600 mt-0.5">Assigned work programmes</p>
                    </div>
                    <CheckCircle2 className="w-8 h-8 text-emerald-400 shrink-0" />
                  </div>

                  <div className="p-4 bg-rose-50 rounded-lg border border-rose-200 flex items-center justify-between shadow-2xs">
                    <div>
                      <p className="text-[11px] font-semibold text-rose-700 uppercase">Staff Birthdays</p>
                      <p className="text-2xl font-bold text-rose-950 mt-0.5">{yearStats.yearBirthdays}</p>
                      <p className="text-[10px] text-rose-600 mt-0.5">Team celebrations throughout {currentDate.getFullYear()}</p>
                    </div>
                    <Gift className="w-8 h-8 text-rose-400 shrink-0" />
                  </div>
                </div>

                {/* 12 Months Heatmap Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {yearMonths.map(mInfo => (
                    <div
                      key={mInfo.monthIdx}
                      className="p-3.5 bg-slate-50/60 hover:bg-slate-50 rounded-lg border border-slate-200 transition shadow-2xs flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between pb-2 border-b border-slate-200/80 mb-2">
                          <h4 className="text-xs font-bold text-slate-900">{mInfo.monthLabel}</h4>
                          <button
                            type="button"
                            onClick={() => {
                              setCurrentDate(new Date(currentDate.getFullYear(), mInfo.monthIdx, 1));
                              setCalendarSubView('month');
                            }}
                            className="text-[10px] text-[#008f18] hover:text-[#006e12] font-semibold hover:underline cursor-pointer"
                          >
                            Open Month
                          </button>
                        </div>

                        {/* Mini Day-of-week header */}
                        <div className="grid grid-cols-7 text-center text-[9px] font-bold text-slate-400 mb-1">
                          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, di) => (
                            <span key={di}>{d}</span>
                          ))}
                        </div>

                        {/* Mini Days Grid */}
                        <div className="grid grid-cols-7 gap-1 text-center text-[10px]">
                          {mInfo.days.map((d, di) => {
                            if (d.isPadding) {
                              return <div key={`pad-${di}`} className="h-6" />;
                            }

                            const dayOccasions = getCalendarOccasions(d.dateStr);
                            const hasOccasions = dayOccasions.length > 0;
                            const hasAny = d.hasMeetings || d.hasTasks || d.hasBirthdays || hasOccasions;

                            return (
                              <button
                                key={`d-${di}`}
                                type="button"
                                onClick={() => {
                                  setSelectedCalendarDate(d.dateStr);
                                  setCurrentDate(new Date(currentDate.getFullYear(), mInfo.monthIdx, d.dayNum!));
                                  setCalendarSubView('day');
                                }}
                                onMouseEnter={(e) => {
                                  if (d.tasks && d.tasks.length > 0) {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    setHoveredActivity({ item: d.tasks[0], type: 'task', x: rect.left, y: rect.bottom + 4 });
                                  } else if (d.meetings && d.meetings.length > 0) {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    setHoveredActivity({ item: d.meetings[0], type: 'meeting', x: rect.left, y: rect.bottom + 4 });
                                  }
                                }}
                                onMouseLeave={() => setHoveredActivity(null)}
                                title={`${d.dateStr}${hasOccasions ? ` • ${dayOccasions.map(o => o.name).join('; ')}` : ''}: ${d.meetingsCount} meetings, ${d.tasksCount} tasks, ${d.birthdaysCount} birthdays`}
                                className={`h-6 rounded flex flex-col items-center justify-center transition cursor-pointer relative ${
                                  d.isToday
                                    ? 'bg-[#00ad1d] text-white font-bold shadow-2xs'
                                    : d.isSelected
                                    ? 'bg-emerald-100 text-emerald-900 font-bold'
                                    : 'text-slate-700 hover:bg-white hover:shadow-2xs'
                                }`}
                              >
                                <span>{d.dayNum}</span>
                                {hasAny && !d.isToday && (
                                  <span className="flex items-center gap-0.5 absolute bottom-0.5">
                                    {dayOccasions.map(occ => (
                                      <span
                                        key={occ.id}
                                        className={`w-1 h-1 rounded-full ${
                                          occ.category === 'shia_happy'
                                            ? 'bg-emerald-500'
                                            : occ.category === 'shia_mourning'
                                            ? 'bg-slate-900'
                                            : 'bg-blue-600'
                                        }`}
                                      />
                                    ))}
                                    {d.hasBirthdays && <span className="w-1 h-1 rounded-full bg-rose-500" />}
                                    {d.hasMeetings && <span className="w-1 h-1 rounded-full bg-purple-500" />}
                                    {d.hasTasks && <span className="w-1 h-1 rounded-full bg-emerald-500" />}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>

                        {/* Month Tasks Due Preview */}
                        {mInfo.monthTasks && mInfo.monthTasks.length > 0 && (
                          <div className="mt-2.5 pt-2 border-t border-slate-200/70 space-y-1">
                            <div className="flex items-center justify-between text-[9px] font-bold text-emerald-800">
                              <span>Due Tasks ({mInfo.monthTasks.length})</span>
                            </div>
                            <div className="space-y-1">
                              {mInfo.monthTasks.slice(0, 2).map(t => (
                                <div
                                  key={t.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedTaskDetail(t);
                                    if (onSelectTask) onSelectTask(t.id);
                                  }}
                                  onMouseEnter={(e) => {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    setHoveredActivity({ item: t, type: 'task', x: rect.left, y: rect.bottom + 4 });
                                  }}
                                  onMouseLeave={() => setHoveredActivity(null)}
                                  className="p-1 rounded bg-emerald-100/90 hover:bg-emerald-200 text-emerald-900 border border-emerald-300/80 truncate font-bold text-[9px] flex items-center justify-between gap-1 shadow-2xs hover:scale-[1.02] transition cursor-pointer"
                                >
                                  <span className="truncate">✓ {t.title}</span>
                                  <span className="text-[8px] text-emerald-700 shrink-0 font-semibold">{t.dueDate ? `${t.dueDate.slice(8)}th` : ''}</span>
                                </div>
                              ))}
                              {mInfo.monthTasks.length > 2 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCurrentDate(new Date(currentDate.getFullYear(), mInfo.monthIdx, 1));
                                    setCalendarSubView('month');
                                  }}
                                  className="text-[9px] text-[#008f18] hover:underline font-bold block w-full text-right cursor-pointer pt-0.5"
                                >
                                  +{mInfo.monthTasks.length - 2} more tasks
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Selected Date Details (shown on all calendar modes) */}
          <div className="bg-white rounded-lg border border-slate-200 p-5 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-[#00ad1d]" />
                <span>Schedule & Due Tasks on {selectedCalendarDate}</span>
                <span className="text-xs text-slate-400 font-normal">
                  ({filteredMeetings.filter(m => m.date === selectedCalendarDate).length} meetings, {userTasksDueOnSelectedDate.length} tasks due)
                </span>
              </span>
            </h3>

            {/* Occasions / Holidays Banner on Selected Date */}
            {getCalendarOccasions(selectedCalendarDate).length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {getCalendarOccasions(selectedCalendarDate).map(occ => (
                  <div
                    key={occ.id}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border shadow-2xs ${occ.badgeBgClass} ${occ.badgeTextClass}`}
                  >
                    <span className={`w-2 h-2 rounded-full ${occ.dotColorClass} shrink-0`} />
                    <span>{occ.name}</span>
                    {occ.hijriDateStr && (
                      <span className="text-[10px] opacity-80 font-normal">({occ.hijriDateStr})</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Staff Birthday Banner on Selected Date */}
            {selectedDayBirthdays.length > 0 && (
              <div className="p-3 bg-gradient-to-r from-pink-50 via-rose-50 to-amber-50 rounded-lg border border-pink-200 flex items-center justify-between shadow-2xs">
                <div className="flex items-center gap-3">
                  <span className="p-2 rounded-full bg-pink-100 text-pink-600 border border-pink-200 shadow-2xs shrink-0">
                    <Gift className="w-4 h-4" />
                  </span>
                  <div>
                    <h4 className="text-xs font-bold text-pink-900 flex items-center gap-1.5">
                      <span>Staff Birthday Celebration Today</span>
                    </h4>
                    <div className="flex flex-wrap gap-2 mt-0.5">
                      {selectedDayBirthdays.map(b => (
                        <span key={b.id} className="text-[11px] font-semibold text-pink-800 flex items-center gap-1">
                          <UserAvatar name={b.name} avatar={b.avatar} className="w-4 h-4" />
                          <span>{b.name}</span>
                          <span className="text-[10px] text-pink-600 font-normal">({b.role} • {b.department})</span>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Meetings */}
            <div>
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Scheduled Meetings</h4>
              {filteredMeetings.filter(m => m.date === selectedCalendarDate).length === 0 ? (
                <p className="text-xs text-slate-400 italic py-1">No meetings scheduled on this date.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredMeetings.filter(m => m.date === selectedCalendarDate).map(m => {
                    const summary = getRsvpSummary(m);
                    const isCreator = m.organizerId === currentUser.id;
                    const userAttendee = m.attendees.find(a => a.userId === currentUser.id && a.userId !== m.organizerId);

                    return (
                      <div key={m.id} className="p-4 rounded-lg border border-slate-200 bg-slate-50/60 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-slate-200/70 text-slate-700">
                              {m.department}
                            </span>
                            <h4 className="text-xs font-bold text-slate-900 mt-1">{m.title}</h4>
                          </div>
                        <span className="text-[11px] font-bold text-purple-800 bg-purple-100 px-2 py-0.5 rounded shrink-0">
                          {m.startTime || m.time}
                        </span>
                      </div>

                      {/* Attached Documents if any */}
                      {renderMeetingAttachments(m.attachments, { compact: true })}

                      {/* RSVP Summary Pills */}
                      <div className="flex flex-wrap items-center gap-1.5 text-[10px] bg-white p-2 rounded-md border border-slate-200">
                        <span className="font-semibold text-slate-600">Invitees RSVP:</span>
                        <span className="text-emerald-700 font-bold">{summary.accepted} Accepted</span>
                        <span className="text-slate-300">•</span>
                        <span className="text-amber-700 font-bold">{summary.proposed} Proposed</span>
                        <span className="text-slate-300">•</span>
                        <span className="text-rose-700 font-bold">{summary.declined} Declined</span>
                        <span className="text-slate-300">•</span>
                        <span className="text-slate-500 font-medium">{summary.pending} Pending</span>
                      </div>

                      {/* Organizer or Invitee Actions */}
                      {isCreator ? (
                        <div className="p-2.5 bg-purple-50/80 rounded-md border border-purple-200 flex flex-wrap gap-2 items-center justify-between">
                          <div className="flex items-center gap-1.5 text-purple-900 font-bold text-[11px]">
                            <ShieldCheck className="w-3.5 h-3.5 text-purple-700" />
                            <span>You are the Organizer</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleOpenEditMeeting(m)}
                              className="px-2 py-1 bg-white hover:bg-purple-100 text-purple-800 border border-purple-200 rounded text-[10px] font-bold flex items-center gap-1 shadow-2xs"
                            >
                              <Pencil className="w-3 h-3" />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeletingMeeting(m)}
                              className="px-2 py-1 bg-white hover:bg-rose-100 text-rose-700 border border-rose-200 rounded text-[10px] font-bold flex items-center gap-1 shadow-2xs"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Delete</span>
                            </button>
                          </div>
                        </div>
                      ) : userAttendee ? (
                        <InlineMeetingRsvp
                          meeting={m}
                          userAttendee={userAttendee}
                          onOpenProposal={handleOpenProposalModal}
                          compact={true}
                        />
                      ) : null}

                      <div className="flex items-center justify-between gap-2 pt-1">
                        <div className="flex items-center gap-1.5">
                          <a
                            href={m.teamsJoinUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="px-2.5 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded text-xs font-semibold inline-flex items-center gap-1.5 shadow-2xs transition"
                          >
                            <Video className="w-3.5 h-3.5" />
                            <span>Join</span>
                          </a>
                          <button
                            onClick={() => downloadCalendarInvite(m)}
                            className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded text-xs font-medium inline-flex items-center gap-1 shadow-2xs"
                          >
                            <Download className="w-3 h-3" />
                            <span>.ics</span>
                          </button>
                        </div>

                        <button
                          onClick={() => setDetailMeetingId(m.id)}
                          className="text-xs text-[#008f18] hover:text-[#006e12] font-semibold flex items-center gap-1 hover:underline"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Full Details</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Tasks Due On This Date */}
          <div className="bg-white rounded-lg border border-slate-200 p-5 shadow-xs space-y-3">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#00ad1d]" />
              <span>Tasks Due on {selectedCalendarDate}</span>
              <span className="text-xs text-slate-400 font-normal">({userTasksDueOnSelectedDate.length} due)</span>
            </h4>
            {userTasksDueOnSelectedDate.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-1">No tasks due on this date.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {userTasksDueOnSelectedDate.map(t => (
                  <div
                    key={t.id}
                    onClick={() => {
                      setSelectedTaskDetail(t);
                      if (onSelectTask) onSelectTask(t.id);
                    }}
                    onMouseEnter={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setHoveredActivity({ item: t, type: 'task', x: rect.left, y: rect.bottom + 4 });
                    }}
                    onMouseLeave={() => setHoveredActivity(null)}
                    className="p-3.5 rounded-lg border border-emerald-200 bg-emerald-50/40 hover:bg-emerald-100/60 transition cursor-pointer space-y-1.5 shadow-2xs group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-bold text-slate-900 group-hover:text-[#008f18] transition">{t.title}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                        t.priority === 'Urgent' || t.priority === 'High' ? 'bg-rose-100 text-rose-800' : 'bg-slate-200 text-slate-700'
                      }`}>{t.priority}</span>
                    </div>
                    <p className="text-[11px] text-slate-600 line-clamp-2">{t.description || 'No description'}</p>
                    <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-emerald-200/60">
                      <span>Status: <b className="text-slate-800">{t.status}</b></span>
                      <span className="text-emerald-700 font-bold flex items-center gap-1 hover:underline">
                        <span>Open Task Details</span>
                        <Eye className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* List Mode */
        <>
          {/* Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-lg border border-slate-200 text-xs shadow-xs">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-600">Department:</span>
                <select
                  value={departmentFilter}
                  onChange={(e) => setDepartmentFilter(e.target.value)}
                  className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-slate-700 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
                >
                  <option value="All">All Departments</option>
                  <option value="Top management">Top management</option>
                  <option value="Finance">Finance</option>
                  <option value="IT">IT</option>
                  <option value="management">management</option>
                  <option value="Logistics and Operations">Logistics and Operations</option>
                  <option value="Tabligh">Tabligh</option>
                  <option value="projects and Mkt">projects and Mkt</option>
                </select>
              </div>

              <div className="relative min-w-[220px]">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search title, chair, attendees..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-slate-800 placeholder-slate-400 text-xs focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
                />
              </div>
            </div>

            <div className="text-slate-500 text-xs font-medium">
              Showing <strong>{filteredMeetings.length}</strong> sessions
            </div>
          </div>

          {/* Meetings Grid */}
          {filteredMeetings.length === 0 ? (
            <div className="bg-white rounded-lg border border-dashed border-slate-200 p-10 text-center space-y-2 shadow-2xs">
              <div className="w-11 h-11 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                <Video className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-800">No Active Meetings</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                You have no upcoming or active sessions matching this view. Past meetings automatically move to your Personal Archive 2 days after their scheduled date.
              </p>
            </div>
          ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredMeetings.map((meeting) => {
              const summary = getRsvpSummary(meeting);
              const isCreator = meeting.organizerId === currentUser.id;
              const userAttendee = meeting.attendees.find(a => a.userId === currentUser.id && a.userId !== meeting.organizerId);
              const chairStaff = staff.find(s => s.id === meeting.chairId || s.name === meeting.chairName);
              const chairName = chairStaff ? formatStaffDisplayName(chairStaff) : (meeting.chairName || meeting.organizerName);

              // Find invitees who proposed new times
              const proposedAttendees = meeting.attendees.filter(
                a => a.status === 'Proposed New Time' && (a.proposedDate || a.proposedTime)
              );

              return (
                <div
                  key={meeting.id}
                  className="bg-white rounded-lg border border-slate-200 p-5 shadow-xs hover:border-slate-300 transition flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-3">
                    {/* Header Badges & Creator Controls */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                          {meeting.department}
                        </span>
                        {isCreator && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-100 text-purple-900 border border-purple-200 flex items-center gap-1">
                            <ShieldCheck className="w-3 h-3 text-purple-700" />
                            <span>Organizer</span>
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded font-bold border ${
                            meeting.status === 'Completed'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : meeting.status === 'Cancelled'
                              ? 'bg-rose-50 text-rose-800 border-rose-200'
                              : 'bg-purple-50 text-purple-800 border-purple-200'
                          }`}
                        >
                          {meeting.status}
                        </span>

                        {/* Edit and Delete buttons for Meeting Creator only */}
                        {isCreator && (
                          <div className="flex items-center gap-1 pl-1 border-l border-slate-200">
                            <button
                              type="button"
                              onClick={() => handleOpenEditMeeting(meeting)}
                              className="p-1 rounded text-slate-500 hover:text-purple-700 hover:bg-purple-50 transition"
                              title="Edit Meeting Details"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeletingMeeting(meeting)}
                              className="p-1 rounded text-slate-500 hover:text-rose-700 hover:bg-rose-50 transition"
                              title="Delete Meeting"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <h3 className="font-bold text-sm text-slate-900 leading-snug">{meeting.title}</h3>
                      {meeting.description && (
                        <p className="text-xs text-slate-600 mt-1 leading-relaxed line-clamp-2">{meeting.description}</p>
                      )}
                    </div>

                    {/* Date & Time Info */}
                    <div className="space-y-1 text-xs text-slate-600 bg-slate-50 p-2.5 rounded-md border border-slate-100">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span className="font-semibold text-slate-800">{meeting.date}</span>
                        <span className="text-slate-300">•</span>
                        <Clock className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                        <span>{meeting.startTime || meeting.time} {meeting.endTime ? `– ${meeting.endTime}` : ''}</span>
                      </div>

                      {chairName && (
                        <div className="flex items-center gap-2 text-[11px] text-purple-900 pt-0.5">
                          <UserCheck className="w-3.5 h-3.5 text-purple-700 shrink-0" />
                          <span>Chair / Host: <strong>{chairName}</strong></span>
                        </div>
                      )}
                    </div>

                    {/* Attached Documents */}
                    {renderMeetingAttachments(meeting.attachments, { compact: true })}

                    {/* Response Summary Bar */}
                    <div className="p-2.5 bg-slate-50 rounded-md border border-slate-200 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-bold text-slate-800 flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-slate-500" />
                          <span>Invitees RSVP Summary ({summary.total})</span>
                        </span>
                        <span className="text-[10px] text-slate-500 font-medium">
                          {summary.accepted} Accepted • {summary.pending} Pending
                        </span>
                      </div>

                      {/* Summary Tag Pills */}
                      <div className="flex flex-wrap gap-1.5 text-[10px]">
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-100/70 text-emerald-900 font-bold">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                          {summary.accepted} Accepted
                        </span>
                        {summary.proposed > 0 && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 font-bold">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />
                            {summary.proposed} Proposed Time
                          </span>
                        )}
                        {summary.declined > 0 && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-100 text-rose-900 font-bold">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-600" />
                            {summary.declined} Declined
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-200/80 text-slate-700 font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                          {summary.pending} Pending
                        </span>
                      </div>

                      {/* Attendees Chips with Individual Status Badges and Notes */}
                      <div className="flex flex-wrap gap-1 pt-1 max-h-24 overflow-y-auto">
                        {meeting.attendees.map(a => {
                          const s = staff.find(staffMember => staffMember.id === a.userId || staffMember.email === a.email);
                          const isAttOrganizer = a.userId === meeting.organizerId;
                          const noteText = a.note || a.comment || a.proposalNote;
                          return (
                            <span
                              key={a.userId}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] shadow-2xs ${
                                a.status === 'Declined'
                                  ? 'bg-rose-50 border-rose-200 text-rose-900'
                                  : a.status === 'Accepted'
                                  ? 'bg-white border-slate-200 text-slate-800'
                                  : a.status === 'Proposed New Time'
                                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                                  : 'bg-slate-50 border-slate-200 text-slate-700'
                              }`}
                              title={noteText ? `${a.name}: "${noteText}"` : undefined}
                            >
                              <span className="font-semibold">{s ? formatStaffDisplayName(s) : a.name}</span>
                              {isAttOrganizer ? (
                                <span className="text-[9px] px-1 py-0.2 rounded bg-purple-100 text-purple-900 font-bold">Organizer</span>
                              ) : (
                                renderRsvpBadge(a.status, 'sm')
                              )}
                              {noteText && (
                                <span className={`text-[9px] italic max-w-[120px] truncate ${
                                  a.status === 'Declined' ? 'text-rose-700 font-semibold' : 'text-slate-500'
                                }`}>
                                  ({a.status === 'Declined' ? `Reason: "${noteText}"` : `"${noteText}"`})
                                </span>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    </div>

                    {/* Organizer Proposal Resolver Banner (if proposals exist and user is organizer) */}
                    {proposedAttendees.length > 0 && isCreator && (
                      <div className="p-3 bg-amber-50 rounded-lg border border-amber-300 space-y-2 text-xs">
                        <div className="flex items-center gap-1.5 text-amber-900 font-bold">
                          <AlertTriangle className="w-4 h-4 text-amber-600" />
                          <span>Proposed Meeting Time Submitted by Invitee</span>
                        </div>

                        {proposedAttendees.map(proposer => (
                          <div key={proposer.userId} className="p-2 bg-white rounded border border-amber-200 space-y-1.5">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="font-bold text-amber-950">{proposer.name}</span>
                              <span className="font-semibold text-amber-800">
                                {proposer.proposedDate} at {proposer.proposedTime} {proposer.proposedEndTime ? `– ${proposer.proposedEndTime}` : ''}
                              </span>
                            </div>
                            {(proposer.proposalNote || proposer.note) && (
                              <p className="text-[11px] text-slate-600 italic bg-amber-50/50 p-1 rounded">
                                "{proposer.proposalNote || proposer.note}"
                              </p>
                            )}

                            {/* Organizer Action Buttons */}
                            <div className="flex items-center gap-2 pt-1 border-t border-amber-100">
                              <button
                                type="button"
                                onClick={() => actions.acceptProposedMeetingTime(meeting.id, proposer.userId)}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] font-bold shadow-2xs transition"
                              >
                                Accept New Time
                              </button>
                              <button
                                type="button"
                                onClick={() => actions.rejectProposedMeetingTime(meeting.id, proposer.userId)}
                                className="px-2.5 py-1 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded text-[10px] font-semibold transition"
                              >
                                Keep Original Time
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Invitee Interactive RSVP Actions (ONLY shown to added invitees, NOT the creator) */}
                    {!isCreator && userAttendee ? (
                      <InlineMeetingRsvp
                        meeting={meeting}
                        userAttendee={userAttendee}
                        onOpenProposal={handleOpenProposalModal}
                        compact={false}
                      />
                    ) : isCreator ? (
                      <div className="p-2.5 bg-purple-50/70 border border-purple-200 rounded-lg flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 text-purple-950 font-bold">
                          <UserCheck className="w-4 h-4 text-purple-700" />
                          <span>Meeting Host & Organizer</span>
                        </div>
                        <span className="text-[11px] text-purple-800 font-medium">Awaiting invitee responses</span>
                      </div>
                    ) : null}
                  </div>

                  {/* Card Bottom Links */}
                  <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-1.5">
                      <a
                        href={meeting.teamsJoinUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded font-semibold flex items-center gap-1.5 shadow-2xs transition"
                      >
                        <Video className="w-3.5 h-3.5" />
                        <span>Join Teams</span>
                      </a>

                      <button
                        onClick={() => handleCopyLink(meeting)}
                        className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded transition"
                        title="Copy Teams Link"
                      >
                        {copiedMeetingId === meeting.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>

                      <button
                        onClick={() => downloadCalendarInvite(meeting)}
                        className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded font-medium flex items-center gap-1.5 shadow-2xs transition"
                        title="Download .ics Outlook Invite"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Outlook (.ics)</span>
                      </button>
                    </div>

                    <button
                      onClick={() => setDetailMeetingId(meeting.id)}
                      className="text-xs text-[#008f18] hover:text-[#006e12] font-semibold flex items-center gap-1 hover:underline"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>View Details</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          )}
        </>
      )}

      {/* MODAL 1: PROPOSE NEW TIME MODAL */}
      {proposingMeeting && (
        <div
          className="oh-dialog fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setProposingMeeting(null)}
        >
          <div
            className="bg-white rounded-lg max-w-lg w-full p-5 sm:p-6 shadow-xl border border-slate-200 space-y-4 animate-in fade-in duration-150 text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Clock3 className="w-5 h-5 text-amber-600" />
                <h3 className="text-base font-bold text-slate-900">Propose New Meeting Time</h3>
              </div>
              <button
                onClick={() => setProposingMeeting(null)}
                className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <p className="font-bold text-slate-900 text-xs">{proposingMeeting.title}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Current Time: {proposingMeeting.date} at {proposingMeeting.startTime || proposingMeeting.time}
              </p>
            </div>

            <form onSubmit={handleSubmitProposal} className="space-y-3">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Proposed Date *</label>
                <input
                  type="date"
                  required
                  value={proposedDate}
                  onChange={(e) => setProposedDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-slate-200 bg-white text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Proposed Start Time *</label>
                  <input
                    type="time"
                    required
                    value={proposedStartTime}
                    onChange={(e) => setProposedStartTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-md border border-slate-200 bg-white text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Proposed End Time</label>
                  <input
                    type="time"
                    value={proposedEndTime}
                    onChange={(e) => setProposedEndTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-md border border-slate-200 bg-white text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Note for Organizer (Optional)
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. Can we do 3:00 PM instead? Clinic inspection rounds finish at 2:30 PM."
                  value={proposalNote}
                  onChange={(e) => setProposalNote(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>

              <div className="p-2.5 rounded bg-amber-50 border border-amber-200 text-[11px] text-amber-800">
                This will record your status as <strong>"Proposed New Time"</strong> and notify the organizer ({proposingMeeting.organizerName}) with your requested time and note.
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setProposingMeeting(null)}
                  className="px-3 py-1.5 rounded-md text-slate-600 font-semibold hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-md bg-amber-600 hover:bg-amber-700 text-white font-semibold shadow-2xs transition"
                >
                  Submit Proposal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: FULL MEETING DETAIL VIEW MODAL */}
      {selectedDetailMeeting && (
        <div
          className="oh-dialog fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setDetailMeetingId(null)}
        >
          <div
            className="bg-white rounded-lg max-w-2xl w-full p-5 sm:p-6 shadow-xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto animate-in fade-in duration-150 text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-3 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                    {selectedDetailMeeting.department}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-purple-100 text-purple-800">
                    {selectedDetailMeeting.meetingType}
                  </span>
                  {selectedDetailMeeting.organizerId === currentUser.id && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-100 text-purple-900 border border-purple-200 flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-purple-700" />
                      <span>You Organized This Meeting</span>
                    </span>
                  )}
                </div>
                <h2 className="text-base font-bold text-slate-900">{selectedDetailMeeting.title}</h2>
              </div>
              <div className="flex items-center gap-1">
                {selectedDetailMeeting.organizerId === currentUser.id && (
                  <>
                    <button
                      onClick={() => {
                        handleOpenEditMeeting(selectedDetailMeeting);
                      }}
                      className="p-1.5 rounded text-slate-600 hover:text-purple-700 hover:bg-purple-50 transition"
                      title="Edit Meeting"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        setDeletingMeeting(selectedDetailMeeting);
                      }}
                      className="p-1.5 rounded text-slate-600 hover:text-rose-700 hover:bg-rose-50 transition"
                      title="Delete Meeting"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
                <button
                  onClick={() => setDetailMeetingId(null)}
                  className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Date & Lead Header */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-slate-700 font-semibold">
                  <Calendar className="w-4 h-4 text-emerald-600" />
                  <span>{selectedDetailMeeting.date}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-600">
                  <Clock className="w-4 h-4 text-purple-600" />
                  <span>{selectedDetailMeeting.startTime || selectedDetailMeeting.time} {selectedDetailMeeting.endTime ? `– ${selectedDetailMeeting.endTime}` : ''}</span>
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2 text-slate-700 font-semibold">
                  <UserCheck className="w-4 h-4 text-purple-700" />
                  <span>Chair: {selectedDetailMeeting.chairName || selectedDetailMeeting.organizerName}</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Organizer: {selectedDetailMeeting.organizerName}
                </p>
              </div>
            </div>

            {/* Description */}
            {selectedDetailMeeting.description && (
              <div className="space-y-1">
                <p className="font-bold text-slate-700 uppercase text-[10px]">Description & Objectives</p>
                <p className="text-slate-600 leading-relaxed bg-white p-2.5 rounded border border-slate-100">
                  {selectedDetailMeeting.description}
                </p>
              </div>
            )}

            {/* Agenda */}
            {selectedDetailMeeting.agenda && selectedDetailMeeting.agenda.length > 0 && (
              <div className="space-y-1.5">
                <p className="font-bold text-slate-700 uppercase text-[10px]">Session Agenda</p>
                <ul className="space-y-1 pl-2">
                  {selectedDetailMeeting.agenda.map((ag, i) => (
                    <li key={i} className="flex items-center gap-2 text-slate-700">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#00ad1d]" />
                      <span>{ag}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Attached Documents & Files */}
            {((selectedDetailMeeting.attachments && selectedDetailMeeting.attachments.length > 0) || selectedDetailMeeting.organizerId === currentUser.id) && (
              <div className="p-3 bg-purple-50/40 rounded-lg border border-purple-200/80 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-slate-800 text-xs">
                    <Paperclip className="w-4 h-4 text-purple-600" />
                    <span>Meeting Documents & Attachments ({selectedDetailMeeting.attachments?.length || 0})</span>
                  </div>
                  {selectedDetailMeeting.organizerId === currentUser.id && (
                    <label className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-purple-50 text-purple-700 border border-purple-200 rounded text-[11px] font-semibold cursor-pointer shadow-2xs transition">
                      <Paperclip className="w-3 h-3 text-purple-600" />
                      <span>Attach File</span>
                      <input
                        type="file"
                        multiple
                        onChange={(e) => handleDetailAttachFile(e, selectedDetailMeeting)}
                        className="hidden"
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.webp,.svg,.gif,.pptx,.ppt"
                      />
                    </label>
                  )}
                </div>

                {selectedDetailMeeting.attachments && selectedDetailMeeting.attachments.length > 0 ? (
                  renderMeetingAttachments(selectedDetailMeeting.attachments, {
                    compact: false,
                    canDelete: selectedDetailMeeting.organizerId === currentUser.id,
                    onDelete: (id) => handleDetailRemoveFile(selectedDetailMeeting, id),
                  })
                ) : (
                  <p className="text-[11px] text-slate-400 italic">No files attached to this meeting yet.</p>
                )}
              </div>
            )}

            {/* Response Summary Bar */}
            {(() => {
              const sum = getRsvpSummary(selectedDetailMeeting);
              return (
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between font-bold text-slate-800">
                    <span>Invitees Response Breakdown ({sum.total} Invitees)</span>
                    <span className="text-[11px] text-slate-500">
                      {Math.round((sum.accepted / Math.max(1, sum.total)) * 100)}% Acceptance Rate
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-2 text-center text-[11px]">
                    <div className="p-2 rounded bg-emerald-50 border border-emerald-200 text-emerald-900 font-bold">
                      <p className="text-base">{sum.accepted}</p>
                      <p className="text-[10px] text-emerald-700 uppercase">Accepted</p>
                    </div>
                    <div className="p-2 rounded bg-amber-50 border border-amber-200 text-amber-900 font-bold">
                      <p className="text-base">{sum.proposed}</p>
                      <p className="text-[10px] text-amber-700 uppercase">Proposed</p>
                    </div>
                    <div className="p-2 rounded bg-rose-50 border border-rose-200 text-rose-900 font-bold">
                      <p className="text-base">{sum.declined}</p>
                      <p className="text-[10px] text-rose-700 uppercase">Declined</p>
                    </div>
                    <div className="p-2 rounded bg-slate-100 border border-slate-200 text-slate-800 font-bold">
                      <p className="text-base">{sum.pending}</p>
                      <p className="text-[10px] text-slate-600 uppercase">Pending</p>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Interactive RSVP Action Controls (ONLY for invited attendees, NOT organizer) */}
            {(() => {
              const isCreator = selectedDetailMeeting.organizerId === currentUser.id;
              const userAtt = selectedDetailMeeting.attendees.find(
                a => a.userId === currentUser.id && a.userId !== selectedDetailMeeting.organizerId
              );

              if (isCreator) {
                return (
                  <div className="p-3 bg-purple-50/70 rounded-lg border border-purple-200 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-purple-950 font-bold text-xs">
                      <ShieldCheck className="w-4 h-4 text-purple-700" />
                      <span>You are the Host and Meeting Organizer</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleOpenEditMeeting(selectedDetailMeeting)}
                        className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded font-bold text-xs flex items-center gap-1 shadow-2xs cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>Edit Meeting</span>
                      </button>
                    </div>
                  </div>
                );
              }

              if (!userAtt) return null;

              return (
                <InlineMeetingRsvp
                  meeting={selectedDetailMeeting}
                  userAttendee={userAtt}
                  onOpenProposal={handleOpenProposalModal}
                  compact={false}
                />
              );
            })()}

            {/* Attendee Register Table */}
            <div className="space-y-2">
              <p className="font-bold text-slate-800 text-xs">Full Attendee Roster & Status</p>
              <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100">
                {selectedDetailMeeting.attendees.map(a => {
                  const s = staff.find(staffMember => staffMember.id === a.userId || staffMember.email === a.email);
                  const isUserOrganizer = selectedDetailMeeting.organizerId === currentUser.id;
                  const isAttOrganizer = a.userId === selectedDetailMeeting.organizerId;

                  return (
                    <div key={a.userId} className="p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white hover:bg-slate-50 transition">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <UserAvatar
                          avatar={s?.avatar || a.avatar || currentUser.avatar}
                          name={a.name}
                          className="w-7 h-7 border border-slate-200 shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 truncate">
                            {s ? formatStaffDisplayName(s) : a.name}
                          </p>
                          <p className="text-[10px] text-[#008f18] font-medium truncate">
                            {s ? formatStaffDisplayOrgDept(s) : selectedDetailMeeting.department}
                          </p>
                          {(a.proposalNote || a.note || a.comment) && (
                            <div className="mt-0.5">
                              {a.status === 'Declined' ? (
                                <p className="text-[11px] text-rose-800 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded font-medium inline-block">
                                  <span className="font-bold">Decline reason:</span> "{a.note || a.comment}"
                                </p>
                              ) : a.status === 'Accepted' ? (
                                <p className="text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded inline-block">
                                  <span className="font-bold">Note:</span> "{a.note || a.comment}"
                                </p>
                              ) : (
                                <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded inline-block">
                                  <span className="font-bold">Proposed time note:</span> "{a.proposalNote || a.note || a.comment}"
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {isAttOrganizer ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-100 text-purple-900 border border-purple-200">
                            Organizer / Host
                          </span>
                        ) : (
                          renderRsvpBadge(a.status, 'sm')
                        )}

                        {/* If attendee proposed new time and viewer is organizer */}
                        {a.status === 'Proposed New Time' && isUserOrganizer && (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => actions.acceptProposedMeetingTime(selectedDetailMeeting.id, a.userId)}
                              className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] font-bold shadow-2xs"
                              title="Accept new time for everyone"
                            >
                              Accept New Time
                            </button>
                            <button
                              type="button"
                              onClick={() => actions.rejectProposedMeetingTime(selectedDetailMeeting.id, a.userId)}
                              className="px-2 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-[10px] font-semibold"
                              title="Keep original time and notify invitee"
                            >
                              Keep Original
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100">
              <div className="flex items-center gap-2">
                <a
                  href={selectedDetailMeeting.teamsJoinUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3.5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded font-bold flex items-center gap-1.5 shadow-2xs transition"
                >
                  <Video className="w-4 h-4" />
                  <span>Join Teams Virtual Room</span>
                </a>

                <button
                  onClick={() => downloadCalendarInvite(selectedDetailMeeting)}
                  className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded font-semibold flex items-center gap-1.5 shadow-2xs transition"
                >
                  <Download className="w-4 h-4" />
                  <span>Download .ics</span>
                </button>
              </div>

              <button
                onClick={() => setDetailMeetingId(null)}
                className="px-4 py-2 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: EDIT MEETING MODAL (Creator Only) */}
      {editingMeeting && (
        <div
          className="oh-dialog fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setEditingMeeting(null)}
        >
          <div
            className="bg-white rounded-lg max-w-xl w-full p-5 sm:p-6 shadow-xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto animate-in fade-in duration-150 text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Pencil className="w-4 h-4 text-purple-600" />
                <h3 className="text-base font-bold text-slate-900">Edit Meeting Details</h3>
              </div>
              <button
                onClick={() => setEditingMeeting(null)}
                className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditMeeting} className="space-y-3.5">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Meeting Title *</label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-slate-200 focus:outline-none focus:ring-1 focus:ring-purple-500 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Department</label>
                  <select
                    value={editDepartment}
                    onChange={(e) => setEditDepartment(e.target.value)}
                    className="w-full px-3 py-2 rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-purple-500 text-xs"
                  >
                    <option value="Top management">Top management</option>
                    <option value="Finance">Finance</option>
                    <option value="IT">IT</option>
                    <option value="management">management</option>
                    <option value="Logistics and Operations">Logistics and Operations</option>
                    <option value="Tabligh">Tabligh</option>
                    <option value="projects and Mkt">projects and Mkt</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Meeting Date *</label>
                  <input
                    type="date"
                    required
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-purple-500 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Start Time *</label>
                  <input
                    type="time"
                    required
                    value={editStartTime}
                    onChange={(e) => setEditStartTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-md border border-slate-200 text-xs"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">End Time</label>
                  <input
                    type="time"
                    value={editEndTime}
                    onChange={(e) => setEditEndTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-md border border-slate-200 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Description</label>
                <textarea
                  rows={2}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>

              {/* Edit Meeting Attachments */}
              <div className="space-y-1.5 p-2.5 bg-slate-50/80 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-700 flex items-center gap-1.5 text-xs">
                    <Paperclip className="w-3.5 h-3.5 text-purple-600" />
                    <span>Meeting Attachments ({editAttachments.length})</span>
                  </label>
                  <label className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white hover:bg-purple-50 text-purple-700 border border-purple-200 text-[11px] font-semibold cursor-pointer shadow-2xs transition">
                    <Paperclip className="w-3 h-3 text-purple-600" />
                    <span>Attach Files</span>
                    <input
                      type="file"
                      multiple
                      onChange={handleEditMeetingFileChange}
                      className="hidden"
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.webp,.svg,.gif,.pptx,.ppt"
                    />
                  </label>
                </div>

                {isUploadingEditFile && (
                  <div className="flex items-center gap-1.5 text-[11px] text-purple-700 py-0.5">
                    <Loader2 className="w-3 h-3 animate-spin text-purple-600" />
                    <span>Processing attachment...</span>
                  </div>
                )}

                {editAttachments.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {editAttachments.map(att => (
                      <div
                        key={att.id}
                        className="inline-flex items-center gap-1.5 px-2 py-1 bg-white border border-purple-200 rounded-md text-[11px] text-slate-800 shadow-2xs"
                      >
                        <FileText className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                        <span className="truncate max-w-[170px] font-medium" title={att.name}>{att.name}</span>
                        <span className="text-[10px] text-slate-400">({att.size})</span>
                        <button
                          type="button"
                          onClick={() => setEditAttachments(editAttachments.filter(a => a.id !== att.id))}
                          className="text-slate-400 hover:text-rose-600 font-bold ml-0.5 cursor-pointer text-xs leading-none"
                          title="Remove attachment"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-400 italic">
                    Optional: attach agendas, reports, slides, or documents for attendees.
                  </p>
                )}
              </div>

              {/* Edit Attendees with live conflict warnings */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-slate-700">
                    Invite Attendees ({editAttendees.length} selected)
                  </label>
                  {editAttendees.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setEditAttendees([editingMeeting.organizerId])}
                      className="text-[11px] text-rose-600 hover:text-rose-800 font-medium"
                    >
                      Reset to Organizer
                    </button>
                  )}
                </div>

                {/* Conflict Banner during edit */}
                {editConflicts.length > 0 && (
                  <div className="mb-2 p-2.5 rounded-md bg-amber-50 border border-amber-300 text-amber-900 space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-xs text-amber-900">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Scheduling Conflict Detected ({editConflicts.length})</span>
                    </div>
                    <ul className="space-y-0.5 text-[11px] text-amber-800 pl-5 list-disc">
                      {editConflicts.map(c => (
                        <li key={c.userId}>
                          <strong>{c.userName}</strong> overlaps with: <em>"{c.conflictingMeetingTitle}"</em> at {c.startTime} – {c.endTime}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <StaffPickerTree
                  mode="multiple"
                  staff={staff}
                  selectedUserIds={editAttendees}
                  onChange={setEditAttendees}
                  conflicts={editConflicts}
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Meeting Host / Chair</label>
                <select
                  value={editChairId}
                  onChange={(e) => setEditChairId(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-slate-200 bg-white text-xs"
                >
                  {staff.filter(s => editAttendees.includes(s.id) || s.id === editingMeeting.organizerId).map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} — {s.role} ({s.organisation || 'WIPAHS'} • {s.department})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingMeeting(null)}
                  className="px-3 py-1.5 rounded-md text-slate-600 font-semibold hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-md bg-purple-600 hover:bg-purple-700 text-white font-semibold shadow-2xs transition"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: DELETE CONFIRMATION MODAL (Creator Only) */}
      {deletingMeeting && (
        <div
          className="oh-dialog fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setDeletingMeeting(null)}
        >
          <div
            className="bg-white rounded-lg max-w-md w-full p-5 shadow-xl border border-slate-200 space-y-3 animate-in fade-in duration-150 text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 text-rose-600 font-bold text-sm">
              <Trash2 className="w-5 h-5" />
              <span>Delete Meeting</span>
            </div>

            <p className="text-slate-700">
              Are you sure you want to delete <strong>"{deletingMeeting.title}"</strong> scheduled on {deletingMeeting.date}?
            </p>

            <p className="text-[11px] text-slate-500 bg-slate-50 p-2 rounded border border-slate-200">
              All invited attendees will be automatically notified of this cancellation.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingMeeting(null)}
                className="px-3 py-1.5 rounded-md text-slate-600 font-semibold hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-md bg-rose-600 hover:bg-rose-700 text-white font-semibold shadow-2xs transition"
              >
                Yes, Delete Meeting
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Hover Details Card for Calendar Activities */}
      {hoveredActivity && (
        <div
          className="fixed z-[100] w-72 bg-slate-900 text-white rounded-xl p-3.5 shadow-2xl border border-slate-700 pointer-events-none text-xs space-y-2 animate-in fade-in duration-100"
          style={{
            left: `${Math.min(hoveredActivity.x, window.innerWidth - 300)}px`,
            top: `${Math.min(hoveredActivity.y, window.innerHeight - 220)}px`
          }}
        >
          <div className="flex items-center justify-between border-b border-slate-700 pb-1.5">
            <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
              hoveredActivity.type === 'meeting' ? 'bg-purple-500/30 text-purple-300 border border-purple-500/40' : 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/40'
            }`}>
              {hoveredActivity.type === 'meeting' ? 'Scheduled Meeting' : 'Due Task Activity'}
            </span>
            <span className="text-[10px] text-slate-400 font-mono">
              {hoveredActivity.type === 'meeting' ? (hoveredActivity.item as Meeting).date : (hoveredActivity.item as Task).dueDate}
            </span>
          </div>

          <h4 className="font-bold text-white text-xs leading-tight">
            {hoveredActivity.item.title}
          </h4>

          {hoveredActivity.item.description && (
            <p className="text-[11px] text-slate-300 line-clamp-2">
              {hoveredActivity.item.description}
            </p>
          )}

          <div className="pt-1 border-t border-slate-800 flex flex-wrap items-center justify-between text-[10px] text-slate-400 gap-1">
            {hoveredActivity.type === 'meeting' ? (
              <>
                <span>Time: <b className="text-purple-300">{(hoveredActivity.item as Meeting).startTime || (hoveredActivity.item as Meeting).time}</b></span>
                <span>Dept: <b className="text-slate-200">{(hoveredActivity.item as Meeting).department}</b></span>
              </>
            ) : (
              <>
                <span>Priority: <b className="text-amber-300">{(hoveredActivity.item as Task).priority}</b></span>
                <span>Status: <b className="text-emerald-300">{(hoveredActivity.item as Task).status}</b></span>
              </>
            )}
          </div>
          <p className="text-[9px] text-emerald-400 font-semibold italic text-right pt-0.5">Click activity to open full details</p>
        </div>
      )}

      {/* TASK DETAIL POPUP MODAL FOR CALENDAR TASKS */}
      {selectedTaskDetail && (
        <div
          className="oh-dialog fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setSelectedTaskDetail(null)}
        >
          <div
            className="bg-white rounded-xl max-w-lg w-full p-5 shadow-2xl border border-slate-200 space-y-4 text-xs max-h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between pb-3 border-b border-slate-100 shrink-0">
              <div className="space-y-1 min-w-0 pr-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#00ad1d]/10 text-[#008f18] border border-[#00ad1d]/30">
                    Office Calendar Task
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                      selectedTaskDetail.status === 'Done'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : 'bg-slate-100 text-slate-700 border-slate-200'
                    }`}
                  >
                    {selectedTaskDetail.status}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                    {selectedTaskDetail.priority} Priority
                  </span>
                </div>
                <h3 className="text-base font-bold text-slate-900 leading-tight">
                  {selectedTaskDetail.title}
                </h3>
              </div>

              <button
                type="button"
                onClick={() => setSelectedTaskDetail(null)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="space-y-4 overflow-y-auto pr-1 flex-1">
              <div>
                <h4 className="font-bold text-slate-700 text-xs mb-1">Task Description</h4>
                <p className="text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-200">
                  {selectedTaskDetail.description || 'No detailed description provided.'}
                </p>
              </div>

              {/* Assigner & Assignee Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Assignee</span>
                  <div className="flex items-center gap-2">
                    <UserAvatar
                      avatar={selectedTaskDetail.assignedToAvatar}
                      name={selectedTaskDetail.assignedToName}
                      className="w-7 h-7 border border-slate-300 shrink-0"
                    />
                    <div>
                      <p className="font-bold text-slate-900">{selectedTaskDetail.assignedToName}</p>
                      <p className="text-[10px] text-slate-500">{selectedTaskDetail.department}</p>
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Created / Assigned By</span>
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-[#00ad1d]/10 text-[#008f18] font-bold text-xs flex items-center justify-center border border-[#00ad1d]/30 shrink-0">
                      {selectedTaskDetail.createdByName?.slice(0, 2).toUpperCase() || 'UB'}
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">{selectedTaskDetail.createdByName}</p>
                      <p className="text-[10px] text-slate-500">Task Creator</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Dates */}
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between text-[11px] text-slate-600 flex-wrap gap-2">
                <div>
                  <span className="text-slate-400">Due Date: </span>
                  <b className="text-slate-800">{selectedTaskDetail.dueDate}</b>
                </div>
                <div>
                  <span className="text-slate-400">Department: </span>
                  <b className="text-slate-800">{selectedTaskDetail.department}</b>
                </div>
              </div>

              {/* Task General Update */}
              {selectedTaskDetail.update && (
                <div className="p-3.5 rounded-xl bg-white border-l-4 border-l-[#00ad1d] border border-slate-200/90 shadow-2xs space-y-1.5">
                  <div className="flex items-center justify-between text-xs flex-wrap gap-1">
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 font-bold text-[11px] uppercase tracking-wide">
                      <MessageSquare className="w-3 h-3 text-[#00ad1d]" />
                      Task Update
                    </span>
                    <span className="text-[11px] text-slate-500 font-medium">
                      By <strong className="text-slate-800">{selectedTaskDetail.update.authorName}</strong> • {selectedTaskDetail.update.updatedAt ? new Date(selectedTaskDetail.update.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                  </div>
                  <p className="text-slate-900 text-xs sm:text-sm font-medium bg-slate-50/70 p-2.5 rounded-md border border-slate-100 leading-relaxed">
                    "{selectedTaskDetail.update.text}"
                  </p>
                </div>
              )}

              {/* Subtasks */}
              {selectedTaskDetail.subtasks && selectedTaskDetail.subtasks.length > 0 && (
                <div className="space-y-1.5">
                  <h4 className="font-bold text-slate-700 text-xs">Subtasks ({selectedTaskDetail.subtasks.length})</h4>
                  <div className="space-y-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                    {selectedTaskDetail.subtasks.map(sub => (
                      <div key={sub.id} className="space-y-1 text-xs">
                        <div className="flex items-center gap-2 text-slate-800 font-medium">
                          <CheckCircle2 className={`w-4 h-4 shrink-0 ${sub.completed ? 'text-[#008f18]' : 'text-slate-300'}`} />
                          <span className={sub.completed ? 'line-through text-slate-400' : 'text-slate-900 font-semibold'}>{sub.title}</span>
                        </div>
                        {sub.update && (
                          <div className="ml-6 p-2.5 bg-white rounded-lg border-l-3 border-l-[#00ad1d] border border-slate-200/90 shadow-2xs space-y-1">
                            <div className="flex items-center justify-between text-[11px] text-slate-500">
                              <span className="font-bold text-emerald-800">Subtask Update</span>
                              <span>By {sub.update.authorName}</span>
                            </div>
                            <p className="text-xs text-slate-800 font-medium">"{sub.update.text}"</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between shrink-0">
              {onSelectTask && (
                <button
                  type="button"
                  onClick={() => {
                    const tid = selectedTaskDetail.id;
                    setSelectedTaskDetail(null);
                    onSelectTask(tid);
                  }}
                  className="px-3.5 py-1.5 bg-[#00ad1d] hover:bg-[#009218] text-white rounded-lg font-bold text-xs transition shadow-2xs flex items-center gap-1.5"
                >
                  <CheckSquare className="w-4 h-4" />
                  <span>Go to Task Workspace</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedTaskDetail(null)}
                className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Google Calendar-style Quick-Create Popover */}
      {quickCreate?.isOpen && (
        <div
          ref={quickCreateRef}
          onClick={(e) => e.stopPropagation()}
          className="fixed z-[95] w-84 sm:w-[350px] max-w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)] overflow-y-auto bg-white rounded-xl shadow-2xl border border-slate-200 p-4 text-xs space-y-3 animate-in fade-in zoom-in-95 duration-150"
          style={{
            left: `${quickCreate.x}px`,
            top: `${quickCreate.y}px`,
          }}
        >
          {/* Header with Date & Close */}
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div className="flex items-center gap-1.5 text-slate-700 font-bold text-xs">
              <Calendar className="w-3.5 h-3.5 text-[#00ad1d]" />
              <span>
                {new Date(quickCreate.dateStr + 'T00:00:00').toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric'
                })}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setQuickCreate(null)}
              className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              title="Close (Esc)"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Type Selector Tabs */}
          <div className="flex items-center p-0.5 bg-slate-100 rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => setQuickCreate((prev) => (prev ? { ...prev, type: 'meeting' } : null))}
              className={`flex-1 py-1.5 px-2.5 rounded-md text-center transition font-semibold flex items-center justify-center gap-1.5 cursor-pointer ${
                quickCreate.type === 'meeting'
                  ? 'bg-white text-slate-900 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Video className="w-3.5 h-3.5 text-[#00ad1d]" />
              <span>Schedule Meeting</span>
            </button>
            <button
              type="button"
              onClick={() => setQuickCreate((prev) => (prev ? { ...prev, type: 'task' } : null))}
              className={`flex-1 py-1.5 px-2.5 rounded-md text-center transition font-semibold flex items-center justify-center gap-1.5 cursor-pointer ${
                quickCreate.type === 'task'
                  ? 'bg-white text-slate-900 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CheckSquare className="w-3.5 h-3.5 text-[#00ad1d]" />
              <span>Create Task</span>
            </button>
          </div>

          {/* Form Content */}
          {quickCreate.type === 'meeting' ? (
            <form onSubmit={handleQuickCreateMeeting} className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                  Meeting Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Weekly Operations Sync"
                  value={quickMeetingTitle}
                  onChange={(e) => setQuickMeetingTitle(e.target.value)}
                  autoFocus
                  required
                  className="w-full px-2.5 py-1.5 rounded-md border border-slate-200 bg-white text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-[#00ad1d] focus:border-[#00ad1d]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">Start Time</label>
                  <input
                    type="time"
                    value={quickMeetingStartTime}
                    onChange={(e) => setQuickMeetingStartTime(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-md border border-slate-200 bg-white text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#00ad1d] focus:border-[#00ad1d]"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">End Time</label>
                  <input
                    type="time"
                    value={quickMeetingEndTime}
                    onChange={(e) => setQuickMeetingEndTime(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-md border border-slate-200 bg-white text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#00ad1d] focus:border-[#00ad1d]"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">Department</label>
                <select
                  value={quickMeetingDepartment}
                  onChange={(e) => setQuickMeetingDepartment(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-md border border-slate-200 bg-white text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#00ad1d] focus:border-[#00ad1d]"
                >
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.name}>{dept.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                  Invitees ({quickMeetingAttendeeIds.length})
                </label>
                <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto mb-1.5 p-1 bg-slate-50 rounded-md border border-slate-200">
                  {quickMeetingAttendeeIds.map((attId) => {
                    const s = staff.find((u) => u.id === attId);
                    if (!s) return null;
                    return (
                      <span
                        key={s.id}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-white border border-slate-200 text-slate-700 font-medium shadow-2xs"
                      >
                        <span className="truncate max-w-[90px]">{s.name}</span>
                        {s.id !== currentUser.id && (
                          <button
                            type="button"
                            onClick={() => setQuickMeetingAttendeeIds((prev) => prev.filter((id) => id !== s.id))}
                            className="text-slate-400 hover:text-rose-500 font-bold leading-none cursor-pointer"
                          >
                            ×
                          </button>
                        )}
                      </span>
                    );
                  })}
                </div>
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value && !quickMeetingAttendeeIds.includes(e.target.value)) {
                      setQuickMeetingAttendeeIds((prev) => [...prev, e.target.value]);
                    }
                  }}
                  className="w-full px-2.5 py-1.5 rounded-md border border-slate-200 bg-white text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#00ad1d] focus:border-[#00ad1d]"
                >
                  <option value="">+ Add staff invitee...</option>
                  {staff
                    .filter((s) => !quickMeetingAttendeeIds.includes(s.id))
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.department})
                      </option>
                    ))}
                </select>
              </div>

              {/* Actions Footer */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleMoreOptions}
                  className="text-xs font-semibold text-[#00ad1d] hover:text-[#008f18] hover:underline cursor-pointer"
                >
                  More options
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setQuickCreate(null)}
                    className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-md transition font-medium cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!quickMeetingTitle.trim() || isCreatingQuickMeeting}
                    className="px-3.5 py-1.5 text-xs bg-[#00ad1d] hover:bg-[#009218] text-white rounded-md font-bold shadow-2xs transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer"
                  >
                    {isCreatingQuickMeeting ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Creating...</span>
                      </>
                    ) : (
                      <span>Create</span>
                    )}
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <form onSubmit={handleQuickCreateTask} className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                  Task Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Prepare monthly finance report"
                  value={quickTaskTitle}
                  onChange={(e) => setQuickTaskTitle(e.target.value)}
                  autoFocus
                  required
                  className="w-full px-2.5 py-1.5 rounded-md border border-slate-200 bg-white text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-[#00ad1d] focus:border-[#00ad1d]"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">Assignee</label>
                <select
                  value={quickTaskAssigneeId}
                  onChange={(e) => {
                    setQuickTaskAssigneeId(e.target.value);
                    const assigned = staff.find((s) => s.id === e.target.value);
                    if (assigned?.department) {
                      setQuickTaskDepartment(assigned.department);
                    }
                  }}
                  className="w-full px-2.5 py-1.5 rounded-md border border-slate-200 bg-white text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#00ad1d] focus:border-[#00ad1d]"
                >
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.department})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">Department</label>
                  <select
                    value={quickTaskDepartment}
                    onChange={(e) => setQuickTaskDepartment(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-md border border-slate-200 bg-white text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#00ad1d] focus:border-[#00ad1d]"
                  >
                    {departments.map((dept) => (
                      <option key={dept.id} value={dept.name}>{dept.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">Priority</label>
                  <select
                    value={quickTaskPriority}
                    onChange={(e) => setQuickTaskPriority(e.target.value as Priority)}
                    className="w-full px-2.5 py-1.5 rounded-md border border-slate-200 bg-white text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#00ad1d] focus:border-[#00ad1d]"
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Urgent">Urgent</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">Due Date</label>
                <input
                  type="date"
                  value={quickTaskDueDate}
                  onChange={(e) => setQuickTaskDueDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-md border border-slate-200 bg-white text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#00ad1d] focus:border-[#00ad1d]"
                />
              </div>

              {/* Actions Footer */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleMoreOptions}
                  className="text-xs font-semibold text-[#00ad1d] hover:text-[#008f18] hover:underline cursor-pointer"
                >
                  More options
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setQuickCreate(null)}
                    className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-md transition font-medium cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!quickTaskTitle.trim() || isCreatingQuickTask}
                    className="px-3.5 py-1.5 text-xs bg-[#00ad1d] hover:bg-[#009218] text-white rounded-md font-bold shadow-2xs transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer"
                  >
                    {isCreatingQuickTask ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Creating...</span>
                      </>
                    ) : (
                      <span>Create</span>
                    )}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
};
