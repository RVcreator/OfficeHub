import React, { useState } from 'react';
import {
  Archive,
  Trash2,
  CheckSquare,
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle2,
  X,
  User,
  Building2,
  Sparkles,
  ArrowUpRight,
  ShieldAlert,
  Star,
  ExternalLink,
  Users,
  FileText,
  Tag,
  MessageSquare
} from 'lucide-react';
import { usePortalStore } from '../services/store';
import { Task, Meeting } from '../types';
import { isTaskAssignedByMe } from '../utils/taskUtils';
import { UserAvatar } from './UserAvatar';

interface PersonalArchivePanelProps {
  userId?: string;
  onSelectTask?: (taskId: string) => void;
  onSelectMeeting?: (meetingId: string) => void;
  className?: string;
}

export const PersonalArchivePanel: React.FC<PersonalArchivePanelProps> = ({
  userId,
  onSelectTask,
  onSelectMeeting,
  className = ''
}) => {
  const { currentUser, tasks, meetings, actions } = usePortalStore();
  const targetUserId = userId || currentUser.id;
  const isSelf = targetUserId === currentUser.id;

  const archiveData = actions.getUserArchive(targetUserId, tasks, meetings);
  const { tasks: archivedTasks, meetings: archivedMeetings } = archiveData;

  const totalItems = archivedTasks.length + archivedMeetings.length;

  const [activeSubTab, setActiveSubTab] = useState<'all' | 'tasks' | 'meetings'>('all');
  const [showClearConfirmModal, setShowClearConfirmModal] = useState(false);
  const [clearedSuccessMsg, setClearedSuccessMsg] = useState(false);

  // Detail Popups
  const [selectedTaskDetail, setSelectedTaskDetail] = useState<Task | null>(null);
  const [selectedMeetingDetail, setSelectedMeetingDetail] = useState<Meeting | null>(null);

  const handleClearArchive = async () => {
    await actions.clearUserArchive(targetUserId);
    setShowClearConfirmModal(false);
    setClearedSuccessMsg(true);
    setTimeout(() => setClearedSuccessMsg(false), 3500);
  };

  return (
    <div className={`space-y-4 w-full ${className}`}>
      {/* Top Banner & Action (Sticky Header) */}
      <div className="p-4 bg-slate-900 bg-gradient-to-r from-slate-900 via-slate-800 to-[#004f0d] text-white rounded-xl shadow-lg space-y-3 sticky top-0 z-30 border border-slate-700/80">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-white/10 backdrop-blur-xs flex items-center justify-center border border-white/20 text-emerald-400">
              <Archive className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white leading-tight">
                  {isSelf ? 'Your Personal Archive' : 'Personal Archive'}
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold text-[10px] border border-emerald-500/30">
                  {totalItems} {totalItems === 1 ? 'Item' : 'Items'}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Completed or cancelled tasks, and all meetings 2 days (48 hours) after their scheduled date, automatically move into archives.
              </p>
            </div>
          </div>

          {totalItems > 0 && isSelf && (
            <button
              type="button"
              onClick={() => setShowClearConfirmModal(true)}
              className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold text-xs shadow-xs transition flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear Your Archive Section</span>
            </button>
          )}
        </div>

        {/* Quick Filter Tabs */}
        <div className="flex items-center gap-2 pt-1 border-t border-white/10 text-xs">
          <button
            type="button"
            onClick={() => setActiveSubTab('all')}
            className={`px-3 py-1 rounded-md font-semibold transition cursor-pointer ${
              activeSubTab === 'all'
                ? 'bg-white text-slate-900 font-bold shadow-2xs'
                : 'text-slate-300 hover:text-white hover:bg-white/10'
            }`}
          >
            All Archived ({totalItems})
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('tasks')}
            className={`px-3 py-1 rounded-md font-semibold transition cursor-pointer ${
              activeSubTab === 'tasks'
                ? 'bg-white text-slate-900 font-bold shadow-2xs'
                : 'text-slate-300 hover:text-white hover:bg-white/10'
            }`}
          >
            Tasks ({archivedTasks.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('meetings')}
            className={`px-3 py-1 rounded-md font-semibold transition cursor-pointer ${
              activeSubTab === 'meetings'
                ? 'bg-white text-slate-900 font-bold shadow-2xs'
                : 'text-slate-300 hover:text-white hover:bg-white/10'
            }`}
          >
            Meetings ({archivedMeetings.length})
          </button>
        </div>
      </div>

      {clearedSuccessMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg flex items-center gap-2 text-xs font-semibold animate-in fade-in duration-150">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Your personal archive section has been cleared successfully!</span>
        </div>
      )}

      {/* Main Content Area */}
      {totalItems === 0 ? (
        <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-200 rounded-xl space-y-2">
          <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
            <Archive className="w-6 h-6" />
          </div>
          <h4 className="font-bold text-slate-700 text-sm">Your Personal Archive is Empty</h4>
          <p className="text-slate-500 text-xs max-w-md mx-auto">
            Completed or cancelled tasks after 2 days, and meetings 2 days after their scheduled time (whether joined or not), automatically appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* ARCHIVED TASKS */}
          {(activeSubTab === 'all' || activeSubTab === 'tasks') && archivedTasks.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-3 py-2 bg-slate-100/90 backdrop-blur-xs rounded-lg border border-slate-200/80 sticky top-[108px] z-10 shadow-2xs">
                <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                  <CheckSquare className="w-3.5 h-3.5 text-[#008f18]" />
                  <span>Archived Tasks ({archivedTasks.length})</span>
                </h4>
                <span className="text-[10px] text-slate-500 font-medium">Click any task to view popup details</span>
              </div>

              <div className="grid grid-cols-1 gap-2">
                {archivedTasks.map(task => {
                  const isDone = task.status === 'Done';
                  const isAssignedToOthers = isTaskAssignedByMe(task, targetUserId);

                  return (
                    <div
                      key={task.id}
                      onClick={() => {
                        setSelectedTaskDetail(task);
                        if (onSelectTask) onSelectTask(task.id);
                      }}
                      className="p-3.5 bg-white rounded-lg border border-slate-200 shadow-2xs hover:border-[#00ad1d]/50 hover:shadow-xs transition cursor-pointer group"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1.5 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-900 text-xs group-hover:text-[#008f18] transition">
                              {task.title}
                            </span>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                                isDone
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  : 'bg-slate-100 text-slate-700 border-slate-200'
                              }`}
                            >
                              {task.status}
                            </span>
                            {isAssignedToOthers && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-800 border border-purple-200">
                                Assigned by you
                              </span>
                            )}
                            {task.priority === 'Urgent' && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-200">
                                Urgent
                              </span>
                            )}
                          </div>

                          <p className="text-[11px] text-slate-600 line-clamp-1">{task.description}</p>

                          <div className="flex items-center gap-3 text-[10px] text-slate-400 pt-0.5 flex-wrap">
                            <span>Dept: <b className="text-slate-600">{task.department}</b></span>
                            <span>•</span>
                            <span>Assigned to: <b className="text-slate-700">{task.assignedToName}</b></span>
                            <span>•</span>
                            <span>Created by: <b className="text-slate-700">{task.createdByName}</b></span>
                            {task.rating && (
                              <>
                                <span>•</span>
                                <span className="text-amber-700 font-bold flex items-center gap-0.5">
                                  ★ {task.rating.stars}/5
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0 self-center text-slate-400 group-hover:text-[#008f18] transition text-xs font-semibold">
                          <span>Details</span>
                          <ArrowUpRight className="w-4 h-4" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ARCHIVED MEETINGS */}
          {(activeSubTab === 'all' || activeSubTab === 'meetings') && archivedMeetings.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-3 py-2 bg-slate-100/90 backdrop-blur-xs rounded-lg border border-slate-200/80 sticky top-[108px] z-10 shadow-2xs">
                <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-blue-600" />
                  <span>Archived Meetings ({archivedMeetings.length})</span>
                </h4>
                <span className="text-[10px] text-slate-500 font-medium">Click any meeting to view popup details</span>
              </div>

              <div className="grid grid-cols-1 gap-2">
                {archivedMeetings.map(meeting => {
                  const isCompleted = meeting.status === 'Completed';
                  const isCancelled = meeting.status === 'Cancelled';
                  const statusLabel = isCancelled ? 'Cancelled' : isCompleted ? 'Completed' : 'Archived';
                  return (
                    <div
                      key={meeting.id}
                      onClick={() => {
                        setSelectedMeetingDetail(meeting);
                      }}
                      className="p-3.5 bg-white rounded-lg border border-slate-200 shadow-2xs hover:border-blue-300 hover:shadow-xs transition cursor-pointer group"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1.5 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-900 text-xs group-hover:text-blue-700 transition">
                              {meeting.title}
                            </span>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                                isCancelled
                                  ? 'bg-rose-50 text-rose-800 border-rose-200'
                                  : isCompleted
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  : 'bg-blue-50 text-blue-800 border-blue-200'
                              }`}
                            >
                              {statusLabel}
                            </span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-50 text-purple-800 border border-purple-200">
                              {meeting.meetingType}
                            </span>
                          </div>

                          {meeting.description && (
                            <p className="text-[11px] text-slate-600 line-clamp-1">{meeting.description}</p>
                          )}

                          <div className="flex items-center gap-3 text-[10px] text-slate-400 pt-0.5 flex-wrap">
                            <span>Date: <b className="text-slate-700">{meeting.date} ({meeting.startTime})</b></span>
                            <span>•</span>
                            <span>Organizer: <b className="text-slate-700">{meeting.organizerName}</b></span>
                            <span>•</span>
                            <span>Attendees: <b className="text-slate-700">{meeting.attendees?.length || 0}</b></span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0 self-center text-slate-400 group-hover:text-blue-600 transition text-xs font-semibold">
                          <span>Details</span>
                          <ArrowUpRight className="w-4 h-4" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TASK DETAIL POPUP MODAL                                                   */}
      {/* ========================================================================= */}
      {selectedTaskDetail && (
        <div
          className="oh-dialog fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setSelectedTaskDetail(null)}
        >
          <div
            className="bg-white rounded-xl max-w-xl w-full p-5 shadow-2xl border border-slate-200 space-y-4 text-xs max-h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between pb-3 border-b border-slate-100 shrink-0">
              <div className="space-y-1 min-w-0 pr-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#00ad1d]/10 text-[#008f18] border border-[#00ad1d]/30">
                    Archived Task Record
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

            {/* Scrollable Body */}
            <div className="space-y-4 overflow-y-auto pr-1 flex-1">
              <div>
                <h4 className="font-bold text-slate-700 text-xs mb-1">Description</h4>
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

              {/* Dates & Timeline */}
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between text-[11px] text-slate-600 flex-wrap gap-2">
                <div>
                  <span className="text-slate-400">Created: </span>
                  <b className="text-slate-800">{selectedTaskDetail.createdAt ? new Date(selectedTaskDetail.createdAt).toLocaleDateString() : 'N/A'}</b>
                </div>
                <div>
                  <span className="text-slate-400">Due Date: </span>
                  <b className="text-slate-800">{selectedTaskDetail.dueDate || 'N/A'}</b>
                </div>
              </div>

              {/* Performance Rating evaluation if present */}
              {selectedTaskDetail.rating && (
                <div className="p-3.5 bg-amber-50/90 border border-amber-200 rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-amber-900 text-xs flex items-center gap-1">
                      <Star className="w-4 h-4 fill-amber-400 text-amber-500" />
                      <span>Performance Evaluation</span>
                    </span>
                    <span className="text-amber-800 font-extrabold text-xs">
                      {selectedTaskDetail.rating.stars} / 5 Stars
                    </span>
                  </div>

                  {selectedTaskDetail.rating.comment && (
                    <p className="text-[11px] text-amber-950 italic bg-white/70 p-2.5 rounded border border-amber-200">
                      "{selectedTaskDetail.rating.comment}"
                    </p>
                  )}
                </div>
              )}

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
            <div className="pt-3 border-t border-slate-100 flex items-center justify-end shrink-0">
              <button
                type="button"
                onClick={() => setSelectedTaskDetail(null)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-md font-bold text-xs shadow-2xs transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MEETING DETAIL POPUP MODAL                                                */}
      {/* ========================================================================= */}
      {selectedMeetingDetail && (
        <div
          className="oh-dialog fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setSelectedMeetingDetail(null)}
        >
          <div
            className="bg-white rounded-xl max-w-xl w-full p-5 shadow-2xl border border-slate-200 space-y-4 text-xs max-h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between pb-3 border-b border-slate-100 shrink-0">
              <div className="space-y-1 min-w-0 pr-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
                    Archived Meeting Record
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-800 border border-purple-200">
                    {selectedMeetingDetail.meetingType}
                  </span>
                </div>
                <h3 className="text-base font-bold text-slate-900 leading-tight">
                  {selectedMeetingDetail.title}
                </h3>
              </div>

              <button
                type="button"
                onClick={() => setSelectedMeetingDetail(null)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="space-y-4 overflow-y-auto pr-1 flex-1">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
                <div className="flex items-center justify-between text-slate-700 text-xs flex-wrap gap-2">
                  <span>Date: <b>{selectedMeetingDetail.date}</b></span>
                  <span>Time: <b>{selectedMeetingDetail.startTime} - {selectedMeetingDetail.endTime}</b></span>
                  <span>Dept: <b>{selectedMeetingDetail.department}</b></span>
                </div>
                {selectedMeetingDetail.description && (
                  <p className="text-slate-600 leading-relaxed pt-1 border-t border-slate-200">
                    {selectedMeetingDetail.description}
                  </p>
                )}
              </div>

              {/* Teams Join URL if available */}
              {selectedMeetingDetail.teamsJoinUrl && (
                <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-purple-900 text-xs">Microsoft Teams Meeting Link</p>
                    <p className="text-[10px] text-purple-700 truncate">{selectedMeetingDetail.teamsJoinUrl}</p>
                  </div>
                  <a
                    href={selectedMeetingDetail.teamsJoinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded text-xs shrink-0 flex items-center gap-1 cursor-pointer"
                  >
                    <span>Open Link</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}

              {/* Attendees List */}
              {selectedMeetingDetail.attendees && selectedMeetingDetail.attendees.length > 0 && (
                <div className="space-y-1.5">
                  <h4 className="font-bold text-slate-700 text-xs flex items-center gap-1">
                    <Users className="w-3.5 h-3.5 text-blue-600" />
                    <span>Attendees ({selectedMeetingDetail.attendees.length})</span>
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {selectedMeetingDetail.attendees.map(att => (
                      <div key={att.userId} className="p-2 bg-slate-50 rounded border border-slate-200 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 truncate">{att.name}</p>
                          <p className="text-[10px] text-slate-400 truncate">{att.email}</p>
                        </div>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0 ${
                            att.status === 'Accepted'
                              ? 'bg-emerald-100 text-emerald-800'
                              : att.status === 'Declined'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {att.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Agenda */}
              {selectedMeetingDetail.agenda && selectedMeetingDetail.agenda.length > 0 && (
                <div className="space-y-1.5">
                  <h4 className="font-bold text-slate-700 text-xs">Agenda Topics</h4>
                  <ul className="list-disc list-inside space-y-1 bg-slate-50 p-3 rounded-lg border border-slate-200 text-slate-700">
                    {selectedMeetingDetail.agenda.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-end shrink-0">
              <button
                type="button"
                onClick={() => setSelectedMeetingDetail(null)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-md font-bold text-xs shadow-2xs transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM CLEAR ARCHIVE MODAL */}
      {showClearConfirmModal && (
        <div
          className="oh-dialog fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-100"
          onClick={() => setShowClearConfirmModal(false)}
        >
          <div
            className="bg-white rounded-xl max-w-md w-full p-5 shadow-2xl border border-slate-200 space-y-4 text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1 min-w-0 flex-1">
                <h3 className="font-bold text-slate-900 text-sm">Clear Your Personal Archive?</h3>
                <p className="text-slate-600 leading-relaxed">
                  This will permanently remove <b>{totalItems} items</b> ({archivedTasks.length} tasks and {archivedMeetings.length} meetings) from your personal archive section.
                </p>
              </div>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg text-[11px] leading-relaxed">
              <b>Note:</b> Clearing your archive removes these completed/cancelled records from your archive view.
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowClearConfirmModal(false)}
                className="px-3 py-1.5 rounded-md border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleClearArchive}
                className="px-3.5 py-1.5 rounded-md bg-rose-600 hover:bg-rose-700 text-white font-bold shadow-2xs transition cursor-pointer"
              >
                Yes, Clear Archive
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
