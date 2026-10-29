import React, { useState, useEffect, useMemo } from 'react';
import {
  CheckSquare,
  FileText,
  Video,
  Users,
  BellRing,
  Plus,
  Calendar,
  AlertTriangle,
  ChevronRight,
  User,
  ShieldCheck,
  Briefcase,
  FileUp,
  BookOpen,
  DollarSign,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { usePortalStore } from '../services/store';
import { TabId } from './Sidebar';
import { fetchAyahOfTheDay, QuranAyah } from '../services/quranService';
import { useHijriDate } from '../utils/hijriDate';
import { isMyPersonalOrAssignedTask } from '../utils/taskUtils';
import { Project } from '../types';
import { getProjectFinancials } from '../utils/projectFinancials';

interface DashboardViewProps {
  onSelectTab: (tab: TabId) => void;
  onOpenQuickAction: () => void;
  onOpenTeamsMeetingModal: () => void;
  onSelectNotice?: (noticeId: string) => void;
  onSelectApproval?: (approvalId: string) => void;
  onSelectMeeting?: (meetingId: string) => void;
  onSelectProject?: (proj: Project, tab?: 'milestones' | 'budget' | 'tasks' | 'log') => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onSelectTab,
  onOpenQuickAction,
  onOpenTeamsMeetingModal,
  onSelectNotice,
  onSelectApproval,
  onSelectMeeting,
  onSelectProject,
}) => {
  const { tasks, notices, currentUser, approvals, meetings, projects } = usePortalStore(['tasks', 'notices', 'currentUser', 'approvals', 'meetings', 'projects']);
  const [ayah, setAyah] = useState<QuranAyah | null>(null);
  const hijriDate = useHijriDate();

  useEffect(() => {
    fetchAyahOfTheDay().then(setAyah);
  }, []);

  const myTasks = tasks.filter(t => {
    if (t.status === 'Cancelled') return false;
    return isMyPersonalOrAssignedTask(t, currentUser.id, currentUser.name);
  });

  const todayStr = new Date().toISOString().split('T')[0];
  const openTasks = myTasks.filter(t => t.status !== 'Done');
  const overdueTasksCount = openTasks.filter(t => t.dueDate && t.dueDate < todayStr).length;
  const dueSoonTasksCount = openTasks.filter(t => {
    if (!t.dueDate) return false;
    const due = new Date(t.dueDate);
    const today = new Date();
    const diffTime = due.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= 3;
  }).length;
  const doneTasksCount = myTasks.filter(t => t.status === 'Done').length;

  const unacknowledgedNotices = notices.filter(n =>
    !n.acknowledgedBy.includes(currentUser.id) &&
    !n.acknowledgedBy.includes(currentUser.name)
  );

  const pendingApprovals = approvals.filter(a => a.status === 'Pending');
  const upcomingMeetings = meetings.filter(m => m.status === 'Scheduled');

  return (
    <div className="oh-dashboard space-y-5">
      {/* Banner */}
      <div className="oh-welcome rounded-lg bg-gradient-to-r from-[#005a9c] via-[#008f58] to-[#00a651] p-4 sm:p-6 text-white grid gap-5 xl:grid-cols-2">
        <div className="space-y-2 min-w-0">
          <span className="inline-block bg-white/20 px-3 py-1 rounded text-[11px] font-semibold tracking-wider uppercase">My OfficeHub</span>
          <h1 className="text-2xl sm:text-3xl font-bold">Welcome, {currentUser.name.split(' ')[0]}</h1>
          <p className="text-xs sm:text-sm opacity-90 font-medium flex items-center gap-2.5 flex-wrap">
            <span>{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
            {hijriDate && (
              <>
                <span className="inline-block w-px h-3.5 bg-white/35 self-center" />
                <span className="text-emerald-100 font-medium">{hijriDate}</span>
              </>
            )}
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <span className="flex items-center gap-1.5 bg-black/10 px-2.5 py-1 rounded text-xs font-medium"><ShieldCheck className="w-3.5 h-3.5"/> {currentUser.role}</span>
            <span className="flex items-center gap-1.5 bg-black/10 px-2.5 py-1 rounded text-xs font-medium"><Briefcase className="w-3.5 h-3.5"/> {currentUser.department}</span>
            <span className="flex items-center gap-1.5 bg-yellow-400/20 px-2.5 py-1 rounded text-xs font-medium text-yellow-50"><BellRing className="w-3.5 h-3.5"/> You are all caught up</span>
          </div>
        </div>

        {/* Ayah of the Day */}
        {ayah && (
          <div className="min-w-0 border-t border-white/20 pt-4 xl:border-t-0 xl:border-l xl:pl-5 text-left font-sans space-y-2">
            <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-widest text-emerald-100/90 flex items-center gap-1 md:justify-end">
              <BookOpen className="w-3 h-3 text-emerald-200" />
              <span>Ayah of the Day</span>
            </p>
            <p
              className="text-lg sm:text-xl font-semibold text-white/95 leading-relaxed tracking-wide font-['Amiri',serif] drop-shadow-xs"
              dir="rtl"
              style={{ fontFamily: "'Amiri', 'Scheherazade New', serif" }}
            >
              {ayah.arabicText}
            </p>
            <p className="text-xs sm:text-sm text-white/90 italic font-['Lora',serif] leading-snug drop-shadow-2xs">
              “{ayah.translation}”
            </p>
            <p className="text-[10px] sm:text-[11px] font-bold text-white/80 uppercase tracking-widest md:text-right">
              ― {ayah.citation} ({ayah.edition})
            </p>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
        {[
          { icon: Plus, title: 'Create task', desc: 'Assign work and a deadline', action: onOpenQuickAction },
          { icon: Video, title: 'Schedule meeting', desc: 'Invite staff and set an agenda', action: onOpenTeamsMeetingModal },
          { icon: Briefcase, title: 'Start project', desc: 'Open a new work programme', action: () => onSelectTab('projects') },
          { icon: FileUp, title: 'Upload document', desc: 'Add a file to the secure library', action: () => onSelectTab('documents') },
          { icon: Calendar, title: 'Open calendar', desc: 'See meetings, tasks and activities', action: () => onSelectTab('calendar') },
        ].map((action, i) => (
          <button key={i} onClick={action.action} className="bg-white p-4 rounded border border-slate-200 hover:border-emerald-500 shadow-sm transition text-left space-y-1">
            <action.icon className="w-5 h-5 text-emerald-600" />
            <h3 className="font-bold text-sm text-slate-900">{action.title}</h3>
            <p className="text-xs text-slate-500 leading-relaxed">{action.desc}</p>
          </button>
        ))}
      </div>

      {/* Main Area */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Notices */}
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
          <div className="flex flex-wrap gap-3 justify-between items-center mb-5">
            <h2 className="font-bold text-slate-900 flex items-center gap-2.5"><BellRing className="w-5 h-5 text-emerald-600" /> Notices & Circulars</h2>
            <button onClick={() => onSelectTab('notices')} className="text-emerald-600 text-sm font-semibold flex items-center hover:underline">View all notices <ChevronRight className="w-4 h-4" /></button>
          </div>
          {unacknowledgedNotices.length > 0 ? (
            <div className="space-y-3">
              {unacknowledgedNotices.slice(0, 2).map(notice => (
                <div
                  key={notice.id}
                  onClick={() => onSelectNotice ? onSelectNotice(notice.id) : onSelectTab('notices')}
                  className="p-3 bg-slate-50 hover:bg-slate-100 rounded border border-slate-100 cursor-pointer transition"
                >
                  <p className="text-sm font-semibold text-slate-900 hover:text-emerald-600">{notice.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{notice.date} • <span className="font-semibold text-emerald-600">View Notice</span></p>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-slate-500">No new notices to acknowledge</p>}
        </div>

        {/* My Tasks Stats */}
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-bold text-slate-900 flex items-center gap-2.5">
              <CheckSquare className="w-5 h-5 text-emerald-600" /> My Tasks
            </h2>
            <button onClick={() => onSelectTab('tasks-my-work')} className="text-emerald-600 text-sm font-semibold flex items-center hover:underline">
              View tasks <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3 cursor-pointer" onClick={() => onSelectTab('tasks-my-work')}>
            {[
              { label: 'Open', count: openTasks.length, color: 'text-slate-900' },
              { label: 'Overdue', count: overdueTasksCount, color: 'text-red-600' },
              { label: 'Due soon', count: dueSoonTasksCount, color: 'text-yellow-600' },
              { label: 'Done', count: doneTasksCount, color: 'text-emerald-600' },
            ].map((stat, i) => (
              <div key={i} className="border border-slate-100 p-4 rounded-lg bg-slate-50 hover:bg-slate-100 transition">
                <p className={`text-3xl font-bold ${stat.color}`}>{stat.count}</p>
                <p className="text-xs text-slate-500 font-medium">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      {/* Bottom section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-bold text-slate-900 flex items-center gap-2.5"><Calendar className="w-5 h-5 text-emerald-600" /> Upcoming Schedule</h2>
            <button onClick={() => onSelectTab('calendar')} className="text-emerald-600 text-sm font-semibold flex items-center hover:underline">Calendar <ChevronRight className="w-4 h-4" /></button>
          </div>
          <div className="space-y-2">
            {upcomingMeetings.length > 0 ? (
              upcomingMeetings.slice(0, 2).map(mtg => (
                <div
                  key={mtg.id}
                  className="p-3 bg-slate-50 border-l-4 border-yellow-500 rounded cursor-pointer hover:bg-slate-100 transition"
                  onClick={() => onSelectMeeting ? onSelectMeeting(mtg.id) : onSelectTab('calendar')}
                >
                   <p className="text-sm font-semibold text-slate-900">{mtg.title}</p>
                   <p className="text-xs text-slate-500">{mtg.date} at {mtg.time || mtg.startTime} • <span className="font-semibold text-emerald-600">View in Calendar</span></p>
                </div>
              ))
            ) : (
              <div className="p-3 bg-slate-50 rounded border border-slate-100 cursor-pointer" onClick={() => onSelectTab('calendar')}>
                 <p className="text-sm font-semibold text-slate-900">No upcoming meetings today</p>
                 <p className="text-xs text-slate-500">Click to view full calendar</p>
              </div>
            )}
          </div>
          <button onClick={() => onSelectTab('calendar')} className="mt-4 text-emerald-600 text-sm font-semibold flex items-center hover:underline">View full calendar <ChevronRight className="w-4 h-4" /></button>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-bold text-slate-900 flex items-center gap-2.5"><ShieldCheck className="w-5 h-5 text-emerald-600" /> Pending Approvals</h2>
            <button onClick={() => onSelectTab('approvals')} className="text-emerald-600 text-sm font-semibold flex items-center hover:underline">View all <ChevronRight className="w-4 h-4" /></button>
          </div>
          <div className="space-y-2">
            {pendingApprovals.length > 0 ? (
              pendingApprovals.slice(0, 3).map(appr => (
                <div
                  key={appr.id}
                  onClick={() => onSelectApproval ? onSelectApproval(appr.id) : onSelectTab('approvals')}
                  className="p-3 bg-slate-50 hover:bg-slate-100 rounded border border-slate-100 cursor-pointer transition"
                >
                  <div className="flex justify-between items-start">
                    <p className="text-sm font-semibold text-slate-900">{appr.title}</p>
                    {appr.amount && <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">{appr.amount}</span>}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{appr.department} • Requested by {appr.requestedBy}</p>
                </div>
              ))
            ) : (
              <div className="p-4 text-center text-slate-500 text-xs bg-slate-50 rounded border border-slate-100">
                <p className="font-semibold text-slate-700">No pending approvals</p>
                <p className="text-slate-400 mt-0.5">All requests have been reviewed.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
