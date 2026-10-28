import React from 'react';
import {
  X,
  Star,
  Mail,
  Phone,
  Video,
  CheckSquare,
  Building2,
  Calendar,
  MessageSquare,
  Award,
  TrendingUp,
  Clock,
  ShieldCheck,
  UserCheck
} from 'lucide-react';
import { StaffUser, Task } from '../types';
import { usePortalStore } from '../services/store';
import { getUserRatingSummary } from '../utils/staffRatings';
import { formatStaffDisplayName, formatStaffDisplayOrgDept } from '../utils/staffHierarchy';
import { UserAvatar } from './UserAvatar';

interface StaffProfileModalProps {
  staffMember: StaffUser | null;
  isOpen: boolean;
  onClose: () => void;
  onAssignTask?: (user: StaffUser) => void;
  onSelectTask?: (taskId: string) => void;
  onSelectMeeting?: (meetingId: string) => void;
}

export const StaffProfileModal: React.FC<StaffProfileModalProps> = ({
  staffMember,
  isOpen,
  onClose,
  onAssignTask,
  onSelectTask,
  onSelectMeeting
}) => {
  const { tasks, currentUser } = usePortalStore();

  if (!isOpen || !staffMember) return null;

  const isSelf = staffMember.id === currentUser.id;
  const ratingSummary = getUserRatingSummary(staffMember.id, tasks, staffMember);
  const { averageRating, totalRatingsCount, distribution, recentRatings } = ratingSummary;

  // Calculate percentages for rating breakdown bars
  const getPercentage = (count: number) => {
    if (totalRatingsCount === 0) return 0;
    return Math.round((count / totalRatingsCount) * 100);
  };

  const teamsChatUrl = `https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(staffMember.email)}`;

  return (
    <div
      className="oh-dialog fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-100"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-5 text-xs max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-slate-100 shrink-0">
          <div className="flex items-start gap-3.5 min-w-0">
            <div className="relative shrink-0">
              <UserAvatar
                name={staffMember.name}
                avatar={staffMember.avatar}
                className="w-14 h-14 border-2 border-slate-200 shadow-xs"
              />
              <span
                className={`w-3.5 h-3.5 rounded-full absolute bottom-0 right-0 ring-2 ring-white ${
                  staffMember.status === 'Online'
                    ? 'bg-emerald-500'
                    : staffMember.status === 'Busy' || staffMember.status === 'In Teams Meeting'
                    ? 'bg-rose-500'
                    : 'bg-slate-400'
                }`}
                title={`Status: ${staffMember.status}`}
              />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-slate-900 leading-tight">
                  {formatStaffDisplayName(staffMember)}
                </h2>
                {isSelf && (
                  <span className="text-[10px] bg-purple-100 text-purple-800 font-bold px-2 py-0.5 rounded">
                    Your Profile
                  </span>
                )}
                <span className="text-[11px] px-2 py-0.5 rounded font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                  {staffMember.status}
                </span>
              </div>

              <p className="text-xs text-[#008f18] font-bold mt-0.5">
                {staffMember.role} • {formatStaffDisplayOrgDept(staffMember)}
              </p>

              <div className="flex items-center gap-3 text-slate-500 text-[11px] mt-1.5 flex-wrap">
                <span className="flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  <a href={`mailto:${staffMember.email}`} className="hover:underline text-slate-700">
                    {staffMember.email}
                  </a>
                </span>
                <span className="flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  <span>{staffMember.phone}</span>
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="space-y-5 overflow-y-auto pr-1 flex-1">
          {/* Out of Office / Leave Banner */}
          {(staffMember.status === 'Out of Office' || staffMember.outOfOffice) && (
            <div className="p-4 bg-gradient-to-r from-amber-50 via-amber-100/50 to-orange-50 rounded-xl border border-amber-300 shadow-2xs space-y-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-amber-900 flex items-center gap-1.5 text-sm">
                  <span>Out of Office ({staffMember.leaveType || 'On Leave'})</span>
                </span>
                {staffMember.leaveEndDate && (
                  <span className="text-[11px] font-bold text-amber-800 bg-white/80 px-2 py-0.5 rounded border border-amber-200">
                    Returning: {staffMember.leaveEndDate}
                  </span>
                )}
              </div>

              {staffMember.outOfOfficeMessage && (
                <p className="text-amber-900 italic bg-white/70 p-2.5 rounded-lg border border-amber-200/80 leading-relaxed text-xs">
                  "{staffMember.outOfOfficeMessage}"
                </p>
              )}

              <div className="flex items-center justify-between pt-1 text-[11px] text-amber-800 flex-wrap gap-2">
                {staffMember.leaveStartDate && (
                  <span>Leave Started: <strong>{staffMember.leaveStartDate}</strong></span>
                )}
                {staffMember.backupContactName && (
                  <span>Relief / Backup: <strong className="text-amber-950">{staffMember.backupContactName}</strong></span>
                )}
              </div>
            </div>
          )}

          {/* Bio / Summary if available */}
          {staffMember.bio && (
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-slate-700 leading-relaxed text-xs">
              <p className="font-bold text-slate-900 text-xs mb-1">About</p>
              <p>{staffMember.bio}</p>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TASK COMPLETION PERFORMANCE & RATING OVERVIEW                            */}
          {/* ========================================================================= */}
          <div className="p-4 bg-gradient-to-br from-amber-50/70 via-white to-amber-50/40 rounded-xl border border-amber-200/80 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-400 text-white flex items-center justify-center shadow-2xs">
                  <Award className="w-4 h-4 fill-white" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900">Task Performance Ratings</h3>
                  <p className="text-[11px] text-slate-500">
                    Aggregated evaluations submitted by task assigners upon task completion
                  </p>
                </div>
              </div>

              {totalRatingsCount > 0 && (
                <span className="text-[11px] font-bold text-amber-900 bg-amber-100/90 border border-amber-200 px-2.5 py-1 rounded-full">
                  {totalRatingsCount} {totalRatingsCount === 1 ? 'task evaluated' : 'tasks evaluated'}
                </span>
              )}
            </div>

            {/* Overall Score & Breakdown */}
            {totalRatingsCount > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center bg-white p-4 rounded-lg border border-amber-100">
                {/* Left: Big Average Display */}
                <div className="sm:col-span-4 flex flex-col items-center justify-center sm:border-r border-slate-100 sm:pr-4 py-1 text-center">
                  <span className="text-4xl font-extrabold text-slate-900 tracking-tight">
                    {averageRating.toFixed(1)}
                  </span>
                  
                  {/* Star Row */}
                  <div className="flex items-center gap-1 my-1.5 text-amber-400">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={`w-4 h-4 ${
                          star <= Math.round(averageRating)
                            ? 'fill-amber-400 text-amber-400'
                            : 'text-slate-200'
                        } stroke-[1.5]`}
                      />
                    ))}
                  </div>

                  <p className="text-xs text-slate-500 font-medium">
                    Average of {totalRatingsCount} verified {totalRatingsCount === 1 ? 'completion' : 'completions'}
                  </p>
                </div>

                {/* Right: 5-to-1 Star Distribution Breakdown Bars */}
                <div className="sm:col-span-8 space-y-1.5 pl-0 sm:pl-2">
                  {([5, 4, 3, 2, 1] as const).map((starNum) => {
                    const count = distribution[starNum];
                    const pct = getPercentage(count);
                    return (
                      <div key={starNum} className="flex items-center gap-2 text-xs">
                        <span className="w-12 text-slate-600 font-semibold flex items-center gap-0.5 justify-end text-[11px]">
                          <span>{starNum}</span>
                          <Star className="w-3 h-3 fill-amber-400 text-amber-400 stroke-none" />
                        </span>

                        <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-amber-400 rounded-full transition-all duration-300"
                            style={{ width: `${pct}%` }}
                          />
                        </div>

                        <span className="w-12 text-right text-[11px] text-slate-500 font-mono">
                          {count} ({pct}%)
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="p-6 bg-white rounded-lg border border-dashed border-amber-200 text-center text-slate-400 space-y-1">
                <Star className="w-8 h-8 mx-auto text-amber-300 stroke-[1.5]" />
                <p className="font-bold text-slate-700 text-xs">No Task Ratings Yet</p>
                <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                  When this staff member completes tasks assigned by organizers, performance ratings from 1 to 5 stars will appear here.
                </p>
              </div>
            )}

            {/* Scrollable List of Recent Rating Feedback */}
            {recentRatings.length > 0 && (
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-amber-600" />
                    <span>Recent Completion Feedback</span>
                  </h4>
                  <span className="text-[10px] text-slate-400 italic">
                    {isSelf ? 'Evaluations are aggregated anonymously' : 'Feedback log'}
                  </span>
                </div>

                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {recentRatings.map((r, idx) => {
                    const isCurrentUserTheRater = r.raterUserId === currentUser.id;

                    return (
                      <div
                        key={idx}
                        className="p-3 bg-white rounded-lg border border-slate-200 hover:border-amber-300 transition space-y-1 shadow-2xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            {/* Star icons */}
                            <div className="flex items-center gap-0.5">
                              {[1, 2, 3, 4, 5].map((s) => (
                                <Star
                                  key={s}
                                  className={`w-3 h-3 ${
                                    s <= r.stars
                                      ? 'fill-amber-400 text-amber-400'
                                      : 'text-slate-200'
                                  } stroke-[1.5]`}
                                />
                              ))}
                            </div>
                            <span className="font-bold text-slate-900 text-xs">
                              {r.stars}.0 / 5
                            </span>
                          </div>

                          <span className="text-[10px] text-slate-400">
                            {new Date(r.ratedAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                        </div>

                        {/* Task Title for Context */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-[11px] font-semibold text-slate-700">
                            Task: <span className="text-slate-900 font-bold">{r.taskTitle}</span>
                          </p>
                          {r.isDepartment && (
                            <span className="px-1.5 py-0.2 rounded bg-purple-100 text-purple-800 text-[10px] font-bold border border-purple-200">
                              {r.departmentName ? `${r.departmentName} Dept` : 'Department Rating'}
                            </span>
                          )}
                        </div>

                        {/* Optional Comment */}
                        {r.comment && (
                          <p className="text-[11px] text-slate-600 italic bg-amber-50/40 p-2 rounded border border-amber-100/60 mt-1">
                            "{r.comment}"
                          </p>
                        )}

                        {/* Attributed note if viewed by the assigner who gave it */}
                        {isCurrentUserTheRater && !isSelf && (
                          <p className="text-[9px] text-amber-800 font-medium pt-0.5">
                            ★ Evaluated by you
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-100 shrink-0">
          <div className="text-[11px] text-slate-400">
            WIPAHS Authorized Staff Directory Sync
          </div>

          <div className="flex items-center gap-2">
            <a
              href={teamsChatUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded font-semibold text-xs flex items-center gap-1.5 transition"
            >
              <Video className="w-3.5 h-3.5" />
              <span>Teams Chat</span>
            </a>

            {!isSelf && onAssignTask && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onAssignTask(staffMember);
                }}
                className="px-3.5 py-1.5 bg-[#00ad1d] hover:bg-[#009218] text-white font-bold rounded text-xs flex items-center gap-1.5 shadow-2xs transition cursor-pointer"
              >
                <CheckSquare className="w-3.5 h-3.5" />
                <span>Assign Task</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
