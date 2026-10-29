import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  CheckSquare,
  Video,
  BellRing,
  Upload,
  Plus,
  Trash2,
  Calendar,
  Clock,
  ShieldCheck,
  Send,
  FolderGit2,
  UserCheck,
  Building2,
  Users,
  AlertTriangle,
  Paperclip,
  FileText,
  FileSpreadsheet,
  File,
  Image,
  Loader2,
  Star,
  AlertCircle
} from 'lucide-react';
import { Department, Priority, TaskStatus, StaffUser, Meeting, MessageAttachment } from '../types';
import { usePortalStore, normalizeDepartmentName } from '../services/store';
import { parseUploadedFile } from '../utils/fileParser';
import { isPersonalTask, isTaskAssignedByMe } from '../utils/taskUtils';
import { StaffPickerTree, SingleSelection } from './StaffPickerTree';
import {
  formatStaffDisplayName,
  formatStaffDisplayOrgDept,
  FIXED_ORGANISATION_ORDER,
  sortOrganisations
} from '../utils/staffHierarchy';
import { UserAvatar } from './UserAvatar';
import { detectMeetingConflicts, convertTo24HourTime, convertTo12HourTime } from '../utils/meetingConflict';
import { canUserViewDocument } from '../utils/documentAccess';

interface QuickActionModalProps {
  isOpen: boolean;
  initialTab?: 'task' | 'meeting' | 'notice' | 'sharepoint';
  initialDate?: string;
  defaultAssignee?: StaffUser | null;
  onSelectTask?: (id: string) => void;
  onClose: () => void;
}

export const QuickActionModal: React.FC<QuickActionModalProps> = ({
  isOpen,
  initialTab = 'task',
  initialDate,
  defaultAssignee = null,
  onSelectTask,
  onClose,
}) => {
  const { staff, currentUser, actions, departments, folderList, meetings, tasks, sharePointDocs } = usePortalStore(['staff', 'currentUser', 'departments', 'folderList', 'meetings', 'tasks', 'sharePointDocs']);

  const [activeTab, setActiveTab] = useState<'task' | 'meeting' | 'notice' | 'sharepoint'>(initialTab);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Completed tasks created by the current user waiting for performance rating (excludes personal tasks)
  const pendingRatingTasks = useMemo(() => {
    return tasks.filter(t => {
      if (!t.pendingRating || t.status !== 'Done' || t.rating) return false;
      return isTaskAssignedByMe(t, currentUser.id);
    });
  }, [tasks, currentUser]);

  React.useEffect(() => {
    if (isOpen) {
      setIsSubmitting(false);
      setActiveTab(initialTab);
      setTaskTitle('');
      setTaskDescription('');
      setTaskPriority('Medium');
      setTaskDueDate(initialDate || new Date().toISOString().split('T')[0]);
      setTaskSubtasks([]);
      setNewSubtaskInput('');
      setTaskAttachments([]);
      setTaskSelectedDepartments([]);
      setTaskSelectedOrganisations(['WIPAHS']);
      setTaskFormError(null);

      // Reset meeting fields so old meeting details never carry over
      setMeetingTitle('');
      setMeetingDepartment(currentUser.department || 'Executive & Admin');
      setMeetingDate(initialDate || new Date().toISOString().split('T')[0]);
      setMeetingStartTime('10:00');
      setMeetingEndTime('11:00');
      setMeetingDescription('');
      setMeetingAgenda(['Review operations scorecard', 'SharePoint document sign-offs', 'Any other business']);
      setNewAgendaInput('');
      setMeetingAttendees([]);
      setMeetingRecurrence('None');
      setMeetingChairId(currentUser.id);
      setMeetingAttachments([]);

      setNoticeTitle('');
      setNoticeContent('');
      setNoticePriority('Normal');
      setNoticePinned(false);
      setNoticeAudience('all');
      setNoticeTargetOrgs(['WIPAHS']);
      setNoticeTargetDepts([]);
      setNoticeTargetIds([]);
      setNoticeAttachments([]);
      if (defaultAssignee) {
        setTaskSelectedPeopleIds([defaultAssignee.id]);
        setTaskAssignTarget('specific_people');
      } else {
        setTaskAssignTarget('personal');
        setTaskSelectedPeopleIds([currentUser.id]);
      }
    }
  }, [isOpen, initialTab, initialDate, defaultAssignee, currentUser.id, currentUser.department]);

  // Task Form State
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskPriority, setTaskPriority] = useState<Priority>('High');
  const [taskAssignTarget, setTaskAssignTarget] = useState<'personal' | 'department' | 'organization' | 'specific_people'>(() => {
    if (defaultAssignee && defaultAssignee.id !== currentUser.id) return 'specific_people';
    return 'personal';
  });
  const [taskSelectedDepartments, setTaskSelectedDepartments] = useState<string[]>([]);
  const [taskSelectedOrganisations, setTaskSelectedOrganisations] = useState<string[]>(['WIPAHS']);
  const [taskSelectedPeopleIds, setTaskSelectedPeopleIds] = useState<string[]>(() => {
    return defaultAssignee ? [defaultAssignee.id] : [currentUser.id];
  });
  const [taskDueDate, setTaskDueDate] = useState(new Date().toISOString().split('T')[0]);
  const [taskSubtasks, setTaskSubtasks] = useState<string[]>([]);
  const [newSubtaskInput, setNewSubtaskInput] = useState('');
  const [taskAttachments, setTaskAttachments] = useState<MessageAttachment[]>([]);
  const [isUploadingTaskFile, setIsUploadingTaskFile] = useState(false);
  const [taskFormError, setTaskFormError] = useState<string | null>(null);

  const handleTaskFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setIsUploadingTaskFile(true);
    try {
      const files = Array.from(e.target.files);
      const parsedList: MessageAttachment[] = [];
      for (const file of files) {
        const att = await parseUploadedFile(file);
        parsedList.push(att);
      }
      setTaskAttachments(prev => [...prev, ...parsedList]);
    } catch (err) {
      console.error('Error attaching file to task:', err);
    } finally {
      setIsUploadingTaskFile(false);
      e.target.value = '';
    }
  };

  const handleRemoveTaskAttachment = (id: string) => {
    setTaskAttachments(prev => prev.filter(a => a.id !== id));
  };

  // Sync default assignee if changed
  React.useEffect(() => {
    if (defaultAssignee) {
      setTaskSelectedPeopleIds([defaultAssignee.id]);
      setTaskAssignTarget('specific_people');
    }
  }, [defaultAssignee]);

  // Meeting Form State
  const [meetingTitle, setMeetingTitle] = useState('');
  const [meetingDepartment, setMeetingDepartment] = useState<Department>('Executive & Admin');
  const [meetingDate, setMeetingDate] = useState('2026-09-23');
  const [meetingStartTime, setMeetingStartTime] = useState('10:00');
  const [meetingEndTime, setMeetingEndTime] = useState('11:00');
  const [meetingDescription, setMeetingDescription] = useState('');
  const [meetingAgenda, setMeetingAgenda] = useState<string[]>(['Review operations scorecard', 'SharePoint document sign-offs', 'Any other business']);
  const [newAgendaInput, setNewAgendaInput] = useState('');
  const [meetingAttendees, setMeetingAttendees] = useState<string[]>([]);
  const [meetingRecurrence, setMeetingRecurrence] = useState<NonNullable<Meeting['recurrence']>>('None');
  const [meetingChairId, setMeetingChairId] = useState<string>(currentUser.id);
  const [meetingAttachments, setMeetingAttachments] = useState<MessageAttachment[]>([]);
  const [isUploadingMeetingFile, setIsUploadingMeetingFile] = useState(false);
  const [showMeetingSharePointPicker, setShowMeetingSharePointPicker] = useState(false);

  const handleMeetingFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setIsUploadingMeetingFile(true);
    try {
      const files = Array.from(e.target.files);
      const parsedList: MessageAttachment[] = [];
      for (const file of files) {
        const att = await parseUploadedFile(file);
        parsedList.push(att);
      }
      setMeetingAttachments(prev => [...prev, ...parsedList]);
    } catch (err) {
      console.error('Error attaching file to meeting:', err);
    } finally {
      setIsUploadingMeetingFile(false);
      e.target.value = '';
    }
  };

  const handleAttachSharePointDoc = (docId: string) => {
    const doc = sharePointDocs.find(d => d.id === docId);
    if (!doc) return;
    if (meetingAttachments.some(a => a.id === `sp-${doc.id}`)) {
      setShowMeetingSharePointPicker(false);
      return;
    }
    const att: MessageAttachment = {
      id: `sp-${doc.id}`,
      name: doc.name,
      size: doc.size,
      type: doc.fileType === 'pdf' ? 'pdf' : doc.fileType === 'xlsx' ? 'xlsx' : 'docx',
      url: doc.sharePointWebUrl,
    };
    setMeetingAttachments(prev => [...prev, att]);
    setShowMeetingSharePointPicker(false);
  };

  const handleMeetingDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
    setIsUploadingMeetingFile(true);
    try {
      const files = Array.from(e.dataTransfer.files);
      const parsedList: MessageAttachment[] = [];
      for (const file of files) {
        const att = await parseUploadedFile(file);
        parsedList.push(att);
      }
      setMeetingAttachments(prev => [...prev, ...parsedList]);
    } catch (err) {
      console.error('Error dropping file to meeting:', err);
    } finally {
      setIsUploadingMeetingFile(false);
    }
  };

  // Dynamic scheduling conflict detection for selected attendees
  const meetingConflicts = useMemo(() => {
    return detectMeetingConflicts(
      meetingDate,
      meetingStartTime,
      meetingEndTime,
      meetingAttendees,
      meetings,
      staff
    );
  }, [meetingDate, meetingStartTime, meetingEndTime, meetingAttendees, meetings, staff]);

  const meetingParticipants = useMemo(() => {
    const list: StaffUser[] = [];
    list.push(currentUser);
    meetingAttendees.forEach(attId => {
      if (attId !== currentUser.id) {
        const s = staff.find(staffMember => staffMember.id === attId);
        if (s) list.push(s);
      }
    });
    return list;
  }, [staff, meetingAttendees, currentUser]);

  // Notice Form State
  const [noticeTitle, setNoticeTitle] = useState('');
  const [noticeContent, setNoticeContent] = useState('');
  const [noticePriority, setNoticePriority] = useState<'Normal' | 'Urgent'>('Normal');
  const [noticePinned, setNoticePinned] = useState(false);
  const [noticeAudience, setNoticeAudience] = useState<'all' | 'organisation' | 'department' | 'org_and_dept' | 'selected_people'>('all');
  const [noticeTargetOrgs, setNoticeTargetOrgs] = useState<string[]>(['WIPAHS']);
  const [noticeTargetDepts, setNoticeTargetDepts] = useState<string[]>([]);
  const [noticeTargetIds, setNoticeTargetIds] = useState<string[]>([]);
  const [noticeAttachments, setNoticeAttachments] = useState<MessageAttachment[]>([]);
  const [isUploadingNoticeFile, setIsUploadingNoticeFile] = useState(false);

  const handleNoticeFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setIsUploadingNoticeFile(true);
    try {
      const files = Array.from(e.target.files);
      const parsedList: MessageAttachment[] = [];
      for (const file of files) {
        const att = await parseUploadedFile(file);
        parsedList.push(att);
      }
      setNoticeAttachments(prev => [...prev, ...parsedList]);
    } catch (err) {
      console.error('Error attaching file to circular:', err);
    } finally {
      setIsUploadingNoticeFile(false);
      e.target.value = '';
    }
  };

  const handleRemoveNoticeAttachment = (id: string) => {
    setNoticeAttachments(prev => prev.filter(a => a.id !== id));
  };

  const availableOrganisations = useMemo(() => {
    const raw = Array.from(new Set(staff.map(s => s.organisation || 'WIPAHS')));
    return sortOrganisations(raw);
  }, [staff]);

  const STANDARD_CORE_DEPTS = useMemo(() => ['Top management', 'IT', 'Finance', 'Marketing', 'Logistics and Operations', 'Tabligh'], []);

  const availableDeptsForSelectedOrgs = useMemo(() => {
    const relevantStaff = noticeTargetOrgs.length > 0
      ? staff.filter(s => noticeTargetOrgs.includes(s.organisation || 'WIPAHS'))
      : staff;
    const staffDepts = relevantStaff.map(s => normalizeDepartmentName(s.department || 'General'));
    const dbDepts = (departments || []).map(d => normalizeDepartmentName(d.name));
    return Array.from(new Set([...STANDARD_CORE_DEPTS, ...dbDepts, ...staffDepts])).filter(Boolean).sort();
  }, [staff, noticeTargetOrgs, departments, STANDARD_CORE_DEPTS]);

  const allDepartmentsGrouped = useMemo(() => {
    const rawOrgs = Array.from(new Set([
      'WIPAHS', 'HO', 'HOP', 'WEC', 'MEDEWELL',
      ...staff.map(s => s.organisation || 'WIPAHS'),
      currentUser.organisation || 'WIPAHS'
    ]));
    const orgs = sortOrganisations(rawOrgs);
    const dbDepts = (departments || []).map(d => normalizeDepartmentName(d.name));

    return orgs.map(org => {
      const staffDepts = staff
        .filter(s => (s.organisation || 'WIPAHS') === org)
        .map(s => normalizeDepartmentName(s.department || 'General'));
      const combined = Array.from(new Set([...STANDARD_CORE_DEPTS, ...dbDepts, ...staffDepts])).filter(Boolean).sort();
      return { org, depts: combined };
    });
  }, [staff, currentUser, departments, STANDARD_CORE_DEPTS]);

  // SharePoint Upload State
  const [spFileName, setSpFileName] = useState('');
  const [spFolder, setSpFolder] = useState<'Operations' | 'Policies & Forms' | 'Finance' | 'Board Minutes' | 'Projects' | 'None'>('Operations');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [spFileType, setSpFileType] = useState<'docx' | 'xlsx' | 'pptx' | 'pdf'>('docx');
  const [spSummary, setSpSummary] = useState('');
  const [spVisibility, setSpVisibility] = useState<'Everyone' | 'Department' | 'Specific People'>('Specific People');
  const [spTargetDepartments, setSpTargetDepartments] = useState<Department[]>([]);
  const [spAllowedUserIds, setSpAllowedUserIds] = useState<string[]>(currentUser?.id ? [currentUser.id] : []);
  const [spEditableUserIds, setSpEditableUserIds] = useState<string[]>(currentUser?.id ? [currentUser.id] : []);
  const [spUploadError, setSpUploadError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSpFileName('');
      setSpFolder('Operations');
      setIsCreatingFolder(false);
      setNewFolderName('');
      setSelectedFile(null);
      setSpFileType('docx');
      setSpSummary('');
      setSpVisibility('Specific People');
      setSpTargetDepartments([]);
      setSpAllowedUserIds(currentUser?.id ? [currentUser.id] : []);
      setSpEditableUserIds(currentUser?.id ? [currentUser.id] : []);
      setSpUploadError(null);
    }
  }, [isOpen, currentUser]);

  // Update allowed users when departments change
  const updateAllowedUsersForDepartments = (departments: Department[]) => {
    const staffInDepts = staff.filter(s => departments.includes(s.department as any));
    const newAllowedUserIds = Array.from(new Set([...spAllowedUserIds, ...staffInDepts.map(s => s.id)]));
    setSpAllowedUserIds(newAllowedUserIds);
  };

  if (!isOpen) return null;

  // Handlers
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    // Validation: Task Title and Due Date are compulsory
    if (!taskTitle.trim()) return;
    if (!taskDueDate || !taskDueDate.trim()) {
      setTaskFormError('Due date is compulsory when creating a task.');
      return;
    }
    if (taskAssignTarget === 'specific_people' && taskSelectedPeopleIds.length === 0) {
      setTaskFormError('Please select at least one staff member to assign this task to.');
      return;
    }
    setTaskFormError(null);

    setIsSubmitting(true);
    try {
      let assignedId = currentUser.id;
      let assignedName = currentUser.name;
      let assignedOrg = currentUser.organisation || 'WIPAHS';
      let assignedDept = currentUser.department || 'Top management';
      let assignedToIds: string[] | undefined = undefined;
      let assignedToNames: string[] | undefined = undefined;
      let assignedDepartments: string[] | undefined = undefined;
      let assignedOrganisations: string[] | undefined = undefined;
      let taskTypeFinal: 'personal' | 'departmental' = 'personal';

      if (taskAssignTarget === 'personal') {
        assignedId = currentUser.id;
        assignedName = currentUser.name;
        assignedOrg = currentUser.organisation || 'WIPAHS';
        assignedDept = currentUser.department || 'Top management';
        assignedToIds = [currentUser.id];
        assignedToNames = [currentUser.name];
        taskTypeFinal = 'personal';
      } else if (taskAssignTarget === 'department') {
        const selectedDepts = taskSelectedDepartments.length > 0 
          ? taskSelectedDepartments 
          : [currentUser.department || 'Top management'];
        
        assignedDepartments = selectedDepts;
        assignedId = `dept-${selectedDepts.join('-')}`;
        assignedName = selectedDepts.length === 1 
          ? `${selectedDepts[0]} (Department)` 
          : `${selectedDepts.length} Departments: ${selectedDepts.join(', ')}`;
        assignedDept = selectedDepts[0];
        assignedOrg = currentUser.organisation || 'WIPAHS';
        taskTypeFinal = 'departmental';
      } else if (taskAssignTarget === 'organization') {
        const selectedOrgs = taskSelectedOrganisations.length > 0
          ? taskSelectedOrganisations
          : ['WIPAHS'];
        
        assignedOrganisations = selectedOrgs;
        assignedId = `org-${selectedOrgs.join('-')}`;
        assignedName = selectedOrgs.length === 1
          ? `${selectedOrgs[0]} (Whole Org)`
          : `${selectedOrgs.length} Organisations: ${selectedOrgs.join(', ')}`;
        assignedOrg = selectedOrgs[0];
        assignedDept = 'All Departments';
        taskTypeFinal = 'departmental';
      } else if (taskAssignTarget === 'specific_people') {
        const selectedPeople = staff.filter(s => taskSelectedPeopleIds.includes(s.id));
        if (selectedPeople.length === 0) {
          assignedId = currentUser.id;
          assignedName = currentUser.name;
          assignedOrg = currentUser.organisation || 'WIPAHS';
          assignedDept = currentUser.department || 'Top management';
          assignedToIds = [currentUser.id];
          assignedToNames = [currentUser.name];
          taskTypeFinal = 'personal';
        } else {
          assignedToIds = selectedPeople.map(s => s.id);
          assignedToNames = selectedPeople.map(s => s.name);
          assignedId = selectedPeople[0].id;
          assignedName = selectedPeople.length === 1 
            ? selectedPeople[0].name 
            : `${selectedPeople.length} Assignees: ${selectedPeople.map(s => s.name).join(', ')}`;
          assignedOrg = selectedPeople[0].organisation || 'WIPAHS';
          assignedDept = selectedPeople[0].department || 'General';
          taskTypeFinal = selectedPeople.length === 1 && selectedPeople[0].id === currentUser.id ? 'personal' : 'departmental';
        }
      }

      await actions.addTask({
        title: taskTitle.trim(),
        description: taskDescription.trim() || 'No detailed description provided.',
        organisation: assignedOrg,
        department: assignedDept,
        status: 'To Do',
        priority: taskPriority,
        assignedToId: assignedId,
        assignedToName: assignedName,
        assignedToIds,
        assignedToNames,
        assignedDepartments,
        assignedOrganisations,
        assignmentType: taskAssignTarget,
        dueDate: taskDueDate,
        subtasks: taskSubtasks.map((st, i) => ({ id: `st-${Date.now()}-${i}`, title: st, completed: false })),
        tags: ['Portal', taskTypeFinal, assignedOrg],
        type: taskTypeFinal,
        attachments: taskAttachments,
        createdById: currentUser.id,
        createdByName: currentUser.name,
      });

      setTaskTitle('');
      setTaskDescription('');
      setTaskDueDate('');
      setTaskSubtasks([]);
      setNewSubtaskInput('');
      setTaskAttachments([]);
      setTaskSelectedDepartments([]);
      setTaskSelectedOrganisations(['WIPAHS']);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || !meetingTitle.trim()) return;

    setIsSubmitting(true);
    try {
      const selectedChair = staff.find(s => s.id === meetingChairId) || currentUser;

      const time24 = convertTo24HourTime(meetingStartTime);
      const start12h = convertTo12HourTime(time24);
      const end12h = convertTo12HourTime(meetingEndTime);

      await actions.addMeeting({
        title: meetingTitle.trim(),
        department: meetingDepartment,
        date: meetingDate,
        time: time24, // Explicit HH:MM 24-hour format e.g. "14:30"
        startTime: start12h,
        endTime: end12h,
        meetingType: 'Microsoft Teams',
        agenda: meetingAgenda,
        description: meetingDescription.trim() || undefined,
        attachments: meetingAttachments,
        chairId: selectedChair.id,
        chairName: selectedChair.name,
        chairEmail: selectedChair.email,
        attendees: staff
          .filter(s => meetingAttendees.includes(s.id) || s.id === currentUser.id)
          .map(s => ({
            userId: s.id,
            name: s.name,
            email: s.email,
            status: s.id === currentUser.id ? 'Accepted' : 'Pending',
            avatar: s.avatar,
          })),
        recurrence: meetingRecurrence,
      });

      setMeetingTitle('');
      setMeetingDepartment('Executive & Admin');
      setMeetingDate(new Date().toISOString().split('T')[0]);
      setMeetingStartTime('10:00');
      setMeetingEndTime('11:00');
      setMeetingDescription('');
      setMeetingAgenda(['Review operations scorecard', 'SharePoint document sign-offs', 'Any other business']);
      setNewAgendaInput('');
      setMeetingAttendees([]);
      setMeetingRecurrence('None');
      setMeetingChairId(currentUser.id);
      setMeetingAttachments([]);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || !noticeTitle.trim()) return;

    setIsSubmitting(true);
    try {
      const targetOrgsStr = noticeAudience === 'all'
        ? undefined
        : noticeTargetOrgs.length > 0
        ? noticeTargetOrgs.join(', ')
        : undefined;

      const targetDeptsStr = noticeAudience === 'all'
        ? 'All Departments'
        : noticeTargetDepts.length > 0
        ? noticeTargetDepts.join(', ')
        : 'All Departments';

      await actions.addNotice({
        title: noticeTitle.trim(),
        content: noticeContent.trim(),
        organisation: targetOrgsStr,
        department: targetDeptsStr,
        priority: noticePriority,
        pinned: noticePinned,
        attachments: noticeAttachments,
        targetAudienceType: noticeAudience,
        targetOrganisation: targetOrgsStr,
        targetDepartment: targetDeptsStr,
        targetOrganisations: noticeAudience === 'all' ? [] : noticeTargetOrgs,
        targetDepartments: noticeAudience === 'all' ? [] : noticeTargetDepts,
        targetUserIds: noticeAudience === 'selected_people' ? noticeTargetIds : [],
        targetUserNames: noticeAudience === 'selected_people' ? staff.filter(s => noticeTargetIds.includes(s.id)).map(s => s.name) : [],
      });

      setNoticeAttachments([]);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUploadDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    setSpUploadError(null);

    if (!selectedFile) {
      setSpUploadError('Please select a file to upload to SharePoint.');
      return;
    }

    setIsSubmitting(true);
    try {
      const name = spFileName.trim() || selectedFile.name;
      const folder = isCreatingFolder ? newFolderName.trim() : (spFolder === 'None' ? 'Uncategorized' : spFolder);

      let fileDataBase64: string;
      try {
        fileDataBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error('Failed to read the selected file.'));
          reader.readAsDataURL(selectedFile);
        });
      } catch (readErr: any) {
        setSpUploadError(readErr?.message || 'Failed to read selected file.');
        setIsSubmitting(false);
        return;
      }

      await actions.addSharePointDocument({
        name,
        folder,
        fileType: spFileType,
        size: `${(selectedFile.size / 1024).toFixed(0)} KB`,
        version: 'v1.0',
        contentSummary: spSummary.trim() || 'Document created and uploaded via WIPAHS OfficeHub.',
        createdById: currentUser.id,
        visibility: spVisibility,
        targetDepartment: spTargetDepartments[0],
        allowedUserIds: spAllowedUserIds,
        editableUserIds: spEditableUserIds,
        fileData: fileDataBase64,
      } as any);

      onClose();
    } catch (uploadErr: any) {
      console.error('SharePoint upload failure:', uploadErr);
      setSpUploadError(uploadErr?.message || 'Failed to upload document to SharePoint.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div 
      className="oh-dialog fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-md max-w-xl w-full p-5 sm:p-6 shadow-xl border border-slate-200 space-y-4 max-h-[90vh] flex flex-col animate-in fade-in duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Create New OfficeHub Record
            </h2>
            <p className="text-xs text-slate-500">
              Synced automatically across WIPAHS, Microsoft Teams, and SharePoint.
            </p>
          </div>

          <button
            onClick={onClose}
            aria-label="Close new record"
            className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 p-1 bg-slate-100 rounded-md text-xs font-semibold shrink-0">
          <button
            onClick={() => setActiveTab('task')}
            className={`py-1.5 px-2 rounded-md flex items-center justify-center gap-1.5 transition ${
              activeTab === 'task' ? 'bg-white text-[#008f18] shadow-2xs font-bold' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <CheckSquare className="w-3.5 h-3.5 text-[#00ad1d]" />
            <span><span className="hidden sm:inline">New</span> Task</span>
            {pendingRatingTasks.length > 0 && (
              <span
                className="px-1.5 py-0.2 rounded-full bg-amber-500 text-white text-[10px] font-bold shadow-2xs animate-pulse"
                title={`${pendingRatingTasks.length} completed task(s) awaiting your rating`}
              >
                {pendingRatingTasks.length}★
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('meeting')}
            className={`py-1.5 px-2 rounded-md flex items-center justify-center gap-1.5 transition ${
              activeTab === 'meeting' ? 'bg-white text-purple-800 shadow-2xs font-bold' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Video className="w-3.5 h-3.5 text-purple-700" />
            Teams
          </button>

          <button
            onClick={() => setActiveTab('notice')}
            className={`py-1.5 px-2 rounded-md flex items-center justify-center gap-1.5 transition ${
              activeTab === 'notice' ? 'bg-white text-amber-800 shadow-2xs font-bold' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <BellRing className="w-3.5 h-3.5 text-amber-700" />
            Circular
          </button>

          <button
            onClick={() => setActiveTab('sharepoint')}
            className={`py-1.5 px-2 rounded-md flex items-center justify-center gap-1.5 transition ${
              activeTab === 'sharepoint' ? 'bg-white text-blue-800 shadow-2xs font-bold' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Upload className="w-3.5 h-3.5 text-[#0c6fae]" />
            SharePoint
          </button>
        </div>

        <div className="overflow-y-auto flex-1 pr-1">
          {/* TAB 1: NEW TASK */}
          {activeTab === 'task' && (
            <form onSubmit={handleCreateTask} className="space-y-4 text-xs">
              {/* Gentle Reminder Banner: Completed tasks awaiting organizer rating */}
              {pendingRatingTasks.length > 0 && (
                <div className="p-3.5 bg-amber-50/90 border-2 border-amber-300 rounded-lg text-xs space-y-2.5">
                  <div className="flex items-start gap-2.5">
                    <div className="p-1 rounded bg-amber-200 text-amber-900 mt-0.5 shrink-0">
                      <Star className="w-4 h-4 fill-amber-500 text-amber-500" />
                    </div>
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 flex-wrap">
                        <p className="font-bold text-amber-950 text-xs">
                          {pendingRatingTasks.length} Completed Task{pendingRatingTasks.length > 1 ? 's' : ''} Awaiting Your Rating
                        </p>
                        <span className="px-1.5 py-0.2 rounded bg-amber-200 text-amber-900 font-bold text-[10px]">
                          Compulsory Step
                        </span>
                      </div>
                      <p className="text-[11px] text-amber-800 leading-relaxed">
                        You have completed task{pendingRatingTasks.length > 1 ? 's' : ''} awaiting performance evaluation. Please rate assignee performance to keep staff records up to date:
                      </p>

                      <div className="space-y-1.5 pt-1 max-h-32 overflow-y-auto">
                        {pendingRatingTasks.map(pt => (
                          <div key={pt.id} className="flex items-center justify-between gap-2 p-2 bg-white rounded border border-amber-200 text-[11px]">
                            <div className="min-w-0 flex-1">
                              <p className="font-bold text-slate-900 truncate">"{pt.title}"</p>
                              <p className="text-[10px] text-slate-500">Completed by {pt.assignedToName}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                if (onSelectTask) {
                                  onSelectTask(pt.id);
                                }
                              }}
                              className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded font-bold text-[10px] shrink-0 cursor-pointer shadow-2xs flex items-center gap-1"
                            >
                              <span>★</span>
                              <span>Rate Task</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Task Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Conduct Secondary School Teacher Workshop"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:border-teal-500 text-xs"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Description</label>
                <textarea
                  rows={2}
                  placeholder="Operational context and expected deliverables..."
                  value={taskDescription}
                  onChange={(e) => setTaskDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:border-teal-500 text-xs"
                />
              </div>

              {/* Assignment Target Dropdown and Selector */}
              <div className="space-y-2">
                <label className="font-semibold text-slate-700 block mb-1">
                  Assign To *
                </label>
                
                <div className="relative">
                  <select
                    value={taskAssignTarget}
                    onChange={(e) => {
                      const nextTarget = e.target.value as 'personal' | 'department' | 'organization' | 'specific_people';
                      setTaskFormError(null);
                      if (nextTarget === 'personal') {
                        setTaskSelectedPeopleIds([currentUser.id]);
                      } else if (nextTarget === 'specific_people' && taskAssignTarget === 'personal') {
                        setTaskSelectedPeopleIds(defaultAssignee ? [defaultAssignee.id] : []);
                      }
                      setTaskAssignTarget(nextTarget);
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white font-medium text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
                  >
                    <option value="personal">Personal (Myself)</option>
                    <option value="department">Department(s)</option>
                    <option value="organization">Organization(s)</option>
                    <option value="specific_people">Specific People</option>
                  </select>
                </div>

                {/* 1. PERSONAL MODE */}
                {taskAssignTarget === 'personal' && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-3">
                    <UserAvatar
                      avatar={currentUser.avatar}
                      name={currentUser.name}
                      className="w-8 h-8 border border-emerald-300 shrink-0"
                    />
                    <div>
                      <p className="font-bold text-xs text-slate-900 leading-tight">
                        {currentUser.name} — {currentUser.role}
                      </p>
                      <p className="text-[11px] text-[#008f18] font-semibold mt-0.5">
                        {currentUser.organisation || 'WIPAHS'} • {currentUser.department} (Personal Task)
                      </p>
                    </div>
                  </div>
                )}

                {/* 2. DEPARTMENT MODE (Multiple Departments) */}
                {taskAssignTarget === 'department' && (
                  <div className="border border-slate-200 rounded-lg p-3 bg-slate-50 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Users className="w-4 h-4 text-[#00ad1d]" />
                        <span className="font-bold text-xs text-slate-800">Select Target Department(s)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const allDepts = Array.from(new Set([
                              ...STANDARD_CORE_DEPTS,
                              ...(departments || []).map(d => normalizeDepartmentName(d.name)),
                              ...staff.map(s => normalizeDepartmentName(s.department || 'General'))
                            ])).filter(Boolean);
                            setTaskSelectedDepartments(allDepts);
                          }}
                          className="text-[11px] text-[#008f18] hover:underline font-medium"
                        >
                          Select All
                        </button>
                        <span className="text-slate-300">|</span>
                        <button
                          type="button"
                          onClick={() => setTaskSelectedDepartments([])}
                          className="text-[11px] text-slate-500 hover:underline"
                        >
                          Clear
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2.5 max-h-56 overflow-y-auto bg-white p-2.5 rounded-md border border-slate-200">
                      {allDepartmentsGrouped.map(({ org, depts }) => (
                        <div key={org} className="space-y-1">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{org}</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pl-1.5">
                            {depts.map(dept => {
                              const isChecked = taskSelectedDepartments.includes(dept);
                              return (
                                <label
                                  key={`${org}-${dept}`}
                                  className={`flex items-center gap-2 p-1.5 rounded cursor-pointer transition border text-xs ${
                                    isChecked
                                      ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-semibold'
                                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setTaskSelectedDepartments([...taskSelectedDepartments, dept]);
                                      } else {
                                        setTaskSelectedDepartments(taskSelectedDepartments.filter(d => d !== dept));
                                      }
                                    }}
                                    className="rounded border-slate-300 text-[#00ad1d] focus:ring-[#00ad1d]"
                                  />
                                  <span className="truncate">{dept}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>

                    {taskSelectedDepartments.length > 0 && (
                      <div className="text-[11px] text-emerald-800 bg-emerald-100/70 px-2.5 py-1 rounded font-medium">
                        ✓ Assigned to {taskSelectedDepartments.length} department(s): {taskSelectedDepartments.join(', ')}
                      </div>
                    )}
                  </div>
                )}

                {/* 3. ORGANIZATION MODE (Multiple Organisations) */}
                {taskAssignTarget === 'organization' && (
                  <div className="border border-slate-200 rounded-lg p-3 bg-slate-50 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Building2 className="w-4 h-4 text-[#00ad1d]" />
                        <span className="font-bold text-xs text-slate-800">Select Target Organisation(s)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setTaskSelectedOrganisations(['WIPAHS', 'HO', 'HOP', 'WEC', 'MEDEWELL'])}
                          className="text-[11px] text-[#008f18] hover:underline font-medium"
                        >
                          Select All
                        </button>
                        <span className="text-slate-300">|</span>
                        <button
                          type="button"
                          onClick={() => setTaskSelectedOrganisations([])}
                          className="text-[11px] text-slate-500 hover:underline"
                        >
                          Clear
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {sortOrganisations(['WIPAHS', 'HO', 'HOP', 'WEC', 'MEDEWELL']).map(org => {
                        const isChecked = taskSelectedOrganisations.includes(org);
                        const orgStaffCount = staff.filter(s => (s.organisation || 'WIPAHS') === org).length;
                        return (
                          <label
                            key={org}
                            className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition border ${
                              isChecked
                                ? 'bg-emerald-50 border-emerald-300 text-emerald-900 shadow-2xs font-semibold'
                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setTaskSelectedOrganisations([...taskSelectedOrganisations, org]);
                                  } else {
                                    setTaskSelectedOrganisations(taskSelectedOrganisations.filter(o => o !== org));
                                  }
                                }}
                                className="rounded border-slate-300 text-[#00ad1d] focus:ring-[#00ad1d]"
                              />
                              <div>
                                <p className="font-bold text-xs">{org}</p>
                                <p className="text-[10px] text-slate-500">{orgStaffCount} staff members</p>
                              </div>
                            </div>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                              Entire Org
                            </span>
                          </label>
                        );
                      })}
                    </div>

                    {taskSelectedOrganisations.length > 0 && (
                      <div className="text-[11px] text-emerald-800 bg-emerald-100/70 px-2.5 py-1 rounded font-medium">
                        ✓ Assigned to {taskSelectedOrganisations.length} organisation(s): {taskSelectedOrganisations.join(', ')}
                      </div>
                    )}
                  </div>
                )}

                {/* 4. SPECIFIC PEOPLE (Shows the full hierarchy box) */}
                {taskAssignTarget === 'specific_people' && (
                  <div className="space-y-2">
                    <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-[#00ad1d]" />
                        <span className="font-bold text-xs text-slate-900">
                          {taskSelectedPeopleIds.length} person(s) selected
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500 font-medium">
                        Check individuals, whole departments, or organisations below:
                      </span>
                    </div>

                    {/* The Full Hierarchy Box */}
                    <StaffPickerTree
                      mode="multiple"
                      staff={staff}
                      selectedUserIds={taskSelectedPeopleIds}
                      onChange={setTaskSelectedPeopleIds}
                    />

                    {/* Selected Badges */}
                    {taskSelectedPeopleIds.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1.5 bg-slate-50 rounded-md border border-slate-200">
                        {taskSelectedPeopleIds.map(id => {
                          const s = staff.find(staffMember => staffMember.id === id);
                          if (!s) return null;
                          return (
                            <span
                              key={id}
                              className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-white border border-slate-200 rounded-md text-[11px] text-slate-800 shadow-2xs"
                            >
                              <UserAvatar
                                name={s.name}
                                avatar={s.avatar}
                                className="w-4 h-4"
                              />
                              <span className="font-semibold">{formatStaffDisplayName(s)}</span>
                              <span className="text-[10px] text-[#008f18]">({formatStaffDisplayOrgDept(s)})</span>
                              <button
                                type="button"
                                onClick={() => setTaskSelectedPeopleIds(taskSelectedPeopleIds.filter(pid => pid !== id))}
                                className="text-slate-400 hover:text-rose-600 font-bold ml-0.5"
                              >
                                ×
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Priority</label>
                <select
                  value={taskPriority}
                  onChange={(e) => setTaskPriority(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-teal-500 text-xs"
                >
                  <option value="Urgent">Urgent (Teams Alert)</option>
                  <option value="High">High Priority</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Due Date <span className="text-rose-500 font-bold">*</span></label>
                <input
                  type="date"
                  required
                  value={taskDueDate}
                  onChange={(e) => setTaskDueDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-teal-500 text-xs"
                />
              </div>

              {/* Document & File Attachments */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-slate-700 block text-xs">
                    Attach Documents & Files
                  </label>
                  <span className="text-[10px] text-slate-400">PDF, Word, Excel, Images, CSV, Text</span>
                </div>

                <div className="p-3 border-2 border-dashed border-slate-200 rounded-lg bg-slate-50/80 hover:bg-emerald-50/40 hover:border-emerald-300 transition group cursor-pointer">
                  <label className="flex flex-col items-center justify-center cursor-pointer text-center space-y-1">
                    <Paperclip className="w-5 h-5 text-emerald-600 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-semibold text-slate-700">
                      Click to choose or drop documents here
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Files will be attached to this task & viewable in browser tabs
                    </span>
                    <input
                      type="file"
                      multiple
                      onChange={handleTaskFileChange}
                      className="hidden"
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.webp,.svg,.gif"
                    />
                  </label>
                </div>

                {isUploadingTaskFile && (
                  <div className="flex items-center gap-2 p-2 bg-emerald-50 text-emerald-800 rounded text-xs font-semibold">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                    <span>Parsing & storing uploaded document...</span>
                  </div>
                )}

                {taskAttachments.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    {taskAttachments.map(att => (
                      <div key={att.id} className="flex items-center justify-between p-2 bg-white border border-slate-200 rounded-lg text-xs shadow-2xs">
                        <div className="flex items-center gap-2 min-w-0 pr-2">
                          <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-800 truncate">{att.name}</p>
                            <p className="text-[10px] text-slate-400">{att.size} • {att.type.toUpperCase()}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveTaskAttachment(att.id)}
                          className="text-slate-400 hover:text-rose-600 p-1 font-bold text-sm cursor-pointer"
                          title="Remove attachment"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Subtasks Builder */}
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Checklist / Subtasks</label>
                <div className="space-y-1.5 mb-2">
                  {taskSubtasks.map((st, i) => (
                    <div key={i} className="flex items-center justify-between p-1.5 bg-slate-50 rounded-lg text-xs">
                      <span className="text-slate-800">{st}</span>
                      <button
                        type="button"
                        onClick={() => setTaskSubtasks(taskSubtasks.filter((_, idx) => idx !== i))}
                        className="text-slate-400 hover:text-rose-600 p-0.5"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Add item to checklist..."
                    value={newSubtaskInput}
                    onChange={(e) => setNewSubtaskInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (newSubtaskInput.trim()) {
                          setTaskSubtasks([...taskSubtasks, newSubtaskInput.trim()]);
                          setNewSubtaskInput('');
                        }
                      }
                    }}
                    className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:border-teal-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (newSubtaskInput.trim()) {
                        setTaskSubtasks([...taskSubtasks, newSubtaskInput.trim()]);
                        setNewSubtaskInput('');
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs"
                  >
                    Add
                  </button>
                </div>
              </div>

              {taskFormError && (
                <div role="alert" className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 font-semibold text-xs">
                  {taskFormError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3.5 py-2 rounded-md text-slate-600 font-semibold hover:bg-slate-100 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-md bg-[#00ad1d] hover:bg-[#009218] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-xs shadow-2xs flex items-center gap-1.5"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Creating Task...</span>
                    </>
                  ) : (
                    <span>Create Task</span>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: SCHEDULE TEAMS MEETING */}
          {activeTab === 'meeting' && (
            <form onSubmit={handleCreateMeeting} className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Meeting Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Q3 Healthcare Dispensary Strategy Review"
                  value={meetingTitle}
                  onChange={(e) => setMeetingTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:border-purple-500 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Department</label>
                  <select
                    value={meetingDepartment}
                    onChange={(e) => setMeetingDepartment(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-purple-500 text-xs"
                  >
                    <option value="Top management">Top management</option>
                    <option value="IT">IT</option>
                    <option value="Finance">Finance</option>
                    <option value="Logistics and Operations">Logistics and Operations</option>
                    <option value="Tabligh">Tabligh</option>
                    <option value="management">management</option>
                    <option value="projects and Mkt">projects and Mkt</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Meeting Date</label>
                  <input
                    type="date"
                    value={meetingDate}
                    onChange={(e) => setMeetingDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-purple-500 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Agenda</label>
                <textarea
                  rows={2}
                  placeholder="Meeting objectives and agenda..."
                  value={meetingDescription}
                  onChange={(e) => setMeetingDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:border-purple-500 text-xs"
                />
              </div>

              {/* Meeting Attachments (Inline) */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleMeetingDrop}
                className="space-y-2 p-3 bg-purple-50/40 rounded-lg border border-purple-200/80 transition"
              >
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <label className="font-semibold text-slate-800 flex items-center gap-1.5 text-xs">
                    <Paperclip className="w-3.5 h-3.5 text-purple-600" />
                    <span>Meeting Attachments & Documents</span>
                    {meetingAttachments.length > 0 && (
                      <span className="px-1.5 py-0.2 rounded-full bg-purple-100 text-purple-700 font-bold text-[10px]">
                        {meetingAttachments.length}
                      </span>
                    )}
                  </label>

                  <div className="flex items-center gap-1.5">
                    {sharePointDocs && sharePointDocs.length > 0 && (
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setShowMeetingSharePointPicker(!showMeetingSharePointPicker)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-[11px] font-semibold cursor-pointer shadow-2xs transition"
                          title="Attach an existing SharePoint document"
                        >
                          <FileText className="w-3 h-3 text-blue-600" />
                          <span>From SharePoint</span>
                        </button>

                        {showMeetingSharePointPicker && (
                          <div className="absolute right-0 top-full mt-1 w-64 bg-white rounded-lg shadow-lg border border-slate-200 p-2 z-30 space-y-1 max-h-52 overflow-y-auto">
                            <div className="flex items-center justify-between pb-1 border-b border-slate-100 text-[11px] font-bold text-slate-700">
                              <span>Select Document</span>
                              <button
                                type="button"
                                onClick={() => setShowMeetingSharePointPicker(false)}
                                className="text-slate-400 hover:text-slate-600"
                              >
                                ×
                              </button>
                            </div>
                            {sharePointDocs.filter(d => canUserViewDocument(d, currentUser)).map(doc => (
                              <button
                                key={doc.id}
                                type="button"
                                onClick={() => handleAttachSharePointDoc(doc.id)}
                                className="w-full text-left p-1.5 rounded hover:bg-purple-50 text-[11px] flex items-center justify-between gap-1.5 transition"
                              >
                                <span className="truncate text-slate-800 font-medium">{doc.name}</span>
                                <span className="text-[10px] text-slate-400 shrink-0 font-mono">({doc.size})</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    <label className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-purple-600 hover:bg-purple-700 text-white border border-purple-600 text-[11px] font-semibold cursor-pointer shadow-2xs transition">
                      <Paperclip className="w-3 h-3 text-white" />
                      <span>Attach Files</span>
                      <input
                        type="file"
                        multiple
                        onChange={handleMeetingFileChange}
                        className="hidden"
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.webp,.svg,.gif,.pptx,.ppt"
                      />
                    </label>
                  </div>
                </div>

                {isUploadingMeetingFile && (
                  <div className="flex items-center gap-1.5 text-[11px] text-purple-700 py-0.5">
                    <Loader2 className="w-3 h-3 animate-spin text-purple-600" />
                    <span>Processing attachment...</span>
                  </div>
                )}

                {meetingAttachments.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {meetingAttachments.map(att => {
                      const ext = (att.name || '').split('.').pop()?.toLowerCase() || '';
                      const isPdf = att.type === 'pdf' || ext === 'pdf';
                      const isSheet = att.type === 'xlsx' || ['xls', 'xlsx', 'csv'].includes(ext);
                      const isImg = att.type === 'image' || ['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif'].includes(ext);

                      return (
                        <div
                          key={att.id}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-purple-200 rounded-md text-[11px] text-slate-800 shadow-2xs group"
                        >
                          <div className={`w-3.5 h-3.5 shrink-0 ${
                            isPdf ? 'text-rose-600' :
                            isSheet ? 'text-emerald-600' :
                            isImg ? 'text-purple-600' :
                            'text-blue-600'
                          }`}>
                            {isPdf ? <FileText className="w-3.5 h-3.5" /> :
                             isSheet ? <FileSpreadsheet className="w-3.5 h-3.5" /> :
                             isImg ? <Image className="w-3.5 h-3.5" /> :
                             <File className="w-3.5 h-3.5" />}
                          </div>
                          <span className="truncate max-w-[180px] font-medium" title={att.name}>{att.name}</span>
                          <span className="text-[10px] text-slate-400">({att.size})</span>
                          <button
                            type="button"
                            onClick={() => setMeetingAttachments(meetingAttachments.filter(a => a.id !== att.id))}
                            className="text-slate-400 hover:text-rose-600 font-bold ml-1 cursor-pointer text-xs leading-none"
                            title="Remove attachment"
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-500 italic">
                    Optional: drag & drop or attach agendas, reports, slides, or documents for attendees.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Start Time</label>
                  <input
                    type="time"
                    value={convertTo24HourTime(meetingStartTime)}
                    onChange={(e) => setMeetingStartTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">End Time</label>
                  <input
                    type="time"
                    value={convertTo24HourTime(meetingEndTime)}
                    onChange={(e) => setMeetingEndTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs"
                  />
                </div>
              </div>

              {/* Attendees (Organisation -> Department -> Person Tree) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-slate-700">
                    Invite Attendees ({meetingAttendees.length} selected)
                  </label>
                  {meetingAttendees.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setMeetingAttendees([])}
                      className="text-[11px] text-rose-600 hover:text-rose-800 font-medium"
                    >
                      Clear Selection
                    </button>
                  )}
                </div>

                <p className="text-[11px] text-slate-500 mb-2">
                  Select individual members, or click "Dept" or "Select All Org" to invite entire organizational units:
                </p>

                {/* Selected attendee chips */}
                {meetingAttendees.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2 max-h-24 overflow-y-auto p-1.5 bg-slate-50 border border-slate-200 rounded-md">
                    {staff.filter(s => meetingAttendees.includes(s.id)).map(s => {
                      const conflict = meetingConflicts.find(c => c.userId === s.id);
                      return (
                        <span
                          key={s.id}
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[11px] shadow-2xs ${
                            conflict
                              ? 'bg-amber-50 border-amber-300 text-amber-950 font-medium'
                              : 'bg-white border-slate-200 text-slate-800'
                          }`}
                          title={conflict ? `Conflicts with ${conflict.conflictingMeetingTitle} at ${conflict.startTime} - ${conflict.endTime}` : undefined}
                        >
                          <span className="font-medium">{formatStaffDisplayName(s)}</span>
                          <span className="text-[#008f18] text-[10px] font-semibold">({formatStaffDisplayOrgDept(s)})</span>
                          {conflict && (
                            <span
                              className="inline-flex items-center gap-0.5 text-amber-700 bg-amber-100/90 px-1 py-0.2 rounded text-[9px] font-bold"
                              title={`Conflicts with "${conflict.conflictingMeetingTitle}" at ${conflict.startTime}`}
                            >
                              <AlertTriangle className="w-2.5 h-2.5 text-amber-600" />
                              <span>Conflict</span>
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => setMeetingAttendees(meetingAttendees.filter(id => id !== s.id))}
                            className="text-slate-400 hover:text-rose-600 ml-0.5 font-bold"
                          >
                            ×
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Scheduling Conflict Warning Banner */}
                {meetingConflicts.length > 0 && (
                  <div className="mb-2 p-2.5 rounded-lg bg-amber-50/90 border border-amber-300 text-amber-900 space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-xs text-amber-900">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Scheduling Conflict Detected ({meetingConflicts.length})</span>
                    </div>
                    <ul className="space-y-0.5 text-[11px] text-amber-800 pl-5 list-disc">
                      {meetingConflicts.map(c => (
                        <li key={c.userId}>
                          <strong>{c.userName}</strong> has an overlapping meeting: <em>"{c.conflictingMeetingTitle}"</em> at {c.startTime} – {c.endTime}
                        </li>
                      ))}
                    </ul>
                    <p className="text-[10px] text-amber-700 italic">
                      An alert notification will also be sent to your organizer inbox upon scheduling.
                    </p>
                  </div>
                )}

                <StaffPickerTree
                  mode="multiple"
                  staff={staff}
                  selectedUserIds={meetingAttendees}
                  onChange={setMeetingAttendees}
                  conflicts={meetingConflicts}
                />
              </div>

              {/* Recurrence */}
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Recurrence</label>
                <select
                  value={meetingRecurrence}
                  onChange={(e) => setMeetingRecurrence(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-purple-500 text-xs"
                >
                  <option value="None">None</option>
                  <option value="Daily">Daily</option>
                  <option value="Weekly">Weekly</option>
                  <option value="Monthly">Monthly</option>
                </select>
              </div>

              {/* Meeting Chair / Session Host */}
              <div className="space-y-1.5 p-3 bg-purple-50/50 rounded-xl border border-purple-200/80">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-800 flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5 text-purple-700" />
                    <span>Meeting Chair / Host *</span>
                  </label>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-100 text-purple-800 font-semibold">
                    Teams Session Lead
                  </span>
                </div>

                <select
                  value={meetingParticipants.some(p => p.id === meetingChairId) ? meetingChairId : currentUser.id}
                  onChange={(e) => setMeetingChairId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white font-medium text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-500"
                >
                  {meetingParticipants.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {p.role} ({p.organisation || 'WIPAHS'} • {p.department}){p.id === currentUser.id ? ' — [Creator / Default Chair]' : ''}
                    </option>
                  ))}
                </select>

                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Designated chair will preside over the session, lead Microsoft Teams agendas, and appear as the official host in Outlook (.ics) calendars.
                </p>
              </div>

              <div className="p-3 bg-purple-50 rounded-xl border border-purple-100 space-y-1">
                <div className="flex items-center gap-1.5 text-purple-900 font-bold text-xs">
                  <Video className="w-3.5 h-3.5 text-purple-700" />
                  <span>Microsoft Teams Virtual Room Generator</span>
                </div>
                <p className="text-[11px] text-purple-700">
                  A secure Microsoft Teams meeting URL, conference ID, and Outlook .ics invite will be automatically generated.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3.5 py-2 rounded-md text-slate-600 font-semibold hover:bg-slate-100 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-md bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-xs shadow-2xs flex items-center gap-1.5"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Scheduling & Generating Teams Link...</span>
                    </>
                  ) : (
                    <span>Schedule & Generate Teams Link</span>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: POST NOTICE */}
          {activeTab === 'notice' && (
            <form onSubmit={handleCreateNotice} className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Circular Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Mandatory Staff Digital Workflow Guidelines"
                  value={noticeTitle}
                  onChange={(e) => setNoticeTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:border-amber-500 text-xs"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Announcement Body *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Enter complete circular text to be distributed to authorized staff..."
                  value={noticeContent}
                  onChange={(e) => setNoticeContent(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:border-amber-500 text-xs"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Priority</label>
                <select
                  value={noticePriority}
                  onChange={(e) => setNoticePriority(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs"
                >
                  <option value="Normal">Normal Notification</option>
                  <option value="Urgent">Urgent (Triggers Teams Bot)</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Target Audience Scope</label>
                <select
                  value={noticeAudience}
                  onChange={(e) => setNoticeAudience(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold"
                >
                  <option value="all">Everyone (All Organisations & Departments)</option>
                  <option value="organisation">Target Specific Organisation(s)</option>
                  <option value="department">Target Specific Department(s)</option>
                  <option value="org_and_dept">Target Specific Organisation(s) & Department(s)</option>
                  <option value="selected_people">Specific Staff Members</option>
                </select>
              </div>

              {/* Multiple Organisations & Departments Selector */}
              {(noticeAudience === 'organisation' || noticeAudience === 'department' || noticeAudience === 'org_and_dept') && (
                <div className="space-y-4 p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                  {/* 1. Target Organisation(s) */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-bold text-xs text-slate-800">
                        <Building2 className="w-4 h-4 text-[#00ad1d]" />
                        <span>Select Target Organisation(s)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setNoticeTargetOrgs([...availableOrganisations])}
                          className="text-[11px] text-[#008f18] hover:underline font-semibold cursor-pointer"
                        >
                          Select All
                        </button>
                        <span className="text-slate-300">|</span>
                        <button
                          type="button"
                          onClick={() => setNoticeTargetOrgs([])}
                          className="text-[11px] text-slate-500 hover:underline cursor-pointer"
                        >
                          Clear
                        </button>
                      </div>
                    </div>

                    {/* Organisation Cards Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {availableOrganisations.map((org) => {
                        const isChecked = noticeTargetOrgs.includes(org);
                        const orgStaffCount = staff.filter((s) => (s.organisation || 'WIPAHS') === org).length;
                        return (
                          <label
                            key={org}
                            className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition border text-xs ${
                              isChecked
                                ? 'bg-emerald-50/90 border-[#00ad1d] text-emerald-950 font-bold shadow-2xs ring-1 ring-[#00ad1d]'
                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100/70'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setNoticeTargetOrgs([...noticeTargetOrgs, org]);
                                } else {
                                  setNoticeTargetOrgs(noticeTargetOrgs.filter((o) => o !== org));
                                }
                              }}
                              className="rounded border-slate-300 text-[#00ad1d] focus:ring-[#00ad1d]"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-semibold">{org}</div>
                              <div className="text-[10px] text-slate-400 font-normal">{orgStaffCount} staff</div>
                            </div>
                          </label>
                        );
                      })}
                    </div>

                    {/* CHOSEN ORGANISATIONS DISPLAY */}
                    {noticeTargetOrgs.length > 0 && (
                      <div className="p-2.5 bg-emerald-50/80 border border-emerald-200 rounded-lg space-y-1.5 animate-in fade-in duration-100">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-bold text-emerald-900 flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-[#00ad1d]" />
                            <span>Chosen Organisations ({noticeTargetOrgs.length}):</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => setNoticeTargetOrgs([])}
                            className="text-[11px] text-emerald-700 hover:text-rose-600 font-medium cursor-pointer"
                          >
                            Clear all
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {noticeTargetOrgs.map((org) => (
                            <span
                              key={org}
                              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-semibold bg-white border border-emerald-300 text-emerald-800 shadow-2xs"
                            >
                              <span>{org}</span>
                              <button
                                type="button"
                                onClick={() => setNoticeTargetOrgs((prev) => prev.filter((o) => o !== org))}
                                className="text-emerald-600 hover:text-rose-600 font-bold ml-1 cursor-pointer"
                                title={`Remove ${org}`}
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 2. Target Department(s) */}
                  <div className="space-y-2 pt-2 border-t border-slate-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-bold text-xs text-slate-800">
                        <Users className="w-4 h-4 text-blue-600" />
                        <span>
                          Select Target Department(s)
                          {noticeTargetOrgs.length > 0 && (
                            <span className="text-[11px] font-normal text-slate-500 ml-1">
                              (in {noticeTargetOrgs.join(', ')})
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setNoticeTargetDepts([...availableDeptsForSelectedOrgs])}
                          className="text-[11px] text-blue-600 hover:underline font-semibold cursor-pointer"
                        >
                          Select All
                        </button>
                        <span className="text-slate-300">|</span>
                        <button
                          type="button"
                          onClick={() => setNoticeTargetDepts([])}
                          className="text-[11px] text-slate-500 hover:underline cursor-pointer"
                        >
                          Clear
                        </button>
                      </div>
                    </div>

                    {/* Quick Add Dropdown */}
                    <select
                      value=""
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val && !noticeTargetDepts.includes(val)) {
                          setNoticeTargetDepts((prev) => [...prev, val]);
                        }
                      }}
                      className="w-full px-3 py-1.5 rounded-md border border-slate-200 bg-white text-xs text-slate-700"
                    >
                      <option value="">+ Add department to audience...</option>
                      {availableDeptsForSelectedOrgs
                        .filter((d) => !noticeTargetDepts.includes(d))
                        .map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                    </select>

                    {/* Department Checkbox List */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-44 overflow-y-auto p-2 bg-white rounded-lg border border-slate-200">
                      {availableDeptsForSelectedOrgs.map((dept) => {
                        const isChecked = noticeTargetDepts.includes(dept);
                        return (
                          <label
                            key={dept}
                            className={`flex items-center gap-2 p-1.5 rounded text-xs cursor-pointer transition ${
                              isChecked
                                ? 'bg-blue-50 text-blue-900 font-semibold'
                                : 'text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setNoticeTargetDepts([...noticeTargetDepts, dept]);
                                } else {
                                  setNoticeTargetDepts(noticeTargetDepts.filter((d) => d !== dept));
                                }
                              }}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="truncate">{dept}</span>
                          </label>
                        );
                      })}
                    </div>

                    {/* CHOSEN DEPARTMENTS DISPLAY */}
                    {noticeTargetDepts.length > 0 ? (
                      <div className="p-2.5 bg-blue-50/80 border border-blue-200 rounded-lg space-y-1.5 animate-in fade-in duration-100">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-bold text-blue-900 flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5 text-blue-600" />
                            <span>Chosen Departments ({noticeTargetDepts.length}):</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => setNoticeTargetDepts([])}
                            className="text-[11px] text-blue-700 hover:text-rose-600 font-medium cursor-pointer"
                          >
                            Clear all
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                          {noticeTargetDepts.map((dept) => (
                            <span
                              key={dept}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold bg-white border border-blue-300 text-blue-800 shadow-2xs"
                            >
                              <span>{dept}</span>
                              <button
                                type="button"
                                onClick={() => setNoticeTargetDepts((prev) => prev.filter((d) => d !== dept))}
                                className="text-blue-500 hover:text-rose-600 font-bold ml-1 cursor-pointer"
                                title={`Remove ${dept}`}
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-500 italic px-1">
                        No specific departments chosen — circular will be delivered to <strong>all departments</strong> in the chosen organisation(s).
                      </p>
                    )}
                  </div>

                  {/* Summary Footer */}
                  {(noticeTargetOrgs.length > 0 || noticeTargetDepts.length > 0) && (
                    <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-700">
                      <span className="font-bold text-slate-900">Audience Scope:</span>
                      <span className="bg-emerald-100 text-emerald-800 font-semibold px-2 py-0.5 rounded">
                        {noticeTargetOrgs.length > 0 ? noticeTargetOrgs.join(', ') : 'All Organisations'}
                      </span>
                      <span>•</span>
                      <span className="bg-blue-100 text-blue-800 font-semibold px-2 py-0.5 rounded">
                        {noticeTargetDepts.length > 0 ? noticeTargetDepts.join(', ') : 'All Departments'}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Specific People Picker */}
              {noticeAudience === 'selected_people' && (
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Select Target Recipients ({noticeTargetIds.length} selected)
                  </label>
                  <StaffPickerTree
                    mode="multiple"
                    staff={staff}
                    selectedUserIds={noticeTargetIds}
                    onChange={setNoticeTargetIds}
                  />
                </div>
              )}

              {/* Circular Document Attachments */}
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Attach Circular Document / File (Optional)
                </label>
                <div className="flex items-center gap-2">
                  <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md font-semibold text-xs border border-slate-200 transition">
                    <Paperclip className="w-3.5 h-3.5 text-slate-600" />
                    <span>Attach Document</span>
                    <input
                      type="file"
                      multiple
                      onChange={handleNoticeFileChange}
                      className="hidden"
                      accept=".pdf,.docx,.doc,.xlsx,.xls,.png,.jpg,.jpeg,.txt,.csv"
                    />
                  </label>
                  {isUploadingNoticeFile && (
                    <span className="flex items-center gap-1 text-slate-500 text-xs">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600" />
                      <span>Processing document...</span>
                    </span>
                  )}
                </div>

                {noticeAttachments.length > 0 && (
                  <div className="space-y-1.5 pt-2">
                    {noticeAttachments.map(att => (
                      <div key={att.id} className="flex items-center justify-between p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs shadow-2xs">
                        <div className="flex items-center gap-2 min-w-0 pr-2">
                          <FileText className="w-4 h-4 text-amber-600 shrink-0" />
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-800 truncate">{att.name}</p>
                            <p className="text-[10px] text-slate-500">{att.size} • {att.type.toUpperCase()}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveNoticeAttachment(att.id)}
                          className="p-1 hover:bg-slate-200 text-slate-400 hover:text-slate-700 rounded-md transition"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="pinNotice"
                  checked={noticePinned}
                  onChange={(e) => setNoticePinned(e.target.checked)}
                  className="rounded text-teal-600 focus:ring-teal-500 w-3.5 h-3.5"
                />
                <label htmlFor="pinNotice" className="text-slate-700 font-medium cursor-pointer">
                  Pin this notice to top of the dashboard
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3.5 py-2 rounded-md text-slate-600 font-semibold hover:bg-slate-100 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-md bg-[#00ad1d] hover:bg-[#009218] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-xs shadow-2xs flex items-center gap-1.5"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Publishing Notice...</span>
                    </>
                  ) : (
                    <span>Publish & Broadcast</span>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* TAB 4: UPLOAD TO SHAREPOINT */}
          {activeTab === 'sharepoint' && (
            <form onSubmit={handleUploadDocument} className="space-y-4 text-xs">
              {spUploadError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-md text-rose-700 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Upload Failed</p>
                    <p className="text-[11px] mt-0.5 leading-relaxed">{spUploadError}</p>
                  </div>
                </div>
              )}

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Attach File *</label>
                <input
                  type="file"
                  onChange={(e) => setSelectedFile(e.target.files ? e.target.files[0] : null)}
                  className="w-full text-xs text-slate-500 file:mr-4 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
                />
              </div>
              
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Document Name (Optional override)</label>
                <input
                  type="text"
                  placeholder={selectedFile?.name || 'e.g. WIPAHS_Audit_Preparation_2026'}
                  value={spFileName}
                  onChange={(e) => setSpFileName(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-slate-200 focus:outline-none focus:border-blue-500 text-xs"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Folder Assignment</label>
                <div className="flex gap-2">
                    <select
                      value={spFolder}
                      onChange={(e) => setSpFolder(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-md border border-slate-200 bg-white text-xs"
                    >
                      <option value="None">-- No Folder (Uncategorized) --</option>
                      {folderList.map(folder => <option key={folder} value={folder}>{folder}</option>)}
                    </select>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCreatingFolder(!isCreatingFolder)}
                  className="mt-2 text-xs text-blue-600 hover:text-blue-800 font-medium"
                >
                  {isCreatingFolder ? 'Cancel' : '+ Create New Folder'}
                </button>
                {isCreatingFolder && (
                  <div className="flex gap-2 mt-2">
                    <input
                      type="text"
                      placeholder="Enter new folder name..."
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      className="w-full px-3 py-2 rounded-md border border-slate-200 focus:outline-none focus:border-blue-500 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => {
                          if (newFolderName.trim()) {
                              actions.addFolder(newFolderName.trim());
                              setSpFolder(newFolderName.trim() as any);
                              setNewFolderName('');
                              setIsCreatingFolder(false);
                          }
                      }}
                      className="px-3 py-2 rounded-md bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"
                    >
                      Add
                    </button>
                  </div>
                )}
              </div>
              
              <div>
                  <label className="font-semibold text-slate-700 block mb-1">Document Type</label>
                  <select
                    value={spFileType}
                    onChange={(e) => setSpFileType(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-md border border-slate-200 bg-white text-xs"
                  >
                    <option value="docx">Word (.docx)</option>
                    <option value="xlsx">Excel (.xlsx)</option>
                    <option value="pptx">PowerPoint (.pptx)</option>
                    <option value="pdf">PDF Document (.pdf)</option>
                  </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Visibility</label>
                  <select
                    value={spVisibility}
                    onChange={(e) => setSpVisibility(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-md border border-slate-200 bg-white text-xs"
                  >
                    <option value="Everyone">Everyone</option>
                    <option value="Department">Department</option>
                    <option value="Specific People">Specific People</option>
                  </select>
                </div>
                {spVisibility === 'Department' && (
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Departments</label>
                    <div className="max-h-24 overflow-y-auto border border-slate-200 rounded-lg p-2 text-xs">
                      {[
                          'Top management',
                          'IT',
                          'Finance',
                          'Logistics and Operations',
                          'Tabligh',
                          'management',
                          'projects and Mkt'
                      ].map(dept => (
                        <label key={dept} className="flex items-center gap-2 py-0.5 cursor-pointer">
                          <input type="checkbox" checked={spTargetDepartments.includes(dept as Department)} onChange={(e) => {
                            const newDepts = e.target.checked 
                              ? [...spTargetDepartments, dept as Department]
                              : spTargetDepartments.filter(d => d !== dept);
                            setSpTargetDepartments(newDepts);
                            
                            if (e.target.checked) {
                              const staffInDept = staff.filter(s => s.department === dept);
                              const newIds = Array.from(new Set([...spAllowedUserIds, ...staffInDept.map(s => s.id)]));
                              setSpAllowedUserIds(newIds);
                            } else {
                              const staffInDept = staff.filter(s => s.department === dept);
                              const newIds = spAllowedUserIds.filter(id => !staffInDept.find(s => s.id === id));
                              setSpAllowedUserIds(newIds);
                            }
                          }} />
                          {dept}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {spVisibility === 'Specific People' && (
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Allowed Users ({spAllowedUserIds.length} selected)
                  </label>
                  <StaffPickerTree
                    mode="multiple"
                    staff={staff}
                    selectedUserIds={spAllowedUserIds}
                    onChange={setSpAllowedUserIds}
                  />
                </div>
              )}
              
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Editable Users</label>
                <div className="max-h-24 overflow-y-auto border border-slate-200 rounded-lg p-2 text-xs">
                  {staff.map(s => (
                    <label key={s.id} className="flex items-center gap-2 py-0.5 cursor-pointer">
                      <input type="checkbox" checked={spEditableUserIds.includes(s.id)} onChange={(e) => {
                        if (e.target.checked) setSpEditableUserIds([...spEditableUserIds, s.id]);
                        else setSpEditableUserIds(spEditableUserIds.filter(id => id !== s.id));
                      }} />
                      {s.name}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Synopsis & Collaboration Summary</label>
                <textarea
                  rows={2}
                  placeholder="Describe key sections, author notes, or compliance references..."
                  value={spSummary}
                  onChange={(e) => setSpSummary(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-slate-200 focus:outline-none focus:border-blue-500 text-xs"
                />
              </div>

              <div className="p-3 bg-blue-50 rounded-md border border-blue-200 text-xs">
                <span className="font-bold text-blue-900 block mb-0.5">SharePoint Online Sync:</span>
                <p className="text-blue-700 text-[11px]">
                  File will be indexed with active co-authoring support and version 1.0 tag in the WIPAHS cloud repository.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3.5 py-2 rounded-md text-slate-600 font-semibold hover:bg-slate-100 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-md bg-[#0c6fae] hover:bg-[#09578a] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-xs shadow-2xs flex items-center gap-1.5"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Uploading to SharePoint...</span>
                    </>
                  ) : (
                    <span>Upload & Sync to SharePoint</span>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
