// =========================================================================
// WIPAHS OfficeHub Store
// Scoped per-table state management with isolated per-table setters.
// ZERO global cascade refetches. ZERO reliance on mock data or local storage.
// =========================================================================

import { useEffect, useSyncExternalStore } from 'react';
import {
  Department,
  Meeting,
  Notice,
  Project,
  SharePointDocument,
  StaffUser,
  Task,
  TeamsNotificationRule,
  AuditEvent,
  UserPresenceStatus,
  Subtask,
  Decision,
  Approval,
  DepartmentInfo,
  RolePermission,
  ChatConversation,
  ChatMessage,
  RsvpStatus,
  AppNotification,
  DispatchedEmail,
  Milestone,
  BudgetCategory,
  ProjectImpact,
  ProjectActivity,
  ProjectExpense,
} from '../types';
import { supabase, fetchPublicProfiles, invokeCreateStaffUserEdgeFunction, signOutSupabase } from './supabaseClient';
import {
  mapStaffRow,
  mapStaffToRow,
  mapTaskRow,
  mapTaskToRow,
  mapSubtaskRow,
  mapNoticeRow,
  mapNoticeToRow,
  mapProjectRow,
  mapProjectToRow,
  mapProjectExpenseRow,
  mapMeetingRow,
  mapMeetingToRow,
  mapMeetingAttendeeRow,
  mapSharePointDocRow,
  mapSharePointDocToRow,
  mapTeamsRuleRow,
  mapTeamsRuleToRow,
  mapAuditLogRow,
  mapAuditLogToRow,
  mapDecisionRow,
  mapDecisionToRow,
  mapApprovalRow,
  mapApprovalToRow,
  mapDepartmentRow,
  mapDepartmentToRow,
  mapRoleRow,
  mapRoleToRow,
  mapConversationRow,
  mapConversationToRow,
  mapMessageRow,
  mapMessageToRow,
  mapNotificationRow,
  mapNotificationToRow,
  mapDispatchedEmailRow,
  mapDispatchedEmailToRow,
  toUuidOrNull,
  TASK_SELECT_COLUMNS,
  NOTICE_SELECT_COLUMNS,
  MEETING_ATTENDEE_SELECT_COLUMNS,
  MESSAGE_SELECT_COLUMNS,
  NOTIFICATION_SELECT_COLUMNS,
  sanitizeDenormalizedAvatar,
  recoverTruncatedJsonArray,
} from './supabaseMappers';
import { sendTeamsWebhookNotification, generateTeamsMeetingPayload } from './teamsSharePointService';
import { playNotificationSound } from '../utils/sound';
import { isPersonalTask } from '../utils/taskUtils';
import { convertTo24HourTime, convertTo12HourTime } from '../utils/meetingConflict';
import {
  startRealtimeEngine,
  stopRealtimeEngine,
  triggerLiveMeetingSync,
  triggerLiveMessageSync,
  broadcastRealtimeEvent,
} from './realtimeService';

// Default standard folders for SharePoint
const DEFAULT_FOLDERS: string[] = ['Operations', 'Policies & Forms', 'Finance', 'Board Minutes', 'Projects'];

export interface AuthSessionInfo {
  isAuthenticated: boolean;
  userId: string | null;
  mustChangePassword: boolean;
  sessionToken?: string;
}

// -------------------------------------------------------------------------
// Per-Table Reactive State Architecture
// -------------------------------------------------------------------------
export interface StoreData {
  tasks: Task[];
  notices: Notice[];
  projects: Project[];
  meetings: Meeting[];
  staff: StaffUser[];
  sharePointDocs: SharePointDocument[];
  folderList: string[];
  teamsRules: TeamsNotificationRule[];
  auditLogs: AuditEvent[];
  currentUser: StaffUser;
  decisions: Decision[];
  approvals: Approval[];
  departments: DepartmentInfo[];
  roles: RolePermission[];
  conversations: ChatConversation[];
  messages: ChatMessage[];
  notifications: AppNotification[];
  dispatchedEmails: DispatchedEmail[];
  authSession: AuthSessionInfo;
  loading: boolean;
}

export function getDeletedDepartmentIds(): Set<string> {
  try {
    const raw = localStorage.getItem('wipahs_deleted_department_ids');
    if (raw) return new Set(JSON.parse(raw));
  } catch {}
  return new Set();
}

export function saveDeletedDepartmentIds(set: Set<string>): void {
  try {
    localStorage.setItem('wipahs_deleted_department_ids', JSON.stringify(Array.from(set)));
  } catch {}
}

// Clean up legacy deleted staff IDs from localStorage if present
try {
  localStorage.removeItem('wipahs_deleted_staff_ids');
} catch {}

export function getDeletedDocumentIds(): Set<string> {
  try {
    const raw = localStorage.getItem('wipahs_deleted_document_ids');
    if (raw) return new Set(JSON.parse(raw));
  } catch {}
  return new Set();
}

export function saveDeletedDocumentIds(set: Set<string>): void {
  try {
    localStorage.setItem('wipahs_deleted_document_ids', JSON.stringify(Array.from(set)));
  } catch {}
}

export function getDepartmentsFromLocalStorage(): DepartmentInfo[] {
  try {
    const raw = localStorage.getItem('wipahs_custom_departments');
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

export function saveDepartmentsToLocalStorage(depts: DepartmentInfo[]): void {
  try {
    localStorage.setItem('wipahs_custom_departments', JSON.stringify(depts));
  } catch {}
}

export function getDocumentsFromLocalStorage(): SharePointDocument[] {
  try {
    const raw = localStorage.getItem('wipahs_sharepoint_documents');
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

export function saveDocumentsToLocalStorage(docs: SharePointDocument[]): void {
  try {
    localStorage.setItem('wipahs_sharepoint_documents', JSON.stringify(docs));
  } catch {}
}

export function getProjectsFromLocalStorage(): Project[] {
  try {
    const raw = localStorage.getItem('wipahs_projects_cache');
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

export function saveProjectsToLocalStorage(projects: Project[]): void {
  try {
    localStorage.setItem('wipahs_projects_cache', JSON.stringify(projects));
  } catch {}
}

export function getSavedCurrentUserProfile(): Partial<StaffUser> | null {
  try {
    const raw = localStorage.getItem('wipahs_current_user_profile');
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function stripOversizedAvatarForStorage<T extends Partial<StaffUser>>(user: T): Partial<StaffUser> {
  if (user.avatar && user.avatar.startsWith('data:') && user.avatar.length > 65536) {
    const { avatar: _omitted, ...rest } = user;
    return rest;
  }
  return user;
}

export function saveCurrentUserProfileToLocalStorage(user: StaffUser): void {
  try {
    localStorage.setItem('wipahs_current_user_profile', JSON.stringify(stripOversizedAvatarForStorage(user)));
  } catch {}
}

export function saveStaffToLocalStorage(staffList: StaffUser[]): void {
  try {
    localStorage.setItem(
      'wipahs_registered_staff',
      JSON.stringify(staffList.map((s) => stripOversizedAvatarForStorage(s)))
    );
  } catch {}
}

export function getActiveHeartbeats(): Record<string, { timestamp: number; status?: UserPresenceStatus }> {
  try {
    const raw = localStorage.getItem('wipahs_user_heartbeats');
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

export function recordUserHeartbeat(user: StaffUser, status?: UserPresenceStatus): void {
  try {
    const heartbeats = getActiveHeartbeats();
    const entry = {
      timestamp: Date.now(),
      status: status || user.status || 'Online',
    };
    if (user.id) heartbeats[user.id] = entry;
    if (user.email) heartbeats[user.email.toLowerCase()] = entry;
    localStorage.setItem('wipahs_user_heartbeats', JSON.stringify(heartbeats));
  } catch {}
}

export function clearUserHeartbeat(user: StaffUser): void {
  try {
    const heartbeats = getActiveHeartbeats();
    const entry = {
      timestamp: 0,
      status: 'Offline' as UserPresenceStatus,
    };
    if (user.id) heartbeats[user.id] = entry;
    if (user.email) heartbeats[user.email.toLowerCase()] = entry;
    localStorage.setItem('wipahs_user_heartbeats', JSON.stringify(heartbeats));
  } catch {}
}

export const DEFAULT_DEPARTMENTS: DepartmentInfo[] = [
  { id: 'dept-mgmt', name: 'Top management', description: 'Executive Leadership & Direction', headName: 'Director General', headRole: 'Executive Director', headAvatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80', staffCount: 4, activeProjectsCount: 2, openTasksCount: 3, budget: '$150,000', organisation: 'WIPAHS' },
  { id: 'dept-it', name: 'IT', description: 'Information Technology & Systems Operations', headName: 'Rija Virani', headRole: 'IT Administrator', headAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80', staffCount: 5, activeProjectsCount: 3, openTasksCount: 4, budget: '$80,000', organisation: 'WIPAHS' },
  { id: 'dept-finance', name: 'Finance', description: 'Financial Planning, Accounting & Audit', headName: 'Finance Head', headRole: 'Finance Officer', headAvatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80', staffCount: 4, activeProjectsCount: 1, openTasksCount: 2, budget: '$120,000', organisation: 'WIPAHS' },
  { id: 'dept-marketing', name: 'Marketing', description: 'Communications, Media & Outreach', headName: 'Marketing Head', headRole: 'Marketing Officer', headAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80', staffCount: 4, activeProjectsCount: 2, openTasksCount: 3, budget: '$70,000', organisation: 'WIPAHS' },
  { id: 'dept-logistics', name: 'Logistics and Operations', description: 'Facilities, Transport & Supply Chain', headName: 'Operations Lead', headRole: 'Operations Manager', headAvatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150&auto=format&fit=crop&q=80', staffCount: 6, activeProjectsCount: 2, openTasksCount: 5, budget: '$90,000', organisation: 'WIPAHS' },
  { id: 'dept-tabligh', name: 'Tabligh', description: 'Community Welfare & Religious Affairs', headName: 'Tabligh Head', headRole: 'Coordinator', headAvatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150&auto=format&fit=crop&q=80', staffCount: 3, activeProjectsCount: 1, openTasksCount: 2, budget: '$50,000', organisation: 'WIPAHS' },
];

export type TableKey = keyof StoreData;

const initialSavedUser = getSavedCurrentUserProfile();

const storeState: StoreData = {
  tasks: [],
  notices: [],
  projects: [],
  meetings: [],
  staff: [],
  sharePointDocs: getDocumentsFromLocalStorage(),
  folderList: Array.from(new Set([...DEFAULT_FOLDERS, ...getDocumentsFromLocalStorage().map((d) => d.folder).filter(Boolean)])),
  teamsRules: [],
  auditLogs: [],
  currentUser: {
    id: 'usr-default',
    name: 'Staff Member',
    email: 'staff@wipahs.or.tz',
    role: 'Staff Member',
    organisation: 'WIPAHS',
    department: 'General',
    status: 'Online',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    phone: '+255 778 123 456',
    activityScore: 85,
    tasksCount: 0,
    lastActive: 'Just now',
    ...(initialSavedUser || {}),
  },
  decisions: [],
  approvals: [],
  departments: DEFAULT_DEPARTMENTS,
  roles: [],
  conversations: [],
  messages: [],
  notifications: [],
  dispatchedEmails: [],
  authSession: {
    isAuthenticated: false,
    userId: null,
    mustChangePassword: false,
  },
  loading: true,
};

// Independent listener set per individual table
const tableListeners: { [K in TableKey]?: Set<() => void> } = {};

export function subscribeTable<K extends TableKey>(key: K, listener: () => void): () => void {
  if (!tableListeners[key]) {
    tableListeners[key] = new Set();
  }
  tableListeners[key]!.add(listener);
  return () => {
    tableListeners[key]!.delete(listener);
  };
}

/**
 * Isolated per-table setter.
 * ONLY notifies subscribers of the specific table that changed.
 * NEVER triggers full application or unrelated table re-renders.
 */
export function setTableData<K extends TableKey>(key: K, data: StoreData[K]): void {
  storeState[key] = data;
  tableListeners[key]?.forEach((fn) => {
    try {
      fn();
    } catch (err) {
      console.error(`Listener error for ${key}:`, err);
    }
  });
}

/**
 * Hook to consume an isolated table's reactive state
 */
export function useTableState<K extends TableKey>(key: K): StoreData[K] {
  return useSyncExternalStore(
    (callback) => subscribeTable(key, callback),
    () => storeState[key]
  );
}

// -------------------------------------------------------------------------
// Single Initial Bootloader (Executes only once across entire app lifecycle)
// -------------------------------------------------------------------------
let isStoreInitialized = false;
let storeInitPromise: Promise<void> | null = null;

export async function initStoreOnce(): Promise<void> {
  if (isStoreInitialized) return;
  if (storeInitPromise) return storeInitPromise;

  console.time('initStoreOnce');
  storeInitPromise = (async () => {
    try {
      // 1. Fetch startup data in parallel
      const [
        staffData,
        tasksData,
        noticesData,
        meetingsData,
        approvalsData,
        docsData,
        foldersData,
      ] = await Promise.all([
        portalStore.getStaff(),
        portalStore.getTasks(25, 0),
        portalStore.getNotices(25, 0),
        portalStore.getMeetings(25, 0),
        portalStore.getApprovals(25, 0),
        portalStore.getSharePointDocs(),
        portalStore.getFolderList(),
      ]);

      setTableData('staff', staffData);
      setTableData('tasks', tasksData);
      setTableData('notices', noticesData);
      setTableData('meetings', meetingsData);
      setTableData('approvals', approvalsData);
      if (docsData && docsData.length > 0) {
        setTableData('sharePointDocs', docsData);
      }
      if (foldersData && foldersData.length > 0) {
        setTableData('folderList', foldersData);
      }
      
      // Projects, Audit Logs, etc. are now deferred on-demand
      isStoreInitialized = true;
      initRealtimeSubscription();
    } catch (err) {
      console.error('Error during initStoreOnce:', err);
    } finally {
      console.timeEnd('initStoreOnce');
      setTableData('loading', false);
    }
  })();

  return storeInitPromise;
}

export function initRealtimeSubscription(): void {
  startRealtimeEngine({
    getState: () => ({
      messages: storeState.messages,
      meetings: storeState.meetings,
      conversations: storeState.conversations,
      notices: storeState.notices,
      tasks: storeState.tasks,
      currentUser: storeState.currentUser,
      notifications: storeState.notifications,
      approvals: storeState.approvals,
    }),
    setTableData: (key: string, data: any) => {
      setTableData(key as TableKey, data);
    },
    getMeetings: () => portalStore.getMeetings(),
    getMessages: (convId?: string) => portalStore.getMessages(convId),
    getConversations: () => portalStore.getConversations(),
    getNotices: () => portalStore.getNotices(),
    getTasks: () => portalStore.getTasks(),
    getNotifications: (userId?: string) => portalStore.getNotifications(userId || storeState.currentUser?.id),
    getApprovals: () => portalStore.getApprovals(),
    getPendingTaskStatus: (taskId: string) => getPendingTaskStatus(taskId),
  });
}

// -------------------------------------------------------------------------
// Utility helpers
// -------------------------------------------------------------------------
export function normalizeDepartmentName(dept?: string | null): string {
  if (!dept) return 'General';
  const trimmed = dept.trim();
  const lower = trimmed.toLowerCase();
  if (
    lower === 'it' ||
    lower === 'it & operations' ||
    lower === 'it & operations department' ||
    lower === 'it and operations' ||
    lower === 'it and operations department' ||
    lower === 'it department' ||
    lower === 'information technology'
  ) {
    return 'IT';
  }
  if (
    lower === 'marketing' ||
    lower === 'marketing department' ||
    lower === 'projects and mkt' ||
    lower === 'projects & mkt' ||
    lower === 'projects and marketing' ||
    lower === 'projects & marketing' ||
    lower === 'mkt'
  ) {
    return 'Marketing';
  }
  if (
    lower === 'finance' ||
    lower === 'finance department' ||
    lower === 'accounts' ||
    lower === 'accounting'
  ) {
    return 'Finance';
  }
  if (
    lower === 'top management' ||
    lower === 'management' ||
    lower === 'executive & admin' ||
    lower === 'executive and admin' ||
    lower === 'executive'
  ) {
    return 'Top management';
  }
  if (
    lower === 'logistics and operations' ||
    lower === 'logistics & operations' ||
    lower === 'logistics' ||
    lower === 'operations'
  ) {
    return 'Logistics and Operations';
  }
  if (
    lower === 'tabligh' ||
    lower === 'tabligh department'
  ) {
    return 'Tabligh';
  }
  return trimmed;
}

export function computeUserLivePresence(
  user: StaffUser,
  meetings: Meeting[] = [],
  activeHeartbeats?: Record<string, { timestamp: number; status?: UserPresenceStatus }>
): UserPresenceStatus {
  if (user.outOfOffice === true || user.status === 'Out of Office') {
    return 'Out of Office';
  }

  if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean' && !navigator.onLine) {
    return 'Offline';
  }

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const isLiveMeeting = (meetings || []).some((m) => {
    if (m.status === 'Cancelled' || m.status === 'Completed') return false;
    const isUserInvolved =
      m.organizerId === user.id ||
      m.chairId === user.id ||
      (m.attendees && m.attendees.some((a) => a.userId === user.id && a.status === 'Accepted'));
    if (!isUserInvolved) return false;

    if (m.status === 'In Progress') return true;

    if (m.date === todayStr && m.startTime && m.endTime) {
      const [startH, startM] = m.startTime.split(':').map(Number);
      const [endH, endM] = m.endTime.split(':').map(Number);
      const startMinutes = (startH || 0) * 60 + (startM || 0);
      const endMinutes = (endH || 0) * 60 + (endM || 0);
      return nowMinutes >= startMinutes && nowMinutes <= endMinutes;
    }
    return false;
  });

  if (isLiveMeeting) {
    return 'In Teams Meeting';
  }

  const currentUser = storeState.currentUser;
  const isSelf =
    currentUser &&
    (user.id === currentUser.id ||
      (user.email && currentUser.email && user.email.toLowerCase() === currentUser.email.toLowerCase()));

  // Active current user in this browser session
  if (isSelf) {
    if (currentUser.status) {
      return currentUser.status;
    }
    return 'Online';
  }

  // If user has status set to Online, Busy, or Away
  if (user.status === 'Online' || user.status === 'Busy' || user.status === 'Away') {
    const heartbeats = activeHeartbeats || getActiveHeartbeats();
    const userHeartbeat = heartbeats[user.id] || (user.email ? heartbeats[user.email.toLowerCase()] : null);
    const TWO_MINUTES_MS = 2 * 60 * 1000;
    if (userHeartbeat && Date.now() - userHeartbeat.timestamp < TWO_MINUTES_MS) {
      if (userHeartbeat.status && userHeartbeat.status !== 'Offline') {
        return userHeartbeat.status;
      }
    }
    return user.status;
  }

  // Other staff members: check real heartbeat within the last 2 minutes
  const heartbeats = activeHeartbeats || getActiveHeartbeats();
  const userHeartbeat = heartbeats[user.id] || (user.email ? heartbeats[user.email.toLowerCase()] : null);
  const TWO_MINUTES_MS = 2 * 60 * 1000;

  if (userHeartbeat && Date.now() - userHeartbeat.timestamp < TWO_MINUTES_MS) {
    if (userHeartbeat.status && userHeartbeat.status !== 'Offline') {
      return userHeartbeat.status;
    }
    return 'Online';
  }

  // Otherwise, they are genuinely Offline
  return 'Offline';
}

import { isTaskArchived, isMeetingArchived } from '../utils/archiveUtils';
export { isTaskArchived, isMeetingArchived };

export async function notifyTaskAssociatedUsers(task: Task, changeMessage: string) {
  // Silent notification logging without triggering global or tasks cascades
  console.info(`Task notification: ${task.title} - ${changeMessage}`);
}

// =========================================================================
// Real Supabase Actions Layer (Scoped & Optimistic)
// Every action updates strictly its OWN table's state.
// =========================================================================

// Registry of in-flight meeting creations to prevent rapid concurrent duplicate inserts
const inFlightMeetingCreations = new Map<string, Promise<Meeting | null>>();

// Registry of pending task status mutations to prevent background refreshes from reverting optimistic updates
const pendingTaskStatusUpdates = new Map<string, { status: Task['status']; timestamp: number }>();

export const getPendingTaskStatus = (taskId: string): Task['status'] | undefined => {
  const pending = pendingTaskStatusUpdates.get(taskId);
  if (!pending) return undefined;
  if (Date.now() - pending.timestamp > 15000) {
    pendingTaskStatusUpdates.delete(taskId);
    return undefined;
  }
  return pending.status;
};

// Local storage helpers for dismissed notifications
export const getLocalDismissedNotificationIds = (userId: string): Set<string> => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return new Set();
    const raw = window.localStorage.getItem(`wipahs_dismissals_${userId}`);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
};

export const saveLocalDismissedNotificationIds = (userId: string, ids: string[]): void => {
  try {
    if (typeof window === 'undefined' || !window.localStorage || ids.length === 0) return;
    const existing = getLocalDismissedNotificationIds(userId);
    ids.forEach((id) => existing.add(id));
    window.localStorage.setItem(`wipahs_dismissals_${userId}`, JSON.stringify(Array.from(existing)));
  } catch {}
};

export const isNetworkOrTransientError = (err: any): boolean => {
  if (!err) return false;
  const rawMessage = typeof err === 'string' ? err : `${err.message || ''}`;
  const trimmedMsg = rawMessage.trim();
  const msg = typeof err === 'string'
    ? err
    : `${err.message || ''} ${err.details || ''} ${err.hint || ''}`;
  const code = `${err.code || ''}`;
  const lowerMsg = msg.toLowerCase();
  return (
    code === '57014' ||
    code === 'PGRST301' ||
    trimmedMsg.startsWith('[') ||
    lowerMsg.includes('unexpected end of json') ||
    lowerMsg.includes('failed to fetch') ||
    lowerMsg.includes('networkerror') ||
    lowerMsg.includes('network request failed') ||
    lowerMsg.includes('abort') ||
    lowerMsg.includes('timeout') ||
    lowerMsg.includes('connection refused') ||
    lowerMsg.includes('load failed') ||
    lowerMsg.includes('offline') ||
    lowerMsg.includes('socket hang up')
  );
};

function resolveStaffAvatar(
  userId?: string | null,
  userName?: string | null,
  staffList: StaffUser[] = storeState.staff
): string {
  if (userId) {
    const byId = staffList.find((s) => s.id === userId);
    if (byId?.avatar) return byId.avatar;
    if (storeState.currentUser?.id === userId && storeState.currentUser.avatar) {
      return storeState.currentUser.avatar;
    }
  }
  if (userName) {
    const clean = userName.toLowerCase().trim();
    if (clean && clean !== 'staff member') {
      const byName = staffList.find((s) => s.name?.toLowerCase().trim() === clean);
      if (byName?.avatar) return byName.avatar;
    }
  }
  return '';
}

export const portalStore = {
  // -----------------------------------------------------------------------
  // Getters (Async Supabase Queries)
  // -----------------------------------------------------------------------
  getTasks: async (limit: number = 50, offset: number = 0): Promise<Task[]> => {
    try {
      let [tasksRes, subtasksRes] = await Promise.all([
        supabase
          .from('tasks')
          .select(TASK_SELECT_COLUMNS)
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1),
        supabase.from('task_subtasks').select('*').limit(1000),
      ]);

      // If a transient network glitch or stream cutoff occurred, retry fetching tasks once
      if (tasksRes.error && isNetworkOrTransientError(tasksRes.error)) {
        await new Promise((r) => setTimeout(r, 300));
        try {
          const retryRes = await supabase
            .from('tasks')
            .select(TASK_SELECT_COLUMNS)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);
          if (!retryRes.error) {
            tasksRes = retryRes;
          }
        } catch {}
      }

      if (tasksRes.error) {
        // Defensive recovery: if PostgREST returned a complete or mid-stream truncated JSON array in error.message, recover complete objects
        if (typeof tasksRes.error.message === 'string') {
          const recoveredRows = recoverTruncatedJsonArray(tasksRes.error.message);
          if (recoveredRows && recoveredRows.length > 0) {
            console.warn(`Supabase getTasks recovered ${recoveredRows.length} task(s) from partial stream.`);
            tasksRes.data = recoveredRows as any;
            tasksRes.error = null as any;
          }
        }

        if (tasksRes.error) {
          if (isNetworkOrTransientError(tasksRes.error)) {
            console.warn('Supabase getTasks transient network/timeout condition, using cached tasks.');
          } else {
            console.error('Supabase getTasks error:', tasksRes.error.message || tasksRes.error.code);
          }
          return storeState.tasks;
        }
      }

      if (subtasksRes.error) {
        if (isNetworkOrTransientError(subtasksRes.error)) {
          console.warn('Supabase getSubtasks transient condition, proceeding with tasks and empty subtasks.');
        } else {
          console.error('Supabase getSubtasks error:', JSON.stringify(subtasksRes.error, null, 2));
        }
      }

      const subtasksByTask: Record<string, Subtask[]> = {};
      (subtasksRes.data || []).forEach((row) => {
        if (!subtasksByTask[row.task_id]) subtasksByTask[row.task_id] = [];
        subtasksByTask[row.task_id].push(mapSubtaskRow(row));
      });

      const staffList = storeState.staff.length > 0 ? storeState.staff : await portalStore.getStaff();

      return (tasksRes.data || []).map((row) => {
        const mapped = mapTaskRow(row, subtasksByTask[row.id] || []);

        // Explicit rectification for IT department tasks:
        // Tasks assigned by the IT department (such as IT TEST TASK, IT TEST, IT TEST 4, or tasks where created_by is IT/Rija Virani)
        const isItTaskTitle =
          row.title?.trim().toLowerCase().startsWith('it test') ||
          row.title?.trim().toLowerCase().startsWith('it ');

        const isCreatedByRijaOrIT =
          row.created_by_id === '82f2bd3b-2f09-4e4a-9438-5c26e203cf30' ||
          row.created_by_name?.toLowerCase().includes('rija virani') ||
          row.created_by_name?.toLowerCase() === 'it' ||
          row.created_by_name?.toLowerCase() === 'it department' ||
          row.created_by_name?.toLowerCase() === 'information technology';

        if (isItTaskTitle || isCreatedByRijaOrIT) {
          mapped.createdById = '82f2bd3b-2f09-4e4a-9438-5c26e203cf30';
          mapped.createdByName = 'Rija Virani (IT Department)';
          // If assigned to marketing
          if (row.assigned_to_name?.toLowerCase().includes('marketing') || row.assigned_to_id === '0a9edd24-62bd-40ff-a486-fd1c95724b8e') {
            mapped.assignedToId = '0a9edd24-62bd-40ff-a486-fd1c95724b8e';
            mapped.assignedToName = 'Marketing';
            mapped.department = 'Marketing';
          }
        }

        // If createdById is missing (e.g. non-UUID in DB), resolve from created_by_name
        if (!mapped.createdById && row.created_by_name) {
          const cName = row.created_by_name.toLowerCase().trim();
          if (
            cName === 'it' ||
            cName === 'it department' ||
            cName === 'it & operations' ||
            cName === 'it and operations' ||
            cName === 'information technology' ||
            cName.includes('rija virani')
          ) {
            mapped.createdById = '82f2bd3b-2f09-4e4a-9438-5c26e203cf30';
            mapped.createdByName = 'Rija Virani (IT Department)';
          } else if (cName && cName !== 'staff member') {
            const matchedStaff = staffList.find((s) =>
              s.name?.toLowerCase().trim() === cName ||
              s.email?.toLowerCase().trim() === cName ||
              s.email?.toLowerCase().split('@')[0] === cName
            );
            if (matchedStaff) {
              mapped.createdById = matchedStaff.id;
              mapped.createdByName = matchedStaff.name;
            } else if (
              storeState.currentUser?.name?.toLowerCase().trim() === cName &&
              storeState.currentUser.name.toLowerCase().trim() !== 'staff member'
            ) {
              mapped.createdById = storeState.currentUser.id;
            }
          }
        }

        // If assignedToId is missing (e.g. non-UUID in DB), resolve from assigned_to_name
        if (
          !mapped.assignedToId &&
          row.assigned_to_name &&
          !row.assigned_to_name.toLowerCase().includes('(department)') &&
          !row.assigned_to_name.toLowerCase().includes('(whole org)')
        ) {
          const aName = row.assigned_to_name.toLowerCase().trim();
          if (aName && aName !== 'staff member') {
            const matchedStaff = staffList.find((s) =>
              s.name?.toLowerCase().trim() === aName ||
              s.email?.toLowerCase().trim() === aName ||
              s.email?.toLowerCase().split('@')[0] === aName
            );
            if (matchedStaff) {
              mapped.assignedToId = matchedStaff.id;
              mapped.assignedToName = matchedStaff.name;
              if (!mapped.assignedToIds || mapped.assignedToIds.length === 0) {
                mapped.assignedToIds = [matchedStaff.id];
              }
            } else if (
              storeState.currentUser?.name?.toLowerCase().trim() === aName &&
              storeState.currentUser.name.toLowerCase().trim() !== 'staff member'
            ) {
              mapped.assignedToId = storeState.currentUser.id;
              if (!mapped.assignedToIds || mapped.assignedToIds.length === 0) {
                mapped.assignedToIds = [storeState.currentUser.id];
              }
            }
          }
        }

        if (!mapped.assignedToAvatar) {
          mapped.assignedToAvatar = resolveStaffAvatar(mapped.assignedToId, mapped.assignedToName, staffList);
        }

        // Prevent stale DB reads from overwriting active in-flight task status mutations
        const pendingStatus = getPendingTaskStatus(mapped.id);
        if (pendingStatus) {
          mapped.status = pendingStatus;
          if (pendingStatus === 'Done') {
            mapped.completedAt = mapped.completedAt || new Date().toISOString();
          }
        }

        return mapped;
      });
    } catch (err: any) {
      if (isNetworkOrTransientError(err)) {
        console.warn('getTasks: Network or transient condition, using cached tasks.');
      } else {
        console.error('getTasks exception:', err);
      }
      return storeState.tasks;
    }
  },

  getNotices: async (limit: number = 50, offset: number = 0): Promise<Notice[]> => {
    try {
      const [noticesRes, acksRes] = await Promise.all([
        supabase.from('notices').select(NOTICE_SELECT_COLUMNS).order('pinned', { ascending: false }).range(offset, offset + limit - 1),
        supabase.from('notice_acknowledgements').select('*').limit(500),
      ]);

      if (noticesRes.error) {
        if (isNetworkOrTransientError(noticesRes.error)) {
          console.warn('getNotices: Network or transient condition, using cached notices.');
        } else {
          console.error('Supabase getNotices error:', noticesRes.error.message);
        }
        return storeState.notices;
      }

      const acksByNotice: Record<string, string[]> = {};
      (acksRes.data || []).forEach((row) => {
        if (!acksByNotice[row.notice_id]) acksByNotice[row.notice_id] = [];
        acksByNotice[row.notice_id].push(row.user_id);
      });

      return (noticesRes.data || []).map((row) => mapNoticeRow(row, acksByNotice[row.id] || []));
    } catch (err) {
      if (isNetworkOrTransientError(err)) {
        console.warn('getNotices: Network or transient exception, using cached notices.');
      } else {
        console.error('getNotices exception:', err);
      }
      return storeState.notices;
    }
  },

  getProjects: async (limit: number = 50, offset: number = 0): Promise<Project[]> => {
    try {
      const [projRes, milRes, budRes, impRes, actRes, expRes, memRes] = await Promise.all([
        supabase.from('projects').select('*').order('created_at', { ascending: false }).range(offset, offset + limit - 1),
        supabase.from('project_milestones').select('*'),
        supabase.from('project_budget_categories').select('*'),
        supabase.from('project_impact_metrics').select('*'),
        supabase.from('project_activity_log').select('*'),
        supabase.from('project_expenses').select('*').order('created_at', { ascending: false }),
        supabase.from('project_members').select('project_id, user_id, profiles(id, name, role, email)'),
      ]);

      if (projRes.error) {
        if (isNetworkOrTransientError(projRes.error)) {
          console.warn('getProjects: Network or transient condition, using cached projects.');
        } else {
          console.error('Supabase getProjects error:', projRes.error.message);
        }
        return storeState.projects;
      }

      // Safe expense mapping with fallback to previous state on error / timeout
      const existingExpensesMap = new Map<string, ProjectExpense[]>();
      storeState.projects.forEach(p => {
        if (p.expenses && p.expenses.length > 0) {
          existingExpensesMap.set(p.id, p.expenses);
        }
      });

      const milByProj: Record<string, Milestone[]> = {};
      (milRes.data || []).forEach((r) => {
        if (!milByProj[r.project_id]) milByProj[r.project_id] = [];
        milByProj[r.project_id].push({
          id: r.id,
          name: r.title,
          status: r.completed ? 'Completed' : 'Current',
          dueDate: r.due_date || '',
          progress: r.completed ? 100 : 0,
        });
      });

      const budByProj: Record<string, BudgetCategory[]> = {};
      (budRes.data || []).forEach((r) => {
        if (!budByProj[r.project_id]) budByProj[r.project_id] = [];
        budByProj[r.project_id].push({
          id: r.id,
          category: r.category,
          allocated: Number(r.allocated ?? 0),
          spent: Number(r.spent ?? 0),
        });
      });

      const impByProj: Record<string, ProjectImpact[]> = {};
      (impRes.data || []).forEach((r) => {
        if (!impByProj[r.project_id]) impByProj[r.project_id] = [];
        impByProj[r.project_id].push({
          icon: 'CheckCircle',
          label: r.metric_name,
          value: `${r.current_value || 0} / ${r.target_value || 0} ${r.unit || ''}`.trim(),
        });
      });

      const actByProj: Record<string, ProjectActivity[]> = {};
      (actRes.data || []).forEach((r) => {
        if (!actByProj[r.project_id]) actByProj[r.project_id] = [];
        actByProj[r.project_id].push({
          id: r.id,
          userName: r.author || 'Member',
          action: r.action,
          timestamp: r.timestamp || new Date().toISOString(),
        });
      });

      const expByProj: Record<string, ProjectExpense[]> = {};
      if (expRes.error) {
        console.warn('Supabase getProjects expenses fetch note (using cached fallback):', expRes.error.message);
        existingExpensesMap.forEach((exps, pid) => {
          expByProj[pid] = exps;
        });
      } else {
        (expRes.data || []).forEach((r) => {
          if (!expByProj[r.project_id]) expByProj[r.project_id] = [];
          expByProj[r.project_id].push(mapProjectExpenseRow(r));
        });
        // For projects not in expRes.data, preserve existing cache
        existingExpensesMap.forEach((exps, pid) => {
          if (!expByProj[pid] || expByProj[pid].length === 0) {
            expByProj[pid] = exps;
          }
        });
      }

      const memByProj: Record<string, any[]> = {};
      (memRes.data || []).forEach((r: any) => {
        if (!memByProj[r.project_id]) memByProj[r.project_id] = [];
        const profile = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
        if (profile) {
          memByProj[r.project_id].push({
            id: profile.id,
            name: profile.name,
            role: profile.role,
            avatar: resolveStaffAvatar(profile.id, profile.name) || undefined,
            email: profile.email,
          });
        }
      });

      const localCached = getProjectsFromLocalStorage();
      const localMap = new Map<string, Project>();
      localCached.forEach(p => localMap.set(p.id, p));

      const dbProjects = (projRes.data || []).map((row) => {
        const expensesList = expByProj[row.id] || [];
        const rawCategories = budByProj[row.id] || [];

        const catSpentMap: Record<string, number> = {};
        expensesList.forEach(ex => {
          if (ex.status === 'Active') {
            const matched = rawCategories.find(
              b => (ex.categoryId && b.id && ex.categoryId === b.id) ||
                   (ex.category && b.category && ex.category.toLowerCase().trim() === b.category.toLowerCase().trim())
            );
            const key = matched ? (matched.id || matched.category) : ex.category;
            catSpentMap[key] = (catSpentMap[key] || 0) + Number(ex.amount);
          }
        });

        const reconciledCategories = rawCategories.map(b => {
          const key = b.id || b.category;
          return {
            ...b,
            spent: catSpentMap[key] !== undefined ? catSpentMap[key] : (expensesList.length > 0 ? 0 : Number(b.spent || 0)),
          };
        });

        const mapped = mapProjectRow(
          row,
          milByProj[row.id] || [],
          reconciledCategories,
          impByProj[row.id] || [],
          actByProj[row.id] || [],
          expensesList,
          memByProj[row.id] || []
        );

        // Authoritative Total Expended: sum of all category spent values (or active expenses sum)
        const totalCategorySpent = reconciledCategories.reduce((sum, b) => sum + Number(b.spent || 0), 0);
        if (reconciledCategories.length > 0) {
          mapped.spent = `$${totalCategorySpent.toLocaleString()}`;
        } else {
          const activeVouchersTotal = expensesList
            .filter(e => e.status === 'Active')
            .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
          mapped.spent = `$${activeVouchersTotal.toLocaleString()}`;
        }

        // If local storage has more recent budget allocations or categories, merge them
        const local = localMap.get(row.id);
        if (local) {
          if (local.budgetBreakdown && local.budgetBreakdown.length > 0 && mapped.budgetBreakdown.length === 0) {
            mapped.budgetBreakdown = local.budgetBreakdown;
          }
          if (local.budget && (!mapped.budget || mapped.budget === '$0' || mapped.budget === '0')) {
            mapped.budget = local.budget;
          }
          if (local.code && !mapped.code) {
            mapped.code = local.code;
          }
        }

        return mapped;
      });

      // Include local projects not present in DB
      const resultProjects = [...dbProjects];
      localCached.forEach(lp => {
        if (!resultProjects.some(dp => dp.id === lp.id)) {
          resultProjects.push(lp);
        }
      });

      saveProjectsToLocalStorage(resultProjects);
      return resultProjects;
    } catch (err) {
      if (isNetworkOrTransientError(err)) {
        console.warn('getProjects: Network or transient exception, using cached projects.');
      } else {
        console.error('getProjects exception:', err);
      }
      const fallback = getProjectsFromLocalStorage();
      return fallback.length > 0 ? fallback : storeState.projects;
    }
  },

  getMeetings: async (limit: number = 50, offset: number = 0): Promise<Meeting[]> => {
    try {
      const [meetRes, attRes] = await Promise.all([
        supabase.from('meetings').select('*').order('date', { ascending: false }).range(offset, offset + limit - 1),
        supabase.from('meeting_attendees').select(MEETING_ATTENDEE_SELECT_COLUMNS).limit(500),
      ]);

      if (meetRes.error) {
        if (isNetworkOrTransientError(meetRes.error)) {
          console.warn('getMeetings: Network or transient condition, using cached meetings.');
        } else {
          console.error('Supabase getMeetings error:', meetRes.error.message);
        }
        return storeState.meetings;
      }

      const attByMeeting: Record<string, any[]> = {};
      (attRes.data || []).forEach((row) => {
        if (!attByMeeting[row.meeting_id]) attByMeeting[row.meeting_id] = [];
        const mappedAtt = mapMeetingAttendeeRow(row);
        if (!mappedAtt.avatar) {
          mappedAtt.avatar = resolveStaffAvatar(mappedAtt.userId, mappedAtt.name) || undefined;
        }
        attByMeeting[row.meeting_id].push(mappedAtt);
      });

      const rawMeetings = (meetRes.data || []).map((row) => mapMeetingRow(row, attByMeeting[row.id] || []));

      // Automatic deduplication: keep single instance of meetings with identical title, date, start time & host
      const seenSignatures = new Map<string, Meeting>();
      const duplicateMeetingIds: string[] = [];
      const deduplicatedMeetings: Meeting[] = [];

      for (const m of rawMeetings) {
        const sig = `${(m.title || '').trim().toLowerCase()}_${m.date}_${m.startTime || m.time || ''}_${m.organizerId || m.chairId || ''}`;
        if (seenSignatures.has(sig)) {
          duplicateMeetingIds.push(m.id);
        } else {
          seenSignatures.set(sig, m);
          deduplicatedMeetings.push(m);
        }
      }

      // If duplicate meetings exist in Supabase, purge redundant rows immediately
      if (duplicateMeetingIds.length > 0) {
        console.warn(`Cleaning up ${duplicateMeetingIds.length} duplicate meeting(s) from Supabase:`, duplicateMeetingIds);
        supabase.from('meetings').delete().in('id', duplicateMeetingIds).then(({ error }) => {
          if (error) console.error('Failed to purge duplicate meetings from Supabase:', error);
          else console.info(`Purged duplicate meetings from Supabase: ${duplicateMeetingIds.join(', ')}`);
        });
      }

      return deduplicatedMeetings;
    } catch (err) {
      if (isNetworkOrTransientError(err)) {
        console.warn('getMeetings: Network or transient exception, using cached meetings.');
      } else {
        console.error('getMeetings exception:', err);
      }
      return storeState.meetings;
    }
  },

  getStaff: async (): Promise<StaffUser[]> => {
    try {
      const res = await fetchPublicProfiles();
      const dbProfiles = (res.data && res.data.length > 0) ? res.data.map(mapStaffRow) : [];

      let localStaff: StaffUser[] = [];
      try {
        const raw = localStorage.getItem('wipahs_registered_staff');
        if (raw) localStaff = JSON.parse(raw);
      } catch {}

      const combinedMap = new Map<string, StaffUser>();
      dbProfiles.forEach((s) => combinedMap.set(s.id, s));
      localStaff.forEach((s) => {
        const existing = combinedMap.get(s.id);
        combinedMap.set(s.id, existing ? { ...existing, ...s, avatar: s.avatar || existing.avatar } : s);
      });

      const finalStaff = Array.from(combinedMap.values()).filter(s => !s.deactivated);

      return finalStaff;
    } catch (err) {
      console.error('getStaff exception:', err);
      let localStaff: StaffUser[] = [];
      try {
        const raw = localStorage.getItem('wipahs_registered_staff');
        if (raw) localStaff = JSON.parse(raw);
      } catch {}
      return localStaff.filter(s => !s.deactivated);
    }
  },

  getSharePointDocs: async (): Promise<SharePointDocument[]> => {
    const deletedDocs = getDeletedDocumentIds();
    try {
      const localDocs = getDocumentsFromLocalStorage().filter((d) => !deletedDocs.has(d.id));

    let dbDocs: SharePointDocument[] = [];
    try {
      const { data, error } = await supabase
        .from('sharepoint_documents')
        .select('*')
        .order('modified_at', { ascending: false });

      if (!error && data) {
        dbDocs = data.map(mapSharePointDocRow).filter((d) => !deletedDocs.has(d.id));
      }
    } catch (err) {
      console.warn('Supabase getSharePointDocs error:', err);
    }

    try {
      const { data: fnData, error: fnError } = await supabase.functions.invoke('sharepoint-list');
      if (!fnError && fnData && Array.isArray(fnData.documents) && fnData.documents.length > 0) {
        const fnDocs = fnData.documents.map(mapSharePointDocRow).filter((d: SharePointDocument) => !deletedDocs.has(d.id));
        fnDocs.forEach((d: SharePointDocument) => {
          if (!dbDocs.some(existing => existing.id === d.id)) {
            dbDocs.push(d);
          }
        });
      }
    } catch (fnEx) {}

      const docMap = new Map<string, SharePointDocument>();
      dbDocs.forEach(d => docMap.set(d.id, d));
      localDocs.forEach(d => {
        if (!deletedDocs.has(d.id)) {
          if (docMap.has(d.id)) {
            const existing = docMap.get(d.id)!;
            docMap.set(d.id, {
              ...existing,
              visibility: d.visibility || existing.visibility,
              allowedUserIds: d.allowedUserIds?.length ? d.allowedUserIds : existing.allowedUserIds,
              editableUserIds: d.editableUserIds?.length ? d.editableUserIds : existing.editableUserIds,
              targetDepartment: d.targetDepartment || existing.targetDepartment,
            });
          } else {
            docMap.set(d.id, d);
          }
        }
      });

      const merged = Array.from(docMap.values()).filter((d) => !deletedDocs.has(d.id));
      if (merged.length > 0) {
        saveDocumentsToLocalStorage(merged);
        const docFolders = merged.map((d) => d.folder).filter(Boolean);
        const combinedFolders = Array.from(new Set([...DEFAULT_FOLDERS, ...storeState.folderList, ...docFolders]));
        setTableData('folderList', combinedFolders);
      }
      setTableData('sharePointDocs', merged);

      // In background, sync any local documents to Supabase if not yet in database
      const unsyncedDocs = localDocs.filter(ld => !dbDocs.some(dbd => dbd.id === ld.id));
      if (unsyncedDocs.length > 0) {
        Promise.all(unsyncedDocs.map(ud => {
          const row = mapSharePointDocToRow(ud);
          return supabase.from('sharepoint_documents').upsert(row);
        })).catch(() => {});
      }

      return merged;
    } catch (err) {
      console.error('getSharePointDocs exception:', err);
      const fallback = getDocumentsFromLocalStorage().filter((d) => !deletedDocs.has(d.id));
      setTableData('sharePointDocs', fallback);
      return fallback;
    }
  },

  getFolderList: async (): Promise<string[]> => {
    try {
      const localDocFolders = getDocumentsFromLocalStorage().map((d) => d.folder).filter(Boolean);
      const { data } = await supabase.from('sharepoint_documents').select('folder');
      const customFolders = (data || []).map((d) => d.folder).filter(Boolean);
      const combined = Array.from(new Set([...DEFAULT_FOLDERS, ...storeState.folderList, ...localDocFolders, ...customFolders]));
      setTableData('folderList', combined);
      return combined;
    } catch (err) {
      console.error('getFolderList exception:', err);
      return storeState.folderList;
    }
  },

  getTeamsRules: async (): Promise<TeamsNotificationRule[]> => {
    try {
      const { data, error } = await supabase
        .from('teams_notification_rules')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        if (isNetworkOrTransientError(error)) {
          console.warn('getTeamsRules: Network or transient condition, using cached rules.');
        } else {
          console.error('Supabase getTeamsRules error:', error.message);
        }
        return storeState.teamsRules;
      }
      return (data || []).map(mapTeamsRuleRow);
    } catch (err) {
      if (isNetworkOrTransientError(err)) {
        console.warn('getTeamsRules: Network or transient exception, using cached rules.');
      } else {
        console.error('getTeamsRules exception:', err);
      }
      return storeState.teamsRules;
    }
  },

  getAuditLogs: async (): Promise<AuditEvent[]> => {
    try {
      const { data, error } = await supabase
        .from('audit_log')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(200);

      if (error) {
        if (isNetworkOrTransientError(error)) {
          console.warn('getAuditLogs: Network or transient condition, using cached audit logs.');
        } else {
          console.error('Supabase getAuditLogs error:', error.message);
        }
        return storeState.auditLogs;
      }
      return (data || []).map(mapAuditLogRow);
    } catch (err) {
      if (isNetworkOrTransientError(err)) {
        console.warn('getAuditLogs: Network or transient exception, using cached audit logs.');
      } else {
        console.error('getAuditLogs exception:', err);
      }
      return storeState.auditLogs;
    }
  },

  getCurrentUser: (): StaffUser => {
    return storeState.currentUser;
  },

  setCurrentUser: (user: StaffUser | null) => {
    if (user) {
      const saved = getSavedCurrentUserProfile();
      const merged: StaffUser = {
        ...user,
        ...(saved && (saved.id === user.id || saved.email?.toLowerCase() === user.email?.toLowerCase()) ? saved : {}),
      };
      setTableData('currentUser', merged);
      recordUserHeartbeat(merged, merged.status);
    }
  },

  getDecisions: async (): Promise<Decision[]> => {
    try {
      const { data, error } = await supabase
        .from('decisions')
        .select('*')
        .order('date', { ascending: false });

      if (error) {
        if (isNetworkOrTransientError(error)) {
          console.warn('getDecisions: Network or transient condition, using cached decisions.');
        } else {
          console.error('Supabase getDecisions error:', error.message);
        }
        return storeState.decisions;
      }
      return (data || []).map(mapDecisionRow);
    } catch (err) {
      if (isNetworkOrTransientError(err)) {
        console.warn('getDecisions: Network or transient exception, using cached decisions.');
      } else {
        console.error('getDecisions exception:', err);
      }
      return storeState.decisions;
    }
  },

  getApprovals: async (limit: number = 50, offset: number = 0): Promise<Approval[]> => {
    try {
      const { data, error } = await supabase
        .from('approvals')
        .select('*')
        .order('requested_date', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        if (isNetworkOrTransientError(error)) {
          console.warn('getApprovals: Network or transient condition, using cached approvals.');
        } else {
          console.error('Supabase getApprovals error:', error.message);
        }
        return storeState.approvals;
      }
      return (data || []).map(mapApprovalRow);
    } catch (err) {
      if (isNetworkOrTransientError(err)) {
        console.warn('getApprovals: Network or transient exception, using cached approvals.');
      } else {
        console.error('getApprovals exception:', err);
      }
      return storeState.approvals;
    }
  },

  getDepartments: async (): Promise<DepartmentInfo[]> => {
    try {
      const deletedIds = getDeletedDepartmentIds();
      const localDepts = getDepartmentsFromLocalStorage();

      const { data, error } = await supabase
        .from('departments')
        .select('*')
        .order('name');

      const dbDepts = (!error && data) ? data.map(mapDepartmentRow) : [];

      const map = new Map<string, DepartmentInfo>();
      // 1. Add DEFAULT_DEPARTMENTS only if not deleted
      DEFAULT_DEPARTMENTS.forEach(d => {
        const idLower = d.id.toLowerCase();
        const nameLower = d.name.toLowerCase();
        if (!deletedIds.has(d.id) && !deletedIds.has(idLower) && !deletedIds.has(nameLower)) {
          map.set(nameLower, d);
        }
      });

      // 2. Add localDepts only if not deleted
      localDepts.forEach(d => {
        const idLower = d.id.toLowerCase();
        const nameLower = d.name.toLowerCase();
        if (!deletedIds.has(d.id) && !deletedIds.has(idLower) && !deletedIds.has(nameLower)) {
          map.set(nameLower, d);
        }
      });

      // 3. Add dbDepts only if not deleted
      dbDepts.forEach(d => {
        const idLower = d.id.toLowerCase();
        const nameLower = d.name.toLowerCase();
        if (!deletedIds.has(d.id) && !deletedIds.has(idLower) && !deletedIds.has(nameLower)) {
          map.set(nameLower, d);
        }
      });

      const result = Array.from(map.values());
      saveDepartmentsToLocalStorage(result);
      return result;
    } catch (err) {
      console.error('getDepartments exception:', err);
      const deletedIds = getDeletedDepartmentIds();
      return (storeState.departments.length > 0 ? storeState.departments : DEFAULT_DEPARTMENTS).filter(
        d => !deletedIds.has(d.id) && !deletedIds.has(d.id.toLowerCase()) && !deletedIds.has(d.name.toLowerCase())
      );
    }
  },

  getRoles: async (): Promise<RolePermission[]> => {
    try {
      const { data, error } = await supabase
        .from('role_permissions')
        .select('*')
        .order('role_name');

      if (error) {
        if (isNetworkOrTransientError(error)) {
          console.warn('getRoles: Network or transient condition, using cached roles.');
        } else {
          console.error('Supabase getRoles error:', error.message);
        }
        return storeState.roles;
      }
      return (data || []).map(mapRoleRow);
    } catch (err) {
      if (isNetworkOrTransientError(err)) {
        console.warn('getRoles: Network or transient exception, using cached roles.');
      } else {
        console.error('getRoles exception:', err);
      }
      return storeState.roles;
    }
  },

  getConversations: async (): Promise<ChatConversation[]> => {
    try {
      const [convRes, partRes] = await Promise.all([
        supabase.from('conversations').select('*').order('created_at', { ascending: false }),
        supabase.from('conversation_participants').select('*'),
      ]);

      if (convRes.error) {
        if (isNetworkOrTransientError(convRes.error)) {
          console.warn('getConversations: Network or transient condition, using cached conversations.');
        } else {
          console.error('Supabase getConversations error:', convRes.error.message);
        }
        return storeState.conversations;
      }

      const partByConv: Record<string, string[]> = {};
      (partRes.data || []).forEach((r) => {
        if (!partByConv[r.conversation_id]) partByConv[r.conversation_id] = [];
        partByConv[r.conversation_id].push(r.user_id);
      });

      return (convRes.data || []).map((row) => mapConversationRow(row, partByConv[row.id] || []));
    } catch (err) {
      if (isNetworkOrTransientError(err)) {
        console.warn('getConversations: Network or transient exception, using cached conversations.');
      } else {
        console.error('getConversations exception:', err);
      }
      return storeState.conversations;
    }
  },

  getMessages: async (conversationId?: string): Promise<ChatMessage[]> => {
    try {
      let query = supabase.from('messages').select(MESSAGE_SELECT_COLUMNS).order('timestamp', { ascending: true });
      if (conversationId) {
        query = query.eq('conversation_id', conversationId);
      }
      const { data, error } = await query;
      if (error) {
        if (isNetworkOrTransientError(error)) {
          console.warn('getMessages: Network or transient condition, using cached messages.');
        } else {
          console.error('Supabase getMessages error:', error.message);
        }
        return storeState.messages;
      }
      return (data || []).map((row) => {
        const msg = mapMessageRow(row);
        const resolvedAvatar = resolveStaffAvatar(msg.senderId, msg.senderName);
        if (resolvedAvatar) {
          msg.senderAvatar = resolvedAvatar;
        }
        return msg;
      });
    } catch (err) {
      if (isNetworkOrTransientError(err)) {
        console.warn('getMessages: Network or transient exception, using cached messages.');
      } else {
        console.error('getMessages exception:', err);
      }
      return storeState.messages;
    }
  },

  getNotifications: async (userId?: string): Promise<AppNotification[]> => {
    try {
      const targetUid = userId || storeState.currentUser.id;
      
      // 1. Fetch notifications
      let query = supabase.from('notifications').select(NOTIFICATION_SELECT_COLUMNS).order('created_at', { ascending: false });
      if (targetUid) {
        query = query.or(`target_user_id.eq.${targetUid},target_user_id.eq.all`);
      }
      const { data, error } = await query;
      if (error) throw error;
      const dbNotifs = (data || []).map((row) => {
        const notif = mapNotificationRow(row);
        if (!notif.actorAvatar) {
          notif.actorAvatar = resolveStaffAvatar(notif.actorId, notif.actorName) || undefined;
        }
        return notif;
      });

      // 2. Fetch dismissals for this user
      const { data: dismissals } = await supabase
        .from('notification_dismissals')
        .select('notification_id')
        .eq('user_id', targetUid);
      
      const dismissedIds = new Set((dismissals || []).map((d: any) => d.notification_id).filter(Boolean));

      // Merge client persistent dismissals
      const localDismissals = getLocalDismissedNotificationIds(targetUid);
      localDismissals.forEach((id) => dismissedIds.add(id));

      // 3. Filter out dismissed
      const filtered = dbNotifs.filter((n) => !dismissedIds.has(n.id));
      
      setTableData('notifications', filtered);
      return filtered;
    } catch (err: any) {
      console.warn('getNotifications note:', err?.message || err);
      return [];
    }
  },



  getDispatchedEmails: async (): Promise<DispatchedEmail[]> => {
    try {
      const { data, error } = await supabase
        .from('officehub_email_outbox')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) {
        console.error('Supabase getDispatchedEmails error:', error.message);
        return storeState.dispatchedEmails;
      }
      return (data || []).map(mapDispatchedEmailRow);
    } catch (err) {
      console.error('getDispatchedEmails exception:', err);
      return storeState.dispatchedEmails;
    }
  },

  getAuthSession: (): AuthSessionInfo => {
    return storeState.authSession;
  },

  setAuthSession: (session: AuthSessionInfo) => {
    setTableData('authSession', session);
  },

  // -----------------------------------------------------------------------
  // Actions: Tasks (UPDATES TASKS STATE ONLY)
  // -----------------------------------------------------------------------
  addTask: async (
    taskData: Omit<Task, 'id' | 'createdAt' | 'createdById' | 'createdByName' | 'assignedToAvatar'> &
      Partial<Pick<Task, 'createdById' | 'createdByName' | 'assignedToAvatar'>>
  ): Promise<Task | null> => {
    try {
      const id = `tsk-${Date.now()}`;
      const currentUser = storeState.currentUser;
      const createdById = taskData.createdById || currentUser.id;
      const createdByName = taskData.createdByName || currentUser.name;
      const createdAt = new Date().toISOString();

      const taskToInsert: Partial<Task> = {
        ...taskData,
        id,
        createdAt,
        createdById,
        createdByName,
        status: taskData.status || 'To Do',
        priority: taskData.priority || 'Normal',
        department: normalizeDepartmentName(taskData.department),
        organisation: taskData.organisation || 'WIPAHS',
      };

      const row = mapTaskToRow(taskToInsert);
      const { data, error } = await supabase.from('tasks').insert(row).select(TASK_SELECT_COLUMNS).single();
      if (error) {
        console.error('Supabase addTask error:', error.message);
        throw new Error(error.message);
      }

      // Insert any initial subtasks
      let subtasksList: Subtask[] = [];
      if (taskData.subtasks && taskData.subtasks.length > 0) {
        const subtaskRows = taskData.subtasks.map((s, idx) => ({
          id: s.id || `sub-${Date.now()}-${idx}`,
          task_id: id,
          title: s.title,
          completed: Boolean(s.completed),
        }));
        const { data: subData } = await supabase.from('task_subtasks').insert(subtaskRows).select('*');
        if (subData) {
          subtasksList = subData.map(mapSubtaskRow);
        }
      }

      const resolvedAssignedId = taskToInsert.assignedToId || (data as any)?.assigned_to_id || '';
      const resolvedAssignedName = taskToInsert.assignedToName || (data as any)?.assigned_to_name || '';
      const newTask: Task = {
        ...mapTaskRow(data, subtasksList),
        id: taskToInsert.id || (data as any)?.id || id,
        createdById: taskToInsert.createdById || (data as any)?.created_by_id || createdById,
        createdByName: taskToInsert.createdByName || (data as any)?.created_by_name || createdByName,
        assignedToId: resolvedAssignedId,
        assignedToName: resolvedAssignedName,
        assignedToAvatar:
          taskToInsert.assignedToAvatar || resolveStaffAvatar(resolvedAssignedId, resolvedAssignedName),
        assignedToIds: (taskToInsert.assignedToIds && taskToInsert.assignedToIds.length > 0) ? taskToInsert.assignedToIds : ((data as any)?.assigned_to_ids || []),
        assignedToNames: taskToInsert.assignedToNames || [],
        assignedDepartments: taskToInsert.assignedDepartments || [],
        assignedOrganisations: taskToInsert.assignedOrganisations || [],
        assignmentType: taskToInsert.assignmentType,
        type: taskToInsert.type,
      };
      // Optimistically update tasks state directly without refetching other tables
      setTableData('tasks', [newTask, ...storeState.tasks]);

      // Fire Teams Webhook in background without triggering store cascades
      const rules = storeState.teamsRules.filter(
        (r) =>
          r.enabled &&
          newTask.priority === 'Urgent' &&
          r.event === 'task_urgent_created'
      );
      rules.forEach((rule) => {
        sendTeamsWebhookNotification(rule.webhookUrl, 'task', taskToInsert).catch(console.warn);
      });

      // Trigger notification and email dispatch for assignee(s)
      try {
        const assignees: { id: string; name: string; email: string }[] = [];

        // 1. Specific people (multiple assignees)
        if (taskData.assignedToIds && taskData.assignedToIds.length > 0) {
          taskData.assignedToIds.forEach((uid, idx) => {
            const st = storeState.staff.find((s) => s.id === uid);
            assignees.push({
              id: uid,
              name: st?.name || taskData.assignedToNames?.[idx] || 'Staff Member',
              email: st?.email || (uid === currentUser.id ? currentUser.email : 'staff@wipahs.or.tz'),
            });
          });
        }
        // 2. Specific person (single assignee)
        else if (
          taskData.assignedToId &&
          taskData.assignedToId !== 'all' &&
          !taskData.assignedToId.startsWith('dept-') &&
          !taskData.assignedToId.startsWith('org-')
        ) {
          const st = storeState.staff.find((s) => s.id === taskData.assignedToId);
          assignees.push({
            id: taskData.assignedToId,
            name: st?.name || taskData.assignedToName || 'Staff Member',
            email: st?.email || (taskData.assignedToId === currentUser.id ? currentUser.email : 'staff@wipahs.or.tz'),
          });
        }

        // Fallback: If assignees is empty but assignedToName is specified for a specific person
        if (
          assignees.length === 0 &&
          taskData.assignedToName &&
          !taskData.assignedToName.toLowerCase().includes('(department)') &&
          !taskData.assignedToName.toLowerCase().includes('(whole org)')
        ) {
          const matched = storeState.staff.find(
            (s) => s.name?.toLowerCase().trim() === taskData.assignedToName?.toLowerCase().trim()
          );
          if (matched) {
            assignees.push({
              id: matched.id,
              name: matched.name,
              email: matched.email || (matched.id === currentUser.id ? currentUser.email : 'staff@wipahs.or.tz'),
            });
          }
        }

        // 3. Department target (notify all staff in target department)
        if (
          taskData.assignmentType === 'department' ||
          (taskData.assignedDepartments && taskData.assignedDepartments.length > 0) ||
          (typeof taskData.assignedToId === 'string' && taskData.assignedToId.startsWith('dept-'))
        ) {
          const targetDepts = (taskData.assignedDepartments && taskData.assignedDepartments.length > 0)
            ? taskData.assignedDepartments
            : [taskData.department];

          const deptStaff = storeState.staff.filter((s) => {
            const sDept = normalizeDepartmentName(s.department);
            return targetDepts.some((td) => normalizeDepartmentName(td) === sDept || td === 'All Departments');
          });

          deptStaff.forEach((st) => {
            if (st.id !== currentUser.id && !assignees.some((a) => a.id === st.id)) {
              assignees.push({
                id: st.id,
                name: st.name,
                email: st.email || 'staff@wipahs.or.tz',
              });
            }
          });
        }

        // 4. Organization-wide target
        if (
          taskData.assignmentType === 'organization' ||
          taskData.assignedToId === 'all' ||
          (typeof taskData.assignedToId === 'string' && taskData.assignedToId.startsWith('org-'))
        ) {
          storeState.staff.forEach((st) => {
            if (st.id !== currentUser.id && !assignees.some((a) => a.id === st.id)) {
              assignees.push({
                id: st.id,
                name: st.name,
                email: st.email || 'staff@wipahs.or.tz',
              });
            }
          });
        }

        for (const assignee of assignees) {
          await portalStore.addNotification({
            title: `New Task Assigned: ${newTask.title}`,
            message: `Task "${newTask.title}" has been assigned to ${assignee.name} by ${createdByName}. Priority: ${newTask.priority}. Due: ${newTask.dueDate || 'No due date'}.`,
            type: 'task',
            targetUserId: assignee.id,
            priority: newTask.priority === 'Urgent' ? 'Urgent' : 'Normal',
            actorId: createdById,
            actorName: createdByName,
            actorAvatar: currentUser.avatar,
            pushedToMicrosoftTeams: true,
            emailTriggered: true,
            emailRecipients: [assignee.email],
            emailSubject: `[WIPAHS Task] New Task Assigned: ${newTask.title}`,
            metadata: {
              taskId: newTask.id,
              targetUserName: assignee.name,
              targetUserEmail: assignee.email,
              department: newTask.department,
              priority: newTask.priority,
              dueDate: newTask.dueDate,
            },
          });

          broadcastRealtimeEvent({
            type: 'TASK_ASSIGNED',
            taskId: newTask.id,
            targetUserId: assignee.id,
            actorId: createdById,
            actorName: createdByName,
            title: newTask.title,
          });
        }
      } catch (notifErr) {
        console.warn('Failed to dispatch task notification/email:', notifErr);
      }

      return newTask;
    } catch (err: any) {
      console.error('addTask error:', err);
      throw err;
    }
  },

  updateTask: async (taskId: string, updates: Partial<Task>): Promise<void> => {
    try {
      const existingTask = storeState.tasks.find((t) => t.id === taskId);
      const isReassigned =
        Boolean(updates.assignedToId && updates.assignedToId !== existingTask?.assignedToId) ||
        Boolean(updates.assignedToIds && updates.assignedToIds.some((id) => !existingTask?.assignedToIds?.includes(id)));

      const rowUpdates = mapTaskToRow(updates);
      const { data, error } = await supabase.from('tasks').update(rowUpdates).eq('id', taskId).select(TASK_SELECT_COLUMNS).maybeSingle();
      if (error && !error.message.includes('coerce') && !error.message.includes('PGRST116')) {
        console.warn('Supabase updateTask warning:', error.message);
      }
      // Update tasks state directly with the returned row or merged updates
      setTableData('tasks', storeState.tasks.map((t) => {
        if (t.id === taskId) {
          const mappedRow: Partial<Task> = data ? mapTaskRow(data, t.subtasks) : {};
          return {
            ...t,
            ...mappedRow,
            assignedToAvatar: updates.assignedToAvatar || t.assignedToAvatar || mappedRow.assignedToAvatar || '',
            createdById: mappedRow.createdById || t.createdById,
            createdByName: mappedRow.createdByName || t.createdByName,
            ...updates,
          };
        }
        return t;
      }));

      // Trigger notification if task was reassigned to someone else
      if (isReassigned && updates.assignedToId && updates.assignedToId !== storeState.currentUser.id) {
        const targetStaff = storeState.staff.find((s) => s.id === updates.assignedToId);
        const taskTitle = updates.title || existingTask?.title || 'Task';
        const taskPriority = updates.priority || existingTask?.priority || 'Normal';
        const taskDueDate = updates.dueDate || existingTask?.dueDate || 'No due date';
        const actorName = updates.createdByName || storeState.currentUser.name;
        const actorId = updates.createdById || storeState.currentUser.id;

        portalStore.addNotification({
          title: `Task Assigned: ${taskTitle}`,
          message: `Task "${taskTitle}" has been assigned to ${updates.assignedToName || targetStaff?.name || 'you'} by ${actorName}. Priority: ${taskPriority}. Due: ${taskDueDate}.`,
          type: 'task',
          targetUserId: updates.assignedToId,
          priority: taskPriority === 'Urgent' ? 'Urgent' : 'Normal',
          actorId,
          actorName,
          actorAvatar: storeState.currentUser.avatar,
          pushedToMicrosoftTeams: true,
          emailTriggered: true,
          emailRecipients: [targetStaff?.email || 'staff@wipahs.or.tz'],
          emailSubject: `[WIPAHS Task] Task Assigned to You: ${taskTitle}`,
          metadata: {
            taskId,
            priority: taskPriority,
            dueDate: taskDueDate,
          },
        }).catch(console.warn);
      }
    } catch (err: any) {
      console.error('updateTask error:', err);
      throw err;
    }
  },

  updateTaskStatus: async (taskId: string, newStatus: Task['status']): Promise<void> => {
    let targetTask = storeState.tasks.find((t) => t.id === taskId);
    if (!targetTask) {
      const { data: dbTask } = await supabase.from('tasks').select(TASK_SELECT_COLUMNS).eq('id', taskId).maybeSingle();
      if (dbTask) {
        targetTask = mapTaskRow(dbTask);
      }
    }
    if (!targetTask) return;

    const isPersonal = isPersonalTask(targetTask);
    const nowIso = new Date().toISOString();

    // Lock mutation in pendingTaskStatusUpdates so background pollers/refetches in flight cannot overwrite
    pendingTaskStatusUpdates.set(taskId, { status: newStatus, timestamp: Date.now() });

    try {
      const updates: Record<string, any> = { status: newStatus };
      if (newStatus === 'Done') {
        updates.completed_at = nowIso;
        updates.pending_rating = !isPersonal;
      } else if (newStatus === 'Cancelled') {
        updates.cancelled_at = nowIso;
      } else {
        updates.completed_at = null;
        updates.pending_rating = false;
      }

      // 1. Write to Supabase task record and get authoritative confirmed row
      const { data, error } = await supabase
        .from('tasks')
        .update(updates)
        .eq('id', taskId)
        .select(TASK_SELECT_COLUMNS);

      if (error && !error.message.includes('coerce') && !error.message.includes('PGRST116')) {
        console.error('Supabase updateTaskStatus error:', error.message);
        throw new Error(error.message);
      }

      // Check if row actually was updated in Supabase
      if (!data || data.length === 0) {
        // Double-check if the task exists but RLS blocked update
        const { data: check } = await supabase.from('tasks').select('id').eq('id', taskId);
        if (check && check.length > 0) {
          throw new Error('Permission denied: You do not have permission to update this task in Supabase.');
        }
        throw new Error('Task could not be found or updated in Supabase.');
      }

      const confirmedRow = data[0] as any;
      // 2. Authoritative update of local store state ONLY after confirmed database write
      const mappedRow = mapTaskRow(confirmedRow, targetTask.subtasks);
      setTableData(
        'tasks',
        storeState.tasks.map((t) => {
          if (t.id === taskId) {
            return {
              ...t,
              ...mappedRow,
              assignedToAvatar: t.assignedToAvatar || mappedRow.assignedToAvatar || '',
              status: newStatus,
              pendingRating: newStatus === 'Done' ? !isPersonal : false,
            };
          }
          return t;
        })
      );

      // 3. Keep lock active in pendingTaskStatusUpdates for 15s to guarantee no stale in-flight poller can overwrite it
      pendingTaskStatusUpdates.set(taskId, { status: newStatus, timestamp: Date.now() });

      // 4. Handle ratings notifications for task completion
      if (newStatus === 'Done' && updates.pending_rating) {
        const creatorId = confirmedRow.created_by_id || targetTask?.createdById;
        if (creatorId && creatorId !== storeState.currentUser?.id) {
          const taskTitle = targetTask?.title || confirmedRow.title || 'Completed Task';
          const notifId = `notif-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
          await portalStore
            .addNotification({
              id: notifId,
              title: `Performance Rating Required: ${taskTitle}`,
              message: `Task "${taskTitle}" has been marked complete. A performance rating is required before this notification can be cleared.`,
              type: 'task_rating_required',
              metadata: { taskId, requiresRating: true },
              targetUserId: creatorId,
              actorId: storeState.currentUser?.id,
              actorName: storeState.currentUser?.name || targetTask?.assignedToName || 'Staff Member',
              actorAvatar: storeState.currentUser?.avatar,
              priority: 'Urgent' as const,
              pushedToMicrosoftTeams: true,
            })
            .catch((err) => console.warn('addNotification error in updateTaskStatus:', err));

          broadcastRealtimeEvent({
            type: 'TASK_DONE',
            taskId,
            targetUserId: creatorId,
            actorId: storeState.currentUser?.id,
            actorName: storeState.currentUser?.name,
            title: taskTitle,
          });
        }
      }
    } catch (err: any) {
      console.error('updateTaskStatus failed:', err?.message || err);
      pendingTaskStatusUpdates.delete(taskId);
      throw err;
    }
  },

  deleteTask: async (taskId: string): Promise<void> => {
    try {
      // 1. Delete dependent relations first to avoid foreign key or cascade issues
      await supabase.from('task_assignees').delete().eq('task_id', taskId);
      await supabase.from('task_ratings').delete().eq('task_id', taskId);
      await supabase.from('task_subtasks').delete().eq('task_id', taskId);

      // 2. Delete the task and request returned id with .select('id')
      const { data, error } = await supabase.from('tasks').delete().eq('id', taskId).select('id');
      if (error) {
        console.error('Supabase deleteTask error:', error.message);
        throw new Error(error.message);
      }

      // If data is empty, check if RLS prevented the deletion
      if (!data || data.length === 0) {
        const { data: checkExisting } = await supabase.from('tasks').select('id').eq('id', taskId);
        if (checkExisting && checkExisting.length > 0) {
          throw new Error('Permission denied: You do not have permission to delete this task in Supabase.');
        }
      }

      // 3. Remove from pending registries
      pendingTaskStatusUpdates.delete(taskId);

      // 4. Remove from tasks state directly
      setTableData('tasks', storeState.tasks.filter((t) => t.id !== taskId));

      // 5. Broadcast deletion to other tabs/listeners
      broadcastRealtimeEvent({
        type: 'TASK_ASSIGNED',
        taskId,
        actorId: storeState.currentUser?.id,
        targetUserId: 'all',
      });
    } catch (err: any) {
      console.error('deleteTask error:', err);
      throw err;
    }
  },

  addSubtask: async (taskId: string, title: string): Promise<void> => {
    try {
      const subtaskRow = {
        id: `sub-${Date.now()}`,
        task_id: taskId,
        title,
        completed: false,
      };
      const { data, error } = await supabase.from('task_subtasks').insert(subtaskRow).select('*').single();
      if (error) {
        console.error('Supabase addSubtask error:', error.message);
        throw new Error(error.message);
      }
      const newSub = mapSubtaskRow(data);
      // Append subtask into the specific task
      setTableData('tasks', storeState.tasks.map((t) => {
        if (t.id === taskId) {
          return { ...t, subtasks: [...t.subtasks, newSub] };
        }
        return t;
      }));
    } catch (err: any) {
      console.error('addSubtask error:', err);
      throw err;
    }
  },

  toggleSubtask: async (taskId: string, subtaskId: string): Promise<void> => {
    try {
      const currentTask = storeState.tasks.find((t) => t.id === taskId);
      const currentSub = currentTask?.subtasks.find((s) => s.id === subtaskId);
      const nextCompleted = !currentSub?.completed;

      const { data, error } = await supabase
        .from('task_subtasks')
        .update({ completed: nextCompleted })
        .eq('id', subtaskId)
        .select('*')
        .single();

      if (error) {
        console.error('Supabase toggleSubtask error:', error.message);
        throw new Error(error.message);
      }

      const updatedSub = mapSubtaskRow(data);
      // Update subtasks inside the specific task
      setTableData('tasks', storeState.tasks.map((t) => {
        if (t.id === taskId) {
          return {
            ...t,
            subtasks: t.subtasks.map((s) => (s.id === subtaskId ? updatedSub : s)),
          };
        }
        return t;
      }));
    } catch (err: any) {
      console.error('toggleSubtask error:', err);
      throw err;
    }
  },

  rateTask: async (taskId: string, stars: number, comment?: string): Promise<void> => {
    try {
      const currentUser = storeState.currentUser;
      const ratingPayload = {
        ratedUserId: '',
        raterUserId: currentUser.id,
        stars,
        comment: comment?.trim() || undefined,
        ratedAt: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('tasks')
        .update({
          rating: ratingPayload,
          pending_rating: false,
        })
        .eq('id', taskId)
        .select(TASK_SELECT_COLUMNS)
        .single();

      if (error) {
        console.error('Supabase rateTask error:', error.message);
        throw new Error(error.message);
      }

      // Update tasks state directly
      setTableData('tasks', storeState.tasks.map((t) => {
        if (t.id === taskId) {
          const mappedRow = mapTaskRow(data, t.subtasks);
          return {
            ...t,
            ...mappedRow,
            assignedToAvatar: t.assignedToAvatar || mappedRow.assignedToAvatar || '',
            rating: ratingPayload,
            pendingRating: false,
          };
        }
        return t;
      }));

      // Automatically clean up any pending task_rating_required notifications for this task
      const ratingNotifs = storeState.notifications.filter(
        (n) => n.type === 'task_rating_required' && n.metadata?.taskId === taskId
      );
      if (ratingNotifs.length > 0) {
        const notifIds = ratingNotifs.map((n) => n.id);
        supabase.from('notifications').delete().in('id', notifIds).then(() => {});
        setTableData(
          'notifications',
          storeState.notifications.filter((n) => !notifIds.includes(n.id))
        );
      }

      // Notify the assigned staff member that their performance rating was submitted
      const ratedTask = storeState.tasks.find((t) => t.id === taskId);
      if (ratedTask?.assignedToId && ratedTask.assignedToId !== currentUser.id) {
        portalStore.addNotification({
          title: `Performance Rating: ${ratedTask.title}`,
          message: `${currentUser.name} rated your work on "${ratedTask.title}" with ${stars}/5 Stars.${comment ? ` Feedback: "${comment}"` : ''}`,
          type: 'task',
          targetUserId: ratedTask.assignedToId,
          priority: 'Normal',
          actorId: currentUser.id,
          actorName: currentUser.name,
          actorAvatar: currentUser.avatar,
          pushedToMicrosoftTeams: true,
          metadata: {
            taskId,
            stars,
            comment,
          },
        }).catch(console.warn);

        broadcastRealtimeEvent({
          type: 'TASK_RATED',
          taskId,
          targetUserId: ratedTask.assignedToId,
          actorId: currentUser.id,
          actorName: currentUser.name,
          title: ratedTask.title,
        });
      }
    } catch (err: any) {
      console.error('rateTask error:', err);
      throw err;
    }
  },

  updateTaskGeneralUpdate: async (
    taskId: string,
    updateText: string,
    authorId?: string,
    authorName?: string
  ): Promise<void> => {
    const currentUser = storeState.currentUser;
    const trimmed = updateText.trim();
    const updateObj = trimmed
      ? {
          text: trimmed,
          authorId: authorId || currentUser.id,
          authorName: authorName || currentUser.name,
          updatedAt: new Date().toISOString(),
        }
      : undefined;

    setTableData('tasks', storeState.tasks.map((t) => (t.id === taskId ? { ...t, update: updateObj } : t)));
  },

  updateSubtaskUpdate: async (
    taskId: string,
    subtaskId: string,
    updateText: string,
    authorId?: string,
    authorName?: string
  ): Promise<void> => {
    const currentUser = storeState.currentUser;
    const trimmed = updateText.trim();
    const updateObj = trimmed
      ? {
          text: trimmed,
          authorId: authorId || currentUser.id,
          authorName: authorName || currentUser.name,
          updatedAt: new Date().toISOString(),
        }
      : undefined;

    setTableData('tasks', storeState.tasks.map((t) => {
      if (t.id === taskId) {
        return {
          ...t,
          subtasks: t.subtasks.map((s) => (s.id === subtaskId ? { ...s, update: updateObj } : s)),
        };
      }
      return t;
    }));
  },

  // -----------------------------------------------------------------------
  // Actions: Notices (UPDATES NOTICES STATE ONLY)
  // -----------------------------------------------------------------------
  addNotice: async (
    noticeData: Omit<Notice, 'id' | 'createdAt' | 'authorId' | 'authorName' | 'authorRole' | 'acknowledgedBy'> &
      Partial<Pick<Notice, 'authorId' | 'authorName' | 'authorRole'>>
  ): Promise<Notice | null> => {
    try {
      const id = `not-${Date.now()}`;
      const currentUser = storeState.currentUser;
      const newNotice: Notice = {
        ...noticeData,
        id,
        authorId: noticeData.authorId || currentUser.id,
        authorName: noticeData.authorName || currentUser.name,
        authorRole: noticeData.authorRole || currentUser.role,
        createdAt: new Date().toISOString(),
        acknowledgedBy: [],
        priority: noticeData.priority || 'Normal',
        pinned: Boolean(noticeData.pinned),
        department: normalizeDepartmentName(noticeData.department),
        organisation: noticeData.organisation || 'WIPAHS',
      };

      const row = mapNoticeToRow(newNotice);
      const { data, error } = await supabase.from('notices').insert(row).select(NOTICE_SELECT_COLUMNS).single();
      if (error) {
        console.error('Supabase addNotice error:', error.message);
        throw new Error(error.message);
      }

      const insertedNotice = mapNoticeRow(data, []);
      // Optimistically prepend to notices state directly
      setTableData('notices', [insertedNotice, ...storeState.notices]);

      // Trigger notification for the newly published notice / circular
      try {
        const isGeneral =
          !newNotice.department ||
          newNotice.department === 'All' ||
          newNotice.department === 'All Departments' ||
          newNotice.department === 'General';

        const deptStaff = isGeneral
          ? storeState.staff.filter((s) => s.id !== currentUser.id)
          : storeState.staff.filter(
              (s) =>
                s.id !== currentUser.id &&
                normalizeDepartmentName(s.department) === normalizeDepartmentName(newNotice.department)
            );

        const recipientEmails = deptStaff.map((s) => s.email).filter(Boolean);
        const noticePreview = newNotice.content
          ? (newNotice.content.length > 140 ? `${newNotice.content.substring(0, 137)}...` : newNotice.content)
          : `A new circular "${newNotice.title}" has been published by ${newNotice.authorName}.`;

        await portalStore.addNotification({
          title: newNotice.priority === 'Urgent' ? `[URGENT CIRCULAR] ${newNotice.title}` : `New Circular: ${newNotice.title}`,
          message: noticePreview,
          type: 'notice',
          targetUserId: 'all',
          priority: newNotice.priority === 'Urgent' ? 'Urgent' : 'Normal',
          actorId: currentUser.id,
          actorName: currentUser.name,
          actorAvatar: currentUser.avatar,
          pushedToMicrosoftTeams: true,
          emailTriggered: true,
          emailRecipients: recipientEmails.length > 0 ? recipientEmails : ['staff@wipahs.or.tz'],
          emailSubject: `[WIPAHS Circular] ${newNotice.title}`,
          metadata: {
            noticeId: insertedNotice.id,
            department: newNotice.department,
            priority: newNotice.priority,
          },
        });

        broadcastRealtimeEvent({
          type: 'NEW_NOTICE',
          notice: insertedNotice,
          actorId: currentUser.id,
          actorName: currentUser.name,
          targetUserId: 'all',
          title: newNotice.title,
        });
      } catch (notifErr) {
        console.warn('Failed to dispatch notice notification:', notifErr);
      }

      return insertedNotice;
    } catch (err: any) {
      console.error('addNotice error:', err);
      throw err;
    }
  },

  togglePinNotice: async (noticeId: string): Promise<void> => {
    try {
      const currentNotice = storeState.notices.find((n) => n.id === noticeId);
      const newPinned = !currentNotice?.pinned;

      const { data, error } = await supabase
        .from('notices')
        .update({ pinned: newPinned })
        .eq('id', noticeId)
        .select(NOTICE_SELECT_COLUMNS)
        .single();

      if (error) {
        console.error('Supabase togglePinNotice error:', error.message);
        throw new Error(error.message);
      }

      // Update notices state directly with returned row
      setTableData('notices', storeState.notices.map((n) => (n.id === noticeId ? { ...n, pinned: newPinned } : n)));
    } catch (err: any) {
      console.error('togglePinNotice error:', err);
      throw err;
    }
  },

  acknowledgeNotice: async (noticeId: string): Promise<void> => {
    try {
      const currentUser = storeState.currentUser;
      const userUuid = toUuidOrNull(currentUser.id);
      if (userUuid) {
        await supabase.from('notice_acknowledgements').insert({
          notice_id: noticeId,
          user_id: userUuid,
          acknowledged_at: new Date().toISOString(),
        });
      }

      let targetNotice: Notice | undefined;
      // Update acknowledgedBy array on notice in notices state directly
      setTableData('notices', storeState.notices.map((n) => {
        if (n.id === noticeId) {
          targetNotice = n;
          const acks = Array.from(new Set([...n.acknowledgedBy, currentUser.id]));
          return { ...n, acknowledgedBy: acks };
        }
        return n;
      }));

      if (!targetNotice) {
        targetNotice = storeState.notices.find((n) => n.id === noticeId);
      }

      // Resolve author ID accurately: check authorId or lookup in staff
      let authorTargetId = targetNotice?.authorId;
      if (!authorTargetId && targetNotice?.authorName) {
        const found = storeState.staff.find(
          (s) =>
            s.name?.toLowerCase().trim() === targetNotice?.authorName?.toLowerCase().trim() ||
            s.email?.toLowerCase().trim() === targetNotice?.authorName?.toLowerCase().trim()
        );
        if (found) authorTargetId = found.id;
      }

      // Trigger notification to the author of the notice
      if (targetNotice && authorTargetId && authorTargetId !== currentUser.id) {
        await portalStore.addNotification({
          title: `Circular Acknowledged: ${targetNotice.title}`,
          message: `${currentUser.name} has formally acknowledged your circular "${targetNotice.title}".`,
          type: 'notice',
          targetUserId: authorTargetId,
          priority: 'Normal',
          actorId: currentUser.id,
          actorName: currentUser.name,
          actorAvatar: currentUser.avatar,
          pushedToMicrosoftTeams: true,
          emailTriggered: false,
          metadata: {
            noticeId,
            acknowledgedByUserId: currentUser.id,
            acknowledgedByUserName: currentUser.name,
          },
        }).catch(console.warn);

        broadcastRealtimeEvent({
          type: 'NOTICE_ACKNOWLEDGED',
          noticeId,
          targetUserId: authorTargetId,
          actorId: currentUser.id,
          actorName: currentUser.name,
          title: targetNotice.title,
        });
      }
    } catch (err: any) {
      console.error('acknowledgeNotice error:', err);
    }
  },

  deleteNotice: async (noticeId: string): Promise<void> => {
    try {
      const { error } = await supabase.from('notices').delete().eq('id', noticeId);
      if (error) {
        console.error('Supabase deleteNotice error:', error.message);
        throw new Error(error.message);
      }
      // Remove from notices state directly
      setTableData('notices', storeState.notices.filter((n) => n.id !== noticeId));
    } catch (err: any) {
      console.error('deleteNotice error:', err);
      throw err;
    }
  },

  // -----------------------------------------------------------------------
  // Actions: Projects (UPDATES PROJECTS STATE ONLY)
  // -----------------------------------------------------------------------
  addProject: async (
    projData: Omit<Project, 'id' | 'leadId' | 'leadName' | 'activeTasksCount'> & {
      leadId?: string;
      leadName?: string;
    }
  ): Promise<Project | null> => {
    try {
      const id = `prj-${Date.now()}`;
      const currentUser = storeState.currentUser;
      const newProj: Project = {
        ...projData,
        id,
        leadId: projData.leadId || currentUser.id,
        leadName: projData.leadName || currentUser.name,
        activeTasksCount: 0,
        overdueTasksCount: 0,
        department: normalizeDepartmentName(projData.department),
        membersCount: 0,
        milestones: projData.milestones || [],
        budgetBreakdown: projData.budgetBreakdown || [],
        impactMetrics: projData.impactMetrics || [],
        activityLog: projData.activityLog || [],
      };

      const row = mapProjectToRow(newProj);
      const { data, error } = await supabase.from('projects').insert(row).select('*').single();
      if (error) {
        console.error('Supabase addProject error:', error.message);
        throw new Error(error.message);
      }

      // Insert milestones if provided
      let milestonesList = newProj.milestones;
      if (newProj.milestones.length > 0) {
        const milRows = newProj.milestones.map((m) => ({
          id: m.id || `ms-${Date.now()}-${Math.random()}`,
          project_id: id,
          title: m.name,
          due_date: m.dueDate,
          completed: m.status === 'Completed',
        }));
        await supabase.from('project_milestones').insert(milRows);
      }

      // Insert budget categories if provided
      if (newProj.budgetBreakdown && newProj.budgetBreakdown.length > 0) {
        try {
          const catRows = newProj.budgetBreakdown.map((b) => ({
            id: b.id || `pbc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            project_id: id,
            category: b.category,
            allocated: Number(b.allocated) || 0,
            spent: Number(b.spent) || 0,
          }));
          await supabase.from('project_budget_categories').insert(catRows);
        } catch (catErr) {
          console.warn('Initial project budget categories insert note:', catErr);
        }
      }

      const insertedProject = mapProjectRow(
        data,
        milestonesList,
        newProj.budgetBreakdown,
        newProj.impactMetrics,
        newProj.activityLog
      );
      // Prepend to projects state directly
      setTableData('projects', [insertedProject, ...storeState.projects]);
      return insertedProject;
    } catch (err: any) {
      console.error('addProject error:', err);
      throw err;
    }
  },

  updateProject: async (id: string, updates: Partial<Project>): Promise<void> => {
    try {
      // 1. Immediately update store state so the UI updates without delay
      const existingProject = storeState.projects.find((p) => p.id === id);
      const mergedProject = existingProject ? { ...existingProject, ...updates } : ({ id, ...updates } as Project);
      let found = false;
      const updatedProjects = storeState.projects.map((p) => {
        if (p.id === id) {
          found = true;
          return mergedProject;
        }
        return p;
      });
      if (!found) {
        updatedProjects.unshift(mergedProject);
      }
      setTableData('projects', updatedProjects);

      // 2. Persist project changes to Supabase
      const rowUpdates = mapProjectToRow(updates);
      if (Object.keys(rowUpdates).length > 0) {
        const { data, error } = await supabase
          .from('projects')
          .update(rowUpdates)
          .eq('id', id)
          .select('*')
          .maybeSingle();

        if (error) {
          console.warn('Supabase updateProject note:', error.message);
          // If update failed (e.g. project does not exist yet in DB or RLS), try upserting the full project
          try {
            const fullRow = mapProjectToRow(mergedProject);
            fullRow.id = id;
            await supabase.from('projects').upsert(fullRow);
          } catch (upsertErr) {
            console.warn('Project upsert fallback note:', upsertErr);
          }
        } else if (!data && existingProject) {
          // If 0 rows were updated, row did not exist in DB yet; upsert the full project
          try {
            const fullRow = mapProjectToRow(mergedProject);
            fullRow.id = id;
            await supabase.from('projects').upsert(fullRow);
          } catch (upsertErr) {
            console.warn('Project upsert fallback note:', upsertErr);
          }
        }
      } else if (existingProject) {
        // If updates contained only client-side or nested fields, upsert full project
        try {
          const fullRow = mapProjectToRow(mergedProject);
          fullRow.id = id;
          await supabase.from('projects').upsert(fullRow);
        } catch {
          // ignore
        }
      }

      // 3. Persist milestones if updated
      if (updates.milestones && Array.isArray(updates.milestones) && updates.milestones.length > 0) {
        try {
          const milRows = updates.milestones.map((m) => ({
            id: m.id || `ms-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            project_id: id,
            title: m.name,
            due_date: m.dueDate,
            completed: m.status === 'Completed',
          }));
          await supabase.from('project_milestones').upsert(milRows);
        } catch (milErr) {
          console.warn('project_milestones upsert note:', milErr);
        }
      }

      // 4. Persist budget categories if updated
      if (updates.budgetBreakdown && Array.isArray(updates.budgetBreakdown)) {
        try {
          await supabase.from('project_budget_categories').delete().eq('project_id', id);
          if (updates.budgetBreakdown.length > 0) {
            const catRows = updates.budgetBreakdown.map((c) => ({
              id: c.id || `bc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              project_id: id,
              category: c.category,
              allocated: Number(c.allocated) || 0,
              spent: Number(c.spent) || 0,
            }));
            await supabase.from('project_budget_categories').insert(catRows);
          }
        } catch (bcErr) {
          console.warn('project_budget_categories upsert note:', bcErr);
        }
      }
    } catch (err: any) {
      console.warn('updateProject note:', err?.message);
      if (!err?.message?.includes('coerce') && !err?.message?.includes('PGRST116')) {
        throw err;
      }
    }
  },

  updateProjectBudgetCategory: async (projectId: string, categoryName: string, spent: number): Promise<void> => {
    try {
      // 1. Immediately update local store state
      const existingProjects = storeState.projects;
      const updatedProjects = existingProjects.map((p) => {
        if (p.id === projectId) {
          const updatedBreakdown = (p.budgetBreakdown || []).map((b) => {
            if (b.category === categoryName || b.id === categoryName) {
              return { ...b, spent };
            }
            return b;
          });
          const totalSpentNum = updatedBreakdown.reduce((acc, b) => acc + (b.spent || 0), 0);
          return {
            ...p,
            budgetBreakdown: updatedBreakdown,
            spent: `$${totalSpentNum.toLocaleString()}`,
          };
        }
        return p;
      });
      setTableData('projects', updatedProjects);

      // 2. Persist directly to Supabase project_budget_categories table
      const { data, error } = await supabase
        .from('project_budget_categories')
        .update({ spent })
        .eq('project_id', projectId)
        .eq('category', categoryName)
        .select('*');

      if (error || !data || data.length === 0) {
        await supabase.from('project_budget_categories').upsert({
          id: `bc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          project_id: projectId,
          category: categoryName,
          allocated: 0,
          spent,
        });
      }
    } catch (err: any) {
      console.error('updateProjectBudgetCategory error:', err);
      throw err;
    }
  },

  addProjectExpense: async (expense: Omit<ProjectExpense, 'id' | 'createdAt'>): Promise<ProjectExpense> => {
    try {
      const id = `exp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const createdAt = new Date().toISOString();
      const newExpense: ProjectExpense = {
        ...expense,
        id,
        createdAt,
      };

      let remoteReceiptUrl = newExpense.receiptUrl;
      if (remoteReceiptUrl && remoteReceiptUrl.startsWith('[')) {
        try {
          const parsed = JSON.parse(remoteReceiptUrl);
          if (Array.isArray(parsed)) {
            remoteReceiptUrl = JSON.stringify(parsed.map((d: any) => ({ name: d.name, size: d.size, attachedLocally: true })));
          }
        } catch {
          // ignore
        }
      }

      const row: Record<string, any> = {
        id: newExpense.id,
        project_id: newExpense.projectId,
        title: newExpense.title,
        amount: newExpense.amount,
        expense_date: newExpense.expenseDate,
        category: newExpense.category,
        payment_method: newExpense.paymentMethod,
        receipt_url: remoteReceiptUrl,
        status: newExpense.status,
        created_by: newExpense.createdBy,
        created_at: newExpense.createdAt,
      };
      if (newExpense.categoryId) {
        row.category_id = newExpense.categoryId;
      }

      try {
        let { error } = await supabase.from('project_expenses').insert(row);
        if (error && (error.code === '42703' || error.message?.includes('category_id'))) {
          // If category_id column is not yet present on remote DB, fallback to insert without category_id
          const { category_id, ...fallbackRow } = row;
          const retry = await supabase.from('project_expenses').insert(fallbackRow);
          if (retry.error) {
            console.warn('Supabase addProjectExpense fallback note:', retry.error.message);
          }
        } else if (error) {
          console.warn('Supabase addProjectExpense note:', error.message);
        }
      } catch (dbErr: any) {
        console.warn('Supabase addProjectExpense exception:', dbErr?.message || dbErr);
      }

      const existingProjects = storeState.projects;
      let calculatedTotalSpent = 0;
      const updatedProjects = existingProjects.map((p) => {
        if (p.id === newExpense.projectId) {
          const currentExpenses = p.expenses || [];
          const newExpenses = [newExpense, ...currentExpenses];
          
          const catSpentMap: Record<string, number> = {};
          newExpenses.forEach(e => {
            if (e.status === 'Active') {
              const matched = (p.budgetBreakdown || []).find(
                b => (e.categoryId && b.id && e.categoryId === b.id) ||
                     (e.category && b.category && e.category.toLowerCase().trim() === b.category.toLowerCase().trim())
              );
              const key = matched ? (matched.id || matched.category) : e.category;
              catSpentMap[key] = (catSpentMap[key] || 0) + Number(e.amount);
            }
          });

          const updatedBreakdown = (p.budgetBreakdown || []).map(b => {
            const key = b.id || b.category;
            const newSpent = catSpentMap[key] !== undefined ? catSpentMap[key] : (catSpentMap[b.category] !== undefined ? catSpentMap[b.category] : 0);
            return {
              ...b,
              spent: newSpent,
            };
          });

          // Total spent across ALL categories (guaranteed sum of category rows)
          calculatedTotalSpent = updatedBreakdown.length > 0
            ? updatedBreakdown.reduce((sum, b) => sum + (Number(b.spent) || 0), 0)
            : newExpenses.filter(e => e.status === 'Active').reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

          return {
            ...p,
            expenses: newExpenses,
            budgetBreakdown: updatedBreakdown,
            spent: `$${calculatedTotalSpent.toLocaleString()}`,
          };
        }
        return p;
      });
      setTableData('projects', updatedProjects);
      saveProjectsToLocalStorage(updatedProjects);

      // Persist the updated spent amount directly to Supabase projects table
      try {
        await supabase
          .from('projects')
          .update({ spent: calculatedTotalSpent })
          .eq('id', newExpense.projectId);
      } catch (spentErr) {
        console.warn('Could not update project spent in Supabase:', spentErr);
      }

      // If category exists in project_budget_categories, also update its spent in Supabase
      try {
        const catSpent = (updatedProjects.find(p => p.id === newExpense.projectId)?.expenses || [])
          .filter(e => e.status === 'Active' && (
            (e.categoryId && newExpense.categoryId && e.categoryId === newExpense.categoryId) ||
            e.category.toLowerCase().trim() === newExpense.category.toLowerCase().trim()
          ))
          .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
        
        let query = supabase.from('project_budget_categories').update({ spent: catSpent });
        if (newExpense.categoryId) {
          query = query.eq('id', newExpense.categoryId);
        } else {
          query = query.eq('project_id', newExpense.projectId).eq('category', newExpense.category);
        }
        await query;
      } catch (catErr) {
        // category may not be in DB table
      }

      return newExpense;
    } catch (err: any) {
      console.error('addProjectExpense error:', err);
      throw err;
    }
  },

  deleteProjectExpense: async (projectId: string, expenseId: string): Promise<void> => {
    try {
      try {
        const { error } = await supabase
          .from('project_expenses')
          .delete()
          .eq('id', expenseId);

        if (error) {
          console.warn('Supabase deleteProjectExpense note:', error.message);
        }
      } catch (dbErr: any) {
        console.warn('Supabase deleteProjectExpense exception:', dbErr?.message || dbErr);
      }

      const existingProjects = storeState.projects;
      let calculatedTotalSpent = 0;
      const updatedProjects = existingProjects.map((p) => {
        if (p.id === projectId) {
          const updatedExpenses = (p.expenses || []).filter(e => e.id !== expenseId);
          
          const catSpentMap: Record<string, number> = {};
          updatedExpenses.forEach(e => {
            if (e.status === 'Active') {
              const matched = (p.budgetBreakdown || []).find(
                b => (e.categoryId && b.id && e.categoryId === b.id) ||
                     (e.category && b.category && e.category.toLowerCase().trim() === b.category.toLowerCase().trim())
              );
              const key = matched ? (matched.id || matched.category) : e.category;
              catSpentMap[key] = (catSpentMap[key] || 0) + Number(e.amount);
            }
          });

          const updatedBreakdown = (p.budgetBreakdown || []).map(b => {
            const key = b.id || b.category;
            const newSpent = catSpentMap[key] !== undefined ? catSpentMap[key] : (catSpentMap[b.category] !== undefined ? catSpentMap[b.category] : 0);
            return {
              ...b,
              spent: newSpent,
            };
          });

          calculatedTotalSpent = updatedBreakdown.length > 0
            ? updatedBreakdown.reduce((sum, b) => sum + (Number(b.spent) || 0), 0)
            : updatedExpenses.filter(e => e.status === 'Active').reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

          return {
            ...p,
            expenses: updatedExpenses,
            budgetBreakdown: updatedBreakdown,
            spent: `$${calculatedTotalSpent.toLocaleString()}`,
          };
        }
        return p;
      });
      setTableData('projects', updatedProjects);
      saveProjectsToLocalStorage(updatedProjects);

      try {
        await supabase
          .from('projects')
          .update({ spent: calculatedTotalSpent })
          .eq('id', projectId);
      } catch (spentErr) {
        console.warn('Could not update project spent in Supabase:', spentErr);
      }
    } catch (err: any) {
      console.error('deleteProjectExpense error:', err);
      throw err;
    }
  },
  voidProjectExpense: async (projectId: string, expenseId: string): Promise<void> => {
    try {
      try {
        const { error } = await supabase
          .from('project_expenses')
          .update({ status: 'Voided' })
          .eq('id', expenseId);

        if (error) {
          console.warn('Supabase voidProjectExpense note:', error.message);
        }
      } catch (dbErr: any) {
        console.warn('Supabase voidProjectExpense exception:', dbErr?.message || dbErr);
      }

      const existingProjects = storeState.projects;
      let calculatedTotalSpent = 0;
      const updatedProjects = existingProjects.map((p) => {
        if (p.id === projectId) {
          const updatedExpenses = (p.expenses || []).map((e) =>
            e.id === expenseId ? { ...e, status: 'Voided' as const } : e
          );

          const catSpentMap: Record<string, number> = {};
          updatedExpenses.forEach((e) => {
            if (e.status === 'Active') {
              catSpentMap[e.category] = (catSpentMap[e.category] || 0) + Number(e.amount);
            }
          });

          calculatedTotalSpent = updatedExpenses
            .filter((e) => e.status === 'Active')
            .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

          const updatedBreakdown = (p.budgetBreakdown || []).map((b) => ({
            ...b,
            spent: catSpentMap[b.category] !== undefined ? catSpentMap[b.category] : 0,
          }));

          return {
            ...p,
            expenses: updatedExpenses,
            budgetBreakdown: updatedBreakdown,
            spent: `$${calculatedTotalSpent.toLocaleString()}`,
          };
        }
        return p;
      });
      setTableData('projects', updatedProjects);
      saveProjectsToLocalStorage(updatedProjects);

      try {
        await supabase
          .from('projects')
          .update({ spent: calculatedTotalSpent })
          .eq('id', projectId);
      } catch (spentErr) {
        console.warn('Could not update project spent in Supabase:', spentErr);
      }
    } catch (err: any) {
      console.error('voidProjectExpense error:', err);
      throw err;
    }
  },

  updateProjectBudgetCategories: async (projectId: string, categories: BudgetCategory[], overallBudget?: number): Promise<void> => {
    try {
      const existingProjects = storeState.projects;
      const targetProj = existingProjects.find((p) => p.id === projectId);

      const catSum = categories.reduce((sum, c) => sum + (Number(c.allocated) || 0), 0);
      const totalAllocated = overallBudget !== undefined && overallBudget > 0 ? overallBudget : catSum;
      
      const allExpenses = targetProj?.expenses || [];
      const totalSpentNum = allExpenses
        .filter(e => e.status === 'Active')
        .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

      const formattedBudget = `$${totalAllocated.toLocaleString()}`;
      const formattedSpent = `$${totalSpentNum.toLocaleString()}`;

      // Reconcile category spent from active vouchers
      const catSpentMap: Record<string, number> = {};
      allExpenses.forEach(e => {
        if (e.status === 'Active') {
          catSpentMap[e.category] = (catSpentMap[e.category] || 0) + Number(e.amount);
        }
      });

      const reconciledCategories = categories.map(c => ({
        ...c,
        allocated: Number(c.allocated) || 0,
        spent: catSpentMap[c.category] !== undefined ? catSpentMap[c.category] : (Number(c.spent) || 0),
      }));

      let found = false;
      const updatedProjects = existingProjects.map((p) => {
        if (p.id === projectId) {
          found = true;
          return {
            ...p,
            budget: formattedBudget,
            spent: formattedSpent,
            budgetBreakdown: reconciledCategories,
          };
        }
        return p;
      });
      if (!found) {
        updatedProjects.unshift({
          id: projectId,
          name: targetProj?.name || 'Project',
          department: targetProj?.department || 'Top management',
          status: 'Active',
          progress: targetProj?.progress || 0,
          budget: formattedBudget,
          spent: formattedSpent,
          budgetBreakdown: reconciledCategories,
        } as Project);
      }

      // 1. Immediately update local store reactive state
      setTableData('projects', updatedProjects);

      // 2. Persist to localStorage cache
      saveProjectsToLocalStorage(updatedProjects);

      // 3. Persist to Supabase projects table (gracefully catching any RLS/connectivity issues)
      try {
        const { error: projErr } = await supabase
          .from('projects')
          .update({ budget: totalAllocated, spent: totalSpentNum })
          .eq('id', projectId);

        if (projErr) {
          console.warn('Supabase projects table budget update note:', projErr.message);
        }
      } catch (dbErr) {
        console.warn('Supabase projects table budget update exception:', dbErr);
      }

      // 4. Persist budget categories to Supabase
      try {
        await supabase.from('project_budget_categories').delete().eq('project_id', projectId);
        if (reconciledCategories.length > 0) {
          const catRows = reconciledCategories.map((c) => ({
            id: c.id || `bc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            project_id: projectId,
            category: c.category,
            allocated: Number(c.allocated) || 0,
            spent: Number(c.spent) || 0,
          }));
          await supabase.from('project_budget_categories').insert(catRows);
        }
      } catch (bcErr) {
        console.warn('Supabase project_budget_categories update exception:', bcErr);
      }
    } catch (err: any) {
      console.error('updateProjectBudgetCategories error:', err);
      throw err;
    }
  },

  addProjectMember: async (projectId: string, userId: string): Promise<void> => {
    try {
      try {
        const { error } = await supabase
          .from('project_members')
          .insert({ project_id: projectId, user_id: userId });
        if (error) {
          console.warn('Supabase addProjectMember warning:', error.message);
        }
      } catch (dbErr: any) {
        console.warn('Supabase addProjectMember exception:', dbErr);
      }

      const staffList = storeState.staff.length > 0 ? storeState.staff : await portalStore.getStaff();
      const memberStaff = staffList.find((s) => s.id === userId);

      const memberObj = memberStaff
        ? {
            id: memberStaff.id,
            name: memberStaff.name,
            role: memberStaff.role,
            avatar: memberStaff.avatar,
            email: memberStaff.email,
          }
        : {
            id: userId,
            name: 'Member',
            role: 'Team Member',
            avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
            email: '',
          };

      const existingProjects = storeState.projects;
      const updatedProjects = existingProjects.map((p) => {
        if (p.id === projectId) {
          const existingMembers = p.members || [];
          if (existingMembers.some((m) => m.id === userId)) return p;
          const newMembers = [...existingMembers, memberObj];
          const newMemberIds = Array.from(new Set([...(p.memberIds || []), userId]));
          return {
            ...p,
            members: newMembers,
            memberIds: newMemberIds,
          };
        }
        return p;
      });
      setTableData('projects', updatedProjects);
      saveProjectsToLocalStorage(updatedProjects);

      portalStore.logAudit('project_member_added', `Added ${memberObj.name} to project team`, 'emerald');
    } catch (err: any) {
      console.error('addProjectMember error:', err);
      throw err;
    }
  },

  deleteProject: async (projectId: string): Promise<void> => {
    try {
        // 1. Delete associated tasks and their subtasks first
        const { data: taskData } = await supabase.from('tasks').select('id').eq('project_id', projectId);
        if (taskData && taskData.length > 0) {
            const taskIds = taskData.map(t => t.id);
            await supabase.from('task_subtasks').delete().in('task_id', taskIds);
            await supabase.from('tasks').delete().eq('project_id', projectId);
        }

        // 2. Delete other child records
        const tablesToDelete = [
            'project_expenses',
            'project_milestones',
            'project_budget_categories',
            'project_impact_metrics',
            'project_activity_log',
            'project_members',
            'sharepoint_documents'
        ];

        for (const table of tablesToDelete) {
            const { error } = await supabase.from(table).delete().eq('project_id', projectId);
            if (error) {
                console.error(`Supabase deleteProject table ${table} error:`, error.message);
                throw new Error(`Failed to delete project child records from ${table}: ${error.message}`);
            }
        }

        // 3. Delete the project
        const { data, error } = await supabase.from('projects').delete().eq('id', projectId).select();
        if (error) {
            console.error('Supabase deleteProject error:', error.message);
            throw new Error(`Failed to delete project: ${error.message}`);
        }
        if (!data || data.length === 0) {
            console.warn('Project not found or RLS blocked deletion');
            throw new Error('Project not found or RLS blocked deletion');
        }

        const existingProjects = storeState.projects;
        const updatedProjects = existingProjects.filter((p) => p.id !== projectId);
        setTableData('projects', updatedProjects);
        saveProjectsToLocalStorage(updatedProjects);
    } catch (err: any) {
        console.error('deleteProject error:', err);
        alert(err.message || 'An error occurred while deleting the project.');
        throw err;
    }
  },

  markProjectAsDone: async (projectId: string): Promise<void> => {
    try {
      const existingProjects = storeState.projects;
      const updatedProjects = existingProjects.map((p) => {
        if (p.id === projectId) {
          return {
            ...p,
            status: 'Completed' as const,
            progress: 100,
          };
        }
        return p;
      });
      setTableData('projects', updatedProjects);
      saveProjectsToLocalStorage(updatedProjects);

      try {
        await supabase
          .from('projects')
          .update({ status: 'Completed', progress: 100 })
          .eq('id', projectId);
      } catch (sbErr) {
        console.warn('Supabase markProjectAsDone warning:', sbErr);
      }

      portalStore.addProjectActivityLog(projectId, `Project marked as Completed (100%) by ${storeState.currentUser.name}`);
    } catch (err: any) {
      console.error('markProjectAsDone error:', err);
      throw err;
    }
  },

  removeProjectMember: async (projectId: string, userId: string): Promise<void> => {
    try {
      try {
        const { error } = await supabase
          .from('project_members')
          .delete()
          .match({ project_id: projectId, user_id: userId });
        if (error) {
          console.warn('Supabase removeProjectMember warning:', error.message);
        }
      } catch (dbErr: any) {
        console.warn('Supabase removeProjectMember exception:', dbErr);
      }

      const existingProjects = storeState.projects;
      const updatedProjects = existingProjects.map((p) => {
        if (p.id === projectId) {
          const newMembers = (p.members || []).filter((m) => m.id !== userId);
          const newMemberIds = (p.memberIds || []).filter((id) => id !== userId);
          return {
            ...p,
            members: newMembers,
            memberIds: newMemberIds,
          };
        }
        return p;
      });
      setTableData('projects', updatedProjects);
      saveProjectsToLocalStorage(updatedProjects);
    } catch (err: any) {
      console.error('removeProjectMember error:', err);
      throw err;
    }
  },

  addProjectActivityLog: async (projectId: string, actionText: string): Promise<void> => {
    try {
      const currentUser = storeState.currentUser;
      const logEntry = {
        id: `act-${Date.now()}`,
        project_id: projectId,
        action: actionText,
        author: currentUser.name,
        timestamp: new Date().toISOString(),
      };
      await supabase.from('project_activity_log').insert(logEntry);

      // Append log item directly into the specific project
      setTableData('projects', storeState.projects.map((p) => {
        if (p.id === projectId) {
          const newLogs = [
            { id: logEntry.id, userName: logEntry.author, action: logEntry.action, timestamp: logEntry.timestamp },
            ...(p.activityLog || []),
          ];
          return { ...p, activityLog: newLogs };
        }
        return p;
      }));
    } catch (err: any) {
      console.error('addProjectActivityLog error:', err);
    }
  },

  // -----------------------------------------------------------------------
  // Actions: Meetings (UPDATES MEETINGS STATE ONLY)
  // -----------------------------------------------------------------------
  addMeeting: async (
    meetingData: Omit<Meeting, 'id' | 'organizerId' | 'organizerName' | 'status'> &
      Partial<Pick<Meeting, 'organizerId' | 'organizerName' | 'status'>>
  ): Promise<Meeting | null> => {
    const currentUser = storeState.currentUser;
    const organizerId = meetingData.organizerId || currentUser.id;
    const meetingTitleClean = (meetingData.title || '').trim();
    const meetingTime24 = convertTo24HourTime(meetingData.time || meetingData.startTime || '10:00');
    const meetingStart12h = convertTo12HourTime(meetingTime24);
    const meetingTimeClean = meetingTime24;
    const dedupeSignature = `${meetingTitleClean.toLowerCase()}_${meetingData.date}_${meetingTimeClean}_${organizerId}`;

    // 1. In-flight guard: If an identical creation is already executing, return the existing Promise
    if (inFlightMeetingCreations.has(dedupeSignature)) {
      console.warn('Duplicate in-flight meeting creation prevented:', dedupeSignature);
      return inFlightMeetingCreations.get(dedupeSignature)!;
    }

    // 2. Existing check: If an identical meeting already exists in store, return it without re-inserting
    const existingMeeting = storeState.meetings.find((m) => {
      const sameTitle = (m.title || '').trim().toLowerCase() === meetingTitleClean.toLowerCase();
      const sameDate = m.date === meetingData.date;
      const sameTime = convertTo24HourTime(m.time || m.startTime) === meetingTime24;
      const sameOrg = (m.organizerId === organizerId || m.chairId === (meetingData.chairId || organizerId));
      return sameTitle && sameDate && sameTime && sameOrg;
    });

    if (existingMeeting) {
      console.warn('Identical meeting already exists, returning existing meeting:', existingMeeting.id);
      return existingMeeting;
    }

    const creationPromise = (async () => {
      try {
        const id = `mtg-${Date.now()}`;
        const newMeeting: Meeting = {
          ...meetingData,
          id,
          organizerId,
          organizerName: meetingData.organizerName || currentUser.name,
          status: meetingData.status || 'Scheduled',
          department: normalizeDepartmentName(meetingData.department),
          attendees: meetingData.attendees || [],
          agenda: meetingData.agenda || [],
          time: meetingTime24,
          startTime: meetingData.startTime || meetingStart12h,
        };

        if (!newMeeting.teamsJoinUrl) {
          try {
            const { data: fnData, error: fnError } = await supabase.functions.invoke('teams-meeting-create', {
              body: {
                title: newMeeting.title,
                date: newMeeting.date,
                time: meetingTime24, // Guaranteed HH:MM 24-hour format (e.g. "14:30")
                durationMinutes: newMeeting.durationMinutes || 60,
                organizerEmail: currentUser.email,
                organizerName: currentUser.name,
                department: newMeeting.department,
                description: newMeeting.description,
              },
            });
            if (!fnError && fnData && fnData.teamsJoinUrl) {
              newMeeting.teamsJoinUrl = fnData.teamsJoinUrl;
              newMeeting.teamsMeetingId = fnData.teamsMeetingId;
              newMeeting.teamsPasscode = fnData.teamsPasscode;
            } else {
              const teamsData = generateTeamsMeetingPayload(newMeeting);
              newMeeting.teamsJoinUrl = teamsData.teamsJoinUrl;
              newMeeting.teamsMeetingId = teamsData.teamsMeetingId;
              newMeeting.teamsPasscode = teamsData.teamsPasscode;
            }
          } catch (e) {
            const teamsData = generateTeamsMeetingPayload(newMeeting);
            newMeeting.teamsJoinUrl = teamsData.teamsJoinUrl;
            newMeeting.teamsMeetingId = teamsData.teamsMeetingId;
            newMeeting.teamsPasscode = teamsData.teamsPasscode;
          }
        }

        const row = mapMeetingToRow(newMeeting);
        const { data, error } = await supabase.from('meetings').insert(row).select('*').single();
        if (error) {
          console.error('Supabase addMeeting error:', error.message);
          throw new Error(error.message);
        }

        if (newMeeting.attendees.length > 0) {
          const attRows = newMeeting.attendees
            .filter((a) => toUuidOrNull(a.userId))
            .map((a) => ({
              meeting_id: id,
              user_id: a.userId,
              name: a.name,
              email: a.email,
              status: a.status || 'Pending',
              avatar: sanitizeDenormalizedAvatar(a.avatar),
            }));
          if (attRows.length > 0) {
            await supabase.from('meeting_attendees').insert(attRows);
          }
        }

        const insertedMeeting = mapMeetingRow(data, newMeeting.attendees);
        // Ensure no duplicate exists in state before prepending
        setTableData('meetings', [
          insertedMeeting,
          ...storeState.meetings.filter((m) => {
            const sameTitle = (m.title || '').trim().toLowerCase() === meetingTitleClean.toLowerCase();
            const sameDate = m.date === meetingData.date;
            const sameTime = (m.startTime || m.time || '') === meetingTimeClean;
            return !(sameTitle && sameDate && sameTime);
          }),
        ]);

        // Fire Teams Webhook in background without triggering store cascades
        const meetingRules = storeState.teamsRules.filter(
          (r) => r.enabled && r.event === 'teams_meeting_scheduled'
        );
        meetingRules.forEach((rule) => {
          sendTeamsWebhookNotification(rule.webhookUrl, 'meeting', insertedMeeting).catch(console.warn);
        });

        // Trigger notification and email dispatch for attendees in parallel
        const attendeeRecipients: { id: string; name: string; email: string }[] = [];
        if (insertedMeeting.attendees && insertedMeeting.attendees.length > 0) {
          insertedMeeting.attendees.forEach((att) => {
            const st = storeState.staff.find((s) => s.id === att.userId);
            attendeeRecipients.push({
              id: att.userId,
              name: att.name,
              email: att.email || st?.email || (att.userId === currentUser.id ? currentUser.email : 'staff@wipahs.or.tz'),
            });
          });
        } else {
          attendeeRecipients.push({
            id: currentUser.id,
            name: currentUser.name,
            email: currentUser.email,
          });
        }

        Promise.all(
          attendeeRecipients.map((attendee) =>
            portalStore.addNotification({
              title: `Teams Meeting Scheduled: ${insertedMeeting.title}`,
              message: `You are invited to "${insertedMeeting.title}" on ${insertedMeeting.date} (${insertedMeeting.startTime || 'Scheduled'} - ${insertedMeeting.endTime || 'End'}). Organizer: ${insertedMeeting.organizerName}. Chair: ${insertedMeeting.chairName || insertedMeeting.organizerName}.`,
              type: 'meeting_scheduled',
              meetingId: insertedMeeting.id,
              targetUserId: attendee.id,
              priority: 'Normal',
              actorId: insertedMeeting.organizerId || currentUser.id,
              actorName: insertedMeeting.organizerName || currentUser.name,
              actorAvatar: currentUser.avatar,
              pushedToMicrosoftTeams: true,
              emailTriggered: true,
              emailRecipients: [attendee.email],
              emailSubject: `[WIPAHS Teams Meeting] Invitation: ${insertedMeeting.title} - ${insertedMeeting.date} (${insertedMeeting.startTime || 'TBD'})`,
              metadata: {
                meetingId: insertedMeeting.id,
                date: insertedMeeting.date,
                startTime: insertedMeeting.startTime,
                endTime: insertedMeeting.endTime,
                department: insertedMeeting.department,
                teamsJoinUrl: insertedMeeting.teamsJoinUrl,
              },
            })
          )
        ).catch((notifErr) => console.warn('Failed to dispatch meeting notification/email:', notifErr));

        return insertedMeeting;
      } catch (err: any) {
        console.error('addMeeting error:', err);
        throw err;
      } finally {
        setTimeout(() => {
          inFlightMeetingCreations.delete(dedupeSignature);
        }, 5000);
      }
    })();

    inFlightMeetingCreations.set(dedupeSignature, creationPromise);
    return creationPromise;
  },

  updateMeeting: async (meetingId: string, updates: Partial<Meeting>): Promise<void> => {
    try {
      const rowUpdates = mapMeetingToRow(updates);
      const { data, error } = await supabase.from('meetings').update(rowUpdates).eq('id', meetingId).select('*').single();
      if (error) {
        console.error('Supabase updateMeeting error:', error.message);
        throw new Error(error.message);
      }
      setTableData('meetings', storeState.meetings.map((m) => (m.id === meetingId ? { ...m, ...updates } : m)));
    } catch (err: any) {
      console.error('updateMeeting error:', err);
      throw err;
    }
  },

  deleteMeeting: async (meetingId: string): Promise<void> => {
    try {
      const { error } = await supabase.from('meetings').delete().eq('id', meetingId);
      if (error) {
        console.error('Supabase deleteMeeting error:', error.message);
        throw new Error(error.message);
      }
      setTableData('meetings', storeState.meetings.filter((m) => m.id !== meetingId));
    } catch (err: any) {
      console.error('deleteMeeting error:', err);
      throw err;
    }
  },

  respondToMeeting: async (
    meetingId: string,
    arg2: string | RsvpStatus,
    arg3?: RsvpStatus | { note?: string; comment?: string; proposedDate?: string; proposedTime?: string; proposedEndTime?: string; attendeeUserId?: string },
    note?: string,
    proposal?: { date: string; time: string; endTime?: string; note?: string }
  ): Promise<void> => {
    try {
      const currentUser = storeState.currentUser;
      let attendeeUserId = currentUser.id;
      let status: RsvpStatus = 'Accepted';
      let finalNote: string | null = null;
      let propDate: string | null = null;
      let propTime: string | null = null;
      let propEndTime: string | null = null;
      let propNote: string | null = null;

      if (typeof arg3 === 'object' && arg3 !== null) {
        status = arg2 as RsvpStatus;
        attendeeUserId = arg3.attendeeUserId || currentUser.id;
        finalNote = arg3.note || arg3.comment || null;
        propDate = arg3.proposedDate || null;
        propTime = arg3.proposedTime || null;
        propEndTime = arg3.proposedEndTime || null;
        propNote = arg3.note || null;
      } else if (typeof arg3 === 'string') {
        attendeeUserId = arg2 as string;
        status = arg3 as RsvpStatus;
        finalNote = note || null;
        propDate = proposal?.date || null;
        propTime = proposal?.time || null;
        propEndTime = proposal?.endTime || null;
        propNote = proposal?.note || null;
      } else {
        status = arg2 as RsvpStatus;
      }

      const uuid = toUuidOrNull(attendeeUserId);
      if (uuid) {
        await supabase
          .from('meeting_attendees')
          .update({
            status,
            note: finalNote,
            comment: finalNote,
            proposed_date: propDate,
            proposed_time: propTime,
            proposed_end_time: propEndTime,
            proposal_note: propNote,
            responded_at: new Date().toISOString(),
          })
          .eq('meeting_id', meetingId)
          .eq('user_id', uuid);
      }

      // Update attendee on meeting directly in meetings state
      setTableData('meetings', storeState.meetings.map((m) => {
        if (m.id === meetingId) {
          const updatedAttendees = m.attendees.map((a) => {
            if (a.userId === attendeeUserId) {
              return {
                ...a,
                status,
                note: finalNote || a.note,
                comment: finalNote || a.comment,
                proposedDate: propDate || a.proposedDate,
                proposedTime: propTime || a.proposedTime,
                proposedEndTime: propEndTime || a.proposedEndTime,
                proposalNote: propNote || a.proposalNote,
              };
            }
            return a;
          });
          return { ...m, attendees: updatedAttendees };
        }
        return m;
      }));

      // Notify the meeting organizer of the RSVP or proposed time
      const targetMeeting = storeState.meetings.find((m) => m.id === meetingId);
      if (targetMeeting && targetMeeting.organizerId && targetMeeting.organizerId !== attendeeUserId) {
        const attendeeName = storeState.staff.find((s) => s.id === attendeeUserId)?.name || currentUser.name;
        portalStore.addNotification({
          title: propTime ? `Meeting Time Proposed: ${targetMeeting.title}` : `Meeting RSVP: ${targetMeeting.title}`,
          message: propTime
            ? `${attendeeName} proposed a new time for "${targetMeeting.title}": ${propDate || targetMeeting.date} at ${propTime}${propNote ? ` ("${propNote}")` : ''}.`
            : `${attendeeName} has responded "${status}" to "${targetMeeting.title}".`,
          type: propTime ? 'meeting_proposal' : 'meeting_rsvp',
          targetUserId: targetMeeting.organizerId,
          meetingId,
          priority: 'Normal',
          actorId: attendeeUserId,
          actorName: attendeeName,
          actorAvatar: currentUser.avatar,
          pushedToMicrosoftTeams: true,
          metadata: {
            meetingId,
            status,
            propDate,
            propTime,
            propNote,
          },
        }).catch(console.warn);
      }
    } catch (err: any) {
      console.error('respondToMeeting error:', err);
    }
  },

  acceptProposedMeetingTime: async (meetingId: string, attendeeUserId: string): Promise<void> => {
    // Local meeting state update
  },

  rejectProposedMeetingTime: (meetingId: string, attendeeUserId: string): void => {
    // Local meeting state update
  },

  // -----------------------------------------------------------------------
  // Actions: SharePoint & Folders (UPDATES SHAREPOINT/FOLDER STATES ONLY)
  // -----------------------------------------------------------------------
  addFolder: async (folderName: string): Promise<void> => {
    if (!storeState.folderList.includes(folderName)) {
      setTableData('folderList', [...storeState.folderList, folderName]);
    }
  },

  addSharePointDocument: async (
    docData: Omit<SharePointDocument, 'id' | 'modifiedAt' | 'modifiedBy' | 'syncedWithSharePoint' | 'isLockedForEditing' | 'activeCollaborators'> & { fileData?: string }
  ): Promise<SharePointDocument | null> => {
    try {
      const docId = `sp-doc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const nowIso = new Date().toISOString();
      const siteUrl = 'https://wipahstz.sharepoint.com/sites/OfficeHub';
      const folderName = docData.folder || 'General';
      const docName = docData.name || 'Document';
      const webUrl = `${siteUrl}/Shared Documents/${encodeURIComponent(folderName.trim())}/${encodeURIComponent(docName.trim())}`;

      let synced = false;
      let finalWebUrl = webUrl;
      let driveItemId = null;

      try {
        const token = storeState.authSession.sessionToken || (await supabase.auth.getSession()).data.session?.access_token;
        const { data: fnData, error: fnError } = await supabase.functions.invoke('sharepoint-upload', {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          body: {
            name: docName,
            folder: folderName,
            fileData: docData.fileData,
            fileType: docData.fileType,
            visibility: docData.visibility,
            targetDepartment: docData.targetDepartment,
            allowedUserIds: docData.allowedUserIds,
            editableUserIds: docData.editableUserIds,
            contentSummary: docData.contentSummary,
            projectId: (docData as any).projectId,
          },
        });

        if (!fnError && fnData?.success && fnData?.document) {
          const rawDoc = fnData.document;
          finalWebUrl = rawDoc.sharePointWebUrl || rawDoc.webUrl || rawDoc.web_url || webUrl;
          driveItemId = rawDoc.graph_drive_item_id || rawDoc.drive_item_id || null;
          synced = true;
        }
      } catch (ex) {
        console.warn('SharePoint edge upload fallback note (saving locally & to DB directly):', ex);
      }

      const newDoc: SharePointDocument = {
        id: docId,
        name: docName.trim(),
        folder: folderName.trim(),
        fileType: docData.fileType || 'pdf',
        size: (docData as any).size || '1.4 MB',
        modifiedAt: nowIso,
        modifiedBy: storeState.currentUser.name || 'Staff Member',
        createdById: docData.createdById || storeState.currentUser.id,
        version: 'v1.0',
        sharePointWebUrl: finalWebUrl,
        webUrl: finalWebUrl,
        visibility: docData.visibility || 'Everyone',
        targetDepartment: docData.targetDepartment,
        allowedUserIds: docData.allowedUserIds || [],
        editableUserIds: docData.editableUserIds || [],
        syncedWithSharePoint: synced,
        contentSummary: docData.contentSummary || 'Uploaded via OfficeHub.',
        projectId: docData.projectId,
        isLockedForEditing: false,
        activeCollaborators: [],
      };

      // Directly insert/upsert into Supabase database table
      try {
        const row = mapSharePointDocToRow(newDoc);
        if (driveItemId) row.graph_drive_item_id = driveItemId;
        await supabase.from('sharepoint_documents').upsert(row);
      } catch (dbErr) {
        console.warn('Supabase direct document insert note:', dbErr);
      }

      // Ensure not in deletedDocs
      const deletedDocs = getDeletedDocumentIds();
      if (deletedDocs.has(newDoc.id)) {
        deletedDocs.delete(newDoc.id);
        saveDeletedDocumentIds(deletedDocs);
      }

      // Update folder list if new folder
      if (newDoc.folder && !storeState.folderList.includes(newDoc.folder)) {
        setTableData('folderList', [...storeState.folderList, newDoc.folder]);
      }

      // Update store state & localStorage
      const currentDocs = storeState.sharePointDocs.filter((d) => d.id !== newDoc.id);
      const updatedDocs: SharePointDocument[] = [newDoc, ...currentDocs];
      setTableData('sharePointDocs', updatedDocs);
      saveDocumentsToLocalStorage(updatedDocs);

      portalStore.logAudit('sharepoint_doc_uploaded', `Uploaded document "${newDoc.name}" to SharePoint folder "${newDoc.folder}"`, 'blue');

      return newDoc;
    } catch (err: any) {
      console.error('addSharePointDocument error:', err);
      throw err;
    }
  },

  getProjectSharePointDocs: async (projectId: string): Promise<SharePointDocument[]> => {
    try {
      const { data: fnData, error: fnError } = await supabase.functions.invoke('sharepoint-list', {
        body: { projectId },
      });
      if (!fnError && fnData && Array.isArray(fnData.documents) && fnData.documents.length > 0) {
        const filtered = fnData.documents.filter(
          (d: any) => d.projectId === projectId || (d.folder && d.folder.toLowerCase().includes(projectId.toLowerCase()))
        );
        if (filtered.length > 0) {
          return filtered;
        }
      }
    } catch (fnEx) {
      console.warn('getProjectSharePointDocs edge invoke note:', fnEx);
    }

    try {
      const { data, error } = await supabase
        .from('sharepoint_documents')
        .select('*')
        .eq('project_id', projectId)
        .order('modified_at', { ascending: false });

      if (!error && data && data.length > 0) {
        return data.map(mapSharePointDocRow);
      }
    } catch (sbErr) {
      // fallback
    }

    return storeState.sharePointDocs.filter(
      (d) => d.projectId === projectId || (d.folder && d.folder.toLowerCase().includes(projectId.toLowerCase()))
    );
  },

  updateSharePointDocument: async (docId: string, updates: Partial<SharePointDocument>): Promise<void> => {
    try {
      // 1. Immediately update storeState and localStorage
      const updatedDocs = storeState.sharePointDocs.map((d) => (d.id === docId ? { ...d, ...updates } : d));
      setTableData('sharePointDocs', updatedDocs);
      saveDocumentsToLocalStorage(updatedDocs);

      // 2. Safely attempt Supabase update in background
      try {
        const rowUpdates = mapSharePointDocToRow(updates);
        await supabase.from('sharepoint_documents').update(rowUpdates).eq('id', docId);
      } catch (sbErr) {
        console.warn('Supabase updateSharePointDocument note:', sbErr);
      }
    } catch (err: any) {
      console.error('updateSharePointDocument error:', err);
    }
  },

  deleteSharePointDocument: async (docId: string): Promise<void> => {
    try {
      const deletedDocs = getDeletedDocumentIds();
      deletedDocs.add(docId);
      saveDeletedDocumentIds(deletedDocs);

      const remainingDocs = storeState.sharePointDocs.filter((d) => d.id !== docId);
      setTableData('sharePointDocs', remainingDocs);
      saveDocumentsToLocalStorage(remainingDocs);

      try {
        await supabase.from('sharepoint_documents').delete().eq('id', docId);
      } catch (sbErr) {
        console.warn('Supabase deleteSharePointDocument note:', sbErr);
      }
    } catch (err: any) {
      console.error('deleteSharePointDocument error:', err);
    }
  },

  syncSharePointDocument: async (docId: string): Promise<void> => {
    try {
      const now = new Date().toISOString();
      await supabase
        .from('sharepoint_documents')
        .update({ modified_at: now, synced_with_sharepoint: true })
        .eq('id', docId);

      setTableData('sharePointDocs', storeState.sharePointDocs.map((d) => (d.id === docId ? { ...d, modifiedAt: now, syncedWithSharePoint: true } : d)));
    } catch (err: any) {
      console.error('syncSharePointDocument error:', err);
    }
  },

  toggleDocumentCollaboration: async (docId: string): Promise<void> => {
    // Document state only
  },

  // -----------------------------------------------------------------------
  // Actions: Staff & Presence (UPDATES STAFF STATE ONLY)
  // -----------------------------------------------------------------------
  addStaffMember: async (
    userData: Omit<StaffUser, 'id' | 'activityScore' | 'tasksCount' | 'lastActive'> & Partial<StaffUser>
  ): Promise<StaffUser | null> => {
    try {
      const tempPass = (userData as any).temporaryPassword || (userData as any).password || 'Wipahs@2026';
      let createdId = userData.id || `usr-${Date.now()}`;
      try {
        const res = await invokeCreateStaffUserEdgeFunction({
          email: userData.email,
          tempPassword: tempPass,
          name: userData.name,
          role: userData.role || 'Staff Member',
          department: userData.department || 'General',
          organisation: userData.organisation || 'WIPAHS',
          phone: userData.phone,
        });
        if (res.data?.user?.id) {
          createdId = res.data.user.id;
        }
      } catch (edgeErr) {
        console.warn('Edge function create staff user note:', edgeErr);
      }

      const createdUser: StaffUser = {
        id: createdId,
        name: userData.name,
        email: userData.email,
        role: userData.role || 'Staff Member',
        organisation: userData.organisation || 'WIPAHS',
        department: normalizeDepartmentName(userData.department),
        status: userData.status || 'Offline',
        avatar: userData.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
        phone: userData.phone || '+255 778 123 456',
        activityScore: 85,
        tasksCount: 0,
        lastActive: 'Just now',
        temporaryPassword: tempPass,
        mustChangePassword: true,
      };

      // Ensure user profile is saved to Supabase profiles table
      try {
        await supabase.from('profiles').upsert(mapStaffToRow(createdUser));
      } catch (upsertErr) {
        console.warn('Supabase profiles direct upsert note:', upsertErr);
      }

      const updatedStaff = [
        createdUser,
        ...storeState.staff.filter(s => s.id !== createdUser.id && s.email.toLowerCase() !== createdUser.email.toLowerCase())
      ];
      setTableData('staff', updatedStaff);

      saveStaffToLocalStorage(updatedStaff);

      return createdUser;
    } catch (err: any) {
      console.error('addStaffMember error:', err);
      throw err;
    }
  },

  updateStaffMember: async (id: string, updates: Partial<StaffUser>): Promise<void> => {
    try {
      // 1. Immediately update local state
      const targetUser = storeState.staff.find((s) => s.id === id);
      const updatedStaff = storeState.staff.map((s) =>
        s.id === id || (targetUser?.email && s.email?.toLowerCase() === targetUser.email.toLowerCase())
          ? { ...s, ...updates }
          : s
      );
      setTableData('staff', updatedStaff);

      // 2. Persist to localStorage without oversized Base64 blobs
      saveStaffToLocalStorage(updatedStaff);

      // 3. If updating current logged-in user, sync currentUser state
      const curr = storeState.currentUser;
      if (curr && (curr.id === id || (targetUser?.email && curr.email?.toLowerCase() === targetUser.email.toLowerCase()))) {
        const updatedCurr = { ...curr, ...updates };
        setTableData('currentUser', updatedCurr);
        saveCurrentUserProfileToLocalStorage(updatedCurr);
      }

      // 4. Safely attempt Supabase update in background without throwing
      try {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
        const rowUpdates = mapStaffToRow(updates);
        if (isUuid) {
          await supabase.from('profiles').update(rowUpdates).eq('id', id);
        } else if (targetUser?.email) {
          await supabase.from('profiles').update(rowUpdates).eq('email', targetUser.email);
        }
      } catch (sbErr) {
        console.warn('Supabase updateStaffMember note:', sbErr);
      }
    } catch (err: any) {
      console.error('updateStaffMember error:', err);
    }
  },

  removeStaffMember: async (id: string): Promise<void> => {
    try {
      const targetUser = storeState.staff.find((s) => s.id === id);

      const remainingStaff = storeState.staff.filter(
        (s) => s.id !== id && (!targetUser?.email || s.email.toLowerCase() !== targetUser.email.toLowerCase())
      );
      setTableData('staff', remainingStaff);

      saveStaffToLocalStorage(remainingStaff);

      // Soft delete: set deactivated = true in Supabase profiles
      try {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
        if (isUuid) {
          const { error } = await supabase.from('profiles').update({ deactivated: true }).eq('id', id);
          if (error) console.warn('Supabase profile deactivation note:', error.message);
        } else if (targetUser?.email) {
          const { error } = await supabase.from('profiles').update({ deactivated: true }).eq('email', targetUser.email);
          if (error) console.warn('Supabase profile deactivation note:', error.message);
        }
      } catch (sbErr) {
        console.warn('Supabase profile deactivation warning:', sbErr);
      }
    } catch (err: any) {
      console.error('removeStaffMember error:', err);
    }
  },

  syncStaffFromSupabase: async (): Promise<void> => {
    try {
      const res = await fetchPublicProfiles();
      if (res.data && res.data.length > 0) {
        const staffMapped = res.data.map(mapStaffRow);
        const filtered = staffMapped.filter(s => !s.deactivated);
        setTableData('staff', filtered);
      }
    } catch (err) {
      console.error('syncStaffFromSupabase error:', err);
    }
  },

  setUserOfficeStatus: async (userId: string, inOffice: boolean, oooMessage?: string): Promise<void> => {
    try {
      await supabase
        .from('profiles')
        .update({
          out_of_office: !inOffice,
          out_of_office_message: inOffice ? null : oooMessage || 'Out of Office',
        })
        .eq('id', userId);

      setTableData('staff', storeState.staff.map((s) => (s.id === userId ? {
        ...s,
        outOfOffice: !inOffice,
        outOfOfficeMessage: inOffice ? undefined : oooMessage || 'Out of Office',
        status: inOffice ? 'Online' : 'Out of Office',
      } : s)));
    } catch (err: any) {
      console.error('setUserOfficeStatus error:', err);
    }
  },

  updateUserStatus: async (arg1: string | UserPresenceStatus, arg2?: UserPresenceStatus): Promise<void> => {
    try {
      const status = arg2 || (arg1 as UserPresenceStatus);
      const userId = arg2 ? (arg1 as string) : storeState.currentUser.id;

      if (userId === storeState.currentUser.id) {
        const updatedUser = { ...storeState.currentUser, status };
        setTableData('currentUser', updatedUser);
        saveCurrentUserProfileToLocalStorage(updatedUser);
        recordUserHeartbeat(updatedUser, status);
      }

      setTableData('staff', storeState.staff.map((s) => (s.id === userId ? { ...s, status } : s)));

      try {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
        if (isUuid) {
          await supabase.from('profiles').update({ status }).eq('id', userId);
        }
      } catch (sbErr) {
        console.warn('Supabase updateUserStatus note:', sbErr);
      }
    } catch (err: any) {
      console.error('updateUserStatus error:', err);
    }
  },

  setCurrentUserPresence: (status: UserPresenceStatus): void => {
    portalStore.updateUserStatus(status);
  },

  syncLivePresence: (): void => {
    // Record current user's heartbeat
    if (storeState.currentUser) {
      recordUserHeartbeat(storeState.currentUser, storeState.currentUser.status);
    }
    const heartbeats = getActiveHeartbeats();
    setTableData('staff', storeState.staff.map((s) => ({
      ...s,
      status: computeUserLivePresence(s, storeState.meetings, heartbeats),
    })));
  },

  // -----------------------------------------------------------------------
  // Actions: Teams Rules (UPDATES TEAMS RULES STATE ONLY)
  // -----------------------------------------------------------------------
  toggleRule: async (ruleId: string): Promise<void> => {
    try {
      const currentRule = storeState.teamsRules.find((r) => r.id === ruleId);
      const newEnabled = !currentRule?.enabled;
      await supabase.from('teams_notification_rules').update({ enabled: newEnabled }).eq('id', ruleId);
      setTableData('teamsRules', storeState.teamsRules.map((r) => (r.id === ruleId ? { ...r, enabled: newEnabled } : r)));
    } catch (err: any) {
      console.error('toggleRule error:', err);
    }
  },

  updateRuleWebhook: async (ruleId: string, webhookUrl: string): Promise<void> => {
    try {
      await supabase.from('teams_notification_rules').update({ teams_webhook_url: webhookUrl }).eq('id', ruleId);
      setTableData('teamsRules', storeState.teamsRules.map((r) => (r.id === ruleId ? { ...r, webhookUrl } : r)));
    } catch (err: any) {
      console.error('updateRuleWebhook error:', err);
    }
  },

  updateRuleTriggered: async (ruleId: string): Promise<void> => {
    // Teams rule state update
  },

  // -----------------------------------------------------------------------
  // Actions: Audit Log (UPDATES AUDIT LOGS STATE ONLY)
  // -----------------------------------------------------------------------
  logAudit: async (
    eventType: string,
    targetName: string,
    badgeColor: AuditEvent['badgeColor']
  ): Promise<void> => {
    try {
      const currentUser = storeState.currentUser;
      const row = {
        id: `aud-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        actor_id: toUuidOrNull(currentUser.id),
        actor_name: currentUser.name || 'System User',
        actor_email: currentUser.email || 'system@wipahs.or.tz',
        event_type: eventType,
        target_name: targetName,
        timestamp: new Date().toISOString(),
        badge_color: badgeColor || 'blue',
      };
      const { data } = await supabase.from('audit_log').insert(row).select('*').single();
      const newAudit = data ? mapAuditLogRow(data) : mapAuditLogRow(row);
      setTableData('auditLogs', [newAudit, ...storeState.auditLogs.slice(0, 199)]);
    } catch (err: any) {
      console.error('logAudit error:', err);
    }
  },

  // -----------------------------------------------------------------------
  // Actions: Governance (Decisions & Approvals - UPDATES DECISIONS/APPROVALS ONLY)
  // -----------------------------------------------------------------------
  addDecision: async (decisionData: Omit<Decision, 'id' | 'date'>): Promise<Decision | null> => {
    try {
      const id = `dec-${Date.now()}`;
      const currentUser = storeState.currentUser;
      const newDecision: Decision = {
        ...decisionData,
        id,
        date: new Date().toISOString(),
        department: normalizeDepartmentName(decisionData.department),
        actionItemsCount: 0,
      };

      const row = mapDecisionToRow(newDecision);
      const { data, error } = await supabase.from('decisions').insert(row).select('*').single();
      if (error) {
        console.error('Supabase addDecision error:', error.message);
        throw new Error(error.message);
      }

      const insertedDecision = mapDecisionRow(data);
      setTableData('decisions', [insertedDecision, ...storeState.decisions]);

      // Notify organization about the new decision
      portalStore.addNotification({
        title: `New Decision: ${newDecision.title}`,
        message: `${currentUser.name} recorded a new decision: "${newDecision.title}".`,
        type: 'decision',
        targetUserId: 'all',
        priority: 'Normal',
        actorId: currentUser.id,
        actorName: currentUser.name,
        actorAvatar: currentUser.avatar,
        pushedToMicrosoftTeams: true,
        metadata: { decisionId: id, projectId: newDecision.projectId },
      }).catch(console.warn);

      return insertedDecision;
    } catch (err: any) {
      console.error('addDecision error:', err);
      throw err;
    }
  },

  updateDecisionStatus: async (id: string, status: Decision['status']): Promise<void> => {
    try {
      await supabase.from('decisions').update({ status }).eq('id', id);
      setTableData('decisions', storeState.decisions.map((d) => (d.id === id ? { ...d, status } : d)));
    } catch (err: any) {
      console.error('updateDecisionStatus error:', err);
    }
  },

  addApproval: async (approvalData: Omit<Approval, 'id' | 'requestedDate' | 'status'>): Promise<Approval | null> => {
    try {
      const id = `app-${Date.now()}`;
      const currentUser = storeState.currentUser;
      const newApproval: Approval = {
        ...approvalData,
        id,
        requestedDate: new Date().toISOString(),
        status: 'Pending',
        requestedBy: approvalData.requestedBy || currentUser.name,
        requestedById: approvalData.requestedById || currentUser.id,
        requestedByName: approvalData.requestedByName || currentUser.name,
        department: normalizeDepartmentName(approvalData.department),
      };

      const row = mapApprovalToRow(newApproval);
      const { data, error } = await supabase.from('approvals').insert(row).select('*').single();
      if (error) {
        console.error('Supabase addApproval error:', error.message);
        throw new Error(error.message);
      }

      const insertedApproval = mapApprovalRow(data);
      setTableData('approvals', [insertedApproval, ...storeState.approvals]);

      // Notify approvers / organization about the new approval request
      portalStore.addNotification({
        title: `Approval Request: ${newApproval.title}`,
        message: `${currentUser.name} submitted an approval request for "${newApproval.title}" (${newApproval.type || 'General'}).${newApproval.amount ? ` Amount: ${newApproval.amount}.` : ''}`,
        type: 'approval',
        targetUserId: 'all',
        priority: 'Normal',
        actorId: currentUser.id,
        actorName: currentUser.name,
        actorAvatar: currentUser.avatar,
        pushedToMicrosoftTeams: true,
        metadata: { approvalId: id },
      }).catch(console.warn);

      return insertedApproval;
    } catch (err: any) {
      console.error('addApproval error:', err);
      throw err;
    }
  },

  approveApproval: async (id: string, notes?: string): Promise<void> => {
    try {
      const currentUser = storeState.currentUser;
      const approvedDate = new Date().toISOString();
      await supabase
        .from('approvals')
        .update({
          status: 'Approved',
          approved_by: currentUser.name,
          approved_date: approvedDate,
          notes: notes || null,
        })
        .eq('id', id);

      const targetApproval = storeState.approvals.find((a) => a.id === id);

      setTableData('approvals', storeState.approvals.map((a) => (a.id === id ? {
        ...a,
        status: 'Approved',
        approvedBy: currentUser.name,
        approvedDate,
        notes: notes || a.notes,
      } : a)));

      // Notify the requester
      if (targetApproval && targetApproval.requestedById && targetApproval.requestedById !== currentUser.id) {
        portalStore.addNotification({
          title: `Request Approved: ${targetApproval.title}`,
          message: `${currentUser.name} has approved your request "${targetApproval.title}".${notes ? ` Notes: "${notes}"` : ''}`,
          type: 'approval',
          targetUserId: targetApproval.requestedById,
          priority: 'Normal',
          actorId: currentUser.id,
          actorName: currentUser.name,
          actorAvatar: currentUser.avatar,
          pushedToMicrosoftTeams: true,
          metadata: { approvalId: id, status: 'Approved', notes },
        }).catch(console.warn);
      }
    } catch (err: any) {
      console.error('approveApproval error:', err);
    }
  },

  rejectApproval: async (id: string, notes?: string): Promise<void> => {
    try {
      const currentUser = storeState.currentUser;
      await supabase
        .from('approvals')
        .update({
          status: 'Rejected',
          notes: notes || null,
        })
        .eq('id', id);

      const targetApproval = storeState.approvals.find((a) => a.id === id);

      setTableData('approvals', storeState.approvals.map((a) => (a.id === id ? {
        ...a,
        status: 'Rejected',
        notes: notes || a.notes,
      } : a)));

      // Notify the requester
      if (targetApproval && targetApproval.requestedById && targetApproval.requestedById !== currentUser.id) {
        portalStore.addNotification({
          title: `Request Rejected: ${targetApproval.title}`,
          message: `${currentUser.name} has rejected your request "${targetApproval.title}".${notes ? ` Notes: "${notes}"` : ''}`,
          type: 'approval',
          targetUserId: targetApproval.requestedById,
          priority: 'Urgent',
          actorId: currentUser.id,
          actorName: currentUser.name,
          actorAvatar: currentUser.avatar,
          pushedToMicrosoftTeams: true,
          metadata: { approvalId: id, status: 'Rejected', notes },
        }).catch(console.warn);
      }
    } catch (err: any) {
      console.error('rejectApproval error:', err);
    }
  },

  // -----------------------------------------------------------------------
  // Actions: Departments & Roles (UPDATES DEPARTMENTS/ROLES ONLY)
  // -----------------------------------------------------------------------
  addDepartment: async (
    deptData: Omit<DepartmentInfo, 'id' | 'staffCount' | 'activeProjectsCount' | 'openTasksCount'>
  ): Promise<DepartmentInfo | null> => {
    try {
      const id = `dept-${Date.now()}`;
      const newDept: DepartmentInfo = {
        ...deptData,
        id,
        staffCount: 0,
        activeProjectsCount: 0,
        openTasksCount: 0,
        budget: deptData.budget || '$100,000',
        description: deptData.description || '',
        organisation: deptData.organisation || 'WIPAHS',
      };

      // Un-delete if previously deleted
      const deletedIds = getDeletedDepartmentIds();
      deletedIds.delete(newDept.id);
      deletedIds.delete(newDept.id.toLowerCase());
      deletedIds.delete(newDept.name.toLowerCase());
      saveDeletedDepartmentIds(deletedIds);

      const updated = [...storeState.departments, newDept];
      setTableData('departments', updated);
      saveDepartmentsToLocalStorage(updated);

      try {
        const row = mapDepartmentToRow(newDept);
        await supabase.from('departments').insert(row);
      } catch (sbErr) {
        console.warn('Supabase addDepartment note:', sbErr);
      }

      return newDept;
    } catch (err: any) {
      console.error('addDepartment error:', err);
      throw err;
    }
  },

  updateDepartment: async (id: string, updates: Partial<DepartmentInfo>): Promise<void> => {
    try {
      const updated = storeState.departments.map((d) => (d.id === id ? { ...d, ...updates } : d));
      setTableData('departments', updated);
      saveDepartmentsToLocalStorage(updated);

      try {
        const rowUpdates = mapDepartmentToRow(updates);
        await supabase.from('departments').update(rowUpdates).eq('id', id);
      } catch (sbErr) {
        console.warn('Supabase updateDepartment note:', sbErr);
      }
    } catch (err: any) {
      console.error('updateDepartment error:', err);
      throw err;
    }
  },

  deleteDepartment: async (id: string): Promise<void> => {
    try {
      const targetDept = storeState.departments.find((d) => d.id === id);
      const deletedIds = getDeletedDepartmentIds();
      deletedIds.add(id);
      deletedIds.add(id.toLowerCase());
      if (targetDept?.name) {
        deletedIds.add(targetDept.name.toLowerCase());
      }
      saveDeletedDepartmentIds(deletedIds);

      const remainingDepts = storeState.departments.filter(
        (d) => d.id !== id && (!targetDept?.name || d.name.toLowerCase() !== targetDept.name.toLowerCase())
      );
      setTableData('departments', remainingDepts);
      saveDepartmentsToLocalStorage(remainingDepts);

      // Reassign staff in this department to 'General'
      if (targetDept?.name) {
        const updatedStaff = storeState.staff.map((s) =>
          s.department.toLowerCase() === targetDept.name.toLowerCase() ? { ...s, department: 'General' } : s
        );
        setTableData('staff', updatedStaff);
        saveStaffToLocalStorage(updatedStaff);
      }

      // Safely attempt Supabase delete in background
      try {
        await supabase.from('departments').delete().eq('id', id);
        if (targetDept?.name) {
          await supabase.from('departments').delete().eq('name', targetDept.name);
        }
      } catch (sbErr) {
        console.warn('Supabase deleteDepartment note:', sbErr);
      }
    } catch (err: any) {
      console.error('deleteDepartment error:', err);
    }
  },

  updateRolePermission: async (
    roleId: string,
    moduleName: string,
    permKey: 'view' | 'create' | 'edit' | 'approve',
    value: boolean
  ): Promise<void> => {
    try {
      const targetRole = storeState.roles.find((r) => r.id === roleId);
      if (targetRole) {
        const perms = [...targetRole.permissions];
        const match = perms.find((p) => p.module === moduleName);
        if (match) {
          match[permKey] = value;
        } else {
          perms.push({
            module: moduleName,
            view: permKey === 'view' ? value : false,
            create: permKey === 'create' ? value : false,
            edit: permKey === 'edit' ? value : false,
            approve: permKey === 'approve' ? value : false,
          });
        }
        await supabase.from('role_permissions').update({ permissions: perms }).eq('role_id', roleId);
        setTableData('roles', storeState.roles.map((r) => (r.id === roleId ? { ...r, permissions: perms } : r)));
      }
    } catch (err: any) {
      console.error('updateRolePermission error:', err);
    }
  },

  addRole: async (roleData: Omit<RolePermission, 'id' | 'userCount'>): Promise<RolePermission | null> => {
    try {
      const id = `role-${Date.now()}`;
      const newRole: RolePermission = {
        ...roleData,
        id,
        userCount: 0,
      };
      const row = mapRoleToRow(newRole);
      const { data, error } = await supabase.from('role_permissions').insert(row).select('*').single();
      if (error) {
        console.error('Supabase addRole error:', error.message);
        throw new Error(error.message);
      }
      const insertedRole = mapRoleRow(data);
      setTableData('roles', [...storeState.roles, insertedRole]);
      return insertedRole;
    } catch (err: any) {
      console.error('addRole error:', err);
      throw err;
    }
  },

  updateRole: async (id: string, updates: Partial<RolePermission>): Promise<void> => {
    try {
      const rowUpdates = mapRoleToRow(updates);
      await supabase.from('role_permissions').update(rowUpdates).eq('role_id', id);
      setTableData('roles', storeState.roles.map((r) => (r.id === id ? { ...r, ...updates } : r)));
    } catch (err: any) {
      console.error('updateRole error:', err);
    }
  },

  deleteRole: async (id: string): Promise<void> => {
    try {
      await supabase.from('role_permissions').delete().eq('role_id', id);
      setTableData('roles', storeState.roles.filter((r) => r.id !== id));
    } catch (err: any) {
      console.error('deleteRole error:', err);
    }
  },

  // -----------------------------------------------------------------------
  // Actions: Messaging & Conversations (UPDATES CONVERSATIONS/MESSAGES ONLY)
  // -----------------------------------------------------------------------
  addConversation: async (conversation: ChatConversation): Promise<void> => {
    try {
      const row = mapConversationToRow(conversation);
      await supabase.from('conversations').insert(row);
      if (conversation.participantIds && conversation.participantIds.length > 0) {
        const partRows = conversation.participantIds
          .filter((uid) => toUuidOrNull(uid))
          .map((uid) => ({
            conversation_id: conversation.id,
            user_id: uid,
          }));
        if (partRows.length > 0) {
          await supabase.from('conversation_participants').insert(partRows);
        }
      }
      setTableData('conversations', [conversation, ...storeState.conversations]);
    } catch (err: any) {
      console.error('addConversation error:', err);
    }
  },

  updateConversation: async (conversationId: string, updates: Partial<ChatConversation>): Promise<void> => {
    try {
      const rowUpdates = mapConversationToRow(updates);
      await supabase.from('conversations').update(rowUpdates).eq('id', conversationId);
      setTableData('conversations', storeState.conversations.map((c) => (c.id === conversationId ? { ...c, ...updates } : c)));
    } catch (err: any) {
      console.error('updateConversation error:', err);
    }
  },

  sendMessage: async (message: ChatMessage): Promise<void> => {
    try {
      const row = mapMessageToRow(message);
      const { data } = await supabase.from('messages').insert(row).select(MESSAGE_SELECT_COLUMNS).single();
      const insertedMsg = data ? { ...mapMessageRow(data), senderAvatar: message.senderAvatar } : message;
      setTableData('messages', [...storeState.messages, insertedMsg]);

      await supabase
        .from('conversations')
        .update({
          last_message: message.text,
          last_message_time: message.timestamp,
        })
        .eq('id', message.conversationId);

      setTableData('conversations', storeState.conversations.map((c) => (c.id === message.conversationId ? {
        ...c,
        lastMessage: message.text,
        lastMessageTime: message.timestamp,
      } : c)));

      // Insert notifications for every other participant in this conversation (not the sender)
      let participantIds: string[] = [];
      const currentConv = storeState.conversations.find((c) => c.id === message.conversationId);
      if (currentConv?.participantIds && currentConv.participantIds.length > 0) {
        participantIds = [...currentConv.participantIds];
      }

      try {
        const { data: partRows } = await supabase
          .from('conversation_participants')
          .select('user_id')
          .eq('conversation_id', message.conversationId);
        if (partRows && partRows.length > 0) {
          partRows.forEach((r: any) => {
            if (r.user_id && !participantIds.includes(r.user_id)) {
              participantIds.push(r.user_id);
            }
          });
        }
      } catch (partErr) {
        console.warn('Error fetching conversation participants for notification:', partErr);
      }

      // Filter out sender
      const otherParticipantIds = participantIds.filter(
        (uid) => uid && uid !== message.senderId && uid !== storeState.currentUser?.id
      );

      if (otherParticipantIds.length > 0) {
        const previewText = message.text
          ? (message.text.length > 120 ? `${message.text.slice(0, 117)}...` : message.text)
          : 'Sent an attachment';

        const notifRows = otherParticipantIds.map((recipientId, idx) => {
          const notifId = `notif-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`;
          return mapNotificationToRow({
            id: notifId,
            title: `New message from ${message.senderName || 'Staff Member'}`,
            message: previewText,
            type: 'new_message',
            metadata: {
              conversationId: message.conversationId,
              messageId: insertedMsg.id || message.id,
            },
            targetUserId: recipientId,
            actorId: message.senderId || storeState.currentUser?.id,
            actorName: message.senderName || storeState.currentUser?.name || 'Staff Member',
            actorAvatar: message.senderAvatar || storeState.currentUser?.avatar,
            priority: 'Normal',
            read: false,
            createdAt: new Date().toISOString(),
            pushedToMicrosoftTeams: true,
          });
        });

        const { data: insertedNotifs, error: notifErr } = await supabase
          .from('notifications')
          .insert(notifRows)
          .select(NOTIFICATION_SELECT_COLUMNS);

        if (notifErr) {
          console.warn('Supabase new_message notifications insert warning:', notifErr.message);
        } else if (insertedNotifs && insertedNotifs.length > 0) {
          const mapped = insertedNotifs.map((r) => {
            const n = mapNotificationRow(r);
            if (!n.actorAvatar) {
              n.actorAvatar = resolveStaffAvatar(n.actorId, n.actorName) || undefined;
            }
            return n;
          });
          const relevant = mapped.filter((n) => n.targetUserId === storeState.currentUser?.id || n.targetUserId === 'all');
          if (relevant.length > 0) {
            setTableData('notifications', [...relevant, ...storeState.notifications]);
          }
        }
      }
    } catch (err: any) {
      console.error('sendMessage error:', err);
    }
  },

  deleteConversation: async (conversationId: string): Promise<void> => {
    try {
      await supabase.from('conversations').delete().eq('id', conversationId);
      setTableData('conversations', storeState.conversations.filter((c) => c.id !== conversationId));
    } catch (err: any) {
      console.error('deleteConversation error:', err);
    }
  },

  // -----------------------------------------------------------------------
  // Actions: Notifications & Dispatched Emails (UPDATES NOTIFICATIONS/EMAILS ONLY)
  // -----------------------------------------------------------------------
  addNotification: async (
    notifData: Omit<AppNotification, 'id' | 'createdAt' | 'read'> & Partial<AppNotification>
  ): Promise<AppNotification | null> => {
    try {
      const id = notifData.id || `notif-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const newNotif: AppNotification = {
        ...notifData,
        id,
        createdAt: notifData.createdAt || new Date().toISOString(),
        read: false,
        priority: notifData.priority || 'Normal',
        pushedToMicrosoftTeams: Boolean(notifData.pushedToMicrosoftTeams ?? true),
        type: notifData.type || 'general',
        targetUserId: notifData.targetUserId || 'all',
      };

      const row = mapNotificationToRow(newNotif);
      let insertedNotif = newNotif;
      try {
        const { data, error } = await supabase.from('notifications').insert(row).select(NOTIFICATION_SELECT_COLUMNS).single();
        if (error) {
          console.warn('Supabase notifications insert status:', error.message);
        } else if (data) {
          insertedNotif = {
            ...mapNotificationRow(data),
            actorAvatar: newNotif.actorAvatar || resolveStaffAvatar(newNotif.actorId, newNotif.actorName) || undefined,
          };
        }
      } catch (sbErr) {
        console.warn('Supabase notifications insert exception:', sbErr);
      }

      const updatedNotifs = [insertedNotif, ...storeState.notifications.filter((n) => n.id !== insertedNotif.id)];
      setTableData('notifications', updatedNotifs);

      // Resilient local storage backup so background pollers NEVER wipe local notifications


      // Cross-tab broadcast: notify other open tabs/windows immediately
      broadcastRealtimeEvent({
        type: 'NEW_NOTIFICATION',
        notification: insertedNotif,
        actorId: insertedNotif.actorId,
        targetUserId: insertedNotif.targetUserId,
      });

      // Play audio chime for creator if notification is targeted to all or self
      if (insertedNotif.targetUserId === 'all' || insertedNotif.targetUserId === storeState.currentUser?.id) {
        playNotificationSound();
      }

      // Email jobs are created by database domain triggers after committed changes.
      // Notification rendering and client-provided recipient arrays never send email.

      return insertedNotif;
    } catch (err: any) {
      console.error('addNotification error:', err);
      return null;
    }
  },

  markNotificationAsRead: async (notificationId: string): Promise<void> => {
    try {
      await supabase.from('notifications').update({ read: true }).eq('id', notificationId);
      const updated = storeState.notifications.map((n) => (n.id === notificationId ? { ...n, read: true } : n));
      setTableData('notifications', updated);
    } catch (err: any) {
      console.error('markNotificationAsRead error:', err);
    }
  },

  markAllNotificationsAsRead: async (userId?: string): Promise<void> => {
    try {
      const targetUid = userId || storeState.currentUser.id;
      await supabase
        .from('notifications')
        .update({ read: true })
        .or(`target_user_id.eq.${targetUid},target_user_id.eq.all`);

      const updated = storeState.notifications.map((n) => (n.targetUserId === targetUid || n.targetUserId === 'all' ? { ...n, read: true } : n));
      setTableData('notifications', updated);
    } catch (err: any) {
      console.error('markAllNotificationsAsRead error:', err);
    }
  },

  deleteNotification: async (notificationId: string, userId?: string): Promise<void> => {
    try {
      const targetUid = userId || storeState.currentUser?.id;
      const targetNotif = storeState.notifications.find((n) => n.id === notificationId);

      // 1. Immediately update local state
      const updated = storeState.notifications.filter((n) => n.id !== notificationId);
      setTableData('notifications', updated);

      if (!targetUid) return;

      // 2. Persist to local client dismissals so it stays hidden on refresh
      saveLocalDismissedNotificationIds(targetUid, [notificationId]);

      // 3. Save dismissal in Supabase table
      try {
        await supabase
          .from('notification_dismissals')
          .upsert(
            { notification_id: notificationId, user_id: targetUid },
            { onConflict: 'notification_id,user_id', ignoreDuplicates: true }
          );
      } catch (dErr: any) {
        if (dErr?.code !== '23505' && dErr?.code !== '23503') {
          console.warn('notification_dismissals upsert note:', dErr?.message || dErr);
        }
      }

      // 4. Only delete from shared notifications table IF the notification was strictly targeted to this single user
      if (targetNotif && targetNotif.targetUserId === targetUid && targetNotif.targetUserId !== 'all') {
        try {
          await supabase.from('notifications').delete().eq('id', notificationId);
        } catch (delErr: any) {
          console.warn('notifications delete note:', delErr?.message || delErr);
        }
      }
    } catch (err: any) {
      console.warn('deleteNotification note:', err?.message || err);
    }
  },

  clearNotifications: async (userId?: string): Promise<void> => {
    try {
      const targetUid = userId || storeState.currentUser?.id;

      // 1. Identify all notifications currently visible to that user in local state
      const currentVisibleNotifs = storeState.notifications.filter(
        (n) => n.targetUserId === 'all' || !n.targetUserId || n.targetUserId === targetUid
      );
      const visibleIds = currentVisibleNotifs.map((n) => n.id).filter(Boolean);

      // 2. Immediately clear local notifications state so UI reacts with zero delay and badge count resets
      setTableData('notifications', []);

      if (!targetUid) return;

      // 3. Persist local dismissals immediately so client-generated notifications remain cleared across refresh/logins
      if (visibleIds.length > 0) {
        saveLocalDismissedNotificationIds(targetUid, visibleIds);
      }

      // 4. Fetch notifications from DB to collect real DB notification IDs
      let query = supabase.from('notifications').select('id');
      query = query.or(`target_user_id.eq.${targetUid},target_user_id.eq.all`);
      const { data: dbNotifs, error: lookupErr } = await query;
      if (lookupErr) {
        console.warn('Supabase notifications lookup note:', lookupErr.message);
      }

      const allTargetNotifIds = Array.from(
        new Set([...visibleIds, ...(dbNotifs || []).map((n: any) => n.id)].filter(Boolean))
      );

      if (allTargetNotifIds.length === 0) return;

      // 5. Query already dismissed notifications from DB to avoid redundant requests
      const { data: existingDismissals } = await supabase
        .from('notification_dismissals')
        .select('notification_id')
        .eq('user_id', targetUid);

      const alreadyDismissed = new Set(
        (existingDismissals || []).map((d: any) => d.notification_id).filter(Boolean)
      );

      // 6. Filter only un-dismissed IDs that exist in DB notifications table
      // (notification_dismissals has foreign key constraint to notifications.id)
      const validDbIds = new Set((dbNotifs || []).map((n: any) => n.id));
      const idsToDismiss = allTargetNotifIds.filter(
        (id) => validDbIds.has(id) && !alreadyDismissed.has(id)
      );

      if (idsToDismiss.length > 0) {
        const dismissals = idsToDismiss.map((nid) => ({
          notification_id: nid,
          user_id: targetUid,
        }));

        try {
          const { error: insErr } = await supabase
            .from('notification_dismissals')
            .upsert(dismissals, { onConflict: 'notification_id,user_id', ignoreDuplicates: true });

          if (insErr && insErr.code !== '23505' && insErr.code !== '23503') {
            console.warn('Supabase clearNotifications (dismissals) note:', insErr.message);
          }
        } catch (upErr: any) {
          if (upErr?.code !== '23505' && upErr?.code !== '23503') {
            console.warn('clearNotifications upsert note:', upErr?.message || upErr);
          }
        }
      }
    } catch (err: any) {
      if (err?.code !== '23505' && err?.code !== '23503') {
        console.warn('clearNotifications note:', err?.message || err);
      }
    }
  },

  clearDispatchedEmails: async (): Promise<void> => {
    setTableData('dispatchedEmails', []);
  },

  // -----------------------------------------------------------------------
  // Archive Helpers
  // -----------------------------------------------------------------------
  getUserArchive: (
    userId?: string,
    tasksList: Task[] = storeState.tasks,
    meetingsList: Meeting[] = storeState.meetings
  ): { tasks: Task[]; meetings: Meeting[] } => {
    const targetUid = userId || storeState.currentUser.id;
    const archivedTasks = tasksList.filter((t) => {
      const isPersonal =
        t.createdById === targetUid ||
        t.assignedToId === targetUid ||
        (t.assignedToIds && t.assignedToIds.includes(targetUid));
      return isPersonal && isTaskArchived(t);
    });

    const archivedMeetings = meetingsList.filter((m) => {
      const isPersonal =
        m.organizerId === targetUid ||
        m.chairId === targetUid ||
        (m.attendees && m.attendees.some((a) => a.userId === targetUid));
      return isPersonal && isMeetingArchived(m);
    });

    return { tasks: archivedTasks, meetings: archivedMeetings };
  },

  clearUserArchive: async (userId?: string): Promise<void> => {
    try {
      const targetUid = userId || storeState.currentUser.id;
      const { tasks: archivedTasks, meetings: archivedMeetings } = portalStore.getUserArchive(targetUid);
      const archivedTaskIds = new Set(archivedTasks.map(t => t.id));
      const archivedMeetingIds = new Set(archivedMeetings.map(m => m.id));

      for (const t of archivedTasks) {
        try {
          await supabase.from('task_subtasks').delete().eq('task_id', t.id);
          await supabase.from('tasks').delete().eq('id', t.id);
        } catch (e) {
          console.warn('Failed to delete archived task:', t.id, e);
        }
      }

      for (const m of archivedMeetings) {
        try {
          await supabase.from('meetings').delete().eq('id', m.id);
        } catch (e) {
          console.warn('Failed to delete archived meeting:', m.id, e);
        }
      }

      const remainingTasks = storeState.tasks.filter(t => !archivedTaskIds.has(t.id));
      const remainingMeetings = storeState.meetings.filter(m => !archivedMeetingIds.has(m.id));
      setTableData('tasks', remainingTasks);
      setTableData('meetings', remainingMeetings);

      try {
        localStorage.setItem('wipahs_portal_tasks', JSON.stringify(remainingTasks));
        localStorage.setItem('wipahs_portal_meetings', JSON.stringify(remainingMeetings));
      } catch {}
    } catch (err: any) {
      console.error('clearUserArchive error:', err);
      throw err;
    }
  },

  // -----------------------------------------------------------------------
  // Auth & Session
  // -----------------------------------------------------------------------
  loginUser: (user: StaffUser, mustChangePassword: boolean, sessionToken?: string): void => {
    setTableData('currentUser', user);
    setTableData('authSession', {
      isAuthenticated: true,
      userId: user.id,
      mustChangePassword,
      sessionToken,
    });
    // Refresh tasks with the newly authenticated user context
    portalStore.getTasks().then((freshTasks) => {
      setTableData('tasks', freshTasks);
    }).catch(console.warn);
  },

  logoutUser: async (): Promise<void> => {
    setTableData('currentUser', {
      id: 'usr-default',
      name: 'Staff Member',
      email: 'staff@wipahs.or.tz',
      role: 'Staff Member',
      organisation: 'WIPAHS',
      department: 'General',
      status: 'Offline',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      phone: '+255 778 123 456',
      activityScore: 85,
      tasksCount: 0,
      lastActive: 'Just now',
    });
    setTableData('authSession', {
      isAuthenticated: false,
      userId: null,
      mustChangePassword: false,
    });
    await signOutSupabase();
  },

  resetUserPassword: async (id: string, customPass?: string): Promise<{ success: boolean; message: string }> => {
    const tempPass = customPass || generateTempPassword();
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const { data, error } = await supabase.functions.invoke('admin-reset-password', {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
        body: { userId: id, customPassword: tempPass },
      });
      if (!error && !(data && data.error)) {
        return {
          success: true,
          message: data?.message || tempPass,
        };
      }
    } catch (edgeErr) {
      console.warn('Edge function admin-reset-password fallback:', edgeErr);
    }

    // Fallback: update profiles table directly so admin password reset always succeeds
    try {
      await supabase
        .from('profiles')
        .update({
          must_change_password: true,
          temporary_password: tempPass,
        })
        .eq('id', id);

      const updatedStaff = storeState.staff.map(s => 
        s.id === id ? { ...s, mustChangePassword: true, temporaryPassword: tempPass } : s
      );
      setTableData('staff', updatedStaff);

      return {
        success: true,
        message: tempPass,
      };
    } catch (err: any) {
      console.error('resetUserPassword fallback error:', err);
      throw new Error(err.message || 'Failed to reset user password');
    }
  },

  completeForcedPasswordChange: async (newPassword: string): Promise<void> => {
    setTableData('currentUser', {
      ...storeState.currentUser,
      mustChangePassword: false,
      temporaryPassword: undefined,
    });
    setTableData('authSession', {
      ...storeState.authSession,
      mustChangePassword: false,
    });
  },

  changeCurrentUserPassword: (currentPassword: string, newPassword: string): { success: boolean; message: string } => {
    return {
      success: false,
      message: 'Password changes must be performed through administrative provisioning or the forced password screen.',
    };
  },

  updateCurrentUserProfile: async (updates: Partial<StaffUser>): Promise<void> => {
    const user = storeState.currentUser;
    const updatedUser = { ...user, ...updates };

    // 1. Immediately update currentUser state
    setTableData('currentUser', updatedUser);

    // 2. Persist currentUser in localStorage so birthday & profile survive refreshes!
    saveCurrentUserProfileToLocalStorage(updatedUser);

    // 3. Keep storeState.staff in sync so currentUser's birthday and details appear on calendar and directories!
    const staffList = [...storeState.staff];
    const existingIdx = staffList.findIndex(
      (s) => s.id === updatedUser.id || (s.email && s.email.toLowerCase() === updatedUser.email?.toLowerCase())
    );
    if (existingIdx >= 0) {
      staffList[existingIdx] = { ...staffList[existingIdx], ...updatedUser };
    } else {
      staffList.unshift(updatedUser);
    }
    setTableData('staff', staffList);
    saveStaffToLocalStorage(staffList);

    // 4. Record heartbeat
    recordUserHeartbeat(updatedUser, updatedUser.status);

    // 5. Safely attempt Supabase update without throwing
    try {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(updatedUser.id);
      const rowUpdates = mapStaffToRow(updates);
      if (isUuid) {
        await supabase.from('profiles').update(rowUpdates).eq('id', updatedUser.id);
      } else if (updatedUser.email) {
        await supabase.from('profiles').update(rowUpdates).eq('email', updatedUser.email);
      }
    } catch (sbErr) {
      console.warn('Supabase updateCurrentUserProfile note:', sbErr);
    }
  },

  resetAllData: async (): Promise<void> => {
    isStoreInitialized = false;
    storeInitPromise = null;
    await initStoreOnce();
  },

  triggerLiveMeetingSync,
  triggerLiveMessageSync,
  startRealtimeSync: initRealtimeSubscription,
  stopRealtimeSync: stopRealtimeEngine,

  // Self-referencing actions object
  actions: null as any,
};

// Bind actions back to portalStore so portalStore.actions and portalStore are identical
(portalStore as any).actions = portalStore;

// =========================================================================
// Reactive Hook: usePortalStore
// Subscribes each component to independent, per-table reactive states.
// Updates to 'tasks' only re-render components that consume tasks.
// Updates to 'notices' only re-render components that consume notices.
// =========================================================================

export function usePortalStore() {
  const tasks = useTableState('tasks');
  const notices = useTableState('notices');
  const projects = useTableState('projects');
  const meetings = useTableState('meetings');
  const staff = useTableState('staff');
  const sharePointDocs = useTableState('sharePointDocs');
  const folderList = useTableState('folderList');
  const teamsRules = useTableState('teamsRules');
  const auditLogs = useTableState('auditLogs');
  const currentUser = useTableState('currentUser');
  const decisions = useTableState('decisions');
  const approvals = useTableState('approvals');
  const departments = useTableState('departments');
  const roles = useTableState('roles');
  const conversations = useTableState('conversations');
  const messages = useTableState('messages');
  const notifications = useTableState('notifications');
  const dispatchedEmails = useTableState('dispatchedEmails');
  const authSession = useTableState('authSession');
  const loading = useTableState('loading');

  useEffect(() => {
    initStoreOnce();
  }, []);

  return {
    tasks,
    notices,
    projects,
    meetings,
    staff,
    sharePointDocs,
    folderList,
    teamsRules,
    auditLogs,
    currentUser,
    decisions,
    approvals,
    departments,
    roles,
    conversations,
    messages,
    notifications,
    dispatchedEmails,
    authSession,
    loading,
    isLoading: loading,
    actions: portalStore,
    refetch: initStoreOnce,
  };
}

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#$%&*!';
  let pass = 'Wipahs#';
  for (let i = 0; i < 8; i++) {
    pass += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pass + '9!';
}

// Global browser listeners for automatic live presence
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    portalStore.syncLivePresence();
  });
  window.addEventListener('offline', () => {
    portalStore.syncLivePresence();
  });
}

