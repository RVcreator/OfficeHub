import {createRefreshGate,createReconnect,shouldReconcile} from './syncPolicy';
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
  MESSAGE_SELECT_COLUMNS,
} from './supabaseMappers';
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
let channelGeneration=0;
let realtimeHealthy=false;
let lastReconcile=0;
const refreshGate=createRefreshGate();
const reconnect=createReconnect((fn,ms)=>setTimeout(fn,ms),id=>clearTimeout(id as ReturnType<typeof setTimeout>),()=>{if(isStarted)setupRealtimeChannel();});

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
  if (!activeBridge || !isStarted || !isBridgeAuthenticated()) return;
  const bridge = activeBridge;
  const userId = bridge.getState().currentUser.id;
  // Broadcasts are refresh hints, never authoritative notification records.
  const current = () => activeBridge === bridge && isStarted && bridge.getState().currentUser.id === userId;
  if (event.type === 'NEW_NOTICE' || event.type === 'NOTICE_ACKNOWLEDGED') {
    void bridge.getNotices().then(rows => { if (current()) bridge.setTableData('notices', rows); }).catch(() => {});
  } else if (['TASK_ASSIGNED', 'TASK_DONE', 'TASK_RATED'].includes(event.type)) {
    void bridge.getTasks().then(rows => { if (current()) bridge.setTableData('tasks', rows); }).catch(() => {});
  } else if (event.type === 'MEETING_SCHEDULED' || event.type === 'MEETING_RSVP') {
    void triggerLiveMeetingSync();
  } else if (event.type === 'NEW_MESSAGE') {
    void triggerLiveMessageSync();
  }
  void triggerLiveNotificationSync();
}

/**
 * Configure the realtime engine with the store bridge
 */
export function setRealtimeBridge(bridge: RealtimeBridge) {
  activeBridge = bridge;
}

function isBridgeAuthenticated(): boolean {
  if (!activeBridge) return false;
  const uid = activeBridge.getState().currentUser?.id;
  return Boolean(uid && uid !== 'usr-default');
}

/**
 * Trigger an immediate, non-blocking sync for meetings
 */
async function triggerLiveMeetingSyncOnce() {
  if (!activeBridge || !isBridgeAuthenticated()) return;
  const bridge=activeBridge, identity=bridge.getState().currentUser.id, generation=channelGeneration;
  const current=()=>isStarted&&activeBridge===bridge&&generation===channelGeneration&&bridge.getState().currentUser.id===identity;
  try {

    const freshMeetings = await bridge.getMeetings();
    if(current())bridge.setTableData('meetings',freshMeetings);

  } catch (err) {
    console.warn('Live meeting sync error:', err);
  }
}
export async function triggerLiveMeetingSync(){
 return refreshGate.run(`meetings-${channelGeneration}`,()=>triggerLiveMeetingSyncOnce());
}


/**
 * Trigger an immediate, non-blocking sync for messages
 */
async function triggerLiveMessageSyncOnce() {
  if (!activeBridge || !isBridgeAuthenticated()) return;
  const bridge=activeBridge, identity=bridge.getState().currentUser.id, generation=channelGeneration;
  const current=()=>isStarted&&activeBridge===bridge&&generation===channelGeneration&&bridge.getState().currentUser.id===identity;
  try {

    const { data: rows, error } = await supabase
      .from('messages')
      .select(MESSAGE_SELECT_COLUMNS)
      .order('timestamp', { ascending: false })
      .limit(30);

    if (error || !rows || !current()) return;

    const currentMessages = bridge.getState().messages;
    const existingIds = new Set(currentMessages.map((m) => m.id));
    const missingRows = rows.filter((r) => !existingIds.has(r.id));

    if (missingRows.length > 0) {
      const mappedNew = missingRows.map(mapMessageRow);
      const merged = [...currentMessages, ...mappedNew].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      if(!current())return;
      bridge.setTableData('messages', merged);

      // Update conversations with newest messages
      const freshConversations = await bridge.getConversations();
      if(!current())return;
      bridge.setTableData('conversations', freshConversations);

      // Refresh saved notifications for incoming messages.
      const currentUserId = bridge.getState().currentUser?.id;
      if (mappedNew.some((m) => m.senderId && m.senderId !== currentUserId)) {
        void triggerLiveNotificationSync();
      }
    }
  } catch (err) {
    console.warn('Live message sync error:', err);
  }
}
export async function triggerLiveMessageSync(){
 return refreshGate.run(`messages-${channelGeneration}`,()=>triggerLiveMessageSyncOnce());
}


/**
 * Initialize Supabase Realtime channel listeners
 */
function setupRealtimeChannel() {
  const generation=++channelGeneration;
  realtimeHealthy=false;
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

        // The saved notification determines whether this message should chime.
        if (newMsg.senderId && newMsg.senderId !== currentUserId) {
          void triggerLiveNotificationSync();
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

          } else {
            // INSERT or DELETE
            const freshTasks = await activeBridge.getTasks();
            activeBridge.setTableData('tasks', freshTasks);
          }
          triggerLiveNotificationSync();
        } catch (e) {}
      }
    )
    // 7. NOTIFICATIONS: Live alerts for tasks, circulars, messages, etc.
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications' },
      () => {
        void triggerLiveNotificationSync();
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
      if(!isStarted||generation!==channelGeneration)return;
      if(status==='SUBSCRIBED'){
        realtimeHealthy=true;reconnect.reset();
        console.info('WIPAHS OfficeHub Live: Realtime channel subscribed.');
      }else if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)){
        realtimeHealthy=false;
        console.warn('WIPAHS OfficeHub Live: Channel status',status,err);
        reconnect.request();
      }
    });
}

/**
 * Trigger an immediate, non-blocking sync for notifications
 */
async function triggerLiveNotificationSyncOnce() {
  if (!activeBridge || !activeBridge.getNotifications || !isBridgeAuthenticated()) return;
  const uid = activeBridge.getState().currentUser?.id;
  try {
    // Store delivery publishes persisted rows, then decides whether to chime.
    await activeBridge.getNotifications(uid);
  } catch {
    // Keep the existing inbox on a failed refresh; never ring for a failed read.
  }
}
export async function triggerLiveNotificationSync(){
 return refreshGate.run(`notifications-${channelGeneration}`,()=>triggerLiveNotificationSyncOnce());
}


/**
 * Smart background poller: Guaranteed fallback in case WebSocket drops or table is not in supabase_realtime publication
 */
function startLiveSyncPoller() {
  if (pollingIntervalId) clearInterval(pollingIntervalId);

  lastReconcile=Date.now();
  pollingIntervalId=setInterval(()=>{
    if(!activeBridge||!isStarted||!isBridgeAuthenticated())return;
    if(!shouldReconcile(Date.now(),lastReconcile,realtimeHealthy,document.visibilityState==='visible',navigator.onLine))return;
    lastReconcile=Date.now();void reconcileVisibleData();
  },5000);
}

/**
 * Handle tab visibility and window focus: sync immediately when user switches back to tab
 */
async function reconcileVisibleData(){
  if(!activeBridge||!isStarted||!isBridgeAuthenticated())return;
  const bridge=activeBridge,identity=bridge.getState().currentUser.id,generation=channelGeneration;
  await Promise.allSettled([triggerLiveMessageSync(),triggerLiveMeetingSync(),triggerLiveNotificationSync(),
    refreshGate.run(`tables-${generation}`,async()=>{
      const [notices,tasks,approvals]=await Promise.all([bridge.getNotices(),bridge.getTasks(),bridge.getApprovals?.()]);
      if(!isStarted||activeBridge!==bridge||generation!==channelGeneration||bridge.getState().currentUser.id!==identity)return;
      bridge.setTableData('notices',notices);bridge.setTableData('tasks',tasks);
      if(approvals)bridge.setTableData('approvals',approvals);
    })]);
}
function handleWindowFocus(){
 if(!isStarted||document.visibilityState!=='visible'||!navigator.onLine)return;
 // Focus and visibility events often arrive together.
 if(Date.now()-lastReconcile<1000)return;
 lastReconcile=Date.now();void reconcileVisibleData();
}
function handleOnline(){
 if(!isStarted)return;
 reconnect.reset();setupRealtimeChannel();lastReconcile=0;handleWindowFocus();
}

function handleVisibilityChange() {
  if (document.visibilityState === 'visible') handleWindowFocus();
}

function handleStorageChange(e: StorageEvent) {
  if (e.key === 'wipahs_last_broadcast_evt' && e.newValue) {
    try { handleBroadcastMessage(JSON.parse(e.newValue)); } catch {}
  }
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
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);

    // Cross-tab storage event fallback
    window.addEventListener('storage', handleStorageChange);
  }

  console.info('WIPAHS OfficeHub Live: Real-time synchronization active.');
}

/**
 * Stop the realtime engine (e.g. on unmount or user signout)
 */
export function stopRealtimeEngine() {
  isStarted = false;
  channelGeneration++;realtimeHealthy=false;reconnect.reset();
  clearTimeout(meetingsDebounceTimer);clearTimeout(messagesDebounceTimer);
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
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('storage', handleStorageChange);
    window.removeEventListener('online', handleOnline);
  }
}
