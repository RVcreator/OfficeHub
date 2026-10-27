// =========================================================================
// Shared Supabase Mappers
// Centralized mapping between Supabase snake_case rows and TypeScript camelCase models
// =========================================================================

import {
  StaffUser,
  Task,
  Subtask,
  Notice,
  Project,
  Milestone,
  BudgetCategory,
  ProjectImpact,
  ProjectActivity,
  ProjectExpense,
  Meeting,
  MeetingAttendee,
  SharePointDocument,
  TeamsNotificationRule,
  AuditEvent,
  Decision,
  Approval,
  DepartmentInfo,
  RolePermission,
  ChatConversation,
  ChatMessage,
  AppNotification,
  DispatchedEmail,
} from '../types';
import { normalizeDept } from '../utils/taskUtils';

export function isValidUuid(str: string | undefined | null): boolean {
  if (!str) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
}

export function toUuidOrNull(str: string | undefined | null): string | null {
  return isValidUuid(str) ? (str as string) : null;
}

// Explicit column lists that exclude oversized denormalized Base64 avatar columns
// so PostgREST responses never time out or truncate mid-stream.
export const TASK_SELECT_COLUMNS =
  'id, title, description, status, priority, department, organisation, assigned_to_id, assigned_to_name, assigned_to_ids, created_by_id, created_by_name, due_date, project_id, sharepoint_doc_id, pending_rating, rating, completed_at, cancelled_at, created_at, assignment_type, assigned_departments, assigned_organisations';

export const NOTICE_SELECT_COLUMNS =
  'id, title, content, author_id, author_name, author_role, department, organisation, priority, created_at, pinned, expires_at, target_audience_type, target_organisations, target_departments, target_user_ids';

export const MEETING_ATTENDEE_SELECT_COLUMNS =
  'meeting_id, user_id, name, email, status, proposed_date, proposed_time, proposed_end_time, proposal_note, note, comment, responded_at';

export const MESSAGE_SELECT_COLUMNS =
  'id, conversation_id, sender_id, sender_name, text, timestamp, reply_to_id, reactions';

export const NOTIFICATION_SELECT_COLUMNS =
  'id, title, message, type, meeting_id, target_user_id, created_at, read, actor_id, actor_name, priority, pushed_to_microsoft_teams, email_triggered, email_recipients, email_sent_at, email_subject, metadata';

/**
 * Prevents multi-megabyte raw Base64 data URLs from being copied into denormalized
 * avatar columns on tasks, messages, notifications, and meeting_attendees.
 */
export function sanitizeDenormalizedAvatar(avatar: string | undefined | null): string | null {
  if (!avatar) return null;
  if (avatar.startsWith('data:') && avatar.length > 8192) {
    return null;
  }
  return avatar;
}

/**
 * Parses a JSON array string, or recovers all complete top-level JSON objects
 * if a PostgREST HTTP 200 stream was cut off mid-response.
 */
export function recoverTruncatedJsonArray<T = any>(raw: string | undefined | null): T[] | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith('[')) return null;

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // Proceed to salvage complete top-level objects before the truncation point
  }

  const recovered: T[] = [];
  let inString = false;
  let escaped = false;
  let depth = 0;
  let objStart = -1;

  for (let i = 1; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      if (depth === 0) objStart = i;
      depth++;
    } else if (ch === '}') {
      if (depth > 0) {
        depth--;
        if (depth === 0 && objStart !== -1) {
          const slice = trimmed.slice(objStart, i + 1);
          try {
            recovered.push(JSON.parse(slice));
          } catch {
            // Ignore malformed fragment
          }
          objStart = -1;
        }
      }
    }
  }

  return recovered.length > 0 ? recovered : null;
}

// -------------------------------------------------------------------------
// 1. Staff / Profiles
// -------------------------------------------------------------------------
export function mapStaffRow(row: any): StaffUser {
  const appMeta = row.app_metadata || {};
  const mustChangeFromMeta =
    row.must_change_password === true || appMeta.must_change_password === true;

  return {
    id: row.id,
    name: row.name || 'Unknown Staff',
    email: row.email || '',
    role: row.role || 'Staff Member',
    organisation: row.organisation || 'WIPAHS',
    department: normalizeDept(row.department || 'General'),
    status: row.status || 'Offline',
    avatar: row.avatar || '',
    phone: row.phone || '+255 778 123 456',
    activityScore: Number(row.activity_score ?? 85),
    tasksCount: Number(row.tasks_count ?? 0),
    lastActive: row.last_active || 'Recently',
    teamsHandle: row.teams_handle || undefined,
    birthday: row.birthday || undefined,
    bio: row.bio || undefined,
    location: row.location || undefined,
    averageRating: row.average_rating !== null && row.average_rating !== undefined ? Number(row.average_rating) : undefined,
    totalRatingsCount: row.total_ratings_count !== null && row.total_ratings_count !== undefined ? Number(row.total_ratings_count) : undefined,
    outOfOffice: Boolean(row.out_of_office),
    outOfOfficeMessage: row.out_of_office_message || undefined,
    leaveType: row.leave_type || undefined,
    leaveStartDate: row.leave_start_date || undefined,
    leaveEndDate: row.leave_end_date || undefined,
    backupContactName: row.backup_contact_name || undefined,
    mustChangePassword: mustChangeFromMeta,
    temporaryPassword: row.temporary_password || undefined,
    deactivated: Boolean(row.deactivated || appMeta.deactivated),
    app_metadata: appMeta,
  };
}

export function mapStaffToRow(staff: Partial<StaffUser>): Record<string, any> {
  const row: Record<string, any> = {};
  if (staff.id !== undefined) row.id = staff.id;
  if (staff.name !== undefined) row.name = staff.name;
  if (staff.email !== undefined) row.email = staff.email;
  if (staff.role !== undefined) row.role = staff.role;
  if (staff.organisation !== undefined) row.organisation = staff.organisation;
  if (staff.department !== undefined) row.department = normalizeDept(staff.department);
  if (staff.status !== undefined) row.status = staff.status;
  if (staff.avatar !== undefined) row.avatar = staff.avatar;
  if (staff.phone !== undefined) row.phone = staff.phone;
  if (staff.activityScore !== undefined) row.activity_score = staff.activityScore;
  if (staff.tasksCount !== undefined) row.tasks_count = staff.tasksCount;
  if (staff.lastActive !== undefined) row.last_active = staff.lastActive;
  if (staff.teamsHandle !== undefined) row.teams_handle = staff.teamsHandle;
  if (staff.birthday !== undefined) row.birthday = staff.birthday;
  if (staff.bio !== undefined) row.bio = staff.bio;
  if (staff.location !== undefined) row.location = staff.location;
  if (staff.averageRating !== undefined) row.average_rating = staff.averageRating;
  if (staff.totalRatingsCount !== undefined) row.total_ratings_count = staff.totalRatingsCount;
  if (staff.outOfOffice !== undefined) row.out_of_office = staff.outOfOffice;
  if (staff.outOfOfficeMessage !== undefined) row.out_of_office_message = staff.outOfOfficeMessage;
  if (staff.leaveType !== undefined) row.leave_type = staff.leaveType;
  if (staff.leaveStartDate !== undefined) row.leave_start_date = staff.leaveStartDate;
  if (staff.leaveEndDate !== undefined) row.leave_end_date = staff.leaveEndDate;
  if (staff.mustChangePassword !== undefined) row.must_change_password = staff.mustChangePassword;
  if (staff.temporaryPassword !== undefined) row.temporary_password = staff.temporaryPassword;
  if (staff.app_metadata !== undefined || staff.deactivated !== undefined) {
    row.app_metadata = {
      ...(staff.app_metadata || {}),
      ...(staff.deactivated !== undefined ? { deactivated: staff.deactivated } : {}),
    };
  }
  return row;
}

// -------------------------------------------------------------------------
// 2. Tasks & Subtasks
// -------------------------------------------------------------------------
export function mapSubtaskRow(row: any): Subtask {
  return {
    id: row.id,
    title: row.title || '',
    completed: Boolean(row.completed),
    assignedTo: row.assigned_to || undefined,
    dueDate: row.due_date || undefined,
    update: row.update || undefined,
  };
}

export function mapTaskRow(row: any, subtasks: Subtask[] = []): Task {
  const isDeptTarget =
    row.assignment_type === 'department' ||
    (typeof row.assigned_to_id === 'string' && row.assigned_to_id.startsWith('dept-')) ||
    (typeof row.assigned_to_name === 'string' && row.assigned_to_name.toLowerCase().includes('(department)'));

  const isOrgTarget =
    row.assignment_type === 'organization' ||
    row.assigned_to_id === 'all' ||
    (typeof row.assigned_to_id === 'string' && row.assigned_to_id.startsWith('org-')) ||
    (typeof row.assigned_to_name === 'string' && row.assigned_to_name.toLowerCase().includes('(whole org)'));

  const isAssignedToOther =
    (Boolean(row.created_by_id) && Boolean(row.assigned_to_id) && row.created_by_id !== row.assigned_to_id && !row.assigned_to_id.startsWith('dept-') && !row.assigned_to_id.startsWith('org-')) ||
    (Boolean(row.created_by_name) && Boolean(row.assigned_to_name) && row.created_by_name.toLowerCase().trim() !== row.assigned_to_name.toLowerCase().trim() && !row.assigned_to_name.toLowerCase().includes('(department)') && !row.assigned_to_name.toLowerCase().includes('(whole org)'));

  const isPersonal =
    !isDeptTarget &&
    !isOrgTarget &&
    !isAssignedToOther &&
    (row.type === 'personal' ||
      row.assignment_type === 'personal' ||
      (Array.isArray(row.tags) && row.tags.some((tg: string) => typeof tg === 'string' && tg.toLowerCase() === 'personal')) ||
      (row.created_by_id && row.assigned_to_id && row.created_by_id === row.assigned_to_id && (!row.assigned_to_ids || row.assigned_to_ids.length <= 1)));

  let resolvedAssignmentType: Task['assignmentType'] = row.assignment_type;
  if (!resolvedAssignmentType) {
    if (isPersonal) {
      resolvedAssignmentType = 'personal';
    } else if (isDeptTarget) {
      resolvedAssignmentType = 'department';
    } else if (isOrgTarget) {
      resolvedAssignmentType = 'organization';
    } else if (isAssignedToOther) {
      resolvedAssignmentType = 'specific_people';
    }
  }

  return {
    id: row.id,
    title: row.title || '',
    description: row.description || '',
    organisation: row.organisation || 'WIPAHS',
    department: row.department || 'General',
    status: row.status || 'To Do',
    priority: row.priority || 'Normal',
    assignedToId: row.assigned_to_id || '',
    assignedToName: row.assigned_to_name || '',
    assignedToAvatar: row.assigned_to_avatar || '',
    assignedToIds: row.assigned_to_ids || [],
    createdById: row.created_by_id || '',
    createdByName: row.created_by_name || '',
    createdAt: row.created_at || new Date().toISOString(),
    dueDate: row.due_date || '',
    subtasks: subtasks,
    tags: row.tags || [],
    sharePointDocId: row.sharepoint_doc_id || undefined,
    projectId: row.project_id || undefined,
    type: isPersonal ? 'personal' : (isDeptTarget || isOrgTarget ? 'departmental' : (row.type || undefined)),
    assignmentType: row.assignment_type || resolvedAssignmentType,
    assignedDepartments: row.assigned_departments || [],
    assignedOrganisations: row.assigned_organisations || [],
    pendingRating: isPersonal ? false : Boolean(row.pending_rating),
    rating: row.rating || undefined,
    completedAt: row.completed_at || undefined,
    cancelledAt: row.cancelled_at || undefined,
  };
}

export function mapTaskToRow(task: Partial<Task>): Record<string, any> {
  const row: Record<string, any> = {};
  if (task.id !== undefined) row.id = task.id;
  if (task.title !== undefined) row.title = task.title;
  if (task.description !== undefined) row.description = task.description;
  if (task.status !== undefined) row.status = task.status;
  if (task.priority !== undefined) row.priority = task.priority;
  if (task.department !== undefined) row.department = task.department;
  if (task.organisation !== undefined) row.organisation = task.organisation;
  if (task.assignedToId !== undefined) row.assigned_to_id = toUuidOrNull(task.assignedToId);
  if (task.assignedToName !== undefined) row.assigned_to_name = task.assignedToName;
  if (task.assignedToAvatar !== undefined) row.assigned_to_avatar = sanitizeDenormalizedAvatar(task.assignedToAvatar);
  if (task.assignedToIds !== undefined) row.assigned_to_ids = task.assignedToIds;
  if (task.assignmentType !== undefined) row.assignment_type = task.assignmentType;
  if (task.assignedDepartments !== undefined) row.assigned_departments = task.assignedDepartments;
  if (task.assignedOrganisations !== undefined) row.assigned_organisations = task.assignedOrganisations;
  if (task.createdById !== undefined) row.created_by_id = toUuidOrNull(task.createdById);
  if (task.createdByName !== undefined) row.created_by_name = task.createdByName;
  if (task.dueDate !== undefined) row.due_date = task.dueDate;
  if (task.projectId !== undefined) row.project_id = task.projectId;
  if (task.sharePointDocId !== undefined) row.sharepoint_doc_id = task.sharePointDocId;
  const isPersonal =
    task.type === 'personal' ||
    task.assignmentType === 'personal' ||
    (Array.isArray(task.tags) && task.tags.some(tg => typeof tg === 'string' && tg.toLowerCase() === 'personal')) ||
    (task.createdById && task.assignedToId && task.createdById === task.assignedToId && (!task.assignedToIds || task.assignedToIds.length <= 1));
  if (task.pendingRating !== undefined) row.pending_rating = isPersonal ? false : task.pendingRating;
  if (task.rating !== undefined) row.rating = task.rating;
  return row;
}

// -------------------------------------------------------------------------
// 3. Notices
// -------------------------------------------------------------------------
export function mapNoticeRow(row: any, acks: string[] = []): Notice {
  return {
    id: row.id,
    title: row.title || '',
    content: row.content || '',
    organisation: row.organisation || 'WIPAHS',
    department: row.department || 'General',
    authorId: row.author_id || '',
    authorName: row.author_name || 'Staff Member',
    authorRole: row.author_role || 'Staff Member',
    createdAt: row.created_at || new Date().toISOString(),
    priority: (row.priority as 'Urgent' | 'Normal') || 'Normal',
    pinned: Boolean(row.pinned),
    acknowledgedBy: acks,
    targetAudienceType: row.target_audience_type || undefined,
    targetOrganisations: row.target_organisations || [],
    targetDepartments: row.target_departments || [],
    targetUserIds: row.target_user_ids || [],
  };
}

export function mapNoticeToRow(notice: Partial<Notice>): Record<string, any> {
  const row: Record<string, any> = {};
  if (notice.id !== undefined) row.id = notice.id;
  if (notice.title !== undefined) row.title = notice.title;
  if (notice.content !== undefined) row.content = notice.content;
  if (notice.authorId !== undefined) row.author_id = toUuidOrNull(notice.authorId);
  if (notice.authorName !== undefined) row.author_name = notice.authorName;
  if (notice.authorRole !== undefined) row.author_role = notice.authorRole;
  if (notice.department !== undefined) row.department = notice.department;
  if (notice.organisation !== undefined) row.organisation = notice.organisation;
  if (notice.priority !== undefined) row.priority = notice.priority;
  if (notice.pinned !== undefined) row.pinned = notice.pinned;
  if (notice.createdAt !== undefined) row.created_at = notice.createdAt;
  if (notice.targetAudienceType !== undefined) row.target_audience_type = notice.targetAudienceType;
  if (notice.targetOrganisations !== undefined) row.target_organisations = notice.targetOrganisations;
  if (notice.targetDepartments !== undefined) row.target_departments = notice.targetDepartments;
  if (notice.targetUserIds !== undefined) row.target_user_ids = notice.targetUserIds;
  return row;
}

// -------------------------------------------------------------------------
// 4. Projects & Milestones
// -------------------------------------------------------------------------
export function mapProjectRow(
  row: any,
  milestones: Milestone[] = [],
  budgetBreakdown: BudgetCategory[] = [],
  impactMetrics: ProjectImpact[] = [],
  activityLog: ProjectActivity[] = [],
  expenses: ProjectExpense[] = [],
  members: { id: string; name: string; role?: string; avatar?: string; email?: string }[] = []
): Project {
  return {
    id: row.id,
    name: row.title || row.name || 'Untitled Project',
    description: row.description || '',
    department: row.department || 'General',
    leadId: row.leader_id || '',
    leadName: row.leader_name || '',
    status: row.status || 'Active',
    progress: Number(row.progress ?? 0),
    budget: row.budget ? String(row.budget) : undefined,
    spent: row.spent ? String(row.spent) : undefined,
    startDate: row.start_date || '',
    targetDate: row.target_date || '',
    membersCount: members.length,
    sharePointFolderUrl: row.sharepoint_folder_url || '',
    activeTasksCount: 0,
    overdueTasksCount: 0,
    milestones,
    budgetBreakdown,
    impactMetrics,
    activityLog,
    expenses,
    members,
  };
}

export function mapProjectToRow(project: Partial<Project>): Record<string, any> {
  const row: Record<string, any> = {};
  if (project.id !== undefined) row.id = project.id;
  if (project.name !== undefined) row.title = project.name;
  if (project.description !== undefined) row.description = project.description;
  if (project.department !== undefined) row.department = project.department;
  if (project.leadId !== undefined) row.leader_id = toUuidOrNull(project.leadId);
  if (project.leadName !== undefined) row.leader_name = project.leadName;
  if (project.status !== undefined) row.status = project.status;
  if (project.progress !== undefined) row.progress = project.progress;
  if (project.budget !== undefined) {
    const num = parseFloat(String(project.budget).replace(/[^0-9.-]+/g, ''));
    row.budget = isNaN(num) ? 0 : num;
  }
  if (project.spent !== undefined) {
    const num = parseFloat(String(project.spent).replace(/[^0-9.-]+/g, ''));
    row.spent = isNaN(num) ? 0 : num;
  }
  if (project.startDate !== undefined) row.start_date = project.startDate;
  if (project.targetDate !== undefined) row.target_date = project.targetDate;
  return row;
}

export function mapProjectExpenseRow(row: any): ProjectExpense {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    amount: Number(row.amount ?? 0),
    expenseDate: row.expense_date || new Date().toISOString().split('T')[0],
    categoryId: row.category_id || undefined,
    category: row.category || 'General',
    paymentMethod: row.payment_method || 'Corporate Card',
    receiptUrl: row.receipt_url || undefined,
    status: row.status || 'Active',
    createdBy: row.created_by || undefined,
    createdAt: row.created_at || new Date().toISOString(),
  };
}

// -------------------------------------------------------------------------
// 5. Meetings & Attendees
// -------------------------------------------------------------------------
export function mapMeetingAttendeeRow(row: any): MeetingAttendee {
  return {
    userId: row.user_id,
    name: row.name || 'Staff Member',
    email: row.email || '',
    status: row.status || 'Pending',
    avatar: row.avatar || undefined,
    proposedDate: row.proposed_date || undefined,
    proposedTime: row.proposed_time || undefined,
    proposedEndTime: row.proposed_end_time || undefined,
    proposalNote: row.proposal_note || undefined,
    note: row.note || undefined,
    comment: row.comment || undefined,
    respondedAt: row.responded_at || undefined,
  };
}

export function mapMeetingRow(row: any, attendees: MeetingAttendee[] = []): Meeting {
  return {
    id: row.id,
    title: row.title || '',
    department: row.department || 'General',
    date: row.date || '',
    startTime: row.start_time || '',
    endTime: row.end_time || '',
    durationMinutes: row.duration_minutes ? Number(row.duration_minutes) : undefined,
    description: row.description || '',
    organizerId: row.organizer_id || '',
    organizerName: row.organizer_name || '',
    attendees,
    agenda: row.agenda || [],
    meetingType: row.meeting_type || 'Microsoft Teams',
    teamsJoinUrl: row.teams_join_url || undefined,
    teamsMeetingId: row.teams_meeting_id || undefined,
    teamsPasscode: row.teams_passcode || undefined,
    minutes: row.minutes || undefined,
    status: row.status || 'Scheduled',
    recurrence: row.recurrence || 'None',
    chairId: row.chair_id || undefined,
    chairName: row.chair_name || undefined,
    chairEmail: row.chair_email || undefined,
  };
}

export function mapMeetingToRow(meeting: Partial<Meeting>): Record<string, any> {
  const row: Record<string, any> = {};
  if (meeting.id !== undefined) row.id = meeting.id;
  if (meeting.title !== undefined) row.title = meeting.title;
  if (meeting.department !== undefined) row.department = meeting.department;
  if (meeting.date !== undefined) row.date = meeting.date;
  if (meeting.startTime !== undefined) row.start_time = meeting.startTime;
  if (meeting.endTime !== undefined) row.end_time = meeting.endTime;
  if (meeting.durationMinutes !== undefined) row.duration_minutes = meeting.durationMinutes;
  if (meeting.description !== undefined) row.description = meeting.description;
  if (meeting.organizerId !== undefined) row.organizer_id = toUuidOrNull(meeting.organizerId);
  if (meeting.organizerName !== undefined) row.organizer_name = meeting.organizerName;
  if (meeting.agenda !== undefined) row.agenda = meeting.agenda;
  if (meeting.meetingType !== undefined) row.meeting_type = meeting.meetingType;
  if (meeting.teamsJoinUrl !== undefined) row.teams_join_url = meeting.teamsJoinUrl;
  if (meeting.teamsMeetingId !== undefined) row.teams_meeting_id = meeting.teamsMeetingId;
  if (meeting.teamsPasscode !== undefined) row.teams_passcode = meeting.teamsPasscode;
  if (meeting.minutes !== undefined) row.minutes = meeting.minutes;
  if (meeting.status !== undefined) row.status = meeting.status;
  if (meeting.recurrence !== undefined) row.recurrence = meeting.recurrence;
  if (meeting.chairId !== undefined) row.chair_id = toUuidOrNull(meeting.chairId);
  if (meeting.chairName !== undefined) row.chair_name = meeting.chairName;
  if (meeting.chairEmail !== undefined) row.chair_email = meeting.chairEmail;
  return row;
}

// -------------------------------------------------------------------------
// 6. SharePoint Documents
// -------------------------------------------------------------------------
export function mapSharePointDocRow(row: any): SharePointDocument {
  const ext = (row.name || '').split('.').pop()?.toLowerCase();
  const fileType = (['docx', 'xlsx', 'pptx', 'pdf'].includes(ext || '') ? ext : 'docx') as any;
  const siteUrl = 'https://wipahstz.sharepoint.com/sites/OfficeHub';
  let validWebUrl = row.web_url;
  if (!validWebUrl || !validWebUrl.startsWith('http') || validWebUrl === siteUrl || validWebUrl === 'https://wipahstz.sharepoint.com' || validWebUrl.endsWith('/OfficeHub') || validWebUrl.endsWith('/OfficeHub/')) {
    validWebUrl = `${siteUrl}/Shared Documents/${encodeURIComponent(row.folder || 'General')}/${encodeURIComponent(row.name || 'Document')}`;
  }
  return {
    id: row.id,
    name: row.name || 'Document',
    folder: row.folder || 'General',
    fileType,
    size: row.size || '1.2 MB',
    modifiedAt: row.modified_at || new Date().toISOString(),
    modifiedBy: row.modified_by || 'Staff Member',
    createdById: row.created_by_id || undefined,
    version: row.version || '1.0',
    sharePointWebUrl: validWebUrl,
    webUrl: validWebUrl,
    visibility: row.visibility || 'Everyone',
    targetDepartment: row.target_department || undefined,
    allowedUserIds: row.allowed_user_ids || [],
    editableUserIds: row.editable_user_ids || [],
    isLockedForEditing: false,
    activeCollaborators: [],
    syncedWithSharePoint: Boolean(row.graph_drive_item_id && row.synced_with_sharepoint !== false),
    contentSummary: row.content_summary || undefined,
    projectId: row.project_id || row.projectId || undefined,
  };
}

export function mapSharePointDocToRow(doc: Partial<SharePointDocument>): Record<string, any> {
  const row: Record<string, any> = {};
  if (doc.id !== undefined) row.id = doc.id;
  if (doc.name !== undefined) row.name = doc.name;
  if (doc.folder !== undefined) row.folder = doc.folder;
  if (doc.webUrl !== undefined) row.web_url = doc.webUrl;
  if (doc.sharePointWebUrl !== undefined && !row.web_url) row.web_url = doc.sharePointWebUrl;
  if (doc.modifiedAt !== undefined) row.modified_at = doc.modifiedAt;
  if (doc.modifiedBy !== undefined) row.modified_by = doc.modifiedBy;
  if (doc.createdById !== undefined) row.created_by_id = toUuidOrNull(doc.createdById);
  if (doc.version !== undefined) row.version = doc.version;
  if (doc.visibility !== undefined) row.visibility = doc.visibility;
  if (doc.targetDepartment !== undefined) row.target_department = doc.targetDepartment;
  if (doc.allowedUserIds !== undefined) row.allowed_user_ids = doc.allowedUserIds;
  if (doc.editableUserIds !== undefined) row.editable_user_ids = doc.editableUserIds;
  if (doc.syncedWithSharePoint !== undefined) row.synced_with_sharepoint = doc.syncedWithSharePoint;
  if (doc.contentSummary !== undefined) row.content_summary = doc.contentSummary;
  if (doc.projectId !== undefined) row.project_id = doc.projectId;
  return row;
}

// -------------------------------------------------------------------------
// 7. Teams Notification Rules
// -------------------------------------------------------------------------
export function mapTeamsRuleRow(row: any): TeamsNotificationRule {
  return {
    id: row.id,
    name: row.title || 'Rule',
    event: row.event_type as any,
    channelName: row.department || 'All',
    webhookUrl: row.teams_webhook_url || '',
    enabled: Boolean(row.enabled),
  };
}

export function mapTeamsRuleToRow(rule: Partial<TeamsNotificationRule>): Record<string, any> {
  const row: Record<string, any> = {};
  if (rule.id !== undefined) row.id = rule.id;
  if (rule.name !== undefined) row.title = rule.name;
  if (rule.event !== undefined) row.event_type = rule.event;
  if (rule.channelName !== undefined) row.department = rule.channelName;
  if (rule.webhookUrl !== undefined) row.teams_webhook_url = rule.webhookUrl;
  if (rule.enabled !== undefined) row.enabled = rule.enabled;
  return row;
}

// -------------------------------------------------------------------------
// 8. Audit Log
// -------------------------------------------------------------------------
export function mapAuditLogRow(row: any): AuditEvent {
  return {
    id: row.id,
    actorName: row.actor_name || 'System',
    actorEmail: row.actor_email || '',
    eventType: row.event_type || 'system_event',
    targetName: row.target_name || '',
    timestamp: row.timestamp || new Date().toISOString(),
    badgeColor: (row.badge_color as any) || 'blue',
  };
}

export function mapAuditLogToRow(audit: Partial<AuditEvent>): Record<string, any> {
  const row: Record<string, any> = {};
  if (audit.id !== undefined) row.id = audit.id;
  if (audit.actorName !== undefined) row.actor_name = audit.actorName;
  if (audit.actorEmail !== undefined) row.actor_email = audit.actorEmail;
  if (audit.eventType !== undefined) row.event_type = audit.eventType;
  if (audit.targetName !== undefined) row.target_name = audit.targetName;
  if (audit.timestamp !== undefined) row.timestamp = audit.timestamp;
  if (audit.badgeColor !== undefined) row.badge_color = audit.badgeColor;
  return row;
}

// -------------------------------------------------------------------------
// 9. Decisions
// -------------------------------------------------------------------------
export function mapDecisionRow(row: any): Decision {
  return {
    id: row.id,
    projectId: row.project_id || undefined,
    title: row.title || '',
    summary: row.context || row.decision || '',
    department: row.department || 'General',
    date: row.date || '',
    decidedBy: row.author_name || 'Board',
    status: (row.status as any) || 'Active',
    actionItemsCount: 0,
  };
}

export function mapDecisionToRow(dec: Partial<Decision>): Record<string, any> {
  const row: Record<string, any> = {};
  if (dec.id !== undefined) row.id = dec.id;
  if (dec.projectId !== undefined) row.project_id = dec.projectId;
  if (dec.title !== undefined) row.title = dec.title;
  if (dec.summary !== undefined) {
    row.context = dec.summary;
    row.decision = dec.summary;
  }
  if (dec.department !== undefined) row.department = dec.department;
  if (dec.decidedBy !== undefined) row.author_name = dec.decidedBy;
  if (dec.date !== undefined) row.date = dec.date;
  if (dec.status !== undefined) row.status = dec.status;
  return row;
}

// -------------------------------------------------------------------------
// 10. Approvals
// -------------------------------------------------------------------------
export function mapApprovalRow(row: any): Approval {
  return {
    id: row.id,
    title: row.title || '',
    description: row.description || '',
    department: row.department || 'General',
    type: row.type || 'Budget',
    amount: row.amount ? String(row.amount) : undefined,
    requestedBy: row.requested_by_name || 'Staff Member',
    requestedById: row.requested_by_id || undefined,
    requestedByName: row.requested_by_name || undefined,
    requestedDate: row.requested_date || '',
    status: (row.status as any) || 'Pending',
    approvedBy: row.approved_by || undefined,
    approvedDate: row.approved_date || undefined,
    notes: row.notes || undefined,
    urgency: row.urgency || 'Normal',
    approverIds: row.approver_ids || [],
  };
}

export function mapApprovalToRow(app: Partial<Approval>): Record<string, any> {
  const row: Record<string, any> = {};
  if (app.id !== undefined) row.id = app.id;
  if (app.title !== undefined) row.title = app.title;
  if (app.description !== undefined) row.description = app.description;
  if (app.department !== undefined) row.department = app.department;
  if (app.type !== undefined) row.type = app.type;
  if (app.amount !== undefined) {
    const num = parseFloat(String(app.amount).replace(/[^0-9.-]+/g, ''));
    row.amount = isNaN(num) ? 0 : num;
  }
  if (app.requestedById !== undefined) row.requested_by_id = toUuidOrNull(app.requestedById);
  if (app.requestedByName !== undefined) row.requested_by_name = app.requestedByName;
  if (app.requestedBy !== undefined && !row.requested_by_name) row.requested_by_name = app.requestedBy;
  if (app.requestedDate !== undefined) row.requested_date = app.requestedDate;
  if (app.status !== undefined) row.status = app.status;
  if (app.approvedBy !== undefined) row.approved_by = app.approvedBy;
  if (app.approvedDate !== undefined) row.approved_date = app.approvedDate;
  if (app.notes !== undefined) row.notes = app.notes;
  if (app.urgency !== undefined) row.urgency = app.urgency;
  if (app.approverIds !== undefined) row.approver_ids = app.approverIds;
  return row;
}

// -------------------------------------------------------------------------
// 11. Departments
// -------------------------------------------------------------------------
export function mapDepartmentRow(row: any): DepartmentInfo {
  return {
    id: row.id,
    name: row.name || 'General',
    description: row.description || '',
    headName: row.head_name || 'Department Head',
    headRole: 'Head of Department',
    headAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    staffCount: Number(row.member_count ?? 0),
    activeProjectsCount: 0,
    openTasksCount: 0,
    budget: '$50,000',
  };
}

export function mapDepartmentToRow(dept: Partial<DepartmentInfo>): Record<string, any> {
  const row: Record<string, any> = {};
  if (dept.id !== undefined) row.id = dept.id;
  if (dept.name !== undefined) row.name = dept.name;
  if (dept.description !== undefined) row.description = dept.description;
  if (dept.headName !== undefined) row.head_name = dept.headName;
  if (dept.staffCount !== undefined) row.member_count = dept.staffCount;
  return row;
}

// -------------------------------------------------------------------------
// 12. Roles & Permissions
// -------------------------------------------------------------------------
export function mapRoleRow(row: any): RolePermission {
  return {
    id: row.role_id,
    roleTitle: row.role_name || row.role_id,
    department: 'All Departments',
    userCount: 0,
    description: row.description || '',
    permissions: Array.isArray(row.permissions) ? row.permissions : [],
  };
}

export function mapRoleToRow(role: Partial<RolePermission>): Record<string, any> {
  const row: Record<string, any> = {};
  if (role.id !== undefined) row.role_id = role.id;
  if (role.roleTitle !== undefined) row.role_name = role.roleTitle;
  if (role.description !== undefined) row.description = role.description;
  if (role.permissions !== undefined) row.permissions = role.permissions;
  return row;
}

// -------------------------------------------------------------------------
// 13. Conversations & Messages
// -------------------------------------------------------------------------
export function mapConversationRow(row: any, participantIds: string[] = []): ChatConversation {
  return {
    id: row.id,
    type: (row.type as 'direct' | 'group') || 'direct',
    name: row.title || 'Conversation',
    participantIds,
    lastMessage: row.last_message || undefined,
    lastMessageTime: row.last_message_time || undefined,
    createdAt: row.created_at || new Date().toISOString(),
  };
}

export function mapConversationToRow(conv: Partial<ChatConversation>): Record<string, any> {
  const row: Record<string, any> = {};
  if (conv.id !== undefined) row.id = conv.id;
  if (conv.name !== undefined) row.title = conv.name;
  if (conv.type !== undefined) row.type = conv.type;
  if (conv.lastMessage !== undefined) row.last_message = conv.lastMessage;
  if (conv.lastMessageTime !== undefined) row.last_message_time = conv.lastMessageTime;
  return row;
}

export function mapMessageRow(row: any): ChatMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id || '',
    senderName: row.sender_name || 'Staff Member',
    senderAvatar: row.sender_avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    text: row.text || '',
    timestamp: row.timestamp || new Date().toISOString(),
    reactions: Array.isArray(row.reactions) ? row.reactions : [],
  };
}

export function mapMessageToRow(msg: Partial<ChatMessage>): Record<string, any> {
  const row: Record<string, any> = {};
  if (msg.id !== undefined) row.id = msg.id;
  if (msg.conversationId !== undefined) row.conversation_id = msg.conversationId;
  if (msg.senderId !== undefined) row.sender_id = toUuidOrNull(msg.senderId);
  if (msg.senderName !== undefined) row.sender_name = msg.senderName;
  if (msg.senderAvatar !== undefined) row.sender_avatar = sanitizeDenormalizedAvatar(msg.senderAvatar);
  if (msg.text !== undefined) row.text = msg.text;
  if (msg.timestamp !== undefined) row.timestamp = msg.timestamp;
  if (msg.reactions !== undefined) row.reactions = msg.reactions;
  return row;
}

// -------------------------------------------------------------------------
// 14. Notifications & Dispatched Emails
// -------------------------------------------------------------------------
export function mapNotificationRow(row: any): AppNotification {
  return {
    id: row.id,
    title: row.title || '',
    message: row.message || '',
    type: row.type || 'general',
    meetingId: row.meeting_id || undefined,
    targetUserId: row.target_user_id || 'all',
    createdAt: row.created_at || new Date().toISOString(),
    read: Boolean(row.read),
    actorId: row.actor_id || undefined,
    actorName: row.actor_name || undefined,
    actorAvatar: row.actor_avatar || undefined,
    priority: (row.priority as 'Urgent' | 'Normal') || 'Normal',
    pushedToMicrosoftTeams: Boolean(row.pushed_to_microsoft_teams ?? true),
    emailTriggered: Boolean(row.email_triggered),
    emailRecipients: row.email_recipients || [],
    emailSentAt: row.email_sent_at || undefined,
    emailSubject: row.email_subject || undefined,
    metadata: row.metadata || {},
  };
}

export function mapNotificationToRow(notif: Partial<AppNotification>): Record<string, any> {
  const row: Record<string, any> = {};
  if (notif.id !== undefined) row.id = notif.id;
  if (notif.title !== undefined) row.title = notif.title;
  if (notif.message !== undefined) row.message = notif.message;
  if (notif.type !== undefined) row.type = notif.type;
  if (notif.meetingId !== undefined) row.meeting_id = notif.meetingId;
  row.target_user_id = notif.targetUserId || 'all';
  if (notif.createdAt !== undefined) row.created_at = notif.createdAt;
  if (notif.read !== undefined) row.read = notif.read;
  if (notif.actorId !== undefined) row.actor_id = toUuidOrNull(notif.actorId);
  row.actor_name = notif.actorName || 'Staff Member';
  if (notif.actorAvatar !== undefined) row.actor_avatar = sanitizeDenormalizedAvatar(notif.actorAvatar);
  if (notif.priority !== undefined) row.priority = notif.priority;
  if (notif.pushedToMicrosoftTeams !== undefined) row.pushed_to_microsoft_teams = notif.pushedToMicrosoftTeams;
  if (notif.emailTriggered !== undefined) row.email_triggered = notif.emailTriggered;
  if (notif.emailRecipients !== undefined) row.email_recipients = notif.emailRecipients;
  if (notif.emailSentAt !== undefined) row.email_sent_at = notif.emailSentAt;
  if (notif.emailSubject !== undefined) row.email_subject = notif.emailSubject;
  if (notif.metadata !== undefined) row.metadata = notif.metadata;
  return row;
}

export function mapDispatchedEmailRow(row: any): DispatchedEmail {
  return {
    id: row.id,
    notificationId: row.notification_id || '',
    recipientEmail: row.recipient_email || '',
    recipientName: row.recipient_name || '',
    senderName: 'WIPAHS OfficeHub',
    senderEmail: 'officehub@wipahs.org',
    subject: row.subject || '',
    bodyText: row.body_text || '',
    // Render text in React. Historic client-written HTML is not trusted.
    timestamp: row.accepted_at || row.created_at || row.sent_at || '',
    priority: 'Normal',
    category: row.event_type || 'Notification',
    status: (['queued','processing','sending','retry','accepted','failed','review','cancelled'].includes(row.status)
      ? row.status : 'unverified') as DispatchedEmail['status'],
  };
}

export function mapDispatchedEmailToRow(email: Partial<DispatchedEmail>): Record<string, any> {
  const row: Record<string, any> = {};
  if (email.id !== undefined) row.id = email.id;
  if (email.notificationId !== undefined) row.notification_id = email.notificationId;
  if (email.recipientEmail !== undefined) row.recipient_email = email.recipientEmail;
  if (email.recipientName !== undefined) row.recipient_name = email.recipientName;
  if (email.subject !== undefined) row.subject = email.subject;
  if (email.bodyHtml !== undefined) row.body_html = email.bodyHtml;
  if (email.bodyText !== undefined) row.body_text = email.bodyText;
  if (email.timestamp !== undefined) row.sent_at = email.timestamp;
  if (email.status !== undefined) row.status = email.status;
  return row;
}

