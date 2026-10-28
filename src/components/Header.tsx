import { isNotificationForUser } from '../services/notificationDelivery';
import React, { useState, useEffect, useRef } from 'react';
import { UserAvatar } from './UserAvatar';
import {
  Search,
  Bell,
  CheckCircle2,
  Zap,
  Radio,
  ExternalLink,
  Settings,
  RefreshCw,
  Video,
  Menu,
  FileText,
  CheckSquare,
  Plus,
  KeyRound,
  User,
  Trash2,
  Archive,
  Star,
  Mail,
  LogOut
} from 'lucide-react';
import { UserPresenceStatus } from '../types';
import { usePortalStore } from '../services/store';
import { formatStaffDisplayName, formatStaffDisplayOrgDept } from '../utils/staffHierarchy';
import { UserRatingDisplay } from './UserRatingDisplay';
import { SettingsTabType } from './SettingsModal';
import { isPersonalTask } from '../utils/taskUtils';
import { canUserViewDocument } from './SharePointView';

interface HeaderProps {
  onOpenSettings: () => void;
  onOpenSettingsTab?: (tab: SettingsTabType) => void;
  onOpenQuickAction: () => void;
  onSearchSelect?: (tab: string) => void;
  onToggleMobileMenu?: () => void;
  isNavigationOpen?: boolean;
  onSelectTask?: (taskId: string) => void;
  onSignOut?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  isNavigationOpen = false,
  onOpenSettings,
  onOpenSettingsTab,
  onOpenQuickAction,
  onSearchSelect,
  onToggleMobileMenu,
  onSelectTask,
  onSignOut,
}) => {
  const { currentUser, staff, actions, notices, tasks, meetings, sharePointDocs, notifications } = usePortalStore();
  const [presenceMenuOpen, setPresenceMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const notificationsRef = useRef<HTMLDivElement>(null);
  const presenceMenuRef = useRef<HTMLDivElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Close notifications bar, presence menu, or search dropdown on click outside or Escape
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (notificationsRef.current && !notificationsRef.current.contains(target)) {
        setNotificationsOpen(false);
      }
      if (presenceMenuRef.current && !presenceMenuRef.current.contains(target)) {
        setPresenceMenuOpen(false);
      }
      if (searchContainerRef.current && !searchContainerRef.current.contains(target)) {
        setShowSearchDropdown(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setNotificationsOpen(false);
        setPresenceMenuOpen(false);
        setShowSearchDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const userNotifications = notifications.filter(n => isNotificationForUser(n, currentUser));
  const unreadNotifCount = userNotifications.filter(n => !n.read).length;
  const myPendingTasks = tasks.filter(t => (t.assignedToId === currentUser.id || (Array.isArray(t.assignedToIds) && t.assignedToIds.includes(currentUser.id))) && t.status !== 'Done');

  const isOutOfOffice = currentUser.outOfOffice || currentUser.status === 'Out of Office';

  const getStatusDetails = (status: UserPresenceStatus) => {
    switch (status) {
      case 'Online':
        return { label: 'Online', badge: 'Active', desc: 'Active in OfficeHub', color: 'bg-[#00ad1d]', isAuto: true };
      case 'In Teams Meeting':
        return { label: 'In Teams Meeting', badge: 'Meeting', desc: 'Meeting status', color: 'bg-purple-600', isAuto: true };
      case 'Offline':
        return { label: 'Offline', badge: 'Disconnected', desc: 'No recent OfficeHub activity', color: 'bg-slate-400', isAuto: true };
      case 'Out of Office':
        return { label: 'Out of Office', badge: 'On Leave / Travel', desc: currentUser.outOfOfficeMessage || 'Away from office', color: 'bg-amber-500', isAuto: false };
      case 'Busy':
        return { label: 'Busy', badge: 'Busy', desc: 'Marked busy', color: 'bg-rose-500', isAuto: true };
      case 'Away':
        return { label: 'Away', badge: 'Idle', desc: 'Inactive in OfficeHub', color: 'bg-amber-500', isAuto: true };
      default:
        return { label: 'Offline', badge: 'Disconnected', desc: 'No recent OfficeHub activity', color: 'bg-slate-400', isAuto: true };
    }
  };

  const currentPresence = getStatusDetails(currentUser.status);

  const handleManualSync = () => {
    setIsSyncing(true);
    setTimeout(() => {
      setIsSyncing(false);
      actions.logAudit('m365_cloud_resync', 'Microsoft Teams & SharePoint status synced', 'emerald');
    }, 600);
  };

  const filteredTasks = searchQuery.trim() ? tasks.filter(t => t.title.toLowerCase().includes(searchQuery.toLowerCase())) : [];
  const filteredDocs = searchQuery.trim() ? sharePointDocs.filter(d => canUserViewDocument(d, currentUser) && d.name.toLowerCase().includes(searchQuery.toLowerCase())) : [];
  const filteredNotices = searchQuery.trim() ? notices.filter(n => n.title.toLowerCase().includes(searchQuery.toLowerCase())) : [];
  const filteredStaff = searchQuery.trim()
    ? staff.filter(s =>
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.organisation || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.department || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.email.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  return (
    <>
      {(notificationsOpen || presenceMenuOpen || showSearchDropdown) && (
        <div
          className="fixed inset-0 z-30 bg-transparent"
          onClick={() => {
            setNotificationsOpen(false);
            setPresenceMenuOpen(false);
            setShowSearchDropdown(false);
          }}
        />
      )}
      <header className="oh-header sticky top-0 z-40 bg-white border-b border-slate-200">
      {/* Left: Brand Identity */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onToggleMobileMenu}
          className="p-1.5 rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition"
          aria-label="Toggle navigation menu" aria-expanded={isNavigationOpen} aria-controls="officehub-navigation"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2.5 min-w-0">
          <span className="inline-flex items-center justify-center overflow-hidden rounded-md bg-white shrink-0 h-9 w-9 border border-slate-200">
            <img
              src="/wipahs-logo.jpg"
              alt="WIPAHS OfficeHub"
              className="h-full w-full object-cover object-top"
              onError={(e) => {
                // fallback gracefully
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          </span>
          <div className="min-w-0">
            <p className="font-bold leading-tight truncate text-[15px] text-[#19232d] tracking-tight">WIPAHS</p>
            <p className="leading-tight truncate text-[11px] text-slate-500 font-medium">OfficeHub</p>
          </div>
        </div>
      </div>

      {/* Center: Search */}
      <div className="oh-search relative min-w-0" ref={searchContainerRef}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setShowSearchDropdown(e.target.value.length > 0);
            }}
            onFocus={() => setShowSearchDropdown(searchQuery.length > 0)}
            aria-label="Search OfficeHub"
            placeholder="Search tasks, documents, staff, notices..."
            className="w-full pl-9 pr-4 py-1.5 bg-slate-50 hover:bg-slate-100/80 focus:bg-white text-xs text-slate-800 placeholder-slate-400 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#00ad1d] focus:border-[#00ad1d] transition"
          />
        </div>

        {/* Search Results Dropdown */}
        {showSearchDropdown && (
          <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-md shadow-lg p-2 z-50 max-h-96 overflow-y-auto text-xs">
            <div className="flex items-center justify-between px-2 py-1 text-[11px] text-slate-400 font-medium border-b border-slate-100 mb-1">
              <span>Results for "{searchQuery}"</span>
              <button
                onClick={() => setShowSearchDropdown(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                Close
              </button>
            </div>

            {filteredTasks.length === 0 && filteredDocs.length === 0 && filteredNotices.length === 0 && filteredStaff.length === 0 ? (
              <p className="text-slate-500 text-center py-4">No matching records found.</p>
            ) : (
              <div className="space-y-2">
                {filteredStaff.length > 0 && (
                  <div>
                    <span className="text-[10px] uppercase font-semibold text-slate-400 px-2">Authorized Staff</span>
                    {filteredStaff.slice(0, 4).map(member => (
                      <div
                        key={member.id}
                        onClick={() => {
                          onSearchSelect?.('staff-directory');
                          setShowSearchDropdown(false);
                        }}
                        className="px-2 py-1.5 hover:bg-slate-50 rounded cursor-pointer flex items-center justify-between"
                      >
                        <div className="min-w-0 pr-2">
                          <p className="font-semibold text-slate-800 truncate">{formatStaffDisplayName(member)}</p>
                          <p className="text-[10px] text-[#008f18] font-medium truncate">{formatStaffDisplayOrgDept(member)}</p>
                        </div>
                        <span className="text-[10px] text-slate-400 shrink-0">{member.status}</span>
                      </div>
                    ))}
                  </div>
                )}

                {filteredTasks.length > 0 && (
                  <div>
                    <span className="text-[10px] uppercase font-semibold text-slate-400 px-2">Tasks</span>
                    {filteredTasks.slice(0, 3).map(task => (
                      <div
                        key={task.id}
                        onClick={() => {
                          onSearchSelect?.('tasks-my-work');
                          setShowSearchDropdown(false);
                        }}
                        className="px-2 py-1.5 hover:bg-slate-50 rounded cursor-pointer flex items-center justify-between"
                      >
                        <span className="font-medium text-slate-800 truncate">{task.title}</span>
                        <span className="text-[10px] text-slate-400">{task.priority}</span>
                      </div>
                    ))}
                  </div>
                )}

                {filteredDocs.length > 0 && (
                  <div>
                    <span className="text-[10px] uppercase font-semibold text-slate-400 px-2">SharePoint Documents</span>
                    {filteredDocs.slice(0, 3).map(doc => (
                      <div
                        key={doc.id}
                        onClick={() => {
                          onSearchSelect?.('documents');
                          setShowSearchDropdown(false);
                        }}
                        className="px-2 py-1.5 hover:bg-slate-50 rounded cursor-pointer flex items-center justify-between"
                      >
                        <span className="font-medium text-slate-800 truncate">{doc.name}</span>
                        <span className="text-[10px] text-slate-400">{doc.category}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right Controls */}
      <div className="oh-header-actions flex items-center">
        {/* Quick New Task / Item Button */}
        <button
          onClick={onOpenQuickAction}
          aria-label="Create new record"
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#00ad1d] hover:bg-[#009218] text-white rounded-md text-xs font-semibold shadow-xs transition"
        >
          <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
          <span className="hidden sm:inline">New</span>
        </button>

        {/* Sync Status Button */}
        <button
          onClick={handleManualSync}
          disabled={isSyncing}
          title="Sync with Microsoft Teams & SharePoint"
          className="p-1.5 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition relative"
        >
          <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-[#00ad1d]' : ''}`} />
        </button>

        {/* Notifications Bell */}
        <div className="relative" ref={notificationsRef}>
          <button
            onClick={() => setNotificationsOpen(!notificationsOpen)}
            className="p-1.5 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition relative"
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4" />
            {userNotifications.length > 0 && (
              <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center ring-2 ring-white">
                {userNotifications.length}
              </span>
            )}
          </button>

          {/* Notifications Flyout */}
          {notificationsOpen && (
            <div className="oh-notifications absolute right-0 top-full mt-2 w-88 bg-white border border-slate-200 rounded-lg shadow-xl p-3 z-50 text-xs animate-in fade-in duration-150">
              <div className="flex flex-wrap gap-2 items-center justify-between pb-2 border-b border-slate-100 mb-2">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-slate-800">Notifications & Alerts</span>
                  {unreadNotifCount > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full bg-rose-100 text-rose-800 text-[10px] font-bold">
                      {unreadNotifCount} new
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[10px]">
                  {unreadNotifCount > 0 && (
                    <button
                      onClick={() => actions.markAllNotificationsAsRead(currentUser.id)}
                      className="text-[#008f18] hover:underline font-semibold"
                    >
                      Mark all read
                    </button>
                  )}
                  {userNotifications.length > 0 && (
                    <button
                      onClick={() => actions.clearNotifications(currentUser.id)}
                      className="text-rose-600 hover:underline font-semibold flex items-center gap-0.5"
                      title="Clear All Notifications"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Clear All</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-2 max-h-80 overflow-y-auto">
                {userNotifications.map(notif => {
                  const isConflict = notif.type === 'meeting_conflict';
                  const isProposal = notif.type === 'meeting_proposal';
                  const isCancelled = notif.type === 'meeting_cancelled';
                  const isRescheduled = notif.type === 'meeting_rescheduled';
                  const isScheduled = notif.type === 'meeting_scheduled';
                  const meta = notif.metadata as { taskId?: string; requiresRating?: boolean } | undefined;
                  const taskForNotif = meta?.taskId ? tasks.find(t => t.id === meta.taskId) : null;
                  const isRatingRequired = notif.type === 'task_rating_required' &&
                    Boolean(meta?.requiresRating) &&
                    Boolean(taskForNotif && taskForNotif.pendingRating && !taskForNotif.rating && !isPersonalTask(taskForNotif, currentUser.id));

                  // Check if this is a proposal for a meeting where current user is organizer
                  const relatedMeeting = notif.meetingId ? meetings.find(m => m.id === notif.meetingId) : null;
                  const isOrganizerOfMeeting = relatedMeeting && relatedMeeting.organizerId === currentUser.id;

                  return (
                    <div
                      key={notif.id}
                      onClick={() => {
                        if (!notif.read && !isRatingRequired) actions.markNotificationAsRead(notif.id);
                      }}
                      className={`p-2.5 rounded-lg border transition space-y-1.5 ${
                        !notif.read
                          ? isRatingRequired
                            ? 'bg-amber-50/95 border-amber-300 ring-1 ring-amber-300 shadow-2xs'
                            : isConflict
                            ? 'bg-amber-50/95 border-amber-300 shadow-2xs'
                            : isCancelled
                            ? 'bg-rose-50/90 border-rose-300 shadow-2xs'
                            : isProposal
                            ? 'bg-purple-50/95 border-purple-300 shadow-2xs'
                            : notif.type === 'new_message'
                            ? 'bg-sky-50/80 border-sky-200 shadow-2xs'
                            : 'bg-emerald-50/70 border-emerald-200 shadow-2xs'
                          : 'bg-slate-50/70 border-slate-200 opacity-85'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {notif.actorAvatar ? (
                            <UserAvatar name={notif.actorName} avatar={notif.actorAvatar} className="w-5 h-5" />
                          ) : (
                            <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-700 font-bold text-[9px] flex items-center justify-center shrink-0">
                              M365
                            </span>
                          )}
                          <p className="font-bold text-[11px] text-slate-900 truncate">{notif.title}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[9px] text-slate-400 font-medium">
                            {notif.createdAt ? new Date(notif.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                          </span>
                          {isRatingRequired ? (
                            <span
                              className="px-1.5 py-0.5 rounded bg-amber-200 text-amber-900 font-bold text-[9px] border border-amber-300"
                              title="Rating is compulsory before dismiss"
                            >
                              Compulsory
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                actions.deleteNotification(notif.id);
                              }}
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition"
                              title="Delete notification"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>

                      <p className="text-[11px] text-slate-700 leading-relaxed">{notif.message}</p>

                      <div className="flex items-center justify-between pt-1 text-[9px]">
                        <div className="flex items-center gap-1">
                          {isRatingRequired ? (
                            <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-900 font-bold border border-amber-300 flex items-center gap-0.5">
                              <span>★ Rate Assignee</span>
                            </span>
                          ) : (
                            <>
                              {notif.emailTriggered && (
                                <span
                                  className="px-1.5 py-0.2 rounded bg-sky-100 text-sky-900 font-bold border border-sky-200 flex items-center gap-0.5"
                                  title={
                                    notif.emailRecipients && notif.emailRecipients.length > 0
                                      ? `Email notification triggered to: ${notif.emailRecipients.join(', ')}`
                                      : 'Email notification triggered'
                                  }
                                >
                                  <Mail className="w-2.5 h-2.5 shrink-0" />
                                  <span>Email Sent</span>
                                </span>
                              )}
                              {notif.pushedToMicrosoftTeams && (
                                <span className="px-1.5 py-0.2 rounded bg-purple-100 text-purple-900 font-bold border border-purple-200">
                                  Teams Pushed
                                </span>
                              )}
                            </>
                          )}
                          {notif.priority === 'Urgent' && (
                            <span className="px-1.5 py-0.2 rounded bg-rose-100 text-rose-800 font-bold">
                              Urgent
                            </span>
                          )}
                        </div>

                        {/* Direct Action for Compulsory Rating */}
                        {isRatingRequired && notif.metadata?.taskId && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setNotificationsOpen(false);
                              if (onSelectTask && notif.metadata?.taskId) {
                                onSelectTask(notif.metadata.taskId);
                              }
                            }}
                            className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded font-bold text-[10px] shadow-2xs transition flex items-center gap-1 cursor-pointer"
                          >
                            <span>★</span>
                            <span>Rate Task Now</span>
                          </button>
                        )}

                        {/* Quick Actions for meeting proposal on notification */}
                        {isProposal && isOrganizerOfMeeting && notif.actorId && relatedMeeting && (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                actions.acceptProposedMeetingTime(relatedMeeting.id, notif.actorId!);
                                actions.markNotificationAsRead(notif.id);
                              }}
                              className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold shadow-2xs transition"
                            >
                              Accept
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                actions.rejectProposedMeetingTime(relatedMeeting.id, notif.actorId!);
                                actions.markNotificationAsRead(notif.id);
                              }}
                              className="px-2 py-0.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded font-semibold transition"
                            >
                              Dismiss
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {userNotifications.length === 0 && (
                  <p className="text-center text-slate-400 py-4">All caught up! No pending notifications.</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Settings */}
        <button
          onClick={onOpenSettings}
          className="p-1.5 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition"
          title="Portal & Integration Settings"
        >
          <Settings className="w-4 h-4" />
        </button>

        {/* User Presence & Avatar */}
        <div className="relative" ref={presenceMenuRef}>
          <button
            onClick={() => setPresenceMenuOpen(!presenceMenuOpen)}
            aria-label="Account and presence" aria-expanded={presenceMenuOpen}
            className="flex items-center gap-2 p-1 pl-1.5 rounded-md hover:bg-slate-100 transition text-left"
          >
            <div className="relative">
              <UserAvatar
                avatar={currentUser.avatar}
                name={currentUser.name}
                className="w-7 h-7 border border-slate-200"
              />
              <span
                className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-white ${currentPresence.color}`}
              ></span>
            </div>
            <div className="hidden xl:block leading-tight">
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-semibold text-slate-800 leading-tight">
                  {formatStaffDisplayName(currentUser)}
                </p>
                <UserRatingDisplay
                  userId={currentUser.id}
                  size="xs"
                  onClick={() => {
                    if (onOpenSettingsTab) {
                      onOpenSettingsTab('ratings');
                    } else {
                      onOpenSettings();
                    }
                  }}
                  className="cursor-pointer hover:opacity-80"
                />
              </div>
              <p className="text-[10px] text-[#008f18] font-medium leading-tight truncate max-w-[140px]">
                {formatStaffDisplayOrgDept(currentUser)}
              </p>
            </div>
          </button>

          {/* Presence Status Dropdown */}
          {presenceMenuOpen && (
            <div className="oh-presence absolute right-0 top-full mt-2 w-56 bg-white border border-slate-200 rounded-md shadow-lg p-2 z-50 text-xs">
              <div className="px-2 py-1.5 border-b border-slate-100 mb-1">
                <p className="font-semibold text-slate-800">{formatStaffDisplayName(currentUser)}</p>
                <p className="text-[10px] text-[#008f18] font-medium">{formatStaffDisplayOrgDept(currentUser)}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">{currentUser.email}</p>
              </div>

              {/* Live Status Display & Location Toggle */}
              <div className="py-2 px-1 space-y-2.5">
                {/* Live System Detected Status */}
                <div className="p-2 bg-slate-50 border border-slate-200/80 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Live Status</span>
                    <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${
                      currentPresence.isAuto ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-800 border border-amber-200'
                    }`}>
                      {currentPresence.isAuto ? 'System Detected' : 'User Set'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${currentPresence.color} animate-pulse`} />
                    <div>
                      <p className="font-bold text-slate-800 text-xs">{currentPresence.label}</p>
                      <p className="text-[10px] text-slate-500">{currentPresence.desc}</p>
                    </div>
                  </div>
                </div>

                {/* Office Availability Toggle (Only editable option for user) */}
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1.5">
                    My Office Availability
                  </label>
                  <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-lg">
                    <button
                      type="button"
                      onClick={() => {
                        void actions.setUserOfficeStatus(currentUser.id, true).catch(error => window.alert(error.message));
                      }}
                      className={`py-1.5 px-2 rounded-md text-xs font-semibold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                        !isOutOfOffice
                          ? 'bg-white text-emerald-800 shadow-xs border border-slate-200'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span>In Office</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        void actions.setUserOfficeStatus(currentUser.id, false).catch(error => window.alert(error.message));
                      }}
                      className={`py-1.5 px-2 rounded-md text-xs font-semibold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                        isOutOfOffice
                          ? 'bg-white text-amber-800 shadow-xs border border-slate-200'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                      <span>Out of Office</span>
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1.5 leading-tight">
                    Online and Away follow activity in OfficeHub. Office availability is set by you.
                  </p>
                </div>
              </div>

              <div className="pt-1.5 mt-1 border-t border-slate-100 space-y-0.5">
                <button
                  onClick={() => {
                    setPresenceMenuOpen(false);
                    if (onOpenSettingsTab) {
                      onOpenSettingsTab('ratings');
                    } else {
                      onOpenSettings();
                    }
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-slate-700 hover:bg-slate-50 transition font-medium"
                >
                  <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                  <span>Performance Ratings</span>
                </button>

                <button
                  onClick={() => {
                    setPresenceMenuOpen(false);
                    if (onOpenSettingsTab) {
                      onOpenSettingsTab('profile');
                    } else {
                      onOpenSettings();
                    }
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-slate-700 hover:bg-slate-50 transition"
                >
                  <User className="w-3.5 h-3.5 text-blue-600" />
                  <span>My Profile & Leave</span>
                </button>

                <button
                  onClick={() => {
                    setPresenceMenuOpen(false);
                    if (onOpenSettingsTab) {
                      onOpenSettingsTab('profile');
                    } else {
                      onOpenSettings();
                    }
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-slate-700 hover:bg-slate-50 transition"
                >
                  <KeyRound className="w-3.5 h-3.5 text-amber-600" />
                  <span>Security & Credentials</span>
                </button>

                <button
                  onClick={() => {
                    setPresenceMenuOpen(false);
                    if (onOpenSettingsTab) {
                      onOpenSettingsTab('archive');
                    } else {
                      onOpenSettings();
                    }
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-slate-700 hover:bg-slate-50 transition"
                >
                  <Archive className="w-3.5 h-3.5 text-purple-600" />
                  <span>Personal Archive</span>
                </button>

                {onSignOut && (
                  <button
                    onClick={() => {
                      setPresenceMenuOpen(false);
                      onSignOut();
                    }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-rose-600 hover:bg-rose-50 transition font-medium border-t border-slate-100 mt-1 pt-1.5 cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5 text-rose-600" />
                    <span>Sign Out</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
    </>
  );
};
