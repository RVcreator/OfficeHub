import React, { useEffect, useState } from 'react';
import {
  BellRing,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Search,
  Filter,
  CheckCheck,
  Calendar,
  FileText,
  CheckSquare,
  ShieldCheck,
  FolderGit2,
  Mail,
  Volume2,
  Eye,
  Send,
  X,
  ExternalLink,
  Inbox
} from 'lucide-react';
import { usePortalStore } from '../services/store';
import { AppNotification, DispatchedEmail } from '../types';
import { isPersonalTask } from '../utils/taskUtils';
import { UserAvatar } from './UserAvatar';

const emailStatusLabel: Record<DispatchedEmail['status'], string> = {
  queued: 'Queued', processing: 'Preparing', sending: 'Sending', retry: 'Retry scheduled',
  accepted: 'Accepted by Microsoft', failed: 'Failed', review: 'Needs review',
  cancelled: 'Cancelled', unverified: 'Unverified legacy record',
};


export const TeamsNotificationsView: React.FC<{
  onSelectTask?: (taskId: string) => void;
}> = ({ onSelectTask }) => {
  const { notifications, currentUser, actions, tasks } = usePortalStore();
  const [dispatchedEmails, setDispatchedEmails] = useState<DispatchedEmail[]>([]);

  const [activeTab, setActiveTab] = useState<'notifications' | 'emails'>('notifications');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('All');
  const [filterPriority, setFilterPriority] = useState<string>('All');
  const [selectedEmail, setSelectedEmail] = useState<DispatchedEmail | null>(null);
  const [testSentMessage, setTestSentMessage] = useState<string | null>(null);

  // Polling only reads durable delivery status. It never creates or sends a job.
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    setDispatchedEmails([]);
    const refresh = async () => {
      const rows = await actions.getDispatchedEmails();
      if (!stopped) {
        setDispatchedEmails(rows);
        timer = setTimeout(refresh, 15000);
      }
    };
    if (activeTab === 'emails' && currentUser.id) void refresh();
    return () => { stopped = true; clearTimeout(timer); };
  }, [activeTab, currentUser.id, actions]);

  // Filter notifications for current user or broadcast ('all')
  const userNotifications = notifications.filter(n => {
    if (n.targetUserId === 'all' || !n.targetUserId) return true;
    if (n.targetUserId === currentUser.id) return true;
    if (currentUser.email && n.targetUserId.toLowerCase() === currentUser.email.toLowerCase()) return true;
    if (currentUser.name && n.targetUserId.toLowerCase() === currentUser.name.toLowerCase()) return true;
    if (Array.isArray(n.emailRecipients) && currentUser.email && n.emailRecipients.some(e => e.toLowerCase() === currentUser.email.toLowerCase())) return true;
    if (n.metadata?.targetUserName && currentUser.name && n.metadata.targetUserName.toLowerCase() === currentUser.name.toLowerCase()) return true;
    if (n.metadata?.targetUserEmail && currentUser.email && n.metadata.targetUserEmail.toLowerCase() === currentUser.email.toLowerCase()) return true;
    return false;
  });

  const filteredNotifications = userNotifications.filter(n => {
    if (filterType !== 'All' && n.type !== filterType) return false;
    if (filterPriority !== 'All' && n.priority !== filterPriority) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        n.title.toLowerCase().includes(q) ||
        n.message.toLowerCase().includes(q) ||
        (n.actorName || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const filteredEmails = dispatchedEmails.filter(email => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        email.subject.toLowerCase().includes(q) ||
        email.recipientEmail.toLowerCase().includes(q) ||
        email.recipientName.toLowerCase().includes(q) ||
        email.bodyText.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleSendTestAlert = () => {
    const testNotif = actions.addNotification({
      title: 'Notification sound test',
      message: `In-app notification test for ${currentUser.name}.`,
      type: 'general',
      targetUserId: currentUser.id,
      priority: 'Urgent',
      actorId: currentUser.id,
      actorName: currentUser.name,
      actorAvatar: currentUser.avatar,
      pushedToMicrosoftTeams: true,
    });

    setTestSentMessage('In-app notification test triggered. Check email status in the outbox for supported events.');
    setTimeout(() => setTestSentMessage(null), 4000);
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'meeting':
      case 'meeting_scheduled':
      case 'meeting_cancelled':
      case 'meeting_rescheduled':
        return <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-800 text-[10px] font-bold">Meeting</span>;
      case 'notice':
        return <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">Circular</span>;
      case 'approval':
        return <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px] font-bold">Approval</span>;
      case 'project':
        return <span className="px-2 py-0.5 rounded bg-teal-100 text-teal-800 text-[10px] font-bold">Project</span>;
      case 'task':
        return <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px] font-bold">Task</span>;
      case 'task_rating_required':
        return <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">Rating Required</span>;
      case 'new_message':
        return <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px] font-bold">Message</span>;
      case 'document':
        return <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">Document</span>;
      default:
        return <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-bold">Alert</span>;
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-md p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-2xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Notification & Email Activity Center
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 font-bold border border-emerald-200">
              {userNotifications.length} Alerts
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded bg-sky-50 text-sky-800 font-bold border border-sky-200 flex items-center gap-1">
              <Mail className="w-3 h-3 text-sky-600" />
              <span>{dispatchedEmails.length} Emails Triggered</span>
            </span>
          </div>
          <h1 className="text-xl font-bold text-[#19232d]">
            Official Operational Notifications & Email Broadcasts
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Review portal alerts and the email status of supported tasks, meetings, notices and approvals.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <button
            onClick={handleSendTestAlert}
            className="px-3 py-1.5 rounded-md bg-[#00ad1d] hover:bg-[#008f18] text-white font-semibold text-xs flex items-center gap-1.5 shadow-2xs transition active:scale-95 cursor-pointer"
            title="Test an in-app notification and sound"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Test Notification</span>
          </button>

          {activeTab === 'notifications' ? (
            <>
              <button
                onClick={() => actions.markAllNotificationsAsRead(currentUser.id)}
                className="px-3 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs flex items-center gap-1.5 transition"
              >
                <CheckCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>Mark All Read</span>
              </button>

              {userNotifications.length > 0 && (
                <button
                  onClick={() => actions.clearNotifications(currentUser.id)}
                  className="px-3 py-1.5 rounded-md bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs flex items-center gap-1.5 shadow-2xs transition active:scale-95"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear All</span>
                </button>
              )}
            </>
          ) : (
            dispatchedEmails.length > 0 && (
              <button
                onClick={() => actions.clearDispatchedEmails?.()}
                className="px-3 py-1.5 rounded-md bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 font-semibold text-xs flex items-center gap-1.5 transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear Email Log</span>
              </button>
            )
          )}
        </div>
      </div>

      {testSentMessage && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 px-4 py-2.5 rounded-md text-xs font-semibold flex items-center justify-between shadow-2xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-emerald-600" />
            <Mail className="w-4 h-4 text-emerald-600" />
            <span>{testSentMessage}</span>
          </div>
          <button onClick={() => setTestSentMessage(null)} className="text-emerald-700 hover:text-emerald-900">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Tabs Switcher: Notifications vs Email Log */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('notifications')}
          className={`flex items-center gap-2 px-4 py-2.5 font-bold text-xs border-b-2 transition cursor-pointer ${
            activeTab === 'notifications'
              ? 'border-[#00ad1d] text-[#00ad1d]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <BellRing className="w-3.5 h-3.5" />
          <span>In-App Notifications ({userNotifications.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('emails')}
          className={`flex items-center gap-2 px-4 py-2.5 font-bold text-xs border-b-2 transition cursor-pointer ${
            activeTab === 'emails'
              ? 'border-[#00ad1d] text-[#00ad1d]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Mail className="w-3.5 h-3.5" />
          <span>Email Dispatch Outbox ({dispatchedEmails.length})</span>
          <span className="px-1.5 py-0.2 bg-sky-100 text-sky-800 text-[10px] rounded-full">
            Auto-Triggered
          </span>
        </button>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-md p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        {activeTab === 'notifications' ? (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-slate-600">Category:</span>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-slate-700 font-medium text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="All">All Categories</option>
                <option value="task_rating_required">Task Ratings</option>
                <option value="new_message">Messages</option>
                <option value="general">General / Tasks</option>
                <option value="meeting">Meetings</option>
                <option value="notice">Circulars</option>
                <option value="approval">Approvals</option>
                <option value="project">Projects</option>
                <option value="document">Documents</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-slate-600">Priority:</span>
              <select
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-slate-700 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="All">All Priorities</option>
                <option value="Urgent">Urgent</option>
                <option value="Normal">Normal</option>
              </select>
            </div>
          </div>
        ) : (
          <div className="text-slate-600 font-medium text-xs flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Automatic Email Delivery Active for All Operational Events</span>
          </div>
        )}

        <div className="relative min-w-[200px] flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              activeTab === 'notifications'
                ? 'Search notification text or actor...'
                : 'Search dispatched emails by subject or recipient...'
            }
            className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
      </div>

      {/* Main Tab Content */}
      {activeTab === 'notifications' ? (
        <div className="space-y-2.5">
          {filteredNotifications.length === 0 ? (
            <div className="bg-white rounded-md border border-slate-200 p-12 text-center text-slate-400 text-xs space-y-2">
              <BellRing className="w-8 h-8 mx-auto text-slate-300" />
              <p className="font-semibold text-slate-700">No notifications found</p>
              <p className="text-slate-400">All caught up! New operational updates will appear here automatically.</p>
            </div>
          ) : (
            filteredNotifications.map((notif) => {
              const timeStr = notif.createdAt 
                ? new Date(notif.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                : 'Recent';

              const meta = notif.metadata as { taskId?: string; requiresRating?: boolean } | undefined;
              const taskForNotif = meta?.taskId ? tasks.find(t => t.id === meta.taskId) : null;
              const isTaskRequiresRating = Boolean(taskForNotif && taskForNotif.pendingRating && !taskForNotif.rating && !isPersonalTask(taskForNotif, currentUser.id));
              const isRatingRequired = notif.type === 'task_rating_required' && Boolean(meta?.requiresRating) && isTaskRequiresRating;

              return (
                <div
                  key={notif.id}
                  className={`bg-white rounded-md border p-4 shadow-2xs transition flex items-start justify-between gap-4 ${
                    !notif.read ? 'border-emerald-300 bg-emerald-50/20' : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <UserAvatar
                      avatar={notif.actorAvatar}
                      name={notif.actorName || 'User'}
                      className="w-9 h-9 border border-slate-200 shrink-0"
                    />

                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-slate-900">{notif.title}</span>
                        {getTypeBadge(notif.type)}
                        {notif.priority === 'Urgent' && (
                          <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px] font-bold">
                            Urgent
                          </span>
                        )}
                        {!notif.read && (
                          <span className="w-2 h-2 rounded-full bg-emerald-500" title="Unread"></span>
                        )}
                      </div>

                      <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">
                        {notif.message}
                      </p>

                      {/* Delivery & Dispatch Indicators */}
                      <div className="flex items-center gap-2.5 flex-wrap pt-1.5 text-[10px]">
                        <span className="text-slate-400">
                          By <b>{notif.actorName || 'System'}</b> â€¢ {timeStr}
                        </span>

                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 font-semibold border border-emerald-200">
                          <Volume2 className="w-3 h-3 text-emerald-600" />
                          <span>Sound Chime</span>
                        </span>

                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-sky-50 text-sky-800 font-semibold border border-sky-200"
                          title="Open the email outbox to check actual queue and submission status"
                        >
                          <Mail className="w-3 h-3 text-sky-600" />
                          <span>Check email outbox</span>
                        </span>

                        {notif.pushedToMicrosoftTeams && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-purple-50 text-purple-800 font-semibold border border-purple-200">
                            <span>Teams Pushed</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions: Rate Task, Read Toggle, & Delete Button */}
                  <div className="flex items-center gap-1.5 shrink-0 self-start flex-wrap justify-end">
                    {isRatingRequired && meta?.taskId && (
                      <button
                        type="button"
                        onClick={() => {
                          if (onSelectTask) onSelectTask(meta.taskId!);
                        }}
                        className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded text-xs font-bold shadow-2xs transition flex items-center gap-1 cursor-pointer"
                      >
                        <span>â˜…</span>
                        <span>Rate Task</span>
                      </button>
                    )}

                    {!notif.read && !isRatingRequired && (
                      <button
                        onClick={() => actions.markNotificationAsRead(notif.id)}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-semibold transition cursor-pointer"
                        title="Mark as read"
                      >
                        Mark Read
                      </button>
                    )}

                    {isRatingRequired ? (
                      <span
                        className="px-2 py-1 rounded bg-amber-100 text-amber-900 font-bold text-[10px] border border-amber-300"
                        title="Rating is compulsory before dismiss"
                      >
                        Compulsory
                      </span>
                    ) : (
                      <button
                        onClick={() => actions.deleteNotification(notif.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition cursor-pointer"
                        title="Delete Notification"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* Email Dispatch Outbox Tab */
        <div className="space-y-3">
          {filteredEmails.length === 0 ? (
            <div className="bg-white rounded-md border border-slate-200 p-12 text-center text-slate-400 text-xs space-y-2">
              <Mail className="w-8 h-8 mx-auto text-slate-300" />
              <p className="font-semibold text-slate-700">No dispatched emails recorded</p>
              <p className="text-slate-400">Email status appears here for supported OfficeHub events after email notifications are enabled.</p>
            </div>
          ) : (
            filteredEmails.map((email) => {
              const timeStr = email.timestamp
                ? new Date(email.timestamp).toLocaleString('en-GB', {
                    timeZone: 'Africa/Dar_es_Salaam',
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  }) + ' EAT'
                : 'Just now';

              return (
                <div
                  key={email.id}
                  className="bg-white rounded-md border border-slate-200 p-4 shadow-2xs hover:border-slate-300 transition flex flex-col sm:flex-row items-start justify-between gap-3"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-slate-900 truncate">
                        {email.subject}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 text-[10px] font-bold border border-emerald-200 flex items-center gap-1">
                        <Mail className="w-3 h-3" />
                        <span>{emailStatusLabel[email.status]}</span>
                      </span>
                      {email.priority === 'Urgent' && (
                        <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px] font-bold">
                          Urgent
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-slate-600 flex items-center gap-2 flex-wrap">
                      <span>To: <b>{email.recipientName}</b> &lt;{email.recipientEmail}&gt;</span>
                      <span>â€¢</span>
                      <span>From: <b>{email.senderName}</b> &lt;{email.senderEmail}&gt;</span>
                      <span>â€¢</span>
                      <span className="text-slate-400">{timeStr}</span>
                    </div>

                    <p className="text-xs text-slate-500 line-clamp-2 mt-1">
                      {email.bodyText.split('\n')[2] || email.bodyText.slice(0, 140)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
                    <button
                      onClick={() => setSelectedEmail(email)}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5 text-slate-600" />
                      <span>Preview Email</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Email Preview Modal */}
      {selectedEmail && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-[#00ad1d]" />
                <span className="font-bold text-sm text-slate-800">Email Broadcast Preview</span>
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold text-[10px] rounded">
                  {emailStatusLabel[selectedEmail.status]}
                </span>
              </div>
              <button
                onClick={() => setSelectedEmail(null)}
                className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Email Metadata */}
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50 text-xs space-y-1">
              <div><span className="font-semibold text-slate-500">Subject:</span> <span className="font-bold text-slate-800">{selectedEmail.subject}</span></div>
              <div><span className="font-semibold text-slate-500">To:</span> <span className="text-slate-800">{selectedEmail.recipientName} ({selectedEmail.recipientEmail})</span></div>
              <div><span className="font-semibold text-slate-500">From:</span> <span className="text-slate-800">{selectedEmail.senderName} ({selectedEmail.senderEmail})</span></div>
              <div><span className="font-semibold text-slate-500">Timestamp:</span> <span className="text-slate-600">{new Date(selectedEmail.timestamp).toLocaleString()} EAT</span></div>
            </div>

            {/* Email Body */}
            <div className="p-5 overflow-y-auto flex-1">
              <pre className="text-xs font-sans text-slate-700 whitespace-pre-wrap leading-relaxed bg-slate-50 p-4 rounded border border-slate-200">
                {selectedEmail.bodyText}
              </pre>
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs">
              <span className="text-slate-400 text-[11px]">
                Microsoft acceptance confirms submission; mailbox delivery is not tracked here.
              </span>
              <button
                onClick={() => setSelectedEmail(null)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white font-semibold rounded text-xs transition"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

