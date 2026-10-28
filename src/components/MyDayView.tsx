import React, { useState, useEffect } from 'react';
import {
  CheckSquare,
  Video,
  Clock,
  BellRing,
  ChevronRight,
  BookOpen
} from 'lucide-react';
import { usePortalStore } from '../services/store';
import { TabId } from './Sidebar';
import { fetchHadithOfTheDay, ShiaHadith } from '../services/hadithService';
import { useHijriDate } from '../utils/hijriDate';
import { isMyPersonalOrAssignedTask } from '../utils/taskUtils';
import { isMeetingArchived, isUserInvolvedInMeeting } from '../utils/archiveUtils';

interface MyDayViewProps {
  onSelectTab: (tab: TabId) => void;
  onOpenQuickAction: () => void;
  onSelectTask?: (taskId: string) => void;
  onSelectMeeting?: (meetingId: string) => void;
}

export const MyDayView: React.FC<MyDayViewProps> = ({
  onSelectTab,
  onOpenQuickAction,
  onSelectTask,
  onSelectMeeting,
}) => {
  const { tasks, meetings, currentUser } = usePortalStore();
  const [hadith, setHadith] = useState<ShiaHadith | null>(null);
  const hijriDate = useHijriDate();

  useEffect(() => {
    fetchHadithOfTheDay().then(setHadith);
  }, []);

  const myTasks = tasks.filter(t => {
    if (t.status === 'Done' || t.status === 'Cancelled') return false;
    return isMyPersonalOrAssignedTask(t, currentUser.id, currentUser.name);
  });
  const todayMeetings = meetings.filter(
    m => !isMeetingArchived(m) && m.status !== 'Cancelled' && m.status !== 'Completed' && isUserInvolvedInMeeting(m, currentUser)
  );

  return (
    <div className="space-y-6">
      {/* My Day Header Banner with Hadith of the Day Overlay */}
      <div className="relative bg-gradient-to-r from-[#004d40] via-[#00695c] to-[#008f58] rounded-lg p-6 sm:p-8 text-white flex flex-col md:flex-row justify-between items-start md:items-center gap-6 shadow-md overflow-hidden">
        <div className="space-y-2 z-10 shrink-0">
          <span className="inline-block bg-white/20 px-3 py-1 rounded text-[11px] font-semibold tracking-wider uppercase">
            Daily Focus
          </span>
          <h1 className="text-3xl sm:text-4xl font-bold">My Day</h1>
          <p className="text-xs sm:text-sm text-white/90 font-medium">
            Hello {currentUser.name}, here is your schedule and tasks for today.
          </p>
          <p className="text-[11px] text-white/80 font-semibold pt-1 flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-emerald-200" />
              <span>{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
            </span>
            {hijriDate && (
              <>
                <span className="inline-block w-px h-3 bg-white/35 self-center" />
                <span className="text-emerald-100 font-medium">{hijriDate}</span>
              </>
            )}
          </p>
        </div>

        {/* Hadith of the Day Overlay Widget (Sits directly on banner gradient) */}
        {hadith && (
          <div className="z-10 max-w-xl text-left md:text-right font-sans space-y-1.5 animate-in fade-in duration-300 border-t md:border-t-0 md:border-l border-white/20 pt-4 md:pt-0 md:pl-6">
            <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-widest text-emerald-100/90 flex items-center gap-1 md:justify-end">
              <BookOpen className="w-3 h-3 text-emerald-200" />
              <span>Hadith of the Day — {hadith.speaker}</span>
            </p>
            {hadith.arabicText && (
              <p
                className="text-base sm:text-lg font-semibold text-white/95 leading-relaxed tracking-wide font-['Amiri',serif] drop-shadow-xs"
                dir="rtl"
                style={{ fontFamily: "'Amiri', 'Scheherazade New', serif" }}
              >
                {hadith.arabicText}
              </p>
            )}
            <p className="text-xs sm:text-sm text-white/90 italic font-['Lora',serif] leading-snug drop-shadow-2xs">
              “{hadith.translation}”
            </p>
            <p className="text-[10px] sm:text-[11px] font-bold text-white/75 uppercase tracking-widest md:text-right">
              ― {hadith.citation}
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-bold text-slate-900 flex items-center gap-2">
              <CheckSquare className="w-5 h-5 text-[#00ad1d]" />
              Tasks for Today
            </h2>
          </div>
          <div className="divide-y divide-slate-100">
            {myTasks.length > 0 ? myTasks.slice(0, 5).map(task => (
                <div
                  key={task.id}
                  onClick={() => onSelectTask ? onSelectTask(task.id) : onSelectTab('tasks-my-work')}
                  className="p-4 hover:bg-slate-50 transition cursor-pointer"
                >
                    <p className="text-sm font-medium text-slate-900 hover:text-[#00ad1d]">{task.title}</p>
                    <p className="text-xs text-slate-500 mt-1">Due: {task.dueDate} • <span className="font-semibold text-emerald-600">View in My Tasks</span></p>
                </div>
            )) : <p className="p-4 text-sm text-slate-500">No tasks for today.</p>}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg shadow-sm">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-bold text-slate-900 flex items-center gap-2">
              <Video className="w-5 h-5 text-purple-600" />
              Meetings
            </h2>
          </div>
          <div className="divide-y divide-slate-100">
            {todayMeetings.length > 0 ? todayMeetings.slice(0, 5).map(mtg => (
                <div
                  key={mtg.id}
                  onClick={() => onSelectMeeting ? onSelectMeeting(mtg.id) : onSelectTab('calendar')}
                  className="p-4 hover:bg-slate-50 transition cursor-pointer"
                >
                    <p className="text-sm font-medium text-slate-900 hover:text-purple-600">{mtg.title}</p>
                    <p className="text-xs text-slate-500 mt-1">{mtg.time} • <span className="font-semibold text-purple-600">View in Calendar</span></p>
                </div>
            )) : <p className="p-4 text-sm text-slate-500">No meetings scheduled.</p>}
          </div>
        </div>
      </div>
    </div>
  );
};
