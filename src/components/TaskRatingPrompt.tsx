import React, { useState } from 'react';
import { Star, ShieldAlert, CheckCircle2, Edit3, Clock, Sparkles } from 'lucide-react';
import { Task } from '../types';
import { usePortalStore } from '../services/store';
import { canEditTaskRating, getRatingRemainingHours } from '../utils/staffRatings';
import { isPersonalTask, isTaskAssignedByMe } from '../utils/taskUtils';

interface TaskRatingPromptProps {
  task: Task;
  onRatingSubmitted?: () => void;
  className?: string;
}

const STAR_LABELS: Record<number, string> = {
  1: 'Needs Improvement',
  2: 'Fair',
  3: 'Good',
  4: 'Very Good',
  5: 'Outstanding',
};

export const TaskRatingPrompt: React.FC<TaskRatingPromptProps> = ({
  task,
  onRatingSubmitted,
  className = '',
}) => {
  const { currentUser, actions } = usePortalStore();

  const isAssigner =
    (Boolean(task.createdById) && task.createdById === currentUser.id && task.createdById !== 'usr-default' && task.createdById !== 'usr-guest') ||
    isTaskAssignedByMe(task, currentUser.id) ||
    Boolean(currentUser.role?.toLowerCase().includes('admin')) ||
    Boolean(currentUser.role?.toLowerCase().includes('director'));
  const isAssignee = !isAssigner;
  const hasExistingRating = !!task.rating;
  const isPending = !!task.pendingRating;

  const isDeptTask =
    !!task.rating?.isDepartmentRating ||
    task.assignmentType === 'department' ||
    task.type === 'departmental' ||
    Boolean(task.assignedDepartments && task.assignedDepartments.length > 0) ||
    Boolean(task.assignedToId?.startsWith('dept-'));

  const deptLabel = task.rating?.departmentName ||
    (task.assignedDepartments && task.assignedDepartments.length > 0
      ? task.assignedDepartments.join(', ')
      : task.department);

  // Rating Form State
  const [selectedStars, setSelectedStars] = useState<number>(task.rating?.stars || 5);
  const [hoveredStars, setHoveredStars] = useState<number | null>(null);
  const [comment, setComment] = useState<string>(task.rating?.comment || '');
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [justSubmitted, setJustSubmitted] = useState<boolean>(false);

  // If task is not completed, don't show rating prompt
  if (task.status !== 'Done') {
    return null;
  }

  // Personal tasks should not require to be rated and should not show rating prompt
  if (isPersonalTask(task, currentUser.id)) {
    return null;
  }

  const handleStarClick = (stars: number) => {
    setSelectedStars(stars);
  };

  const handleSubmitRating = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (selectedStars < 1 || selectedStars > 5) return;

    setIsSubmitting(true);
    try {
      actions.rateTask(task.id, selectedStars, comment);
      setIsEditing(false);
      setJustSubmitted(true);
      if (onRatingSubmitted) onRatingSubmitted();
      setTimeout(() => setJustSubmitted(false), 3000);
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeStars = hoveredStars !== null ? hoveredStars : selectedStars;

  // 1. Existing Rating View (when not currently in edit mode)
  if (hasExistingRating && !isEditing) {
    const rating = task.rating!;
    const canEdit = canEditTaskRating(rating, currentUser.id);
    const remainingHours = getRatingRemainingHours(rating);

    return (
      <div className={`p-4 bg-amber-50/80 border border-amber-200 rounded-lg space-y-2 text-xs shadow-2xs ${className}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="p-1 rounded bg-amber-100 text-amber-800">
              <Star className="w-4 h-4 fill-amber-500 text-amber-500" />
            </span>
            <div>
              <p className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                <span>Task Performance Rating</span>
                {justSubmitted && (
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.2 rounded animate-in fade-in">
                    ✓ Submitted
                  </span>
                )}
              </p>
              <p className="text-[11px] text-slate-500">
                {isAssigner ? (
                  isDeptTask ? (
                    <span>Rated by you for <strong>{deptLabel} Department</strong> • Aggregates across all department members</span>
                  ) : (
                    <span>Rated by you for {task.assignedToName}</span>
                  )
                ) : (
                  <span>Verified performance evaluation for this completed task</span>
                )}
              </p>
            </div>
          </div>

          {/* Edit button if assigner and within 24 hours */}
          {isAssigner && canEdit && (
            <button
              type="button"
              onClick={() => {
                setSelectedStars(rating.stars);
                setComment(rating.comment || '');
                setIsEditing(true);
              }}
              className="px-2.5 py-1 bg-white hover:bg-amber-100/70 border border-amber-300 text-amber-900 rounded font-semibold text-[11px] flex items-center gap-1 transition cursor-pointer shadow-2xs shrink-0"
              title={`Edit this rating (${remainingHours}h remaining in the 24h edit window)`}
            >
              <Edit3 className="w-3 h-3 text-amber-700" />
              <span>Edit Rating ({remainingHours}h left)</span>
            </button>
          )}
        </div>

        {/* Rating Star Row & Label */}
        <div className="flex items-center gap-2 pt-1">
          <div className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((star) => (
              <Star
                key={star}
                className={`w-4 h-4 ${
                  star <= rating.stars
                    ? 'fill-amber-400 text-amber-400'
                    : 'text-slate-300'
                } stroke-[1.5]`}
              />
            ))}
          </div>
          <span className="font-bold text-slate-800 text-xs">
            {rating.stars} / 5
          </span>
          <span className="text-[11px] font-medium text-amber-800 bg-amber-100/70 px-2 py-0.2 rounded-full">
            {STAR_LABELS[rating.stars] || 'Rated'}
          </span>
          <span className="text-[10px] text-slate-400 ml-auto">
            {new Date(rating.ratedAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
        </div>

        {/* Optional Comment */}
        {rating.comment && (
          <div className="mt-2 p-2.5 bg-white/90 rounded border border-amber-200 text-slate-700 text-xs italic">
            "{rating.comment}"
          </div>
        )}

        {isAssigner && !canEdit && (
          <p className="text-[10px] text-slate-400 flex items-center gap-1 pt-1">
            <Clock className="w-3 h-3 text-slate-400" />
            <span>Rating is locked and finalized (24-hour edit window completed).</span>
          </p>
        )}
      </div>
    );
  }

  // 2. Pending Rating — If current user is NOT the assigner (e.g. assignee waiting for rating)
  if (isPending && !isAssigner) {
    return (
      <div className={`p-3.5 bg-amber-50/90 border border-amber-300 rounded-lg text-xs space-y-1 ${className}`}>
        <div className="flex items-center gap-2 text-amber-900 font-bold">
          <Clock className="w-4 h-4 text-amber-600 shrink-0" />
          <span>Completed • Awaiting Organizer Rating</span>
        </div>
        <p className="text-[11px] text-amber-800 leading-relaxed">
          {isDeptTask ? (
            <span>
              This department task was completed for <strong>{deptLabel} Department</strong>. The organizer (<strong>{task.createdByName}</strong>) has been notified to submit the department performance evaluation.
            </span>
          ) : (
            <span>
              This task was completed by <strong>{task.assignedToName}</strong>. The organizer (<strong>{task.createdByName}</strong>) has been notified to evaluate this completion.
            </span>
          )}
        </p>
      </div>
    );
  }

  // 3. Compulsory Rating Form for the Assigner (or when editing within 24h)
  return (
    <form
      onSubmit={handleSubmitRating}
      className={`p-4 bg-gradient-to-r from-amber-50 via-yellow-50/60 to-amber-50 border-2 border-amber-300 rounded-lg space-y-3 text-xs shadow-xs animate-in fade-in ${className}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-amber-400 text-white flex items-center justify-center shadow-2xs shrink-0">
            <Star className="w-5 h-5 fill-white text-white" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <h4 className="font-bold text-slate-900 text-sm">
                {isEditing
                  ? (isDeptTask ? 'Edit Department Performance Rating' : 'Edit Task Performance Rating')
                  : (isDeptTask ? 'Rate Department Task Completion' : 'Rate Task Completion')}
              </h4>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-200 text-amber-900 border border-amber-300 uppercase tracking-wide">
                Compulsory Step
              </span>
            </div>
            <p className="text-[11px] text-slate-600 mt-0.5">
              {isDeptTask ? (
                <span>
                  Task was completed for <strong>{deptLabel} Department</strong>. Rating evaluates the department's deliverable and affects all members in <strong>{deptLabel}</strong>.
                </span>
              ) : (
                <span>
                  Task was completed by <strong>{task.assignedToName}</strong>. Rate their performance on this task from 1 to 5 stars.
                </span>
              )}
            </p>
          </div>
        </div>

        {isEditing && (
          <button
            type="button"
            onClick={() => setIsEditing(false)}
            className="text-[11px] text-slate-500 hover:text-slate-700 font-semibold cursor-pointer underline"
          >
            Cancel
          </button>
        )}
      </div>

      {/* Interactive Star Selector */}
      <div className="p-3 bg-white rounded-md border border-amber-200 space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <label className="font-bold text-slate-700 text-xs">
            Performance Rating <span className="text-rose-500 font-bold">*</span>
          </label>
          <span className="text-xs font-bold text-amber-800">
            {activeStars} of 5 — {STAR_LABELS[activeStars] || ''}
          </span>
        </div>

        <div className="flex items-center gap-1.5 py-1">
          {[1, 2, 3, 4, 5].map((star) => {
            const isFilled = star <= activeStars;
            return (
              <button
                key={star}
                type="button"
                onClick={() => handleStarClick(star)}
                onMouseEnter={() => setHoveredStars(star)}
                onMouseLeave={() => setHoveredStars(null)}
                className="p-1 rounded-md hover:bg-amber-100 transition cursor-pointer transform hover:scale-115 active:scale-95 focus:outline-none"
                title={`Rate ${star} star${star > 1 ? 's' : ''} (${STAR_LABELS[star]})`}
              >
                <Star
                  className={`w-7 h-7 transition-colors ${
                    isFilled
                      ? 'fill-amber-400 text-amber-400 drop-shadow-2xs'
                      : 'text-slate-300 hover:text-amber-300'
                  } stroke-[1.5]`}
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* Optional Short Comment Input */}
      <div>
        <label className="font-bold text-slate-700 text-xs block mb-1">
          Optional Feedback Comment
        </label>
        <input
          type="text"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="E.g., Delivered ahead of schedule, thorough attention to detail..."
          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
          maxLength={200}
        />
        <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1">
          <span>Feedback is recorded on the assignee's aggregated performance profile.</span>
          <span>{comment.length}/200</span>
        </div>
      </div>

      {/* Submit Action */}
      <div className="flex items-center justify-end gap-2 pt-1 border-t border-amber-200">
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-300 text-white font-bold text-xs rounded-md shadow-2xs transition cursor-pointer flex items-center gap-1.5"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>{isEditing ? 'Save Updated Rating' : 'Submit Performance Rating'}</span>
        </button>
      </div>
    </form>
  );
};
