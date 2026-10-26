export type Department = 
  | 'All Departments'
  | 'Top management'
  | 'IT'
  | 'Finance'
  | 'management'
  | 'projects and Mkt'
  | 'Logistics and Operations'
  | 'Tabligh'
  | string;

export type Priority = 'Urgent' | 'High' | 'Medium' | 'Low';

export type TaskStatus = 'To Do' | 'In Progress' | 'In Review' | 'Done' | 'Cancelled';

export interface TaskUpdate {
  text: string;
  authorId: string;
  authorName: string;
  updatedAt: string; // ISO timestamp
}

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
  assignedTo?: string;
  dueDate?: string;
  update?: TaskUpdate;
}

export interface TaskRating {
  ratedUserId: string; // the assignee or department ID
  raterUserId: string; // the assigner
  stars: number; // 1-5
  comment?: string;
  ratedAt: string; // ISO timestamp
  isDepartmentRating?: boolean;
  departmentName?: string;
}

export type TaskAssignmentType = 'personal' | 'department' | 'organization' | 'specific_people';

export interface Task {
  id: string;
  title: string;
  description: string;
  organisation?: string;
  department: Department | string;
  status: TaskStatus;
  priority: Priority;
  assignedToId: string;
  assignedToName: string;
  assignedToAvatar: string;
  assignedToIds?: string[];
  assignedToNames?: string[];
  assignedDepartments?: string[];
  assignedOrganisations?: string[];
  assignmentType?: TaskAssignmentType;
  createdById: string;
  createdByName: string;
  createdAt: string;
  dueDate: string;
  subtasks: Subtask[];
  update?: TaskUpdate;
  tags: string[];
  sharePointDocId?: string;
  sharePointDocUrl?: string;
  teamsMeetingLink?: string;
  teamsNotificationSent?: boolean;
  type?: 'personal' | 'departmental';
  projectId?: string;
  attachments?: MessageAttachment[];
  rating?: TaskRating;
  pendingRating?: boolean;
  completedAt?: string;
  cancelledAt?: string;
  generalUpdate?: string;
}

export interface Notice {
  id: string;
  title: string;
  content: string;
  organisation?: string;
  department: Department | string;
  authorId: string;
  authorName: string;
  authorRole: string;
  createdAt: string;
  date?: string;
  priority: 'Urgent' | 'Normal';
  pinned: boolean;
  targetAudienceType?: 'all' | 'organisation' | 'department' | 'org_and_dept' | 'selected_people';
  targetOrganisation?: string;
  targetDepartment?: string;
  targetOrganisations?: string[];
  targetDepartments?: string[];
  targetUserIds?: string[];
  targetUserNames?: string[];
  attachments?: MessageAttachment[];
  acknowledgedBy: string[]; // user IDs or names
  teamsSent?: boolean;
}

export interface Milestone {
  id: string;
  name: string;
  status: 'Completed' | 'Current' | 'Upcoming';
  dueDate: string;
  progress: number;
}

export interface BudgetCategory {
  id?: string;
  category: string;
  allocated: number;
  spent: number;
}

export interface ProjectImpact {
  icon: string;
  label: string;
  value: string;
}

export interface ProjectActivity {
  id: string;
  userName: string;
  userAvatar?: string;
  action: string;
  timestamp: string;
}

export interface ProjectExpense {
  id: string;
  projectId: string;
  title: string;
  amount: number;
  expenseDate: string;
  categoryId?: string;
  category: string;
  paymentMethod: string;
  receiptUrl?: string;
  status: 'Active' | 'Voided';
  createdBy?: string;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  code?: string;
  description: string;
  department: Department;
  leadId: string;
  leadName: string;
  status: 'Active' | 'On Track' | 'At Risk' | 'Delayed' | 'Completed';
  statusReason?: string;
  progress: number;
  budget?: string;
  spent?: string;
  startDate: string;
  targetDate: string;
  membersCount: number;
  memberIds?: string[];
  members?: { id: string; name: string; role?: string; avatar?: string; email?: string }[];
  sharePointFolderUrl: string;
  activeTasksCount: number;
  overdueTasksCount: number;
  notes?: string[];
  attachments?: { name: string; url: string; size: string; type: string }[];
  milestones: Milestone[];
  budgetBreakdown: BudgetCategory[];
  impactMetrics: ProjectImpact[];
  activityLog?: ProjectActivity[];
  expenses?: ProjectExpense[];
}

export type RsvpStatus = 'Accepted' | 'Pending' | 'Declined' | 'Proposed New Time';

export interface MeetingAttendee {
  userId: string;
  name: string;
  email: string;
  status: RsvpStatus;
  avatar?: string;
  proposedDate?: string;
  proposedTime?: string;
  proposedEndTime?: string;
  proposedDateTime?: string;
  proposalNote?: string;
  note?: string;
  comment?: string;
  respondedAt?: string;
}

export interface Meeting {
  id: string;
  title: string;
  department: Department | string;
  date: string;
  time?: string;
  startTime: string;
  endTime: string;
  durationMinutes?: number;
  description?: string;
  organizerId: string;
  organizerName: string;
  attendees: MeetingAttendee[];
  agenda: string[];
  meetingType: 'Microsoft Teams' | 'In-Person Boardroom' | 'Hybrid';
  teamsJoinUrl?: string;
  teamsMeetingId?: string;
  teamsPasscode?: string;
  minutes?: string;
  status: 'Scheduled' | 'In Progress' | 'Completed' | 'Cancelled';
  recurrence?: 'None' | 'Daily' | 'Weekly' | 'Monthly';
  chairId?: string;
  chairName?: string;
  chairEmail?: string;
  attachments?: MessageAttachment[];
}

export interface SharePointDocument {
  id: string;
  name: string;
  folder: 'Policies & Forms' | 'Operations' | 'Finance' | 'Board Minutes' | 'Projects' | string;
  category?: string;
  fileType: 'docx' | 'xlsx' | 'pptx' | 'pdf';
  size: string;
  modifiedAt: string;
  lastModified?: string;
  modifiedBy: string;
  createdById?: string;
  lastModifiedBy?: string;
  version: string;
  sharePointWebUrl: string;
  webUrl?: string;
  visibility?: 'Everyone' | 'Department' | 'Specific People';
  targetDepartment?: Department;
  allowedUserIds?: string[]; // If visibility is 'Specific People'
  editableUserIds?: string[];
  isLockedForEditing: boolean;
  activeCollaborators: {
    userId: string;
    name: string;
    editingSection?: string;
  }[];
  activeUsers?: string[];
  syncedWithSharePoint: boolean;
  contentSummary?: string;
  projectId?: string;
}

export type UserPresenceStatus = 'Online' | 'Busy' | 'In Teams Meeting' | 'Away' | 'Offline' | 'Out of Office';

export interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: string;
  organisation: string;
  department: string;
  status: UserPresenceStatus;
  avatar: string;
  phone: string;
  activityScore: number;
  tasksCount: number;
  lastActive: string;
  teamsHandle?: string;
  birthday?: string; // e.g. "09-24" or "1992-09-24"
  bio?: string;
  location?: string;
  averageRating?: number;
  totalRatingsCount?: number;
  outOfOffice?: boolean;
  outOfOfficeMessage?: string;
  leaveType?: 'Annual Leave' | 'Sick / Medical Leave' | 'Official Travel / Field Mission' | 'Maternity / Paternity Leave' | 'Emergency / Personal Leave' | 'Study Leave' | string;
  leaveStartDate?: string;
  leaveEndDate?: string;
  backupContactName?: string;
  mustChangePassword?: boolean;
  temporaryPassword?: string;
  deactivated?: boolean;
  app_metadata?: {
    must_change_password?: boolean;
    [key: string]: any;
  };
}

export interface MessageAttachment {
  id: string;
  name: string;
  size: string;
  type: 'pdf' | 'docx' | 'xlsx' | 'image' | 'file';
  url: string;
  textContent?: string;
  sheetData?: { sheetName: string; rows: (string | number | boolean | null)[][] }[];
  mimeType?: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  senderRole?: string;
  text: string;
  timestamp: string;
  attachments?: MessageAttachment[];
  reactions?: { emoji: string; count: number; userIds: string[] }[];
}

export interface ChatConversation {
  id: string;
  type: 'direct' | 'group';
  name: string;
  description?: string;
  avatar?: string;
  department?: Department | string;
  participantIds: string[];
  lastMessage?: string;
  lastMessageTime?: string;
  unreadCount?: number;
  createdById?: string;
  createdAt?: string;
}

export type TeamsNotificationEventType =
  | 'task_urgent_created'
  | 'task_completed'
  | 'urgent_notice'
  | 'teams_meeting_scheduled'
  | 'teams_meeting_updated'
  | 'teams_meeting_rescheduled'
  | 'teams_meeting_cancelled'
  | 'meeting_rsvp_received'
  | 'meeting_conflict_alert'
  | 'sharepoint_doc_uploaded';

export interface TeamsNotificationRule {
  id: string;
  name: string;
  event: TeamsNotificationEventType;
  channelName: string;
  webhookUrl: string;
  enabled: boolean;
  lastTriggered?: string;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type:
    | 'meeting_scheduled'
    | 'meeting_updated'
    | 'meeting_rescheduled'
    | 'meeting_cancelled'
    | 'meeting_rsvp'
    | 'meeting_proposal'
    | 'meeting_conflict'
    | 'task'
    | 'notice'
    | 'approval'
    | 'project'
    | 'document'
    | 'general'
    | string;
  meetingId?: string;
  targetUserId: string;
  createdAt: string;
  read: boolean;
  actorId?: string;
  actorName?: string;
  actorAvatar?: string;
  priority?: 'Urgent' | 'Normal';
  pushedToMicrosoftTeams?: boolean;
  emailTriggered?: boolean;
  emailRecipients?: string[];
  emailSentAt?: string;
  emailSubject?: string;
  metadata?: Record<string, any>;
}

export interface DispatchedEmail {
  id: string;
  notificationId: string;
  recipientEmail: string;
  recipientName: string;
  senderName: string;
  senderEmail: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  timestamp: string;
  priority: 'Urgent' | 'Normal';
  category: string;
  status: 'queued' | 'processing' | 'sending' | 'retry' | 'accepted' | 'failed' | 'review' | 'cancelled' | 'unverified';
}

export interface AuditEvent {
  id: string;
  actorName: string;
  actorEmail: string;
  eventType: string;
  targetName: string;
  description?: string;
  timestamp: string;
  badgeColor: 'teal' | 'blue' | 'amber' | 'emerald' | 'purple' | 'green';
}

export interface Decision {
  id: string;
  projectId?: string;
  title: string;
  summary: string;
  department: Department;
  meetingId?: string;
  meetingTitle?: string;
  date: string;
  decidedBy: string;
  status: 'Adopted' | 'Approved' | 'In Implementation' | 'Under Review';
  category?: 'Strategic' | 'Financial' | 'Operational' | 'Governance';
  actionItemsCount: number;
}

export interface Approval {
  id: string;
  title: string;
  description: string;
  department: Department;
  type?: 'Budget Allocation' | 'Procurement' | 'Project Milestone' | 'Contract' | string;
  amount?: string;
  projectId?: string;
  projectName?: string;
  requestedBy: string;
  requestedById?: string;
  requestedByName?: string;
  urgency?: string;
  requestedByAvatar?: string;
  requestedDate: string;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Under Review';
  approvedBy?: string;
  approvedDate?: string;
  notes?: string;
  approverIds?: string[];
  attachments?: {
    name: string;
    url: string;
    size: string;
    type: 'pdf' | 'docx' | 'xlsx' | 'image' | 'file';
  }[];
}

export interface DepartmentInfo {
  id: string;
  name: Department | string;
  organisation?: string;
  headName: string;
  headRole: string;
  headAvatar: string;
  staffCount: number;
  activeProjectsCount: number;
  openTasksCount: number;
  budget: string;
  description: string;
}

export interface RolePermission {
  id: string;
  roleTitle: string;
  department: string;
  userCount: number;
  description: string;
  permissions: {
    module: string;
    view: boolean;
    create: boolean;
    edit: boolean;
    approve: boolean;
  }[];
}


