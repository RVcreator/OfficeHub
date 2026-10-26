import { Task, TaskRating, StaffUser } from '../types';

export function normalizeDeptName(dept?: string | null): string {
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
  return trimmed;
}

export interface RecentRatingEntry {
  taskId: string;
  taskTitle: string;
  stars: number;
  comment?: string;
  ratedAt: string;
  raterUserId: string;
  isDepartment?: boolean;
  departmentName?: string;
}

export interface StaffRatingSummary {
  averageRating: number;
  totalRatingsCount: number;
  distribution: {
    5: number;
    4: number;
    3: number;
    2: number;
    1: number;
  };
  recentRatings: RecentRatingEntry[];
}

/**
 * Checks if a task rating applies to a specific staff user:
 * - Direct individual assignee
 * - Individual assignee listed in multi-assignee task
 * - Member of the department / departments assigned to the task
 */
export function doesTaskRatingApplyToUser(
  task: Task,
  userId: string,
  user?: StaffUser
): { applies: boolean; isDepartment: boolean; departmentName?: string } {
  if (!task.rating) return { applies: false, isDepartment: false };

  // Personal tasks do not require to be rated and should not count in staff evaluation
  if (
    task.type === 'personal' ||
    task.assignmentType === 'personal' ||
    (Array.isArray(task.tags) && task.tags.some(tg => typeof tg === 'string' && tg.toLowerCase() === 'personal')) ||
    (task.createdById && task.assignedToId && task.createdById === task.assignedToId && (!task.assignedToIds || task.assignedToIds.length <= 1))
  ) {
    return { applies: false, isDepartment: false };
  }

  // 1. Direct personal rating for this user
  if (
    task.rating.ratedUserId === userId ||
    task.assignedToId === userId ||
    (task.assignedToIds && task.assignedToIds.includes(userId))
  ) {
    return { applies: true, isDepartment: false };
  }

  // 2. Department task rating
  const isDeptTask =
    task.rating.isDepartmentRating ||
    task.assignmentType === 'department' ||
    task.type === 'departmental' ||
    (task.assignedDepartments && task.assignedDepartments.length > 0) ||
    task.assignedToId?.startsWith('dept-');

  if (isDeptTask && user && user.department) {
    const userDept = normalizeDeptName(user.department);
    const taskDepts: string[] = [];

    if (task.assignedDepartments && task.assignedDepartments.length > 0) {
      task.assignedDepartments.forEach(d => taskDepts.push(normalizeDeptName(d)));
    }
    if (task.department) {
      taskDepts.push(normalizeDeptName(task.department));
    }

    if (taskDepts.includes(userDept)) {
      // Check organisation compatibility if specified
      if (task.organisation && user.organisation) {
        if (
          task.organisation !== user.organisation &&
          !task.assignedOrganisations?.includes(user.organisation)
        ) {
          return { applies: false, isDepartment: false };
        }
      }

      const deptLabel = task.assignedDepartments && task.assignedDepartments.length > 0
        ? task.assignedDepartments.join(', ')
        : (task.department || user.department);

      return { applies: true, isDepartment: true, departmentName: deptLabel };
    }
  }

  return { applies: false, isDepartment: false };
}

/**
 * Aggregates all completed task ratings received by a specific user as an assignee,
 * including individual task ratings and department task ratings for their department(s).
 */
export function getUserRatingSummary(
  userId: string,
  tasks: Task[],
  userOrStaffList?: StaffUser | StaffUser[]
): StaffRatingSummary {
  // Determine user info
  let user: StaffUser | undefined;
  if (userOrStaffList) {
    if (Array.isArray(userOrStaffList)) {
      user = userOrStaffList.find(s => s.id === userId);
    } else if (userOrStaffList.id === userId) {
      user = userOrStaffList;
    }
  }

  const ratings: RecentRatingEntry[] = [];

  tasks.forEach(t => {
    if (!t.rating) return;
    const { applies, isDepartment, departmentName } = doesTaskRatingApplyToUser(t, userId, user);
    if (applies) {
      ratings.push({
        taskId: t.id,
        taskTitle: t.title,
        stars: t.rating.stars,
        comment: t.rating.comment,
        ratedAt: t.rating.ratedAt,
        raterUserId: t.rating.raterUserId,
        isDepartment,
        departmentName: departmentName || t.rating.departmentName,
      });
    }
  });

  const totalRatingsCount = ratings.length;
  const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  let sum = 0;

  ratings.forEach(r => {
    sum += r.stars;
    const whole = Math.min(5, Math.max(1, Math.round(r.stars))) as 1 | 2 | 3 | 4 | 5;
    distribution[whole] = (distribution[whole] || 0) + 1;
  });

  const averageRating = totalRatingsCount > 0 ? Math.round((sum / totalRatingsCount) * 10) / 10 : 0;

  // Sort newest first
  ratings.sort((a, b) => new Date(b.ratedAt).getTime() - new Date(a.ratedAt).getTime());

  return {
    averageRating,
    totalRatingsCount,
    distribution,
    recentRatings: ratings,
  };
}

/**
 * Assigner can edit a rating within 24 hours of submission.
 */
export function canEditTaskRating(rating: TaskRating, currentUserId: string): boolean {
  if (rating.raterUserId !== currentUserId) return false;
  const ratedTime = new Date(rating.ratedAt).getTime();
  const now = Date.now();
  const hoursElapsed = (now - ratedTime) / (1000 * 60 * 60);
  return hoursElapsed < 24;
}

/**
 * Returns remaining edit hours (0-24) or 0 if expired.
 */
export function getRatingRemainingHours(rating: TaskRating): number {
  const ratedTime = new Date(rating.ratedAt).getTime();
  const now = Date.now();
  const hoursLeft = 24 - (now - ratedTime) / (1000 * 60 * 60);
  return Math.max(0, Math.round(hoursLeft));
}
