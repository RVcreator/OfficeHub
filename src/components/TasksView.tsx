import { UserAvatar } from './UserAvatar';
import { ConfirmDialog } from './ConfirmDialog';
import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  CheckSquare,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
  Video,
  FileText,
  Calendar,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  User,
  Layers,
  Check,
  Building,
  Building2,
  Users,
  Filter,
  ArrowDownUp,
  ChevronsUpDown,
  ChevronsDownUp,
  Paperclip,
  Download,
  File,
  Image,
  FileSpreadsheet,
  Trash2,
  ShieldCheck,
  UserCheck,
  RefreshCw,
  Edit3,
  UserPlus,
  Ban,
  XCircle,
  Star,
  Award,
  MessageSquare
} from 'lucide-react';
import { Priority, Task, TaskStatus, StaffUser, MessageAttachment } from '../types';
import { usePortalStore, normalizeDepartmentName } from '../services/store';
import { getAttachmentTabUrl, openAttachmentInNewTab, downloadAttachment, parseUploadedFile } from '../utils/fileParser';
import { UserRatingDisplay } from './UserRatingDisplay';
import { TaskRatingPrompt } from './TaskRatingPrompt';
import {
  isPersonalTask,
  isMyPersonalOrAssignedTask,
  isTaskDepartmentalForUser,
  isTaskVisibleInAllTasks,
  isTaskAssignedByMe
} from '../utils/taskUtils';
import { isTaskArchived } from '../utils/archiveUtils';
import {
  formatStaffDisplayName,
  formatStaffDisplayOrgDept,
  FIXED_ORGANISATION_ORDER,
  sortOrganisations
} from '../utils/staffHierarchy';

export type TaskGroupByOption = 'None' | 'Department' | 'Assignee' | 'Status' | 'Priority' | 'Due date';
export type GroupSortOption = 'count' | 'alphabetical';

const STORAGE_KEY_GROUP_BY = 'wipahs_tasks_group_by_v1';
const STORAGE_KEY_COLLAPSED = 'wipahs_tasks_group_collapsed_v1';
const STORAGE_KEY_GROUP_SORT = 'wipahs_tasks_group_sort_v1';

function getInitialGroupBy(): TaskGroupByOption {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_GROUP_BY);
    if (saved && ['None', 'Department', 'Assignee', 'Status', 'Priority', 'Due date'].includes(saved)) {
      return saved as TaskGroupByOption;
    }
  } catch {
    // ignore
  }
  return 'Department'; // Default to "Department" as requested
}

function getInitialGroupSort(): GroupSortOption {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_GROUP_SORT);
    if (saved && (saved === 'count' || saved === 'alphabetical')) {
      return saved as GroupSortOption;
    }
  } catch {
    // ignore
  }
  return 'count'; // Default to sort by count (largest first)
}

function getInitialCollapsedState(): Record<string, boolean> {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_COLLAPSED);
    if (saved) return JSON.parse(saved);
  } catch {
    // ignore
  }
  return {};
}

export function normalizeDepartment(dept?: string | null): string {
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

interface TasksViewProps {
  onOpenNewTaskModal: () => void;
  defaultCategory?: 'my-work' | 'department' | 'all' | 'assigned-by-me';
  onCategoryChange?: (category: 'my-work' | 'department' | 'all' | 'assigned-by-me') => void;
  selectedTaskId?: string | null;
  onClearSelectedTask?: () => void;
}

interface TaskGroupItem {
  key: string;
  name: string;
  icon?: React.ElementType;
  tasks: Task[];
}

export const TasksView: React.FC<TasksViewProps> = ({
  onOpenNewTaskModal,
  defaultCategory = 'my-work',
  onCategoryChange,
  selectedTaskId,
  onClearSelectedTask
}) => {
  const { tasks, staff, currentUser, actions, projects } = usePortalStore();

  const todayDateStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  const [activeCategory, setActiveCategory] = useState<'my-work' | 'department' | 'all' | 'assigned-by-me'>(defaultCategory);
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'All'>('All');
  const [organisationFilter, setOrganisationFilter] = useState<string>('All');
  const [departmentFilter, setDepartmentFilter] = useState<string>('All');
  const [priorityFilter, setPriorityFilter] = useState<Priority | 'All'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [newSubtaskText, setNewSubtaskText] = useState('');

  // Reassignment state
  const [isReassigning, setIsReassigning] = useState(false);
  const [selectedReassigneeId, setSelectedReassigneeId] = useState('');
  const [reassignSuccessMsg, setReassignSuccessMsg] = useState<string | null>(null);

  // Editing Task details state
  const [isEditingTask, setIsEditingTask] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPriority, setEditPriority] = useState<Priority>('High');
  const [editDueDate, setEditDueDate] = useState('');

  // Subtask update editing state
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null);
  const [subtaskUpdateText, setSubtaskUpdateText] = useState('');

  // Main task general update editing state
  const [isEditingMainTaskUpdate, setIsEditingMainTaskUpdate] = useState(false);
  const [mainTaskUpdateText, setMainTaskUpdateText] = useState('');

  // Status saving state for active tasks to provide smooth UX feedback
  const [savingTaskIds, setSavingTaskIds] = useState<Set<string>>(new Set());
  const [isDeletingTask, setIsDeletingTask] = useState(false);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);
  const [confirmModalState, setConfirmModalState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    isDestructive?: boolean;
    onConfirm: () => void;
  } | null>(null);

  const handleCloseDrawer = () => {
    setSelectedTask(null);
    setIsEditingTask(false);
    setIsReassigning(false);
    setReassignSuccessMsg(null);
    setEditingSubtaskId(null);
    setSubtaskUpdateText('');
    setIsEditingMainTaskUpdate(false);
    setMainTaskUpdateText('');
    setIsDeletingTask(false);
    if (onClearSelectedTask) {
      onClearSelectedTask();
    }
  };

  // Keep selectedTask in sync with store tasks and auto-select task if selectedTaskId is set
  useEffect(() => {
    if (selectedTaskId) {
      const task = tasks.find(t => t.id === selectedTaskId);
      if (task) {
        setSelectedTask(task);
      }
    } else if (selectedTask) {
      const updated = tasks.find(t => t.id === selectedTask.id);
      if (updated && (updated.status !== selectedTask.status || updated.title !== selectedTask.title || updated.description !== selectedTask.description || updated.dueDate !== selectedTask.dueDate || updated.priority !== selectedTask.priority || JSON.stringify(updated.subtasks) !== JSON.stringify(selectedTask.subtasks))) {
        setSelectedTask(updated);
      }
    }
  }, [selectedTaskId, tasks]);

  // Reset drawer state when selectedTask changes
  useEffect(() => {
    setIsReassigning(false);
    setSelectedReassigneeId('');
    setIsEditingTask(false);
    setReassignSuccessMsg(null);
    setEditingSubtaskId(null);
    setSubtaskUpdateText('');
    setIsEditingMainTaskUpdate(false);
    setMainTaskUpdateText('');
  }, [selectedTask?.id]);

  // Permission Checks
  const canUserEditTask = (task: Task | null): boolean => {
    if (!task || !currentUser) return false;
    // Task created by current user
    if (task.createdById === currentUser.id) return true;
    // Task assigned directly to current user
    if (task.assignedToId === currentUser.id) return true;
    if (task.assignedToIds && task.assignedToIds.includes(currentUser.id)) return true;
    return false;
  };

  const canUserAddUpdate = (task: Task | null): boolean => {
    if (!task || !currentUser) return false;
    return true;
  };

  const formatUpdateTimestamp = (isoString?: string): string => {
    if (!isoString) return '';
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (isToday) return `Today at ${timeStr}`;
    return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${timeStr}`;
  };

  const handleSaveSubtaskUpdate = (taskId: string, subtaskId: string, text: string) => {
    actions.updateSubtaskUpdate(taskId, subtaskId, text, currentUser.id, currentUser.name);
    setEditingSubtaskId(null);
    setSubtaskUpdateText('');
    const updated = tasks.find((t: Task) => t.id === taskId);
    if (updated) setSelectedTask(updated);
  };

  const handleSaveMainTaskUpdate = (taskId: string, text: string) => {
    actions.updateTaskGeneralUpdate(taskId, text, currentUser.id, currentUser.name);
    setIsEditingMainTaskUpdate(false);
    setMainTaskUpdateText('');
    const updated = tasks.find((t: Task) => t.id === taskId);
    if (updated) setSelectedTask(updated);
  };

  const canUserReassignTask = (task: Task | null): boolean => {
    if (!task || !currentUser) return false;
    // 1. Personal task
    const isPersonal = task.type === 'personal' || task.assignmentType === 'personal' || task.assignedToId === currentUser.id;
    // 2. Assigned directly to me
    const isAssignedToMe = task.assignedToId === currentUser.id || Boolean(task.assignedToIds && task.assignedToIds.includes(currentUser.id));
    // 3. Assigned to my department
    const userDept = normalizeDepartmentName(currentUser.department);
    const taskDept = normalizeDepartmentName(task.department);
    const isAssignedToMyDept = taskDept === userDept ||
      Boolean(task.assignedDepartments && task.assignedDepartments.map(d => normalizeDepartmentName(d)).includes(userDept));

    return Boolean(isPersonal || isAssignedToMe || isAssignedToMyDept);
  };

  const handleStartEditTask = (task: Task) => {
    setEditTitle(task.title);
    setEditDescription(task.description || '');
    setEditPriority(task.priority);
    setEditDueDate(task.dueDate || '');
    setIsEditingTask(true);
  };

  const handleSaveTaskEdit = () => {
    if (!selectedTask) return;
    if (!editTitle.trim()) {
      setBannerMessage('Task title cannot be empty.');
      return;
    }
    if (!editDueDate || !editDueDate.trim()) {
      setBannerMessage('Due date is compulsory when updating a task.');
      return;
    }

    actions.updateTask(selectedTask.id, {
      title: editTitle.trim(),
      description: editDescription.trim(),
      priority: editPriority,
      dueDate: editDueDate,
    });

    const updated = tasks.find((t: Task) => t.id === selectedTask.id);
    if (updated) setSelectedTask(updated);
    setIsEditingTask(false);
  };

  const handleConfirmReassign = () => {
    if (!selectedTask || !selectedReassigneeId) return;
    const targetStaff = staff.find(s => s.id === selectedReassigneeId);
    if (!targetStaff) return;

    const newDept = normalizeDepartmentName(targetStaff.department);
    const newOrg = targetStaff.organisation || selectedTask.organisation || 'WIPAHS';

    actions.updateTask(selectedTask.id, {
      assignedToId: targetStaff.id,
      assignedToName: targetStaff.name,
      assignedToAvatar: targetStaff.avatar,
      assignedToIds: [targetStaff.id],
      assignedToNames: [targetStaff.name],
      department: newDept,
      organisation: newOrg,
      assignmentType: 'specific_people',
      type: targetStaff.id === currentUser.id ? 'personal' : 'departmental',
      createdById: selectedTask.createdById,
      createdByName: selectedTask.createdByName,
    });

    // Trigger instant notification and email for the reassigned staff member
    if (targetStaff.id !== currentUser.id) {
      actions.addNotification({
        title: `Task Reassigned to You: ${selectedTask.title}`,
        message: `Task "${selectedTask.title}" has been assigned to you by ${currentUser.name}. Priority: ${selectedTask.priority}. Due: ${selectedTask.dueDate || 'No due date'}.`,
        type: 'task',
        targetUserId: targetStaff.id,
        priority: selectedTask.priority === 'Urgent' ? 'Urgent' : 'Normal',
        actorId: currentUser.id,
        actorName: currentUser.name,
        actorAvatar: currentUser.avatar,
        pushedToMicrosoftTeams: true,
        emailTriggered: true,
        emailRecipients: [targetStaff.email || 'staff@wipahs.or.tz'],
        emailSubject: `[WIPAHS Task] Task Assigned to You: ${selectedTask.title}`,
        metadata: {
          taskId: selectedTask.id,
          department: newDept,
          priority: selectedTask.priority,
          dueDate: selectedTask.dueDate,
        },
      });
    }

    const updated = tasks.find((t: Task) => t.id === selectedTask.id);
    if (updated) setSelectedTask(updated);
    setIsReassigning(false);
    setSelectedReassigneeId('');
    setReassignSuccessMsg(`Task reassigned successfully to ${targetStaff.name}`);
    setTimeout(() => setReassignSuccessMsg(null), 4000);
  };

  // Grouping state with local storage persistence
  const [groupBy, setGroupBy] = useState<TaskGroupByOption>(getInitialGroupBy);
  const [groupSort, setGroupSort] = useState<GroupSortOption>(getInitialGroupSort);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(getInitialCollapsedState);

  // Sync grouping preference to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_GROUP_BY, groupBy);
    } catch {
      // ignore
    }
  }, [groupBy]);

  // Sync group sort preference to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_GROUP_SORT, groupSort);
    } catch {
      // ignore
    }
  }, [groupSort]);

  // Sync collapsed state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_COLLAPSED, JSON.stringify(collapsedGroups));
    } catch {
      // ignore
    }
  }, [collapsedGroups]);

  // Category change handler that resets filters to prevent hiding tasks
  const handleSelectCategory = (cat: 'my-work' | 'department' | 'all' | 'assigned-by-me') => {
    setActiveCategory(cat);
    setStatusFilter('All');
    setPriorityFilter('All');
    setOrganisationFilter('All');
    setDepartmentFilter('All');
    setSearchQuery('');
    onCategoryChange?.(cat);
  };

  // Update category when defaultCategory prop changes and reset filters
  useEffect(() => {
    setActiveCategory(defaultCategory);
    setStatusFilter('All');
    setPriorityFilter('All');
    setOrganisationFilter('All');
    setDepartmentFilter('All');
    setSearchQuery('');
  }, [defaultCategory]);

  // 1. My Tasks: personal tasks and tasks assigned to me (excluding tasks assigned by me to others)
  const myWorkTasks = useMemo(() => {
    const currentId = currentUser.id;
    const currentName = currentUser.name?.toLowerCase().trim() || '';
    return tasks.filter(t => {
      if (isTaskArchived(t)) return false;
      return isMyPersonalOrAssignedTask(t, currentId, currentName);
    });
  }, [tasks, currentUser]);

  // 2. Department Tasks: tasks assigned to the department as a whole (excluding personal tasks)
  const deptTasks = useMemo(() => {
    const currentId = currentUser.id;
    return tasks.filter(t => {
      if (isTaskArchived(t)) return false;
      // Personal tasks must never appear in department tasks
      if (isPersonalTask(t, currentId)) return false;
      return isTaskDepartmentalForUser(t, currentUser.department);
    });
  }, [tasks, currentUser]);

  // 3. Assigned By Me: all tasks assigned by current user to other members, departments, or organisations
  const assignedByMeTasks = useMemo(() => {
    return tasks.filter(t => {
      if (isTaskArchived(t)) return false;
      return isTaskAssignedByMe(t, currentUser.id);
    });
  }, [tasks, currentUser]);

  const assignedByMePendingRatingTasks = useMemo(() => {
    if (activeCategory !== 'assigned-by-me') return [];
    return assignedByMeTasks.filter(t => {
      if (t.status !== 'Done' || t.rating || !t.pendingRating) return false;
      return true;
    });
  }, [activeCategory, assignedByMeTasks]);

  // 4. All Tasks: all tasks relevant to the user, including personal tasks, tasks assigned to me,
  // tasks assigned by me, departmental tasks, and organisation-wide tasks
  const allTasksForUser = useMemo(() => {
    const currentId = currentUser.id;
    const currentName = currentUser.name?.toLowerCase().trim() || '';
    return tasks.filter(t => {
      if (isTaskArchived(t)) return false;
      return isTaskVisibleInAllTasks(
        t,
        currentId,
        currentName,
        currentUser.department,
        currentUser.organisation
      );
    });
  }, [tasks, currentUser]);

  // Select base list for active tab:
  const currentList = activeCategory === 'my-work'
    ? myWorkTasks
    : activeCategory === 'department'
    ? deptTasks
    : activeCategory === 'assigned-by-me'
    ? assignedByMeTasks
    : allTasksForUser;

  const availableOrganisations = useMemo(() => {
    const orgs = Array.from(new Set(currentList.map(t => t.organisation || 'WIPAHS')));
    return sortOrganisations(orgs);
  }, [currentList]);

  // Available departments: clean unique list based on active tab's tasks
  const availableDepartments = useMemo(() => {
    const relevantTasks = organisationFilter === 'All'
      ? currentList
      : currentList.filter(t => (t.organisation || 'WIPAHS') === organisationFilter);
    const set = new Set<string>();
    relevantTasks.forEach(t => {
      const d = normalizeDepartment(t.department);
      if (d) set.add(d);
    });
    return Array.from(set).sort();
  }, [currentList, organisationFilter]);

  // Apply existing Status, Priority, Department, and Search filters
  const filteredTasks = useMemo(() => {
    return currentList.filter(task => {
      const taskOrg = task.organisation || 'WIPAHS';
      const taskDept = normalizeDepartment(task.department);

      if (statusFilter !== 'All' && task.status !== statusFilter) return false;
      if (priorityFilter !== 'All' && task.priority !== priorityFilter) return false;
      if (activeCategory === 'all' && organisationFilter !== 'All' && taskOrg !== organisationFilter) return false;
      if (departmentFilter !== 'All' && taskDept !== normalizeDepartment(departmentFilter)) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          task.title.toLowerCase().includes(q) ||
          task.description.toLowerCase().includes(q) ||
          task.assignedToName.toLowerCase().includes(q) ||
          taskOrg.toLowerCase().includes(q) ||
          taskDept.toLowerCase().includes(q) ||
          (task.tags && task.tags.some(tag => tag.toLowerCase().includes(q)))
        );
      }
      return true;
    });
  }, [currentList, statusFilter, priorityFilter, activeCategory, organisationFilter, departmentFilter, searchQuery]);

  // Helper: resolve clean display assignee for a task
  const resolveTaskAssignee = (t: Task): string => {
    if (t.assignmentType === 'organization' && t.assignedOrganisations && t.assignedOrganisations.length > 0) {
      return t.assignedOrganisations.join(', ');
    }
    if (t.assignmentType === 'department' && t.assignedDepartments && t.assignedDepartments.length > 0) {
      return t.assignedDepartments.join(', ');
    }
    if (t.assignedToIds && t.assignedToIds.length > 1) {
      return t.assignedToNames?.join(', ') || `${t.assignedToIds.length} Assignees`;
    }
    return t.assignedToName || 'Unassigned';
  };

  // Helper: map a task to its due date bucket
  const getDueDateBucket = (t: Task): string => {
    if (t.status === 'Done') return 'Completed';
    if (!t.dueDate) return 'No Due Date';

    const dueDateStr = t.dueDate;
    const baseDate = todayDateStr; // Dynamic current system date

    if (dueDateStr < baseDate) return 'Overdue';
    if (dueDateStr === baseDate) return 'Due Today';

    // Check if within next 7 days (this week)
    const dueTime = new Date(dueDateStr).getTime();
    const baseTime = new Date(baseDate).getTime();
    const diffDays = Math.ceil((dueTime - baseTime) / (1000 * 60 * 60 * 24));

    if (diffDays <= 7 && diffDays > 0) return 'Due This Week';
    return 'Later / Upcoming';
  };

  // Compute Task Groups based on selected groupBy option
  const calculatedGroups = useMemo<TaskGroupItem[]>(() => {
    if (groupBy === 'None') return [];

    // 1. Group by Department
    if (groupBy === 'Department') {
      const normFilter = normalizeDepartment(departmentFilter);
      // If user is filtering to a specific department, collapse grouping down to a single group automatically
      if (departmentFilter !== 'All') {
        const groupTasks = filteredTasks.filter(t => normalizeDepartment(t.department) === normFilter);
        return [{
          key: `dept-${normFilter}`,
          name: normFilter,
          icon: Building2,
          tasks: groupTasks
        }];
      }

      // Group all departments present in filteredTasks (normalized to avoid duplicates)
      const depts = Array.from(new Set(filteredTasks.map(t => normalizeDepartment(t.department)))).sort();
      return depts.map(dept => ({
        key: `dept-${dept}`,
        name: dept,
        icon: Building2,
        tasks: filteredTasks.filter(t => normalizeDepartment(t.department) === dept)
      }));
    }

    // 2. Group by Status
    if (groupBy === 'Status') {
      const allStatuses: TaskStatus[] = ['To Do', 'In Progress', 'In Review', 'Done'];
      if (statusFilter !== 'All') {
        return [{
          key: `status-${statusFilter}`,
          name: statusFilter,
          icon: CheckCircle2,
          tasks: filteredTasks.filter(t => t.status === statusFilter)
        }];
      }
      return allStatuses.map(st => ({
        key: `status-${st}`,
        name: st,
        icon: CheckCircle2,
        tasks: filteredTasks.filter(t => t.status === st)
      }));
    }

    // 3. Group by Priority
    if (groupBy === 'Priority') {
      const allPriorities: Priority[] = ['Urgent', 'High', 'Medium', 'Low'];
      if (priorityFilter !== 'All') {
        return [{
          key: `priority-${priorityFilter}`,
          name: `${priorityFilter} Priority`,
          icon: AlertCircle,
          tasks: filteredTasks.filter(t => t.priority === priorityFilter)
        }];
      }
      return allPriorities.map(pr => ({
        key: `priority-${pr}`,
        name: `${pr} Priority`,
        icon: AlertCircle,
        tasks: filteredTasks.filter(t => t.priority === pr)
      }));
    }

    // 4. Group by Assignee
    if (groupBy === 'Assignee') {
      const assigneeMap = new Map<string, Task[]>();
      filteredTasks.forEach(task => {
        const assignee = resolveTaskAssignee(task);
        if (!assigneeMap.has(assignee)) {
          assigneeMap.set(assignee, []);
        }
        assigneeMap.get(assignee)!.push(task);
      });

      const uniqueAssignees = Array.from(assigneeMap.keys()).sort();
      return uniqueAssignees.map(assignee => ({
        key: `assignee-${assignee}`,
        name: assignee,
        icon: User,
        tasks: assigneeMap.get(assignee)!
      }));
    }

    // 5. Group by Due date
    if (groupBy === 'Due date') {
      const standardBuckets = ['Overdue', 'Due Today', 'Due This Week', 'Later / Upcoming', 'Completed'];
      const bucketMap = new Map<string, Task[]>();
      standardBuckets.forEach(b => bucketMap.set(b, []));

      filteredTasks.forEach(task => {
        const bucket = getDueDateBucket(task);
        if (!bucketMap.has(bucket)) {
          bucketMap.set(bucket, []);
        }
        bucketMap.get(bucket)!.push(task);
      });

      return standardBuckets.map(bucket => ({
        key: `due-${bucket}`,
        name: bucket,
        icon: Clock,
        tasks: bucketMap.get(bucket) || []
      }));
    }

    return [];
  }, [groupBy, departmentFilter, statusFilter, priorityFilter, filteredTasks]);

  // Sort groups: count (largest first) by default, or alphabetical
  const sortedGroups = useMemo<TaskGroupItem[]>(() => {
    if (calculatedGroups.length === 0) return [];
    const copy = [...calculatedGroups];

    if (groupSort === 'count') {
      copy.sort((a, b) => {
        const diff = b.tasks.length - a.tasks.length;
        if (diff !== 0) return diff;
        return a.name.localeCompare(b.name);
      });
    } else {
      copy.sort((a, b) => a.name.localeCompare(b.name));
    }

    return copy;
  }, [calculatedGroups, groupSort]);

  // Determine whether a group is collapsed
  // "Collapsed by default only if a group has more than 8 tasks."
  const isGroupCollapsed = (groupKey: string, taskCount: number): boolean => {
    if (typeof collapsedGroups[groupKey] === 'boolean') {
      return collapsedGroups[groupKey];
    }
    return taskCount > 8;
  };

  const toggleGroup = (groupKey: string, taskCount: number) => {
    const currentlyCollapsed = isGroupCollapsed(groupKey, taskCount);
    setCollapsedGroups(prev => ({
      ...prev,
      [groupKey]: !currentlyCollapsed
    }));
  };

  // Check if all currently visible groups are collapsed
  const allGroupsAreCollapsed = useMemo(() => {
    if (sortedGroups.length === 0) return false;
    return sortedGroups.every(g => isGroupCollapsed(g.key, g.tasks.length));
  }, [sortedGroups, collapsedGroups]);

  // Collapse all / Expand all toggle
  const handleToggleAllGroups = () => {
    const targetState = !allGroupsAreCollapsed; // true = collapse all, false = expand all
    setCollapsedGroups(prev => {
      const next = { ...prev };
      sortedGroups.forEach(g => {
        next[g.key] = targetState;
      });
      return next;
    });
  };

  // Keyboard navigation for group header
  const handleHeaderKeyDown = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    groupKey: string,
    taskCount: number
  ) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleGroup(groupKey, taskCount);
      return;
    }

    const isCollapsed = isGroupCollapsed(groupKey, taskCount);
    if (e.key === 'ArrowDown' && !isCollapsed) {
      e.preventDefault();
      const container = document.getElementById(`group-tasks-${groupKey}`);
      const firstTask = container?.querySelector<HTMLElement>('[data-task-item]');
      if (firstTask) firstTask.focus();
    }
  };

  // Keyboard navigation between tasks within a group
  const handleTaskKeyDown = (
    e: React.KeyboardEvent<HTMLDivElement>,
    task: Task,
    groupKey: string
  ) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setSelectedTask(task);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const current = e.currentTarget;
      const next = current.nextElementSibling as HTMLElement | null;
      if (next && next.hasAttribute('data-task-item')) {
        next.focus();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const current = e.currentTarget;
      const prev = current.previousElementSibling as HTMLElement | null;
      if (prev && prev.hasAttribute('data-task-item')) {
        prev.focus();
      } else {
        const header = document.getElementById(`group-header-${groupKey}`);
        if (header) header.focus();
      }
    }
  };

  // Priority badge styling with fixed uniform box width (w-[78px] min-w-[78px] h-6) for pixel-perfect vertical task alignment
  const renderPriorityBadge = (priority: Priority) => {
    let dotColor = 'bg-slate-500';
    let badgeClasses = 'bg-slate-100 text-slate-800 border-slate-300';

    switch (priority) {
      case 'Urgent':
        dotColor = 'bg-rose-600';
        badgeClasses = 'bg-rose-50 text-rose-800 border-rose-300';
        break;
      case 'High':
        dotColor = 'bg-amber-600';
        badgeClasses = 'bg-amber-50 text-amber-900 border-amber-300';
        break;
      case 'Medium':
        dotColor = 'bg-blue-600';
        badgeClasses = 'bg-blue-50 text-blue-800 border-blue-300';
        break;
      case 'Low':
      default:
        dotColor = 'bg-slate-500';
        badgeClasses = 'bg-slate-100 text-slate-800 border-slate-300';
        break;
    }

    return (
      <div
        className={`w-[78px] min-w-[78px] h-6 inline-flex items-center justify-center gap-1.5 px-2 rounded-md border text-[11px] font-semibold shrink-0 transition focus:outline-none focus:ring-1 focus:ring-slate-400 text-center ${badgeClasses}`}
        title={`Priority: ${priority} (WCAG AA certified)`}
        aria-label={`Priority ${priority}`}
      >
        <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} aria-hidden="true" />
        <span className="truncate">{priority}</span>
      </div>
    );
  };

  // Priority Weight Helper
  const getPriorityWeight = (priority: Priority): number => {
    switch (priority) {
      case 'Urgent': return 4;
      case 'High': return 3;
      case 'Medium': return 2;
      case 'Low': return 1;
      default: return 0;
    }
  };

  // Status badge styling with WCAG AA contrast (>= 4.5:1 on white)
  const getStatusBadge = (status: TaskStatus) => {
    switch (status) {
      case 'Done':
        return 'bg-emerald-50 text-emerald-800 border-emerald-300';
      case 'Cancelled':
        return 'bg-slate-100 text-slate-600 border-slate-300 line-through';
      case 'In Progress':
        return 'bg-blue-50 text-blue-800 border-blue-300';
      case 'In Review':
        return 'bg-amber-50 text-amber-900 border-amber-300';
      case 'To Do':
      default:
        return 'bg-slate-100 text-slate-800 border-slate-300';
    }
  };

  // Helper to render a list section: active tasks sorted by priority (higher first) and due date (due soonest first),
  // with all done and cancelled tasks grouped together under a header at the end of the section.
  const renderTaskListSection = (taskList: Task[], groupKey = 'flat') => {
    if (taskList.length === 0) {
      return (
        <div className="py-4 px-6 text-center text-xs text-slate-400 italic bg-white" role="listitem">
          No tasks in this section
        </div>
      );
    }

    const isAssignedByMeCategory = activeCategory === 'assigned-by-me';
    // For assigned-by-me, pending-rating tasks are already displayed in the global pinned banner above the list
    const regularTaskList = isAssignedByMeCategory
      ? taskList.filter(t => !(t.status === 'Done' && t.pendingRating && !isPersonalTask(t, currentUser.id)))
      : taskList;

    const activeTasks = regularTaskList.filter(t => t.status !== 'Done' && t.status !== 'Cancelled');
    const completedAndCancelledTasks = regularTaskList.filter(t => t.status === 'Done' || t.status === 'Cancelled');

    // Sort active tasks: higher priority weight first (Urgent > High > Medium > Low), then due soonest (earlier dates first)
    const sortedActiveTasks = [...activeTasks].sort((a, b) => {
      const weightA = getPriorityWeight(a.priority);
      const weightB = getPriorityWeight(b.priority);
      if (weightB !== weightA) {
        return weightB - weightA;
      }
      const dateA = a.dueDate || '9999-99-99';
      const dateB = b.dueDate || '9999-99-99';
      return dateA.localeCompare(dateB);
    });

    return (
      <div className="bg-white">
        {/* Active Tasks sorted by Priority & Due Soonest */}
        {sortedActiveTasks.length > 0 && (
          <div className="divide-y divide-slate-100">
            {sortedActiveTasks.map(task => renderTaskItem(task, groupKey))}
          </div>
        )}

        {/* Done & Cancelled Tasks grouped together under a header at the end of the section */}
        {completedAndCancelledTasks.length > 0 && (
          <div className="bg-slate-50/80 p-3 border-t border-slate-200 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700 px-1">
              <span className="flex items-center gap-1.5 uppercase tracking-wide text-[11px] text-slate-600">
                <CheckCircle2 className="w-3.5 h-3.5 text-slate-500" />
                Completed & Cancelled Tasks ({completedAndCancelledTasks.length})
              </span>
            </div>
            <div className="divide-y divide-slate-200/60 bg-white rounded border border-slate-200 shadow-2xs">
              {completedAndCancelledTasks.map(task => renderTaskItem(task, `${groupKey}-completed`))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const handleToggleSubtask = (taskId: string, subtaskId: string) => {
    actions.toggleSubtask(taskId, subtaskId);
    if (selectedTask && selectedTask.id === taskId) {
      const updated = tasks.find((t: Task) => t.id === taskId);
      if (updated) setSelectedTask(updated);
    }
  };

  const handleAddSubtask = (taskId: string) => {
    if (!newSubtaskText.trim()) return;
    actions.addSubtask(taskId, newSubtaskText.trim());
    setNewSubtaskText('');
    const updated = tasks.find((t: Task) => t.id === taskId);
    if (updated) setSelectedTask(updated);
  };

  const handleDrawerAttachFile = async (e: React.ChangeEvent<HTMLInputElement>, task: Task) => {
    if (!e.target.files || e.target.files.length === 0) return;
    try {
      const files = Array.from(e.target.files);
      const newAttachments: MessageAttachment[] = [];
      for (const file of files) {
        const att = await parseUploadedFile(file);
        newAttachments.push(att);
      }
      const existing = task.attachments || [];
      const updatedAttachments = [...existing, ...newAttachments];
      actions.updateTask(task.id, { attachments: updatedAttachments });
      const updatedTask = tasks.find((t: Task) => t.id === task.id);
      if (updatedTask) setSelectedTask(updatedTask);
    } catch (err) {
      console.error('Error attaching file in task drawer:', err);
    } finally {
      e.target.value = '';
    }
  };

  const handleDrawerRemoveFile = (task: Task, attachmentId: string) => {
    const existing = task.attachments || [];
    const updatedAttachments = existing.filter(a => a.id !== attachmentId);
    actions.updateTask(task.id, { attachments: updatedAttachments });
    const updatedTask = tasks.find((t: Task) => t.id === task.id);
    if (updatedTask) setSelectedTask(updatedTask);
  };

  // Individual task row component with responsive layout (stacked on mobile without truncation)
  const renderTaskItem = (task: Task, groupKey = 'flat') => {
    const isPast = task.dueDate ? task.dueDate < todayDateStr : false;
    const isOverdue = isPast && task.status !== 'Done';
    const completedSubtasks = task.subtasks.filter(s => s.completed).length;
    const totalSubtasks = task.subtasks.length;

    const assignedStaff = staff.find(s => s.id === task.assignedToId);
    const org = task.organisation || assignedStaff?.organisation || 'WIPAHS';
    const dept = task.department || assignedStaff?.department || 'General';

    let assignTitle = task.assignedToName;
    let assignSubtitle = `${org} • ${dept}`;

    if (task.assignmentType === 'organization' && task.assignedOrganisations && task.assignedOrganisations.length > 0) {
      assignTitle = task.assignedOrganisations.join(', ');
      assignSubtitle = `${task.assignedOrganisations.length} Organisation(s)`;
    } else if (task.assignmentType === 'department' && task.assignedDepartments && task.assignedDepartments.length > 0) {
      assignTitle = task.assignedDepartments.join(', ');
      assignSubtitle = `${task.assignedDepartments.length} Department(s) • ${org}`;
    } else if (task.assignedToIds && task.assignedToIds.length > 1) {
      assignTitle = `${task.assignedToIds.length} Assignees`;
      assignSubtitle = task.assignedToNames?.join(', ') || task.assignedToName;
    } else if (assignedStaff) {
      assignTitle = formatStaffDisplayName(assignedStaff);
      assignSubtitle = formatStaffDisplayOrgDept(assignedStaff);
    }

    return (
      <div
        key={task.id}
        data-task-item
        role="listitem"
        tabIndex={0}
        onClick={() => setSelectedTask(task)}
        onKeyDown={(e) => handleTaskKeyDown(e, task, groupKey)}
        className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#00ad1d] transition-colors cursor-pointer group border-b border-slate-100 last:border-b-0 ${
          isOverdue ? 'bg-rose-50/80 hover:bg-rose-100/70 border-l-4 border-l-rose-500' : 'hover:bg-slate-50/90'
        }`}
      >
        {/* Left: Checkbox box, Priority badge box & Title & stacked metadata */}
        <div className="oh-task-content flex items-start gap-2.5 min-w-0 flex-1">
          <button
            type="button"
            disabled={savingTaskIds.has(task.id)}
            onClick={async (e) => {
              e.stopPropagation();
              const nextStatus = task.status === 'Done' ? 'In Progress' : 'Done';
              setSavingTaskIds((prev) => new Set(prev).add(task.id));
              try {
                await actions.updateTaskStatus(task.id, nextStatus);
              } catch (err: any) {
                setBannerMessage(`Could not update task: ${err?.message || 'Permission denied or network error'}`);
              } finally {
                setSavingTaskIds((prev) => {
                  const next = new Set(prev);
                  next.delete(task.id);
                  return next;
                });
              }
            }}
            className={`mt-0.5 w-5 h-5 min-w-[20px] rounded border flex items-center justify-center transition shrink-0 cursor-pointer ${
              task.status === 'Done'
                ? 'bg-[#00ad1d] border-[#00ad1d] text-white shadow-2xs'
                : 'border-slate-300 hover:border-[#00ad1d] bg-white'
            } ${savingTaskIds.has(task.id) ? 'opacity-80' : ''}`}
            title={task.status === 'Done' ? 'Mark incomplete' : 'Mark task completed'}
            aria-label={task.status === 'Done' ? 'Mark task incomplete' : 'Mark task completed'}
          >
            {savingTaskIds.has(task.id) ? (
              <div className="w-2.5 h-2.5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            ) : (
              task.status === 'Done' && <Check className="w-3.5 h-3.5 stroke-[3]" />
            )}
          </button>

          {renderPriorityBadge(task.priority)}

          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-slate-900 group-hover:text-[#008f18] leading-snug break-words">
                {task.title}
              </p>

              {/* Assignment Type badge */}
              {task.assignmentType === 'organization' && (
                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.2 rounded bg-purple-50 text-purple-700 border border-purple-200 font-semibold">
                  <Building2 className="w-2.5 h-2.5" />
                  <span>Org Unit</span>
                </span>
              )}

              {task.assignmentType === 'department' && (
                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.2 rounded bg-blue-50 text-blue-700 border border-blue-200 font-semibold">
                  <Users className="w-2.5 h-2.5" />
                  <span>Departmental</span>
                </span>
              )}

              {task.assignedToIds && task.assignedToIds.length > 1 && (
                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                  <Users className="w-2.5 h-2.5" />
                  <span>{task.assignedToIds.length} People</span>
                </span>
              )}

              {/* Teams meeting link */}
              {task.teamsMeetingLink && (
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(task.teamsMeetingLink, '_blank');
                  }}
                  className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 cursor-pointer"
                  title="Open Teams Virtual Meeting"
                >
                  <Video className="w-2.5 h-2.5" />
                  <span>Teams Room</span>
                </span>
              )}

              {/* Attached Documents badge */}
              {task.attachments && task.attachments.length > 0 && (
                <span
                  className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-300 font-semibold"
                  title={`${task.attachments.length} attached document(s)`}
                >
                  <Paperclip className="w-2.5 h-2.5 text-emerald-600" />
                  <span>{task.attachments.length} {task.attachments.length === 1 ? 'Doc' : 'Docs'}</span>
                </span>
              )}

              {/* SharePoint Doc link */}
              {task.sharePointDocUrl && (
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(task.sharePointDocUrl, '_blank');
                  }}
                  className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 cursor-pointer"
                  title="Open SharePoint File"
                >
                  <FileText className="w-2.5 h-2.5" />
                  <span>SharePoint</span>
                </span>
              )}
            </div>

            {/* Sub-details: stacked naturally on mobile without truncation */}
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-600">
              <span className="font-semibold text-slate-800">
                {assignTitle}
              </span>
              {task.assignedToId && !task.assignedToId.startsWith('dept-') && !task.assignedToId.startsWith('org-') && (!task.assignedToIds || task.assignedToIds.length <= 1) && (
                <UserRatingDisplay userId={task.assignedToId} size="xs" />
              )}
              <span aria-hidden="true" className="text-slate-300">•</span>
              <span className="text-[#008f18] font-medium">
                {assignSubtitle}
              </span>

              {totalSubtasks > 0 && (
                <>
                  <span aria-hidden="true" className="text-slate-300">•</span>
                  <span className="inline-flex items-center gap-1 text-[11px] text-slate-600 font-medium">
                    <CheckCircle2 className="w-3 h-3 text-[#00ad1d]" />
                    {completedSubtasks}/{totalSubtasks} subtasks
                  </span>
                </>
              )}

              {task.update && (
                <>
                  <span aria-hidden="true" className="text-slate-300">•</span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200" title={`Latest update: ${task.update.text}`}>
                    <MessageSquare className="w-3 h-3 text-[#008f18]" />
                    <span>Update: {task.update.text.length > 25 ? task.update.text.slice(0, 25) + '...' : task.update.text}</span>
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right / Bottom on mobile: Status badge & Due date & Rating badge */}
        <div className="shrink-0 flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-1.5 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 text-right">
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            {task.status === 'Done' && task.pendingRating && !isPersonalTask(task, currentUser.id) && (
              <span
                className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded font-bold bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs animate-pulse"
                title="Task completed — rating is required from assigner"
              >
                <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                <span>{task.createdById === currentUser.id ? 'Rate Task ★' : 'Pending Rating'}</span>
              </span>
            )}

            {task.status === 'Done' && task.rating && !isPersonalTask(task, currentUser.id) && (
              <span
                className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-bold bg-amber-50 text-amber-800 border border-amber-200"
                title={`Rated ${task.rating.stars} stars${task.rating.comment ? `: "${task.rating.comment}"` : ''}`}
              >
                <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                <span>{task.rating.stars}.0</span>
              </span>
            )}

            <span
              className={`text-[11px] px-2.5 py-0.5 rounded border font-semibold ${getStatusBadge(task.status)}`}
              title={`Status: ${task.status}`}
            >
              {task.status}
            </span>
          </div>

          <span
            className={`flex items-center gap-1 text-xs ${
              isOverdue ? 'text-rose-700 font-semibold' : 'text-slate-500'
            }`}
          >
            <Clock className="w-3.5 h-3.5 shrink-0" />
            <span>{task.dueDate}{isOverdue && ' (Overdue)'}</span>
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Top Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200 rounded-md p-3.5 shadow-2xs h-full min-h-[76px] flex items-center">
          <div className="flex items-center gap-2.5 w-full">
            <div className="w-8 h-8 rounded-md bg-[#00ad1d]/10 flex items-center justify-center shrink-0">
              <CheckSquare className="w-4 h-4 text-[#00ad1d]" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold text-slate-900 leading-tight">
                {myWorkTasks.filter(t => t.status !== 'Done').length}
              </p>
              <p className="text-xs text-slate-500">My Open Tasks</p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-md p-3.5 shadow-2xs h-full min-h-[76px] flex items-center">
          <div className="flex items-center gap-2.5 w-full">
            <div className="w-8 h-8 rounded-md bg-blue-50 flex items-center justify-center shrink-0">
              <Building className="w-4 h-4 text-[#0c6fae]" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold text-slate-900 leading-tight">
                {deptTasks.filter(t => t.status !== 'Done').length}
              </p>
              <p className="text-xs text-slate-500 truncate">
                {currentUser.organisation || 'WIPAHS'} • {normalizeDepartment(currentUser.department)}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-md p-3.5 shadow-2xs h-full min-h-[76px] flex items-center">
          <div className="flex items-center gap-2.5 w-full">
            <div className="w-8 h-8 rounded-md bg-purple-50 flex items-center justify-center shrink-0">
              <Layers className="w-4 h-4 text-purple-700" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold text-slate-900 leading-tight">
                {tasks.filter(t => t.status === 'In Progress').length}
              </p>
              <p className="text-xs text-slate-500">Active Workstreams</p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-md p-3.5 shadow-2xs h-full min-h-[76px] flex items-center">
          <div className="flex items-center gap-2.5 w-full">
            <div className="w-8 h-8 rounded-md bg-rose-50 flex items-center justify-center shrink-0">
              <AlertCircle className="w-4 h-4 text-rose-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold text-rose-600 leading-tight">
                {projects.reduce((acc, p) => {
                  if (!p.milestones) return acc;
                  return acc + p.milestones.filter(m => {
                    if (m.status === 'Completed') return false;
                    return m.dueDate ? m.dueDate < todayDateStr : false;
                  }).length;
                }, 0)}
              </p>
              <p className="text-xs text-slate-500">Overdue Milestones</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="bg-white border border-slate-200 rounded-md shadow-2xs overflow-hidden">
        {/* Category Tabs Header */}
        <div className="p-3 sm:p-4 border-b border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="oh-tabs flex items-center gap-1.5 bg-slate-200/80 p-1 rounded-md text-xs font-medium">
            <button
              onClick={() => handleSelectCategory('my-work')}
              className={`px-3 py-1.5 rounded-sm transition ${
                activeCategory === 'my-work'
                  ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              My Tasks ({myWorkTasks.length})
            </button>
            <button
              onClick={() => handleSelectCategory('department')}
              className={`px-3 py-1.5 rounded-sm transition ${
                activeCategory === 'department'
                  ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Department Tasks ({deptTasks.length})
            </button>
            <button
              onClick={() => handleSelectCategory('assigned-by-me')}
              className={`px-3 py-1.5 rounded-sm transition flex items-center gap-1 ${
                activeCategory === 'assigned-by-me'
                  ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>Assigned By Me ({assignedByMeTasks.length})</span>
              {assignedByMeTasks.filter(t => t.status === 'Done' && t.pendingRating).length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-white text-[9px] font-bold">
                  {assignedByMeTasks.filter(t => t.status === 'Done' && t.pendingRating).length}★
                </span>
              )}
            </button>
            <button
              onClick={() => handleSelectCategory('all')}
              className={`px-3 py-1.5 rounded-sm transition ${
                activeCategory === 'all'
                  ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Tasks ({allTasksForUser.length})
            </button>
          </div>

          {/* New Task Button */}
          <button
            onClick={onOpenNewTaskModal}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#00ad1d] hover:bg-[#009218] text-white rounded-md text-xs font-semibold shadow-2xs transition self-start sm:self-auto cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Create Task</span>
          </button>
        </div>

        {/* Filters and Grouping Bar */}
        <div className="p-3 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter tasks by title, assignee, organisation..."
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
              aria-label="Filter tasks search input"
            />
          </div>

          {/* Filter Dropdowns & Group By */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-slate-700 text-xs focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
              aria-label="Filter by status"
            >
              <option value="All">All Statuses</option>
              <option value="To Do">To Do</option>
              <option value="In Progress">In Progress</option>
              <option value="In Review">In Review</option>
              <option value="Done">Done</option>
              <option value="Cancelled">Cancelled</option>
            </select>

            {/* Priority Filter */}
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as any)}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-slate-700 text-xs focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
              aria-label="Filter by priority"
            >
              <option value="All">All Priorities</option>
              <option value="Urgent">Urgent</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>

            {/* Organisation Filter */}
            {activeCategory === 'all' && (
              <select
                value={organisationFilter}
                onChange={(e) => {
                  setOrganisationFilter(e.target.value);
                  setDepartmentFilter('All');
                }}
                className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-slate-700 font-semibold text-xs focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
                aria-label="Filter by organisation"
              >
                <option value="All">All Organisations</option>
                {availableOrganisations.map(org => (
                  <option key={org} value={org}>{org}</option>
                ))}
              </select>
            )}

            {/* Department Filter */}
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-slate-700 text-xs focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
              aria-label="Filter by department"
            >
              <option value="All">All Departments</option>
              {availableDepartments.map(dept => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>

            {/* Group By Filter Dropdown */}
            <div className="flex items-center gap-1.5 pl-1 border-l border-slate-200">
              <label htmlFor="task-group-by-select" className="text-slate-500 text-xs font-semibold whitespace-nowrap">
                Group by:
              </label>
              <select
                id="task-group-by-select"
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value as TaskGroupByOption)}
                className="px-2.5 py-1.5 bg-purple-50/50 border border-purple-200 text-purple-900 font-semibold rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-purple-600"
                aria-label="Group tasks by"
              >
                <option value="None">None</option>
                <option value="Department">Department</option>
                <option value="Assignee">Assignee</option>
                <option value="Status">Status</option>
                <option value="Priority">Priority</option>
                <option value="Due date">Due date</option>
              </select>

              {/* Group Sort Toggle (Alphabetical vs Count) */}
              {groupBy !== 'None' && (
                <button
                  type="button"
                  onClick={() => setGroupSort(prev => prev === 'count' ? 'alphabetical' : 'count')}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-md text-slate-700 text-xs font-medium transition cursor-pointer"
                  title={groupSort === 'count' ? 'Sorting groups by Count (largest first). Click to sort alphabetically.' : 'Sorting groups Alphabetically (A-Z). Click to sort by count.'}
                  aria-label={`Sort groups by ${groupSort === 'count' ? 'count' : 'name'}`}
                >
                  <ArrowDownUp className="w-3.5 h-3.5 text-slate-500" />
                  <span>{groupSort === 'count' ? 'Count (9→1)' : 'A→Z'}</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Group Control Sub-header (when grouping active) */}
        {groupBy !== 'None' && filteredTasks.length > 0 && (
          <div className="px-4 py-2 bg-slate-50/90 border-b border-slate-200 flex items-center justify-between text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-800">
                Grouped by {groupBy}
              </span>
              <span aria-hidden="true" className="text-slate-300">•</span>
              <span>
                {sortedGroups.length} {sortedGroups.length === 1 ? 'group' : 'groups'} ({filteredTasks.length} {filteredTasks.length === 1 ? 'task' : 'tasks'})
              </span>
            </div>

            {/* Collapse All / Expand All Toggle */}
            <button
              type="button"
              onClick={handleToggleAllGroups}
              className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900 font-semibold px-2 py-0.5 rounded hover:bg-slate-200/70 transition cursor-pointer"
              aria-label={allGroupsAreCollapsed ? 'Expand all task groups' : 'Collapse all task groups'}
            >
              {allGroupsAreCollapsed ? (
                <>
                  <ChevronsUpDown className="w-3.5 h-3.5 text-slate-500" />
                  <span>Expand all</span>
                </>
              ) : (
                <>
                  <ChevronsDownUp className="w-3.5 h-3.5 text-slate-500" />
                  <span>Collapse all</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Content Section */}
        {activeCategory === 'assigned-by-me' && assignedByMePendingRatingTasks.length > 0 && (
          <div className="bg-amber-50/95 border-b-2 border-amber-300 p-3 mb-3 rounded-md space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-amber-950 px-1">
              <span className="flex items-center gap-1.5 uppercase tracking-wide text-[11px] text-amber-900 font-extrabold">
                <Star className="w-4 h-4 fill-amber-500 text-amber-500 shrink-0" />
                Pinned — Awaiting Your Performance Rating ({assignedByMePendingRatingTasks.length}) • Compulsory Step
              </span>
            </div>
            <div className="divide-y divide-amber-200 bg-white rounded-md border border-amber-300 shadow-2xs overflow-hidden">
              {assignedByMePendingRatingTasks.map(task => renderTaskItem(task, 'global-pinned'))}
            </div>
          </div>
        )}

        {filteredTasks.length === 0 ? (
          <div className="text-center py-12 px-4 bg-white">
            <CheckSquare className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-700">No tasks found</p>
            <p className="text-xs text-slate-400 mt-1">Try adjusting your filter criteria or create a new task.</p>
          </div>
        ) : groupBy === 'None' ? (
          /* None: Flat list sorted by priority & due date, with completed & cancelled tasks grouped at bottom */
          <div role="list" aria-label="Tasks list" className="bg-white">
            {renderTaskListSection(filteredTasks, 'flat')}
          </div>
        ) : (
          /* Active Grouping: Collapsible sections with sticky headers */
          <div className="space-y-3 p-3 bg-slate-50/60">
            {sortedGroups.map(group => {
              const isCollapsed = isGroupCollapsed(group.key, group.tasks.length);
              const GroupIcon = group.icon || Layers;

              return (
                <div
                  key={group.key}
                  className="bg-white border border-slate-200 rounded-md overflow-hidden shadow-2xs"
                >
                  {/* Sticky Group Header */}
                  <button
                    id={`group-header-${group.key}`}
                    type="button"
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleGroup(group.key, group.tasks.length)}
                    onKeyDown={(e) => handleHeaderKeyDown(e, group.key, group.tasks.length)}
                    aria-expanded={!isCollapsed}
                    aria-controls={`group-tasks-${group.key}`}
                    className="w-full text-left sticky top-0 z-10 flex items-center justify-between px-4 py-2.5 bg-slate-100/95 backdrop-blur-xs hover:bg-slate-200/90 border-b border-slate-200 cursor-pointer select-none transition focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#00ad1d]"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-slate-400 hover:text-slate-700 shrink-0">
                        {isCollapsed ? (
                          <ChevronRight className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </span>

                      <GroupIcon className="w-4 h-4 text-[#00ad1d] shrink-0" />

                      <span className="font-bold text-sm text-slate-900 tracking-wide truncate">
                        {group.name}
                      </span>

                      <span className="text-[11px] px-2 py-0.2 rounded-full bg-slate-200 text-slate-700 font-bold shrink-0">
                        {group.tasks.length} {group.tasks.length === 1 ? 'task' : 'tasks'}
                      </span>
                    </div>

                    <span className="text-[11px] text-slate-500 font-medium shrink-0 ml-2">
                      {isCollapsed ? 'Click to expand' : 'Click to collapse'}
                    </span>
                  </button>

                  {/* Group Tasks List */}
                  {!isCollapsed && (
                    <div
                      id={`group-tasks-${group.key}`}
                      role="list"
                      aria-label={`${group.name} tasks`}
                      className="bg-white"
                    >
                      {renderTaskListSection(group.tasks, group.key)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Task Detail Drawer */}
      {selectedTask && (
        <div
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-2xs z-50 flex justify-end animate-in fade-in duration-100"
          onClick={handleCloseDrawer}
        >
          <div
            className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col border-l border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-5 border-b border-slate-200 flex items-start justify-between bg-slate-50/70">
              <div className="space-y-1 pr-2 flex-1">
                <div className="flex items-center gap-2">
                  {renderPriorityBadge(selectedTask.priority)}
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    {selectedTask.organisation || 'WIPAHS'} • {selectedTask.department}
                  </span>
                </div>
                <h2 className="text-base font-bold text-slate-900">{selectedTask.title}</h2>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {canUserEditTask(selectedTask) && !isEditingTask && (
                  <button
                    type="button"
                    onClick={() => handleStartEditTask(selectedTask)}
                    className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-teal-600" />
                    <span>Edit Task</span>
                  </button>
                )}
                <button
                  onClick={handleCloseDrawer}
                  className="text-slate-400 hover:text-slate-700 p-1 rounded cursor-pointer"
                  aria-label="Close task details drawer"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Body */}
            {isEditingTask ? (
              <div className="p-5 overflow-y-auto space-y-4 text-xs flex-1 bg-slate-50/50">
                <div className="p-3 bg-teal-50 border border-teal-200 rounded-lg">
                  <p className="font-bold text-teal-900 text-xs">Editing Task Details</p>
                  <p className="text-[11px] text-teal-700 mt-0.5">Due date is compulsory when updating tasks.</p>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Task Title *</label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-1 focus:ring-[#00ad1d] font-semibold text-xs text-slate-900"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Description</label>
                  <textarea
                    rows={3}
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-1 focus:ring-[#00ad1d] text-xs text-slate-800"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Priority</label>
                    <select
                      value={editPriority}
                      onChange={(e) => setEditPriority(e.target.value as Priority)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-1 focus:ring-[#00ad1d] text-xs font-medium"
                    >
                      <option value="Urgent">Urgent</option>
                      <option value="High">High</option>
                      <option value="Medium">Medium</option>
                      <option value="Low">Low</option>
                    </select>
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      Due Date <span className="text-rose-500 font-bold">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={editDueDate}
                      onChange={(e) => setEditDueDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-1 focus:ring-[#00ad1d] text-xs font-medium"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setIsEditingTask(false)}
                    className="px-3.5 py-1.5 bg-white hover:bg-slate-100 text-slate-600 border border-slate-300 rounded text-xs font-medium cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveTaskEdit}
                    className="px-4 py-1.5 bg-[#00ad1d] hover:bg-[#008f18] text-white rounded text-xs font-bold shadow-2xs cursor-pointer"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-5 overflow-y-auto space-y-4 text-xs flex-1">
                {/* Persistent Task Completion Performance Rating Banner / Form */}
                {selectedTask.status === 'Done' && !isPersonalTask(selectedTask, currentUser.id) && (selectedTask.pendingRating || selectedTask.rating) && (
                  <TaskRatingPrompt
                    task={selectedTask}
                    onRatingSubmitted={() => {
                      const updated = tasks.find((t: Task) => t.id === selectedTask.id);
                      if (updated) setSelectedTask(updated);
                    }}
                  />
                )}

                {/* Read-Only Banner if created by someone else and not assigned to currentUser */}
                {!canUserEditTask(selectedTask) && (
                  <div className="p-3 bg-amber-50/90 border border-amber-200 rounded-lg flex items-start gap-2.5 text-amber-900 text-xs font-medium">
                    <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">Read-Only Task View</p>
                      <p className="text-[11px] text-amber-800 mt-0.5">
                        This task was created by <strong>{selectedTask.createdByName || 'another user'}</strong>. You can only edit tasks you created or are assigned to.
                      </p>
                    </div>
                  </div>
                )}

                {/* Reassignment Option Section (for personal, assigned to me, or assigned to my department) */}
                {canUserReassignTask(selectedTask) && (
                  <div className="p-3.5 bg-emerald-50/80 border border-emerald-200 rounded-lg space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-emerald-900 font-bold text-xs">
                        <UserCheck className="w-4 h-4 text-[#00ad1d]" />
                        <span>Reassign Task Option</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setIsReassigning(!isReassigning);
                          setSelectedReassigneeId('');
                        }}
                        className="px-2.5 py-1 bg-white hover:bg-emerald-100 text-[#008f18] border border-emerald-300 rounded text-[11px] font-semibold transition cursor-pointer flex items-center gap-1"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>{isReassigning ? 'Cancel' : 'Reassign Task'}</span>
                      </button>
                    </div>

                    {reassignSuccessMsg && (
                      <div className="text-[11px] bg-emerald-100 text-emerald-900 font-bold p-2 rounded border border-emerald-300 animate-in fade-in">
                        ✓ {reassignSuccessMsg}
                      </div>
                    )}

                    {isReassigning && (
                      <div className="space-y-2 bg-white p-3 rounded-md border border-emerald-200 animate-in fade-in duration-100">
                        <label className="block text-[11px] font-bold text-slate-700">
                          Select a staff member to reassign this task to:
                        </label>
                        <select
                          value={selectedReassigneeId}
                          onChange={(e) => setSelectedReassigneeId(e.target.value)}
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md bg-white text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
                        >
                          <option value="">-- Choose Staff Member --</option>
                          {staff.map(s => (
                            <option key={s.id} value={s.id}>
                              {formatStaffDisplayName(s)} ({formatStaffDisplayOrgDept(s)})
                            </option>
                          ))}
                        </select>

                        {selectedReassigneeId && (
                          <div className="flex items-center justify-end gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => setIsReassigning(false)}
                              className="px-2.5 py-1 text-slate-500 hover:text-slate-800 text-xs font-medium cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={handleConfirmReassign}
                              className="px-3 py-1 bg-[#00ad1d] hover:bg-[#008f18] text-white rounded text-xs font-bold transition shadow-2xs cursor-pointer"
                            >
                              Confirm Reassignment
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <p className="text-[11px] uppercase font-bold text-slate-400 mb-1">Description</p>
                  <p className="text-slate-700 leading-relaxed bg-slate-50 p-2.5 rounded border border-slate-200">
                    {selectedTask.description}
                  </p>
                </div>

                {/* Assignee Banner / List */}
                <div>
                  <p className="text-[11px] uppercase font-bold text-slate-400 mb-1">Assigned To</p>
                  {selectedTask.assignedOrganisations && selectedTask.assignedOrganisations.length > 0 ? (
                    <div className="p-3 bg-purple-50/70 border border-purple-200 rounded-lg space-y-1">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-purple-700" />
                        <span className="font-bold text-slate-900 text-xs">
                          {selectedTask.assignedOrganisations.join(', ')}
                        </span>
                      </div>
                      <p className="text-[11px] text-purple-800 font-medium">
                        Assigned to {selectedTask.assignedOrganisations.length} whole organisation unit(s)
                      </p>
                    </div>
                  ) : selectedTask.assignedDepartments && selectedTask.assignedDepartments.length > 0 ? (
                    <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-lg space-y-1">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-blue-700" />
                        <span className="font-bold text-slate-900 text-xs">
                          {selectedTask.assignedDepartments.join(', ')}
                        </span>
                      </div>
                      <p className="text-[11px] text-blue-800 font-medium">
                        Assigned to {selectedTask.assignedDepartments.length} department(s) • {selectedTask.organisation || 'WIPAHS'}
                      </p>
                    </div>
                  ) : selectedTask.assignedToIds && selectedTask.assignedToIds.length > 1 ? (
                    <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Users className="w-4 h-4 text-[#00ad1d]" />
                          <span className="font-bold text-slate-900 text-xs">
                            {selectedTask.assignedToIds.length} Assigned People
                          </span>
                        </div>
                      </div>
                      <div className="space-y-1.5 max-h-36 overflow-y-auto">
                        {selectedTask.assignedToIds.map(id => {
                          const s = staff.find(staffMember => staffMember.id === id);
                          if (!s) return null;
                          return (
                            <div key={id} className="flex items-center gap-2 bg-white p-1.5 rounded border border-emerald-100 text-xs">
                              <UserAvatar name={s.name} avatar={s.avatar} className="w-6 h-6" />
                              <div>
                                <p className="font-semibold text-slate-800 text-xs">{formatStaffDisplayName(s)}</p>
                                <p className="text-[10px] text-[#008f18]">{formatStaffDisplayOrgDept(s)}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    (() => {
                      const assignedStaff = staff.find(s => s.id === selectedTask.assignedToId);
                      return (
                        <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-lg flex items-center gap-3">
                          <UserAvatar
                            avatar={assignedStaff?.avatar}
                            name={assignedStaff ? formatStaffDisplayName(assignedStaff) : selectedTask.assignedToName}
                            className="w-9 h-9 border border-emerald-300"
                          />
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-bold text-sm text-slate-900 leading-tight">
                                {assignedStaff ? formatStaffDisplayName(assignedStaff) : selectedTask.assignedToName}
                              </p>
                              {selectedTask.assignedToId && !selectedTask.assignedToId.startsWith('dept-') && !selectedTask.assignedToId.startsWith('org-') && (
                                <UserRatingDisplay userId={selectedTask.assignedToId} size="xs" />
                              )}
                            </div>
                            <p className="text-xs text-[#008f18] font-semibold mt-0.5">
                              {assignedStaff
                                ? formatStaffDisplayOrgDept(assignedStaff)
                                : `${selectedTask.organisation || 'WIPAHS'} • ${selectedTask.department}`}
                            </p>
                          </div>
                        </div>
                      );
                    })()
                  )}
                </div>

                {/* Assigned By / Creator Box */}
                <div>
                  <p className="text-[11px] uppercase font-bold text-slate-400 mb-1">Assigned By / Creator</p>
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs shrink-0">
                      <User className="w-4 h-4 text-slate-600" />
                    </div>
                    <div>
                      <p className="font-bold text-xs text-slate-900 leading-tight">
                        {selectedTask.createdByName || 'Staff Member'}
                      </p>
                      <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                        Created {new Date(selectedTask.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Status Selector */}
                <div>
                  <p className="text-[11px] uppercase font-bold text-slate-400 mb-1">Status</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(['To Do', 'In Progress', 'In Review', 'Done', 'Cancelled'] as TaskStatus[]).map((st) => {
                      const isCurrent = selectedTask.status === st;
                      const canEdit = canUserEditTask(selectedTask);
                      return (
                        <button
                          key={st}
                          disabled={!canEdit || savingTaskIds.has(selectedTask.id)}
                          onClick={async () => {
                            if (!canEdit || savingTaskIds.has(selectedTask.id)) return;
                            setSavingTaskIds((prev) => new Set(prev).add(selectedTask.id));
                            try {
                              await actions.updateTaskStatus(selectedTask.id, st);
                              const updated = tasks.find((t: Task) => t.id === selectedTask.id);
                              if (updated) setSelectedTask(updated);
                            } catch (err: any) {
                              setBannerMessage(`Could not update task: ${err?.message || 'Permission denied or network error'}`);
                            } finally {
                              setSavingTaskIds((prev) => {
                                const next = new Set(prev);
                                next.delete(selectedTask.id);
                                return next;
                              });
                            }
                          }}
                          className={`px-2.5 py-1 rounded border text-xs font-medium transition ${
                            !canEdit ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'
                          } ${
                            isCurrent
                              ? (st === 'Cancelled' ? 'bg-slate-700 text-white border-slate-700 font-bold' : 'bg-[#00ad1d] text-white border-[#00ad1d]')
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {st}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Main Task General Update */}
                <div>
                  {!isEditingMainTaskUpdate ? (
                    <div className="p-4 bg-gradient-to-r from-emerald-50/80 via-white to-emerald-50/60 rounded-xl border-2 border-emerald-200/90 shadow-xs space-y-3">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2.5">
                          <span className="p-2 rounded-lg bg-[#00ad1d] text-white shadow-2xs">
                            <MessageSquare className="w-4 h-4" />
                          </span>
                          <div>
                            <span className="text-sm font-bold text-slate-900 block leading-tight">
                              General Task Update
                            </span>
                            <span className="text-xs text-slate-600">
                              {selectedTask.update ? 'Latest progress note on this task overall' : 'No general update added yet — add notes or progress'}
                            </span>
                          </div>
                        </div>

                        {canUserAddUpdate(selectedTask) && (
                          <button
                            type="button"
                            onClick={() => {
                              setIsEditingMainTaskUpdate(true);
                              setMainTaskUpdateText(selectedTask.update?.text || '');
                            }}
                            className={`px-3 py-1.5 text-xs font-semibold rounded-md shadow-2xs hover:shadow-xs transition-all flex items-center gap-1 cursor-pointer ${
                              selectedTask.update
                                ? 'bg-white hover:bg-slate-50 text-slate-800 border border-emerald-400'
                                : 'bg-[#00ad1d] hover:bg-[#008f18] text-white'
                            }`}
                          >
                            {selectedTask.update ? (
                              <>
                                <Edit3 className="w-3 h-3 text-emerald-700" />
                                <span>Edit Update</span>
                              </>
                            ) : (
                              <>
                                <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                                <span>Add Update</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>

                      {selectedTask.update && (
                        <div className="p-3.5 bg-white rounded-lg border-l-4 border-l-[#00ad1d] border-y border-r border-slate-200/90 shadow-2xs space-y-2">
                          <div className="flex items-center justify-between text-xs text-slate-500 flex-wrap gap-1">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-emerald-100 text-emerald-900 font-bold text-[11px] uppercase tracking-wide">
                              <MessageSquare className="w-3 h-3 text-[#008f18]" />
                              Latest Task Update
                            </span>
                            <span className="font-medium text-slate-600 text-xs">
                              By <strong className="text-slate-900">{selectedTask.update.authorName}</strong> • {formatUpdateTimestamp(selectedTask.update.updatedAt)}
                            </span>
                          </div>
                          <p className="text-sm font-medium text-slate-900 leading-relaxed bg-slate-50/70 p-2.5 rounded-md border border-slate-100">
                            "{selectedTask.update.text}"
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-4 bg-white rounded-xl border-2 border-emerald-400 space-y-3 shadow-md">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-sm text-slate-900 flex items-center gap-2">
                          <span className="p-1.5 rounded-md bg-[#00ad1d] text-white">
                            <MessageSquare className="w-4 h-4" />
                          </span>
                          <span>{selectedTask.update ? 'Edit Task Update' : 'New Task Update'}</span>
                        </span>
                        <span className="text-xs text-slate-400">Press Enter to save, Shift+Enter for newline</span>
                      </div>
                      <div className="space-y-3">
                        <textarea
                          rows={3}
                          autoFocus
                          value={mainTaskUpdateText}
                          onChange={(e) => setMainTaskUpdateText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleSaveMainTaskUpdate(selectedTask.id, mainTaskUpdateText);
                            } else if (e.key === 'Escape') {
                              setIsEditingMainTaskUpdate(false);
                            }
                          }}
                          placeholder="Type a general update or progress note on this task..."
                          className="w-full px-3.5 py-2.5 text-sm bg-white border-2 border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00ad1d] focus:border-[#00ad1d] text-slate-900 shadow-inner"
                        />
                        <div className="flex items-center justify-end gap-2.5">
                          <button
                            type="button"
                            onClick={() => setIsEditingMainTaskUpdate(false)}
                            className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs sm:text-sm font-semibold cursor-pointer transition"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSaveMainTaskUpdate(selectedTask.id, mainTaskUpdateText)}
                            className="px-5 py-2 bg-[#00ad1d] hover:bg-[#008f18] text-white text-xs sm:text-sm font-bold rounded-lg cursor-pointer transition shadow-sm hover:shadow flex items-center gap-1.5"
                          >
                            Save Update
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Subtasks Section */}
                <div>
                  <p className="text-[11px] uppercase font-bold text-slate-400 mb-2">
                    Subtask Checklist ({selectedTask.subtasks.filter(s => s.completed).length}/{selectedTask.subtasks.length})
                  </p>

                  <div className="space-y-2 mb-3">
                    {selectedTask.subtasks.map((sub) => {
                      const canEdit = canUserAddUpdate(selectedTask);
                      const isEditingThisSub = editingSubtaskId === sub.id;

                      return (
                        <div
                          key={sub.id}
                          className="p-3 rounded-lg bg-slate-50 hover:bg-slate-100/60 border border-slate-200 transition space-y-2 shadow-2xs"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5 flex-1 min-w-0">
                              <input
                                type="checkbox"
                                checked={sub.completed}
                                disabled={!canEdit}
                                onChange={() => canEdit && handleToggleSubtask(selectedTask.id, sub.id)}
                                className="w-4 h-4 text-[#00ad1d] rounded border-slate-300 focus:ring-[#00ad1d] cursor-pointer shrink-0"
                              />
                              <span
                                onClick={() => canEdit && handleToggleSubtask(selectedTask.id, sub.id)}
                                className={`text-xs select-none leading-tight ${canEdit ? 'cursor-pointer' : 'cursor-default'} ${
                                  sub.completed ? 'line-through text-slate-400' : 'text-slate-900 font-semibold'
                                }`}
                              >
                                {sub.title}
                              </span>
                            </div>

                            {/* Obvious, visible Add/Edit Update button */}
                            {canEdit && !isEditingThisSub && (
                              !sub.update ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingSubtaskId(sub.id);
                                    setSubtaskUpdateText('');
                                  }}
                                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-[11px] font-semibold shadow-2xs hover:shadow-xs transition-all inline-flex items-center gap-1 cursor-pointer shrink-0"
                                  title="Add an update to this subtask"
                                >
                                  <Plus className="w-3 h-3 stroke-[2.5]" />
                                  <span>Add Update</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingSubtaskId(sub.id);
                                    setSubtaskUpdateText(sub.update?.text || '');
                                  }}
                                  className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 hover:border-slate-400 rounded-md text-[11px] font-semibold shadow-2xs hover:shadow-xs transition-all inline-flex items-center gap-1 cursor-pointer shrink-0"
                                  title="Edit this subtask's update"
                                >
                                  <Edit3 className="w-3 h-3 text-slate-500" />
                                  <span>Edit Update</span>
                                </button>
                              )
                            )}
                          </div>

                          {/* Inline Input when editing this subtask's update */}
                          {isEditingThisSub && (
                            <div className="ml-6 pt-1 space-y-1.5 bg-emerald-50/40 p-2.5 rounded-md border border-emerald-300" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-between text-xs font-medium text-slate-700">
                                <span className="flex items-center gap-1 text-emerald-800 text-[11px] font-semibold">
                                  <MessageSquare className="w-3 h-3 text-[#00ad1d]" />
                                  {sub.update ? 'Edit Subtask Update' : 'New Subtask Update'}
                                </span>
                                <span className="text-[10px] text-slate-400">Press Enter to save</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  autoFocus
                                  value={subtaskUpdateText}
                                  onChange={(e) => setSubtaskUpdateText(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      handleSaveSubtaskUpdate(selectedTask.id, sub.id, subtaskUpdateText);
                                    } else if (e.key === 'Escape') {
                                      setEditingSubtaskId(null);
                                    }
                                  }}
                                  placeholder="Type an update on this subtask..."
                                  className="flex-1 px-3 py-1.5 text-xs bg-white border border-emerald-300 rounded-md focus:outline-none focus:ring-1 focus:ring-[#00ad1d] text-slate-900 shadow-2xs"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSaveSubtaskUpdate(selectedTask.id, sub.id, subtaskUpdateText)}
                                  className="px-3 py-1.5 bg-[#00ad1d] hover:bg-[#008f18] text-white text-xs font-semibold rounded-md cursor-pointer transition shadow-2xs shrink-0 flex items-center gap-1"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingSubtaskId(null)}
                                  className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-md border border-slate-300 cursor-pointer shrink-0"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Display saved update */}
                          {sub.update && !isEditingThisSub && (
                            <div className="ml-6 mt-1 p-2 bg-white rounded-md border-l-3 border-l-[#00ad1d] border border-slate-200/90 shadow-2xs space-y-1">
                              <div className="flex items-center justify-between gap-2 flex-wrap text-[11px]">
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-100/90 text-emerald-900 font-bold text-[10px]">
                                  <MessageSquare className="w-2.5 h-2.5 text-[#008f18]" />
                                  Subtask Update
                                </span>
                                <span className="text-[10px] text-slate-500 font-medium">
                                  By <strong className="text-slate-700">{sub.update.authorName}</strong> • {formatUpdateTimestamp(sub.update.updatedAt)}
                                </span>
                              </div>
                              <p className="text-xs text-slate-800 font-medium leading-relaxed bg-slate-50/60 p-1.5 rounded border border-slate-100">
                                "{sub.update.text}"
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Add Subtask Input (only if authorized to edit) */}
                  {canUserEditTask(selectedTask) && (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newSubtaskText}
                        onChange={(e) => setNewSubtaskText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddSubtask(selectedTask.id);
                          }
                        }}
                        placeholder="Add a new checklist item..."
                        className="flex-1 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
                      />
                      <button
                        onClick={() => handleAddSubtask(selectedTask.id)}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded text-xs font-medium cursor-pointer"
                      >
                        Add
                      </button>
                    </div>
                  )}
                </div>

                {/* Attached Documents & Files Section */}
                <div className="pt-3 border-t border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] uppercase font-bold text-slate-500 flex items-center gap-1.5">
                      <Paperclip className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Attached Documents & Files ({selectedTask.attachments?.length || 0})</span>
                    </p>
                    {canUserEditTask(selectedTask) && (
                      <label className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 hover:bg-emerald-100 text-[#008f18] rounded border border-emerald-200 text-[11px] font-semibold cursor-pointer transition">
                        <Plus className="w-3 h-3" />
                        <span>Attach Document</span>
                        <input
                          type="file"
                          multiple
                          onChange={(e) => handleDrawerAttachFile(e, selectedTask)}
                          className="hidden"
                          accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.webp,.svg,.gif"
                        />
                      </label>
                    )}
                  </div>

                  {selectedTask.attachments && selectedTask.attachments.length > 0 ? (
                    <div className="space-y-2">
                      {selectedTask.attachments.map(att => {
                        const tabUrl = getAttachmentTabUrl(att);
                        const ext = (att.name || '').split('.').pop()?.toLowerCase() || '';
                        const isPdf = att.type === 'pdf' || ext === 'pdf';
                        const isSheet = att.type === 'xlsx' || ['xls', 'xlsx', 'csv'].includes(ext);
                        const isImg = att.type === 'image' || ['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif'].includes(ext);

                        return (
                          <div
                            key={att.id}
                            className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/80 hover:bg-emerald-50/40 hover:border-emerald-200 transition flex items-center justify-between gap-3 group"
                          >
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${
                                isPdf ? 'bg-rose-100 text-rose-700' :
                                isSheet ? 'bg-emerald-100 text-emerald-700' :
                                isImg ? 'bg-purple-100 text-purple-700' :
                                'bg-blue-100 text-blue-700'
                              }`}>
                                {isPdf ? <FileText className="w-3.5 h-3.5" /> :
                                 isSheet ? <FileSpreadsheet className="w-3.5 h-3.5" /> :
                                 isImg ? <Image className="w-3.5 h-3.5" /> :
                                 <File className="w-3.5 h-3.5" />}
                              </div>

                              <div className="min-w-0 flex-1">
                                <a
                                  href={tabUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-bold text-slate-800 hover:text-emerald-700 text-xs truncate block leading-snug"
                                  title={`Open ${att.name} in new browser tab`}
                                >
                                  {att.name}
                                </a>
                                <p className="text-[10px] text-slate-400 mt-0.5">
                                  {att.size || 'Attachment'} • {att.type.toUpperCase()}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <a
                                href={tabUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-semibold transition shadow-2xs"
                                title="Open in new browser tab"
                              >
                                <ExternalLink className="w-3 h-3" />
                                <span>Open</span>
                              </a>

                              <button
                                type="button"
                                onClick={() => downloadAttachment(att)}
                                className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded transition cursor-pointer"
                                title="Download file"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </button>

                              {canUserEditTask(selectedTask) && (
                                <button
                                  type="button"
                                  onClick={() => handleDrawerRemoveFile(selectedTask, att.id)}
                                  className="p-1 text-slate-400 hover:text-rose-600 rounded transition cursor-pointer"
                                  title="Remove attachment from task"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-slate-400 italic text-xs">No documents attached yet to this task.</p>
                  )}
                </div>

                {/* Integrations (Teams & SharePoint) */}
                <div className="pt-2 border-t border-slate-200 space-y-2">
                  <p className="text-[11px] uppercase font-bold text-slate-400">Microsoft 365 Links</p>
                  {selectedTask.teamsMeetingLink ? (
                    <div className="flex items-center justify-between p-2 rounded bg-purple-50/80 border border-purple-200">
                      <div className="flex items-center gap-2 text-purple-900 font-medium">
                        <Video className="w-3.5 h-3.5 text-purple-700" />
                        <span>Teams Virtual Meeting Attached</span>
                      </div>
                      <a
                        href={selectedTask.teamsMeetingLink}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2 py-1 bg-purple-600 text-white rounded text-[11px] font-medium hover:bg-purple-700 transition"
                      >
                        Join Meeting
                      </a>
                    </div>
                  ) : (
                    <p className="text-slate-400 italic">No Microsoft Teams meeting linked.</p>
                  )}

                  {selectedTask.sharePointDocUrl ? (
                    <div className="flex items-center justify-between p-2 rounded bg-blue-50/80 border border-blue-200">
                      <div className="flex items-center gap-2 text-blue-900 font-medium">
                        <FileText className="w-3.5 h-3.5 text-blue-700" />
                        <span>SharePoint File Workspace</span>
                      </div>
                      <a
                        href={selectedTask.sharePointDocUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2 py-1 bg-blue-600 text-white rounded text-[11px] font-medium hover:bg-blue-700 transition"
                      >
                        Open File
                      </a>
                    </div>
                  ) : (
                    <p className="text-slate-400 italic">No SharePoint document attached.</p>
                  )}
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <span className="text-xs text-slate-500 font-semibold">
                Due: <span className="text-slate-800">{selectedTask.dueDate}</span>
              </span>
              <div className="flex gap-2">
                {canUserEditTask(selectedTask) && (
                  <button
                    disabled={isDeletingTask}
                    onClick={async () => {
                      if (selectedTask.pendingRating && !isPersonalTask(selectedTask, currentUser.id)) {
                        setBannerMessage('This completed task requires a performance rating before it can be removed.');
                        return;
                      }
                      setConfirmModalState({
                        isOpen: true,
                        title: 'Delete Task',
                        message: 'Are you sure you want to delete this task? This action cannot be undone.',
                        isDestructive: true,
                        onConfirm: async () => {
                          setConfirmModalState(null);
                          setIsDeletingTask(true);
                          try {
                            await actions.deleteTask(selectedTask.id);
                            handleCloseDrawer();
                          } catch (err: any) {
                            setBannerMessage(`Failed to delete task: ${err?.message || 'Permission denied or network error'}`);
                          } finally {
                            setIsDeletingTask(false);
                          }
                        }
                      });
                    }}
                    className="px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded text-xs font-medium transition cursor-pointer disabled:opacity-50"
                  >
                    {isDeletingTask ? 'Deleting...' : 'Delete Task'}
                  </button>
                )}
                <button
                  onClick={handleCloseDrawer}
                  className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded text-xs font-medium transition cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* In-app banner alert message */}
      {bannerMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 border border-slate-700 max-w-md animate-in slide-in-from-bottom-3 duration-200">
          <span className="text-sm font-medium flex-1">{bannerMessage}</span>
          <button
            onClick={() => setBannerMessage(null)}
            className="text-slate-400 hover:text-white px-1.5 py-0.5 rounded text-xs font-bold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Stateful Confirm Dialog */}
      {confirmModalState && (
        <ConfirmDialog
          isOpen={confirmModalState.isOpen}
          title={confirmModalState.title}
          message={confirmModalState.message}
          isDestructive={confirmModalState.isDestructive}
          onConfirm={confirmModalState.onConfirm}
          onCancel={() => setConfirmModalState(null)}
        />
      )}
    </div>
  );
};
