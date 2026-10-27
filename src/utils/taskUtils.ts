import { Task } from '../types';

export function normalizeDept(dept?: string | null): string {
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
  if (
    lower === 'marketing' ||
    lower === 'marketing department' ||
    lower === 'projects and mkt' ||
    lower === 'projects & mkt' ||
    lower === 'projects and marketing' ||
    lower === 'projects & marketing' ||
    lower === 'mkt'
  ) {
    return 'Marketing';
  }
  if (
    lower === 'finance' ||
    lower === 'finance department' ||
    lower === 'accounts' ||
    lower === 'accounting'
  ) {
    return 'Finance';
  }
  if (
    lower === 'top management' ||
    lower === 'management' ||
    lower === 'executive & admin' ||
    lower === 'executive and admin' ||
    lower === 'executive'
  ) {
    return 'Top management';
  }
  if (
    lower === 'logistics and operations' ||
    lower === 'logistics & operations' ||
    lower === 'logistics' ||
    lower === 'operations'
  ) {
    return 'Logistics and Operations';
  }
  if (
    lower === 'tabligh' ||
    lower === 'tabligh department'
  ) {
    return 'Tabligh';
  }
  return trimmed;
}

/**
 * Checks whether a task is a personal task (individual personal work item).
 * Personal tasks are meant for personal task management and should not require ratings
 * or appear in delegated/assigned-by-you lists.
 * If a task is assigned to someone else or to a department/org, it is NEVER a personal task.
 */
export function isPersonalTask(task: Partial<Task> | null | undefined, currentUserId?: string): boolean {
  if (!task) return false;

  // 1. If assigned to a department or whole organization, it is NEVER a personal task
  if (
    task.assignmentType === 'department' ||
    task.assignmentType === 'organization' ||
    (Array.isArray(task.assignedDepartments) && task.assignedDepartments.length > 0) ||
    (Array.isArray(task.assignedOrganisations) && task.assignedOrganisations.length > 0) ||
    (typeof task.assignedToId === 'string' && (task.assignedToId.startsWith('dept-') || task.assignedToId.startsWith('org-') || task.assignedToId === 'all')) ||
    (typeof task.assignedToName === 'string' && (task.assignedToName.toLowerCase().includes('(department)') || task.assignedToName.toLowerCase().includes('(whole org)')))
  ) {
    return false;
  }

  // 2. If a task is assigned to other people, it is NEVER a personal task
  if (currentUserId) {
    const isAssignedToOther =
      (typeof task.assignedToId === 'string' && task.assignedToId.length > 0 && task.assignedToId !== currentUserId && !task.assignedToId.startsWith('dept-') && !task.assignedToId.startsWith('org-')) ||
      (Array.isArray(task.assignedToIds) && task.assignedToIds.some(id => id && id !== currentUserId));
    if (isAssignedToOther) {
      return false;
    }
  }

  // If creator and assignee are distinctly different users, it is NOT personal (it is delegated/assigned)
  if (
    typeof task.createdById === 'string' &&
    task.createdById.length > 0 &&
    typeof task.assignedToId === 'string' &&
    task.assignedToId.length > 0 &&
    task.createdById !== task.assignedToId &&
    !task.assignedToId.startsWith('dept-') &&
    !task.assignedToId.startsWith('org-')
  ) {
    return false;
  }

  if (
    task.createdByName &&
    task.assignedToName &&
    task.createdByName.toLowerCase().trim() !== task.assignedToName.toLowerCase().trim() &&
    !task.assignedToName.toLowerCase().includes('(department)') &&
    !task.assignedToName.toLowerCase().includes('(whole org)')
  ) {
    return false;
  }

  // 3. Explicit personal type or assignmentType
  if (task.type === 'personal' || task.assignmentType === 'personal') {
    return true;
  }

  // 4. Tags array containing 'personal'
  if (Array.isArray(task.tags) && task.tags.some(tg => typeof tg === 'string' && tg.toLowerCase() === 'personal')) {
    return true;
  }

  // 5. Created by a user and assigned to the exact same user with no other assignees
  if (task.createdById && task.assignedToId && task.createdById === task.assignedToId) {
    if (!task.assignedToIds || task.assignedToIds.length <= 1 || task.assignedToIds.every(id => id === task.createdById)) {
      return true;
    }
  }

  // 6. If currentUserId is passed and task is self-assigned to this user
  if (currentUserId && task.createdById === currentUserId && (!task.assignedToId || task.assignedToId === currentUserId)) {
    if (!task.assignedToIds || task.assignedToIds.length === 0 || task.assignedToIds.every(id => !id || id === currentUserId)) {
      return true;
    }
  }

  return false;
}

/**
 * Checks if a task is directly assigned to the specified user.
 */
export function isTaskAssignedToUser(task: Task, currentUserId: string, currentUserName?: string): boolean {
  if (!task || !currentUserId) return false;

  // Never match department or organization tasks as direct user assignment
  if (
    task.assignmentType === 'department' ||
    task.assignmentType === 'organization' ||
    (Array.isArray(task.assignedDepartments) && task.assignedDepartments.length > 0) ||
    (Array.isArray(task.assignedOrganisations) && task.assignedOrganisations.length > 0) ||
    (typeof task.assignedToId === 'string' && (task.assignedToId.startsWith('dept-') || task.assignedToId.startsWith('org-') || task.assignedToId === 'all')) ||
    (typeof task.assignedToName === 'string' && (task.assignedToName.toLowerCase().includes('(department)') || task.assignedToName.toLowerCase().includes('(whole org)')))
  ) {
    return false;
  }

  // 1. Direct ID match
  if (task.assignedToId === currentUserId) return true;

  // 2. Direct array ID match
  if (Array.isArray(task.assignedToIds) && task.assignedToIds.includes(currentUserId)) {
    return true;
  }

  // 3. Exact name match (fallback ONLY for cases where assignee IDs were not mapped in DB)
  const hasExplicitAssigneeIds =
    Boolean(task.assignedToId) ||
    (Array.isArray(task.assignedToIds) && task.assignedToIds.some(Boolean));

  const normCurrentName = currentUserName?.toLowerCase().trim();
  if (!hasExplicitAssigneeIds && normCurrentName && normCurrentName !== 'staff member') {
    if (task.assignedToName && task.assignedToName.toLowerCase().trim() === normCurrentName) {
      return true;
    }
    if (Array.isArray(task.assignedToNames)) {
      if (task.assignedToNames.some(n => typeof n === 'string' && n.toLowerCase().trim() === normCurrentName)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Checks whether a task was assigned/created by the current user to other people or departments.
 * Used for the "Assigned By Me" view.
 */
export function isTaskAssignedByMe(task: Task, currentUserId: string): boolean {
  if (!task || !currentUserId) return false;

  const currentId = currentUserId;

  // 1. Strict creator check: rely ONLY on createdById === currentUserId
  const isCreator = Boolean(task.createdById) && task.createdById === currentId && task.createdById !== 'usr-default' && task.createdById !== 'usr-guest';
  if (!isCreator) {
    return false;
  }

  // 2. Personal tasks must NOT appear in assigned-by-me
  if (isPersonalTask(task, currentUserId)) {
    return false;
  }

  // 3. Self-assigned tasks must NOT appear in assigned-by-me
  // Must be assigned to other members, departments, or organization
  const isAssignedToOther =
    (Boolean(task.assignedToId) && task.assignedToId !== currentId && !task.assignedToId.startsWith('dept-') && !task.assignedToId.startsWith('org-')) ||
    (Array.isArray(task.assignedToIds) && task.assignedToIds.some(id => id && id !== currentId)) ||
    task.assignmentType === 'department' ||
    task.assignmentType === 'organization' ||
    (task.assignmentType === 'specific_people' && Array.isArray(task.assignedToIds) && task.assignedToIds.some(id => id && id !== currentId)) ||
    (Array.isArray(task.assignedDepartments) && task.assignedDepartments.length > 0) ||
    (Array.isArray(task.assignedOrganisations) && task.assignedOrganisations.length > 0) ||
    (typeof task.assignedToId === 'string' && (task.assignedToId.startsWith('dept-') || task.assignedToId.startsWith('org-')));

  return Boolean(isAssignedToOther);
}

/**
 * Checks if a task belongs directly to the current user's own execution queue
 * (either a personal task of the current user, or a task assigned to the current user).
 * Explicitly excludes tasks delegated/assigned by the current user to other people,
 * departments, or organisations.
 */
export function isMyPersonalOrAssignedTask(
  task: Task,
  currentUserId: string,
  currentUserName?: string
): boolean {
  if (!task || !currentUserId || currentUserId === 'usr-default' || currentUserId === 'usr-guest') {
    return false;
  }

  // Tasks delegated/assigned by the current user to others (or rated by the current user as assigner)
  // are NOT tasks assigned to or personally done by the current user.
  if (isTaskAssignedByMe(task, currentUserId)) {
    return false;
  }
  if (task.rating?.raterUserId && task.rating.raterUserId === currentUserId) {
    return false;
  }
  if (task.rating?.ratedUserId && task.rating.ratedUserId !== currentUserId) {
    return false;
  }

  // 1. Personal task: must belong to the current user (never another user's personal task)
  if (isPersonalTask(task)) {
    return task.createdById === currentUserId || task.assignedToId === currentUserId;
  }
  if (isPersonalTask(task, currentUserId)) {
    return task.createdById === currentUserId || task.assignedToId === currentUserId;
  }

  // 2. Directly assigned to the current user
  return isTaskAssignedToUser(task, currentUserId, currentUserName);
}

/**
 * Checks if a task is a departmental task relevant to the user's department as a whole.
 * Individual tasks assigned to a specific person do NOT qualify as departmental tasks for other members.
 */
export function isTaskDepartmentalForUser(task: Task, userDepartment?: string): boolean {
  if (!task || !userDepartment) return false;
  const trimmed = userDepartment.trim();
  if (!trimmed) return false;
  const userDept = normalizeDept(trimmed);
  if (!userDept || userDept === 'General') return false;

  // Personal tasks can NEVER be departmental
  if (isPersonalTask(task)) return false;

  // Tasks assigned to a specific individual person can NEVER be departmental for others
  const isAssignedToSpecificPerson =
    Boolean(task.assignedToId && !task.assignedToId.startsWith('dept-') && !task.assignedToId.startsWith('org-') && task.assignedToId !== 'all') &&
    Boolean(task.assignedToName && !task.assignedToName.toLowerCase().includes('(department)') && !task.assignedToName.toLowerCase().includes('(whole org)'));

  if (isAssignedToSpecificPerson && task.assignmentType !== 'department') {
    return false;
  }

  // A task is a departmental task if it was targeted to a department
  const isDeptTarget =
    task.assignmentType === 'department' ||
    (Array.isArray(task.assignedDepartments) && task.assignedDepartments.length > 0) ||
    (typeof task.assignedToId === 'string' && task.assignedToId.startsWith('dept-')) ||
    (typeof task.assignedToName === 'string' && task.assignedToName.toLowerCase().includes('(department)'));

  if (!isDeptTarget) {
    return false;
  }

  if (Array.isArray(task.assignedDepartments) && task.assignedDepartments.length > 0) {
    const normDepts = task.assignedDepartments.map(normalizeDept);
    return normDepts.includes(userDept) || normDepts.includes('All Departments') || normDepts.includes('all departments');
  }

  const taskDept = normalizeDept(task.department);
  return taskDept === userDept || taskDept === 'All Departments' || taskDept === 'all departments';
}

/**
 * Checks if a task is an organisation-wide task relevant to the user's organisation.
 */
export function isTaskOrganisationalForUser(task: Task, userOrganisation?: string): boolean {
  if (!task) return false;
  if (isPersonalTask(task)) return false;

  const isOrgTarget =
    task.assignmentType === 'organization' ||
    task.assignedToId === 'all' ||
    (Array.isArray(task.assignedOrganisations) && task.assignedOrganisations.length > 0) ||
    (typeof task.assignedToId === 'string' && task.assignedToId.startsWith('org-')) ||
    (typeof task.assignedToName === 'string' && task.assignedToName.toLowerCase().includes('(whole org)'));

  if (!isOrgTarget) return false;

  const userOrg = (userOrganisation || 'WIPAHS').trim().toLowerCase();
  if (Array.isArray(task.assignedOrganisations) && task.assignedOrganisations.length > 0) {
    return task.assignedOrganisations.some(o => o.trim().toLowerCase() === userOrg);
  }
  if (task.assignedToId === 'all') return true;
  const taskOrg = (task.organisation || 'WIPAHS').trim().toLowerCase();
  return taskOrg === userOrg;
}

/**
 * Filters tasks visible in "All Tasks" view.
 *
 * For the logged-in member, "All Tasks" includes all tasks relevant to the user:
 * 1. Personal tasks belonging to the current user (never someone else's personal tasks).
 * 2. Tasks assigned directly to the current user.
 * 3. Tasks assigned/created by the current user ("Assigned By Me").
 * 4. Departmental tasks assigned to the user's department as a whole.
 * 5. Organisation-wide tasks assigned to the user's organisation.
 */
export function isTaskVisibleInAllTasks(
  task: Task,
  currentUserId: string,
  currentUserName?: string,
  userDepartment?: string,
  userOrganisation?: string
): boolean {
  if (!task) return false;

  // 1. Personal tasks: ONLY show if it belongs to current user (strictly private to owner).
  if (isPersonalTask(task) || isPersonalTask(task, currentUserId)) {
    return Boolean(currentUserId) && (task.createdById === currentUserId || task.assignedToId === currentUserId);
  }

  // 2. Tasks assigned directly to the current user
  if (isTaskAssignedToUser(task, currentUserId, currentUserName)) {
    return true;
  }

  // 3. Tasks assigned/created by the current user (including delegated tasks)
  if (
    isTaskAssignedByMe(task, currentUserId) ||
    (Boolean(currentUserId) &&
      currentUserId !== 'usr-default' &&
      currentUserId !== 'usr-guest' &&
      task.createdById === currentUserId)
  ) {
    return true;
  }

  // 4. Departmental tasks for the user's department (assigned to the department as a whole)
  if (isTaskDepartmentalForUser(task, userDepartment)) {
    return true;
  }

  // 5. Organisation-wide tasks for the user's organisation
  if (isTaskOrganisationalForUser(task, userOrganisation)) {
    return true;
  }

  return false;
}
