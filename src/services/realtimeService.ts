// =========================================================================
// WIPAHS OfficeHub - Live Real-Time Synchronization Engine
// Subscribes to Supabase postgres_changes for live multi-user collaboration
// Combines WebSockets + Background Smart Reconciler + Window Focus Sync + BroadcastChannel.
// Instant audio alerts and real-time UI updates for notices, acknowledgments, tasks, messages.
// =========================================================================

import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import {
  mapMessageRow,
  mapMeetingAttendeeRow,
  mapMeetingRow,
  mapNoticeRow,
  mapTaskRow,
  mapConversationRow,
} from './supabaseMappers';
import { playNotificationSound } from '../utils/sound';
import { ChatMessage, Meeting, Notice, Task, ChatConversation, AppNotification, Approval } from '../types';

export interface RealtimeBridge {
  getState: () => {
    messages: ChatMessage[];
    meetings: Meeting[];
    conversations: ChatConversation[];
    notices: Notice[];
    tasks: Task[];
    currentUser: { id: string; name: string };
    notifications?: AppNotification[];
    approvals?: Approval[];
  };
  setTableData: (key: string, data: any) => void;
  getMeetings: () => Promise<Meeting[]>;
  getMessages: (conversationId?: string) => Promise<ChatMessage[]>;
  getConversations: () => Promise<ChatConversation[]>;
  getNotices: () => Promise<Notice[]>;
  getTasks: () => Promise<Task[]>;
  getNotifications?: (userId?: string) => Promise<AppNotification[]>;
  getApprovals?: () => Promise<Approval[]>;
  getPendingTaskStatus?: (taskId: string) => Task['status'] | undefined;
}

export interface PortalBroadcastEvent {
  type:
    | 'NEW_NOTIFICATION'
    | 'NEW_NOTICE'
    | 'NOTICE_ACKNOWLEDGED'
    | 'TASK_ASSIGNED'
    | 'TASK_DONE'
    | 'TASK_RATED'
    | 'NEW_MESSAGE'
    | 'MEETING_SCHEDULED'
    | 'MEETING_RSVP';
  notification?: AppNotification;
  notice?: Notice;
  noticeId?: string;
  actorId?: string;
  actorName?: string;
  targetUserId?: string;
  title?: string;
  taskId?: string;
  data?: any;
}

let activeBridge: RealtimeBridge | null = null;
let realtimeChannel: RealtimeChannel | null = null;
let isStarted = false;
let pollingIntervalId: any = null;
let meetingsDebounceTimer: any = null;
let messagesDebounceTimer: any = null;
let lastMessageCheckTime = 0;
let lastMeetingCheckTime = 0;

// Cross-tab / cross-window broadcast channel for instant local delivery
let portalBroadcastChannel: BroadcastChannel | null = null;
if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  try {
    portalBroadcastChannel = new BroadcastChannel('wipahs_portal_realtime_events');
    portalBroadcastChannel.onmessage = (event) => {
      handleBroadcastMessage(event.data);
    };
  } catch {}
}

/**
 * Broadcast an event across all open tabs/windows in the browser
 */
export function broadcastRealtimeEvent(event: PortalBroadcastEvent): void {
  try {
    if (portalBroadcastChannel) {
      portalBroadcastChannel.postMessage(event);
    }
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(
        'wipahs_last_broadcast_evt',
        JSON.stringify({ ...event, _ts: Date.now() })
      );
    }
  } catch {}
}

/**
 * Handle incoming cross-tab broadcast events
 */
function handleBroadcastMessage(event: PortalBroadcastEvent) {
  if (!activeBridge || !isStarted) return;
  const currentUserId = activeBridge.getState().currentUser?.id;
  if (!currentUserId) return;

  // Don't replay sound for self-actions
  if (event.actorId && event.actorId === currentUserId) return;

  const isTargetedToMe =
    event.targetUserId === 'all' ||
    !event.targetUserId ||
    event.targetUserId === currentUserId;

  if (event.type === 'NEW_NOTIFICATION' && event.notification) {
    const notif = event.notification;
    if (notif.targetUserId === 'all' || notif.targetUserId === currentUserId) {
      const cur = activeBridge.getState().notifications || [];
      if (!cur.some((n) => n.id === notif.id)) {
        activeBridge.setTableData('notifications', [notif, ...cur]);
      }
      playNotificationSound();
    }
  } else if (event.type === 'NEW_NOTICE') {
    activeBridge.getNotices().then((notices) => {
      activeBridge?.setTableData('notices', notices);
    });
    triggerLiveNotificationSync();
    if (isTargetedToMe) {
      playNotificationSound();
    }
  } else if (event.type === 'NOTICE_ACKNOWLEDGED') {
    activeBridge.getNotices().then((notices) => {
      activeBridge?.setTableData('notices', notices);
    });
    triggerLiveNotificationSync();
    if (event.targetUserId === currentUserId) {
      playNotificationSound();
    }
  } else if (event.type === 'TASK_ASSIGNED') {
    activeBridge.getTasks().then((tasks) => {
      activeBridge?.setTableData('tasks', tasks);
    });
    triggerLiveNotificationSync();
    if (event.targetUserId === currentUserId) {
      playNotificationSound();
    }
  } else if (event.type === 'TASK_DONE') {
    activeBridge.getTasks().then((tasks) => {
      activeBridge?.setTableData('tasks', tasks);
    });
    triggerLiveNotificationSync();
    if (event.targetUserId === currentUserId) {
      playNotificationSound();
    }
  } else if (event.type === 'TASK_RATED') {
    activeBridge.getTasks().then((tasks) => {
      activeBridge?.setTableData('tasks', tasks);
    });
    triggerLiveNotificationSync();
    if (event.targetUserId === currentUserId) {
      playNotificationSound();
    }
  }
}

/**
 * Configure the realtime engine with the store bridge
 */
export function setRealtimeBridge(bridge: RealtimeBridge) {
  activeBridge = bridge;
}

/**
 * Trigger an immediate, non-blocking sync for meetings
 */
export async function triggerLiveMeetingSync() {
  if (!activeBridge) return;
  try {
    const now = Date.now();
    if (now - lastMeetingCheckTime < 1000) return;
    lastMeetingCheckTime = now;

    const freshMeetings = await activeBridge.getMeetings();
    const currentMeetings = activeBridge.getState().meetings;

    let hasDiff = freshMeetings.length !== currentMeetings.length;
    if (!hasDiff) {
      const currentMap = new Map(currentMeetings.map((m) => [m.id, m]));
      for (const fm of freshMeetings) {
        const cm = currentMap.get(fm.id);
        if (
          !cm ||
          cm.status !== fm.status ||
          cm.startTime !== fm.startTime ||
          cm.time !== fm.time ||
          cm.date !== fm.date ||
          (cm.attendees?.length || 0) !== (fm.attendees?.length || 0) ||
          cm.attendees?.some((ca, idx) => {
            const fa = fm.attendees?.[idx];
            return (
              !fa ||
              ca.status !== fa.status ||
              ca.proposedDate !== fa.proposedDate ||
              ca.proposedTime !== fa.proposedTime
            );
          })
        ) {
          hasDiff = true;
          break;
        }
      }
    }

    if (hasDiff) {
      activeBridge.setTableData('meetings', freshMeetings);
    }
  } catch (err) {
    console.warn('Live meeting sync error:', err);
  }
}

/**
 * Trigger an immediate, non-blocking sync for messages
 */
export async function triggerLiveMessageSync() {
  if (!activeBridge) return;
  try {
    const now = Date.now();
    if (now - lastMessageCheckTime < 1000) return;
    lastMessageCheckTime = now;

    const { data: rows, error } = await supabase
      .from('messages')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(30);

    if (error || !rows) return;

    const currentMessages = activeBridge.getState().messages;
    const existingIds = new Set(currentMessages.map((m) => m.id));
    const missingRows = rows.filter((r) => !existingIds.has(r.id));

    if (missingRows.length > 0) {
      const mappedNew = missingRows.map(mapMessageRow);
      const merged = [...currentMessages, ...mappedNew].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      activeBridge.setTableData('messages', merged);

      // Update conversations with newest messages
      const freshConversations = await activeBridge.getConversations();
      activeBridge.setTableData('conversations', freshConversations);

      // Play soft chime if a message from someone else arrived
      const currentUserId = activeBridge.getState().currentUser?.id;
      if (mappedNew.some((m) => m.senderId && m.senderId !== currentUserId)) {
        playNotificationSound();
      }
    }
  } catch (err) {
    console.warn('Live message sync error:', err);
  }
}

/**
 * Initialize Supabase Realtime channel listeners
 */
function setupRealtimeChannel() {
  if (realtimeChannel) {
    try {
      supabase.removeChannel(realtimeChannel);
    } catch {}
    realtimeChannel = null;
  }

  realtimeChannel = supabase
    .channel('wipahs_officehub_live')
    // 1. MESSAGES: Instant live delivery
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages' },
      (payload) => {
        if (!activeBridge) return;
        const newMsg = mapMessageRow(payload.new);
        const currentMsgs = activeBridge.getState().messages;

        // Idempotent guard: ignore if already in state
        if (currentMsgs.some((m) => m.id === newMsg.id)) return;

        activeBridge.setTableData('messages', [...currentMsgs, newMsg]);

        // Update corresponding conversation snippet & unread count
        const currentConvs = activeBridge.getState().conversations;
        const currentUserId = activeBridge.getState().currentUser?.id;
        const updatedConvs = currentConvs.map((conv) => {
          if (conv.id === newMsg.conversationId) {
            return {
              ...conv,
              lastMessage: newMsg.text,
              lastMessageTime: newMsg.timestamp,
              unreadCount:
                newMsg.senderId !== currentUserId ? (conv.unreadCount || 0) + 1 : conv.unreadCount,
            };
          }
          return conv;
        });
        activeBridge.setTableData('conversations', updatedConvs);

        // Sound chime for incoming message from other user
        if (newMsg.senderId && newMsg.senderId !== currentUserId) {
          playNotificationSound();
        }
      }
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'messages' },
      (payload) => {
        if (!activeBridge) return;
        const updatedMsg = mapMessageRow(payload.new);
        const currentMsgs = activeBridge.getState().messages;
        activeBridge.setTableData(
          'messages',
          currentMsgs.map((m) => (m.id === updatedMsg.id ? updatedMsg : m))
        );
      }
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'messages' },
      (payload) => {
        if (!activeBridge) return;
        const deletedId = payload.old?.id;
        if (!deletedId) return;
        const currentMsgs = activeBridge.getState().messages;
        activeBridge.setTableData(
          'messages',
          currentMsgs.filter((m) => m.id !== deletedId)
        );
      }
    )
    // 2. CONVERSATIONS: Realtime creation or updates
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'conversations' },
      async () => {
        if (!activeBridge) return;
        try {
          const freshConvs = await activeBridge.getConversations();
          activeBridge.setTableData('conversations', freshConvs);
        } catch (e) {
          console.warn('Error syncing conversations:', e);
        }
      }
    )
    // 3. MEETINGS: Instant live addition, update, or cancellation
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'meetings' },
      () => {
        if (!activeBridge) return;
        clearTimeout(meetingsDebounceTimer);
        meetingsDebounceTimer = setTimeout(() => {
          triggerLiveMeetingSync();
        }, 200);
      }
    )
    // 4. MEETING ATTENDEES: Live RSVP / Proposal updates
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'meeting_attendees' },
      () => {
        if (!activeBridge) return;
        clearTimeout(meetingsDebounceTimer);
        meetingsDebounceTimer = setTimeout(() => {
          triggerLiveMeetingSync();
        }, 200);
      }
    )
    // 5. NOTICES: Live announcements
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notices' },
      async (payload) => {
        if (!activeBridge) return;
        try {
          const freshNotices = await activeBridge.getNotices();
          activeBridge.setTableData('notices', freshNotices);
          const currentUserId = activeBridge.getState().currentUser?.id;
          if (payload.new && payload.new.author_id !== currentUserId) {
            playNotificationSound();
          }
          triggerLiveNotificationSync();
        } catch (e) {}
      }
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'notices' },
      async () => {
        if (!activeBridge) return;
        try {
          const freshNotices = await activeBridge.getNotices();
          activeBridge.setTableData('notices', freshNotices);
        } catch (e) {}
      }
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'notices' },
      async () => {
        if (!activeBridge) return;
        try {
          const freshNotices = await activeBridge.getNotices();
          activeBridge.setTableData('notices', freshNotices);
        } catch (e) {}
      }
    )
    // 5b. NOTICE ACKNOWLEDGEMENTS: Live circular acknowledgment
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notice_acknowledgements' },
      async (payload) => {
        if (!activeBridge) return;
        try {
          const freshNotices = await activeBridge.getNotices();
          activeBridge.setTableData('notices', freshNotices);
          triggerLiveNotificationSync();

          const ackUser = payload.new?.user_id;
          const noticeId = payload.new?.notice_id;
          const currentUserId = activeBridge.getState().currentUser?.id;
          const targetNotice = freshNotices.find((n) => n.id === noticeId);
          if (
            targetNotice &&
            targetNotice.authorId === currentUserId &&
            ackUser !== currentUserId
          ) {
            playNotificationSound();
          }
        } catch (e) {}
      }
    )
    // 6. TASKS: Live task updates
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'tasks' },
      async (payload) => {
        if (!activeBridge) return;
        try {
          const currentUserId = activeBridge.getState().currentUser?.id;

          if (payload.eventType === 'UPDATE' && payload.new) {
            const updatedRow = payload.new;
            const currentTasks = activeBridge.getState().tasks;
            const existingTask = currentTasks.find((t) => t.id === updatedRow.id);

            // Respect pending local mutations
            const pendingStatus = activeBridge.getPendingTaskStatus?.(updatedRow.id);
            const targetStatus = pendingStatus || updatedRow.status;

            if (existingTask) {
              const updatedTasks = currentTasks.map((t) => {
                if (t.id === updatedRow.id) {
                  return {
                    ...t,
                    status: targetStatus,
                    title: updatedRow.title ?? t.title,
                    description: updatedRow.description ?? t.description,
                    priority: updatedRow.priority ?? t.priority,
                    dueDate: updatedRow.due_date ?? t.dueDate,
                    completedAt: updatedRow.completed_at ?? (targetStatus === 'Done' ? (t.completedAt || new Date().toISOString()) : undefined),
                    cancelledAt: updatedRow.cancelled_at ?? (targetStatus === 'Cancelled' ? (t.cancelledAt || new Date().toISOString()) : undefined),
                    pendingRating: updatedRow.pending_rating !== undefined ? Boolean(updatedRow.pending_rating) : t.pendingRating,
                    rating: updatedRow.rating ?? t.rating,
                    generalUpdate: updatedRow.general_update ?? t.generalUpdate,
                  };
                }
                return t;
              });
              activeBridge.setTableData('tasks', updatedTasks);
            } else {
              const freshTasks = await activeBridge.getTasks();
              activeBridge.setTableData('tasks', freshTasks);
            }

            if (
              updatedRow.status === 'Done' &&
              updatedRow.created_by_id === currentUserId &&
              updatedRow.assigned_to_id !== currentUserId
            ) {
              playNotificationSound();
            }
          } else {
            // INSERT or DELETE
            const freshTasks = await activeBridge.getTasks();
            activeBridge.setTableData('tasks', freshTasks);
            if (payload.eventType === 'INSERT' && payload.new) {
              const assigned = payload.new.assigned_to_id;
              const createdBy = payload.new.created_by_id;
              if (assigned === currentUserId && createdBy !== currentUserId) {
                playNotificationSound();
              }
            }
          }
          triggerLiveNotificationSync();
        } catch (e) {}
      }
    )
    // 7. NOTIFICATIONS: Live alerts for tasks, circulars, messages, etc.
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications' },
      (payload) => {
        if (!activeBridge) return;
        const currentUserId = activeBridge.getState().currentUser?.id;
        const notifRow = payload.new;
        if (notifRow) {
          const target = notifRow.target_user_id;
          const actor = notifRow.actor_id;
          if ((target === 'all' || target === currentUserId) && actor !== currentUserId) {
            playNotificationSound();
          }
        }
        triggerLiveNotificationSync();
      }
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'notifications' },
      () => {
        triggerLiveNotificationSync();
      }
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'notifications' },
      () => {
        triggerLiveNotificationSync();
      }
    )
    // 8. APPROVALS: Live approval requests & status changes
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'approvals' },
      async () => {
        if (!activeBridge || !activeBridge.getApprovals) return;
        try {
          const freshApprovals = await activeBridge.getApprovals();
          activeBridge.setTableData('approvals', freshApprovals);
          triggerLiveNotificationSync();
        } catch (e) {
          console.warn('Error syncing approvals:', e);
        }
      }
    )
    .subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        console.info('WIPAHS OfficeHub Live: Realtime channel subscribed.');
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        console.warn('WIPAHS OfficeHub Live: Channel status', status, err);
        // Automatic reconnection attempt
        setTimeout(() => {
          if (isStarted) {
            setupRealtimeChannel();
          }
        }, 4000);
      }
    });
}

/**
 * Trigger an immediate, non-blocking sync for notifications
 */
export async function triggerLiveNotificationSync() {
  if (!activeBridge || !activeBridge.getNotifications) return;
  try {
    const uid = activeBridge.getState().currentUser?.id;
    const freshNotifs = await activeBridge.getNotifications(uid);
    const current = activeBridge.getState().notifications || [];

    // Check for newly arrived unread notifications targeted at this user and created by someone else
    const curIds = new Set(current.map((n) => n.id));
    const newlyArrived = freshNotifs.filter(
      (n) =>
        !curIds.has(n.id) &&
        !n.read &&
        n.actorId !== uid &&
        (n.targetUserId === 'all' || n.targetUserId === uid)
    );

    if (
      freshNotifs.length !== current.length ||
      freshNotifs.some((n, i) => n.id !== current[i]?.id || n.read !== current[i]?.read)
    ) {
      activeBridge.setTableData('notifications', freshNotifs);
    }

    if (newlyArrived.length > 0) {
      playNotificationSound();
    }
  } catch (err) {
    console.warn('Live notification sync error:', err);
  }
}

/**
 * Smart background poller: Guaranteed fallback in case WebSocket drops or table is not in supabase_realtime publication
 */
function startLiveSyncPoller() {
  if (pollingIntervalId) clearInterval(pollingIntervalId);

  // Fast pulse every 3 seconds for messages, 6 seconds for meetings and notifications, 15 seconds for notices/tasks
  let tick = 0;
  pollingIntervalId = setInterval(async () => {
    if (!activeBridge || !isStarted) return;
    tick++;

    // Every 3 seconds: poll for new messages
    triggerLiveMessageSync();

    // Every 6 seconds (every 2nd tick): poll for meetings and notifications
    if (tick % 2 === 0) {
      triggerLiveMeetingSync();
      triggerLiveNotificationSync();
    }

    // Every 15 seconds (every 5th tick): poll for notices and tasks
    if (tick % 5 === 0) {
      try {
        const [notices, freshTasks] = await Promise.all([
          activeBridge.getNotices(),
          activeBridge.getTasks(),
        ]);
        
        // Smart diff check for tasks before updating
        const currentTasks = activeBridge.getState().tasks;
        if (JSON.stringify(currentTasks) !== JSON.stringify(freshTasks)) {
           activeBridge.setTableData('tasks', freshTasks);
        }
        
        const curNotices = activeBridge.getState().notices;
        const currentUserId = activeBridge.getState().currentUser?.id;

        if (notices.length !== curNotices.length) {
          // Check if a new notice from someone else arrived
          const curNoticeIds = new Set(curNotices.map((n) => n.id));
          const hasNewNoticeFromOther = notices.some(
            (n) => !curNoticeIds.has(n.id) && n.authorId && n.authorId !== currentUserId
          );
          activeBridge.setTableData('notices', notices);
          if (hasNewNoticeFromOther) {
            playNotificationSound();
            triggerLiveNotificationSync();
          }
        }
      } catch {}
    }
  }, 3000);
}

/**
 * Handle tab visibility and window focus: sync immediately when user switches back to tab
 */
function handleWindowFocus() {
  if (!isStarted || !activeBridge) return;
  triggerLiveMessageSync();
  triggerLiveMeetingSync();
  triggerLiveNotificationSync();
}

function handleOnline() {
  if (!isStarted) return;
  setupRealtimeChannel();
  triggerLiveMessageSync();
  triggerLiveMeetingSync();
  triggerLiveNotificationSync();
}

/**
 * Start the full live realtime engine
 */
export function startRealtimeEngine(bridge: RealtimeBridge) {
  if (isStarted) return;
  isStarted = true;
  setRealtimeBridge(bridge);

  setupRealtimeChannel();
  startLiveSyncPoller();

  if (typeof window !== 'undefined') {
    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        handleWindowFocus();
      }
    });
    window.addEventListener('online', handleOnline);

    // Cross-tab storage event fallback
    window.addEventListener('storage', (e) => {
      if (e.key === 'wipahs_last_broadcast_evt' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          handleBroadcastMessage(parsed);
        } catch {}
      }
    });
  }

  console.info('WIPAHS OfficeHub Live: Real-time synchronization active.');
}

/**
 * Stop the realtime engine (e.g. on unmount or user signout)
 */
export function stopRealtimeEngine() {
  isStarted = false;
  if (pollingIntervalId) {
    clearInterval(pollingIntervalId);
    pollingIntervalId = null;
  }
  if (realtimeChannel) {
    try {
      supabase.removeChannel(realtimeChannel);
    } catch {}
    realtimeChannel = null;
  }
  if (typeof window !== 'undefined') {
    window.removeEventListener('focus', handleWindowFocus);
    window.removeEventListener('online', handleOnline);
  }
}
