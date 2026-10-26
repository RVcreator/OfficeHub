import { UserAvatar } from './UserAvatar';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  Upload,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Calendar,
  DollarSign,
  Users,
  ExternalLink,
  Plus,
  Trash2,
  Pencil,
  Lock,
  MessageSquare,
  FileText,
  CheckSquare,
  Square,
  ChevronRight,
  TrendingUp,
  Droplets,
  GraduationCap,
  Building2,
  MapPin,
  Activity,
  Send,
  Save,
  Download,
  Paperclip,
  Eye,
  Loader2,
  FolderGit2,
  Search,
  Filter,
  FileSpreadsheet,
  Sparkles,
  ArrowUpRight,
  Ban,
  UserPlus
} from 'lucide-react';
import { Department, Project, Milestone, BudgetCategory, ProjectImpact, Task, SharePointDocument, ProjectExpense } from '../types';
import { usePortalStore } from '../services/store';

interface ProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  project?: Project;
  initialTab?: 'milestones' | 'documents' | 'budget' | 'tasks' | 'log' | 'members';
}

export const ProjectModal: React.FC<ProjectModalProps> = ({
  isOpen,
  onClose,
  project: propProject,
  initialTab = 'milestones'
}) => {
  const { actions, currentUser, tasks, staff, departments, sharePointDocs, projects } = usePortalStore();
  const project = projects.find(p => p.id === propProject?.id) || propProject || {} as Project;

  const availableDepartments = React.useMemo(() => {
    const fromStore = (departments || []).map(d => d.name);
    const fromStaff = (staff || []).map(s => s.department);
    const set = Array.from(new Set([...fromStore, ...fromStaff]))
      .filter(Boolean)
      .map(d => d.trim())
      .filter(d => !d.toLowerCase().includes('relief') && d !== 'All Departments' && d !== 'All');
    if (set.length === 0) {
      return ['Top management', 'IT', 'Finance', 'Logistics and Operations', 'Tabligh', 'management', 'projects and Mkt'];
    }
    return set.sort();
  }, [departments, staff]);

  const [activeTab, setActiveTab] = useState<'milestones' | 'documents' | 'budget' | 'tasks' | 'log' | 'members'>(initialTab);
  const [isEditing, setIsEditing] = useState(false);

  // Form states synced strictly to `project`
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<Project['status']>('Active');
  const [statusReason, setStatusReason] = useState('');
  const [progress, setProgress] = useState(0);
  const [department, setDepartment] = useState<Department>('Top management');
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [startDate, setStartDate] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [sharePointFolderUrl, setSharePointFolderUrl] = useState('');
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [budgetBreakdown, setBudgetBreakdown] = useState<BudgetCategory[]>([]);
  const [impactMetrics, setImpactMetrics] = useState<ProjectImpact[]>([]);
  const [activityLog, setActivityLog] = useState<any[]>([]);

  // Real SharePoint documents for this project
  const [projectDocs, setProjectDocs] = useState<SharePointDocument[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [spUploadError, setSpUploadError] = useState<string | null>(null);

  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expenseTitle, setExpenseTitle] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);
  const [expenseCategory, setExpenseCategory] = useState('');
  const [expenseCategoryId, setExpenseCategoryId] = useState('');
  const [expensePaymentMethod, setExpensePaymentMethod] = useState('Corporate Card');
  const [expenseFiles, setExpenseFiles] = useState<{ name: string; url: string; size: string }[]>([]);
  const [isUploadingExpenseFiles, setIsUploadingExpenseFiles] = useState(false);
  const [isSubmittingExpense, setIsSubmittingExpense] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<{ name: string; url: string } | null>(null);

  // Manage Budget Modal State
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [editingCategories, setEditingCategories] = useState<BudgetCategory[]>([]);
  const [overallBudgetInput, setOverallBudgetInput] = useState('');
  const [newCatName, setNewCatName] = useState('');
  const [newCatAllocated, setNewCatAllocated] = useState('');
  const [isSavingBudget, setIsSavingBudget] = useState(false);

  // Expense Ledger Filters
  const [expenseSearch, setExpenseSearch] = useState('');
  const [expenseCatFilter, setExpenseCatFilter] = useState('All');
  const [expenseStatusFilter, setExpenseStatusFilter] = useState<'All' | 'Active' | 'Voided'>('All');

  const handleOpenBudgetModal = () => {
    // DO NOT put default categories! Only use existing categories or leave empty
    setEditingCategories(
      budgetBreakdown && budgetBreakdown.length > 0
        ? budgetBreakdown.map(c => ({ ...c }))
        : []
    );
    const existingOverall = totalAllocated > 0 ? totalAllocated : parseAmount(project?.budget);
    setOverallBudgetInput(existingOverall > 0 ? String(existingOverall) : '');
    setNewCatName('');
    setNewCatAllocated('');
    setShowBudgetModal(true);
  };

  const handleSaveBudgetBreakdown = async () => {
    if (!project) return;
    setIsSavingBudget(true);
    try {
      const overallNum = Number(overallBudgetInput) || 0;
      const catSum = editingCategories.reduce((sum, c) => sum + (Number(c.allocated) || 0), 0);
      const effectiveBudget = overallNum > 0 ? overallNum : catSum;

      await actions.updateProjectBudgetCategories(project.id, editingCategories, effectiveBudget);
      setBudgetBreakdown(editingCategories);
      actions.addProjectActivityLog(
        project.id,
        `Updated project budget allocations (Overall Budget: $${effectiveBudget.toLocaleString()}, ${editingCategories.length} categories) by ${currentUser.name}`
      );
      setShowBudgetModal(false);
    } catch (err) {
      console.error('Error saving budget breakdown:', err);
      alert('Failed to save budget breakdown. Please try again.');
    } finally {
      setIsSavingBudget(false);
    }
  };

  const handleExpenseFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setIsUploadingExpenseFiles(true);
    try {
      const files = Array.from(e.target.files);
      const newFiles: { name: string; url: string; size: string }[] = [];
      for (const file of files) {
        const fileDataBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error(`Failed to read file ${file.name}`));
          reader.readAsDataURL(file);
        });
        newFiles.push({
          name: file.name,
          url: fileDataBase64,
          size: `${Math.max(1, Math.round(file.size / 1024))} KB`,
        });
      }
      setExpenseFiles(prev => [...prev, ...newFiles]);
    } catch (err) {
      console.error('Error reading expense document:', err);
    } finally {
      setIsUploadingExpenseFiles(false);
      e.target.value = '';
    }
  };

  const handleRemoveExpenseFile = (index: number) => {
    setExpenseFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleOpenReceiptDoc = async (url?: string, _docName?: string) => {
    console.log('Opening receipt doc:', url);
    if (!url) return;
    
    if (url.startsWith('data:')) {
      try {
        const byteString = atob(url.split(',')[1]);
        const mimeString = url.split(',')[0].split(':')[1].split(';')[0];
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
          ia[i] = byteString.charCodeAt(i);
        }
        const blob = new Blob([ab], { type: mimeString });
        const blobUrl = URL.createObjectURL(blob);
        window.open(blobUrl, '_blank');
      } catch (e) {
        console.error('Error opening receipt:', e);
        // Fallback
        window.open(url, '_blank');
      }
    } else {
      window.open(url, '_blank');
    }
  };

  const handleRecordExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseTitle.trim() || !expenseAmount || !project) return;
    if (!expenseCategory.trim() && !expenseCategoryId.trim()) {
      alert('Please select a budget category for this expense.');
      return;
    }
    setIsSubmittingExpense(true);
    try {
      const receiptDataUrl = expenseFiles.length > 0 ? JSON.stringify(expenseFiles) : undefined;
      await actions.addProjectExpense({
        projectId: project.id,
        title: expenseTitle.trim(),
        amount: Number(expenseAmount) || 0,
        expenseDate: expenseDate || new Date().toISOString().split('T')[0],
        categoryId: expenseCategoryId || undefined,
        category: expenseCategory.trim(),
        paymentMethod: expensePaymentMethod || 'Corporate Card',
        receiptUrl: receiptDataUrl,
        status: 'Active',
        createdBy: currentUser.name,
      });
      actions.addProjectActivityLog(
        project.id,
        `Recorded expense "${expenseTitle.trim()}" ($${Number(expenseAmount).toLocaleString()}) in "${expenseCategory}" by ${currentUser.name}`
      );
      setExpenseTitle('');
      setExpenseAmount('');
      setExpenseFiles([]);
      setShowExpenseModal(false);
    } catch (err: any) {
      console.error('Error recording expense:', err);
    } finally {
      setIsSubmittingExpense(false);
    }
  };

  // Confirmation Dialog State
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    onConfirm: () => void;
  } | null>(null);

  const ConfirmationModal = () => {
    if (!confirmDialog) return null;
    return (
      <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-white rounded-lg p-6 max-w-sm w-full shadow-2xl border border-slate-200">
          <h3 className="text-sm font-bold text-slate-900 mb-4">{confirmDialog.title}</h3>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setConfirmDialog(null)}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-semibold transition"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                confirmDialog.onConfirm();
                setConfirmDialog(null);
              }}
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded text-xs font-semibold transition"
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    );
  };

  const handleVoidExpense = async (expenseId: string, expenseTitle: string) => {
    if (!project) return;
    setConfirmDialog({
      isOpen: true,
      title: `Are you sure you want to void expense "${expenseTitle}"?`,
      onConfirm: async () => {
        try {
          console.log("voidProjectExpense clicked", { projectId: project.id, expenseId });
          await actions.voidProjectExpense(project.id, expenseId);
          actions.addProjectActivityLog(project.id, `Voided expense "${expenseTitle}" by ${currentUser.name}`);
        } catch (err) {
          console.error('Error voiding expense:', err);
          alert('Failed to void expense. Please try again.');
        }
      }
    });
  };

  const handleDeleteExpense = async (expenseId: string, expenseTitle: string) => {
    if (!project) return;
    setConfirmDialog({
      isOpen: true,
      title: `Permanently delete expense "${expenseTitle}"? This cannot be undone.`,
      onConfirm: async () => {
        try {
          console.log("deleteProjectExpense clicked", { projectId: project.id, expenseId });
          await actions.deleteProjectExpense(project.id, expenseId);
          actions.addProjectActivityLog(project.id, `Permanently deleted expense "${expenseTitle}" by ${currentUser.name}`);
        } catch (err) {
          console.error('Error deleting expense:', err);
          alert('Failed to delete expense. Please try again.');
        }
      }
    });
  };

  const handleDeleteProject = async () => {
    if (!project) return;
    setConfirmDialog({
      isOpen: true,
      title: `WARNING: Are you sure you want to permanently delete project "${project.name}" and all associated records? This action cannot be undone.`,
      onConfirm: async () => {
        try {
          console.log("deleteProject clicked", { projectId: project.id });
          await actions.deleteProject(project.id);
          onClose();
        } catch (err) {
          console.error('Error deleting project:', err);
          alert('Failed to delete project. Please try again.');
        }
      }
    });
  };

  const handleMarkProjectAsDone = async () => {
    if (!project) return;
    setConfirmDialog({
      isOpen: true,
      title: `Mark project "${project.name}" as Completed (100% progress)?`,
      onConfirm: async () => {
        try {
          console.log("markProjectAsDone clicked", { projectId: project.id });
          await actions.markProjectAsDone(project.id);
        } catch (err) {
          console.error('Error marking project as done:', err);
          alert('Failed to mark project as done. Please try again.');
        }
      }
    });
  };

  const handleRemoveMember = async (userId: string, userName: string) => {
    if (!project) return;
    setConfirmDialog({
      isOpen: true,
      title: `Remove ${userName} from this project?`,
      onConfirm: async () => {
        try {
          console.log("removeProjectMember clicked", { projectId: project.id, userId });
          await actions.removeProjectMember(project.id, userId);
          actions.addProjectActivityLog(project.id, `Removed ${userName} from the project team by ${currentUser.name}`);
        } catch (err) {
          console.error('Error removing project member:', err);
          alert('Failed to remove project member. Please try again.');
        }
      }
    });
  };

  const handleAddMember = async (userId: string, userName: string) => {
    if (!project) return;
    try {
      await actions.addProjectMember(project.id, userId);
      actions.addProjectActivityLog(project.id, `Added ${userName} to the project team by ${currentUser.name}`);
      setShowAddMemberModal(false);
      setMemberSearchQuery('');
    } catch (err) {
      console.error('Error adding project member:', err);
      alert('Failed to add project member. Please try again.');
    }
  };

  const handleExportProjectLedger = () => {
    if (!project) return;
    const allExpenses = project.expenses || [];
    const headers = ['Expense Date', 'Title / Vendor', 'Category', 'Payment Method', 'Amount ($)', 'Status', 'Receipt URL', 'Recorded By'];
    const rows = allExpenses.map(e => [
      `"${e.expenseDate}"`,
      `"${e.title.replace(/"/g, '""')}"`,
      `"${e.category}"`,
      `"${e.paymentMethod}"`,
      e.amount,
      `"${e.status}"`,
      `"${e.receiptUrl || ''}"`,
      `"${e.createdBy || ''}"`
    ]);

    const csvContent = '\uFEFF' + [
      `"PROJECT BUDGET & EXPENSE AUDIT LEDGER - ${project.name} (${project.code || ''})"`,
      `"Total Allocated: $${totalAllocated.toLocaleString()} | Total Spent: $${totalSpent.toLocaleString()} | Uncommitted Balance: $${totalRemaining.toLocaleString()}"`,
      '',
      headers.join(','),
      ...rows.map(r => r.join(','))
    ].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${(project.code || 'PROJECT')}_Expenses_Ledger_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const loadProjectDocuments = React.useCallback(async () => {
    if (!project?.id) return;
    setIsLoadingDocs(true);
    try {
      const projectFolder = `Projects/${project.code || project.name.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
      let fetchedDocs: SharePointDocument[] = [];
      if (actions.getProjectSharePointDocs) {
        fetchedDocs = await actions.getProjectSharePointDocs(project.id);
      }
      const localMatches = (sharePointDocs || []).filter(
        (d: any) => d.projectId === project.id || (d.folder && (d.folder.toLowerCase().includes(projectFolder.toLowerCase()) || (project.code && d.folder.toLowerCase().includes(project.code.toLowerCase()))))
      );
      const merged = Array.from(new Map([...fetchedDocs, ...localMatches].map(d => [d.id, d])).values());
      setProjectDocs(merged);
    } catch (err) {
      console.warn('Error fetching project documents:', err);
      const projectFolder = `Projects/${project.code || project.name.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
      const filtered = (sharePointDocs || []).filter(
        (d: any) => d.projectId === project.id || (d.folder && (d.folder.toLowerCase().includes(projectFolder.toLowerCase()) || (project.code && d.folder.toLowerCase().includes(project.code.toLowerCase()))))
      );
      setProjectDocs(filtered);
    } finally {
      setIsLoadingDocs(false);
    }
  }, [project?.id, project?.code, project?.name, actions, sharePointDocs]);

  useEffect(() => {
    if (isOpen && project?.id) {
      loadProjectDocuments();
    }
  }, [isOpen, project?.id, loadProjectDocuments]);

  // Real upload using sharepoint-upload Edge Function
  const handleProjectFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !project) return;
    setIsUploading(true);
    setSpUploadError(null);
    try {
      const files = Array.from(e.target.files);
      const projectFolder = `Projects/${project.code || project.name.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

      for (const file of files) {
        // Read file as Base64 data URL (same reliable pattern as QuickActionModal.tsx)
        const fileDataBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error(`Failed to read selected file ${file.name}`));
          reader.readAsDataURL(file);
        });

        const ext = (file.name.split('.').pop() || '').toLowerCase();
        const fileType = (['docx', 'xlsx', 'pptx', 'pdf'].includes(ext) ? ext : 'pdf') as any;

        await actions.addSharePointDocument({
          name: file.name,
          folder: projectFolder,
          fileType,
          size: `${Math.max(1, Math.round(file.size / 1024))} KB`,
          version: 'v1.0',
          contentSummary: `Project document for ${project.name} (${project.code || 'Initiative'}). Uploaded by ${currentUser.name}.`,
          createdById: currentUser.id,
          visibility: 'Everyone',
          targetDepartment: project.department as any,
          fileData: fileDataBase64,
          projectId: project.id,
        } as any);

        actions.addProjectActivityLog(project.id, `Uploaded "${file.name}" synced to SharePoint (${projectFolder}) by ${currentUser.name}`);
      }

      await loadProjectDocuments();
    } catch (err: any) {
      console.error('Error uploading project document:', err);
      setSpUploadError(err?.message || 'Failed to upload document to SharePoint.');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleRemoveProjectDocument = async (docId: string, docName: string) => {
    if (!project) return;
    try {
      await actions.deleteSharePointDocument(docId);
      actions.addProjectActivityLog(project.id, `Removed project document "${docName}" by ${currentUser.name}`);
      setProjectDocs(prev => prev.filter(d => d.id !== docId));
    } catch (err) {
      console.error('Error removing document:', err);
    }
  };

  // Auxiliary UI states
  const [newLogInput, setNewLogInput] = useState('');
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskAssignee, setNewTaskAssignee] = useState(currentUser.id);
  const [newTaskDueDate, setNewTaskDueDate] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<Task['priority']>('Medium');
  const [showAddMilestone, setShowAddMilestone] = useState(false);
  const [newMilestoneName, setNewMilestoneName] = useState('');
  const [newMilestoneDueDate, setNewMilestoneDueDate] = useState('');
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [memberSearchQuery, setMemberSearchQuery] = useState('');

  // Sync state cleanly whenever `project` or `isOpen` changes
  useEffect(() => {
    if (isOpen && project) {
      setActiveTab(initialTab);
      setIsEditing(false);
      setName(project.name);
      setCode(project.code || '');
      setDescription(project.description || '');
      setStatus(project.status);
      setStatusReason(project.statusReason || '');
      setProgress(project.progress);
      setDepartment(
        project.department && !project.department.toLowerCase().includes('relief')
          ? project.department
          : 'Top management'
      );
      setMemberIds(
        project.memberIds && project.memberIds.length > 0
          ? project.memberIds
          : (project.members && project.members.length > 0 ? project.members.map(m => m.id) : (project.leadId ? [project.leadId] : [currentUser.id]))
      );
      setStartDate(project.startDate);
      setTargetDate(project.targetDate);
      setSharePointFolderUrl(project.sharePointFolderUrl || '');
      setMilestones(project.milestones || []);
      setBudgetBreakdown(project.budgetBreakdown || []);
      setImpactMetrics(project.impactMetrics || []);
      setActivityLog(project.activityLog || []);
      setNewLogInput('');
      setIsAddingTask(false);
      setShowAddMilestone(false);
      setExpenseSearch('');
      setExpenseCatFilter('All');
      setExpenseStatusFilter('All');
    }
  }, [isOpen, propProject?.id, initialTab, project?.budgetBreakdown, project?.expenses]);

  // Check role-based edit permission using the same substring-matching pattern as public.is_admin() and Edge Functions
  const isLead = project.leadId === currentUser.id;
  const isMember = (project.memberIds || []).includes(currentUser.id) || (project.members || []).some(m => m.id === currentUser.id);
  const r = (currentUser.role || '').toLowerCase();
  const d = (currentUser.department || '').toLowerCase();
  const isExecutiveOrAdmin =
    r.includes('admin') ||
    r.includes('manager') ||
    r.includes('director') ||
    r.includes('lead') ||
    d.includes('it') ||
    d.includes('executive') ||
    d.includes('top management');
  const isFinance = d.includes('finance') || r.includes('finance');
  const canEdit = isLead || isExecutiveOrAdmin || isMember || isFinance;

  // Helper to parse dollar amounts safely
  const parseAmount = (val?: string | number): number => {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    return Number(String(val).replace(/[^0-9.-]+/g, '')) || 0;
  };

  // Budget calculations:
  // 1. Overall authorized budget envelope (from categories sum if defined, otherwise project.budget)
  const categoriesAllocated = (budgetBreakdown || []).reduce((sum, item) => sum + (Number(item.allocated) || 0), 0);
  const baseBudget = parseAmount(project.budget);
  const totalAllocated = baseBudget > 0 ? Math.max(baseBudget, categoriesAllocated) : categoriesAllocated;

  // 2. Active expenses and per-category spent mapping
  const activeExpenses = (project.expenses || []).filter(e => e.status === 'Active');
  const expensesSpent = activeExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

  // Authoritative per-category spent map derived from active expenses
  const categorySpentMap = useMemo(() => {
    const map: Record<string, number> = {};
    activeExpenses.forEach(exp => {
      const matched = (budgetBreakdown || []).find(
        b => (exp.categoryId && b.id && exp.categoryId === b.id) ||
             (exp.category && b.category && exp.category.toLowerCase().trim() === b.category.toLowerCase().trim())
      );
      const key = matched ? (matched.id || matched.category) : exp.category;
      map[key] = (map[key] || 0) + (Number(exp.amount) || 0);
    });
    return map;
  }, [activeExpenses, budgetBreakdown]);

  // Function to get authoritative spent for any category
  const getCategorySpent = (cat: BudgetCategory): number => {
    if (activeExpenses.length > 0) {
      const key = cat.id || cat.category;
      return categorySpentMap[key] || 0;
    }
    return Number(cat.spent) || 0;
  };

  // 3. Authoritative Total Spent: strictly equal to sum of all category spent values
  // (guaranteeing that Total Portfolio Envelope and the category breakdown are mathematically identical)
  const totalSpent = (budgetBreakdown && budgetBreakdown.length > 0)
    ? budgetBreakdown.reduce((sum, cat) => sum + getCategorySpent(cat), 0)
    : (activeExpenses.length > 0 ? expensesSpent : parseAmount(project.spent));

  // 4. Costs subtracted from overall budget
  const totalRemaining = totalAllocated - totalSpent;
  const overallSpentPercent = totalAllocated > 0 ? Math.round((totalSpent / totalAllocated) * 100) : 0;

  // Tasks linked to this project
  const linkedTasks = tasks.filter(t => t.projectId === project.id || t.tags?.some(tag => tag.toLowerCase() === project.name.toLowerCase()));
  const overdueLinkedTasks = linkedTasks.filter(t => t.status !== 'Done' && t.dueDate && new Date(t.dueDate) < new Date());

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    if ((status === 'At Risk' || status === 'Delayed') && !statusReason.trim()) {
      alert('Please provide a reason for the At Risk or Delayed status.');
      return;
    }

    const formattedBudget = `$${totalAllocated.toLocaleString()}`;
    const formattedSpent = `$${totalSpent.toLocaleString()}`;

    const updates: Partial<Project> = {
      name,
      code,
      description,
      department,
      status,
      statusReason: (status === 'At Risk' || status === 'Delayed') ? statusReason : undefined,
      progress: Number(progress),
      budget: formattedBudget,
      spent: formattedSpent,
      startDate,
      targetDate,
      sharePointFolderUrl,
      milestones,
      budgetBreakdown,
      impactMetrics,
      activityLog,
      activeTasksCount: linkedTasks.filter(t => t.status !== 'Done').length,
      overdueTasksCount: overdueLinkedTasks.length,
    };

    actions.updateProject(project.id, updates);

    if (status !== project.status) {
      actions.addProjectActivityLog(project.id, `Status updated to ${status}${statusReason ? `: "${statusReason}"` : ''}`);
    }

    setIsEditing(false);
  };

  const handlePostLog = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLogInput.trim()) return;
    actions.addProjectActivityLog(project.id, newLogInput.trim());
    setActivityLog(prev => [
      {
        id: `act-${Date.now()}`,
        userName: currentUser.name,
        userAvatar: currentUser.avatar,
        action: newLogInput.trim(),
        timestamp: 'Just now'
      },
      ...prev
    ]);
    setNewLogInput('');
  };

  const handleToggleMilestone = (mId: string) => {
    if (!canEdit) return;
    const updated = milestones.map(m => {
      if (m.id === mId) {
        const nextStatus = m.status === 'Completed' ? 'Current' : m.status === 'Current' ? 'Upcoming' : 'Completed';
        const nextProgress = nextStatus === 'Completed' ? 100 : nextStatus === 'Current' ? 50 : 0;
        return { ...m, status: nextStatus as any, progress: nextProgress };
      }
      return m;
    });
    setMilestones(updated);

    const completedCount = updated.filter(m => m.status === 'Completed').length;
    const totalCount = updated.length;
    const newProgress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
    setProgress(newProgress);
    actions.updateProject(project.id, { milestones: updated, progress: newProgress });
  };

  const handleAddMilestone = () => {
    if (!newMilestoneName.trim()) return;
    const newM: Milestone = {
      id: `m-${Date.now()}`,
      name: newMilestoneName.trim(),
      status: 'Upcoming',
      dueDate: newMilestoneDueDate || targetDate || new Date().toISOString().split('T')[0],
      progress: 0
    };
    const updated = [...milestones, newM];
    setMilestones(updated);

    const completedCount = updated.filter(m => m.status === 'Completed').length;
    const totalCount = updated.length;
    const newProgress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
    setProgress(newProgress);
    actions.updateProject(project.id, { milestones: updated, progress: newProgress });
    setNewMilestoneName('');
    setNewMilestoneDueDate('');
    setShowAddMilestone(false);
  };

  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    if (!newTaskDueDate || !newTaskDueDate.trim()) {
      alert('Due date is compulsory for project tasks.');
      return;
    }
    const assignee = staff.find(s => s.id === newTaskAssignee) || currentUser;
    actions.addTask({
      title: newTaskTitle.trim(),
      description: `Task for project: ${project.name}`,
      department: project.department,
      status: 'To Do',
      priority: newTaskPriority,
      assignedToId: assignee.id,
      assignedToName: assignee.name,
      dueDate: newTaskDueDate || project.targetDate || new Date().toISOString().split('T')[0],
      tags: [project.code || 'Project', 'Task'],
      projectId: project.id,
      subtasks: [],
      sharePointDocUrl: project.sharePointFolderUrl,
    });
    setNewTaskTitle('');
    setNewTaskDueDate('');
    setIsAddingTask(false);
  };

  const renderImpactIcon = (iconName: string) => {
    switch (iconName?.toLowerCase()) {
      case 'droplets':
        return <Droplets className="w-4 h-4 text-sky-600" />;
      case 'graduationcap':
        return <GraduationCap className="w-4 h-4 text-purple-600" />;
      case 'building2':
        return <Building2 className="w-4 h-4 text-indigo-600" />;
      case 'mappin':
        return <MapPin className="w-4 h-4 text-rose-600" />;
      case 'activity':
        return <Activity className="w-4 h-4 text-emerald-600" />;
      default:
        return <Users className="w-4 h-4 text-[#00ad1d]" />;
    }
  };

  if (!isOpen || !project) return null;

  return (
    <div 
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-lg max-w-4xl w-full shadow-2xl border border-slate-200 my-4 sm:my-8 flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#00ad1d]/10 flex items-center justify-center text-[#00ad1d] font-bold text-sm">
              {project.code ? project.code.slice(0, 3) : 'PRJ'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">
                  {project.code || 'INITIATIVE'}
                </span>
                <span className="text-xs font-semibold text-slate-500">{project.department}</span>
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => {
                      const next = !isEditing;
                      setIsEditing(next);
                      if (next) {
                        setTimeout(() => {
                          document.getElementById('project-edit-section')?.scrollIntoView({ behavior: 'smooth' });
                        }, 100);
                      }
                    }}
                    className="px-2 py-0.5 text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 rounded transition flex items-center gap-1 border border-slate-200 text-[10px] font-semibold"
                    title={isEditing ? 'Hide Edit Section' : 'Edit Project Details (Appears at bottom)'}
                  >
                    <Pencil className="w-3 h-3 text-[#00ad1d]" />
                    <span>{isEditing ? 'Hide Edit' : 'Edit Project'}</span>
                  </button>
                ) : (
                  <span title="Read-only view (Only project lead or director can edit)">
                    <Lock className="w-3.5 h-3.5 text-slate-400" />
                  </span>
                )}
              </div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 leading-snug">
                {project.name}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {project.sharePointFolderUrl && (
              <a
                href={project.sharePointFolderUrl}
                target="_blank"
                rel="noreferrer"
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md transition"
              >
                <span>SharePoint</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Status Alert Banner if At Risk or Delayed */}
        {(project.status === 'At Risk' || project.status === 'Delayed') && (
          <div className="bg-amber-50 border-b border-amber-200 px-5 py-2.5 flex items-start gap-2.5 text-xs text-amber-900 shrink-0">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Project Status: {project.status}</span>
              {project.statusReason && <p className="italic text-amber-800 mt-0.5">"{project.statusReason}"</p>}
            </div>
          </div>
        )}

        {/* Project Progress Overview Header Bar */}
        <div className="bg-slate-50 border-b border-slate-200 px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="flex-1">
            <div className="flex items-center justify-between text-xs font-semibold mb-1">
              <span className="text-slate-700">Overall Project Progress</span>
              <span className="text-[#00ad1d] font-bold">{progress}%</span>
            </div>
            <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
              <div
                className="bg-[#00ad1d] h-full transition-all duration-500 rounded-full"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs font-medium text-slate-600 shrink-0">
            <span>Milestones: <strong className="text-slate-800">{milestones.filter(m => m.status === 'Completed').length} / {milestones.length} Done</strong></span>
            <span>Status: <strong className="text-slate-800">{project.status}</strong></span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center border-b border-slate-200 px-5 bg-white shrink-0 overflow-x-auto">
          <button
            onClick={() => setActiveTab('milestones')}
            className={`py-3 px-3 text-xs font-semibold flex items-center gap-1.5 border-b-2 whitespace-nowrap transition ${
              activeTab === 'milestones'
                ? 'border-[#00ad1d] text-[#00ad1d]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Milestones & Timeline</span>
            <span className="text-[10px] ml-1 px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600">
              {milestones.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('documents')}
            className={`py-3 px-3 text-xs font-semibold flex items-center gap-1.5 border-b-2 whitespace-nowrap transition ${
              activeTab === 'documents'
                ? 'border-[#00ad1d] text-[#00ad1d]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <FolderGit2 className="w-3.5 h-3.5" />
            <span>Documents & SharePoint</span>
            <span className="text-[10px] ml-1 px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600">
              {projectDocs.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('members')}
            className={`py-3 px-3 text-xs font-semibold flex items-center gap-1.5 border-b-2 whitespace-nowrap transition ${
              activeTab === 'members'
                ? 'border-[#00ad1d] text-[#00ad1d]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Members</span>
            <span className="text-[10px] ml-1 px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600">
              {project.members?.length || 0}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('budget')}
            className={`py-3 px-3 text-xs font-semibold flex items-center gap-1.5 border-b-2 whitespace-nowrap transition ${
              activeTab === 'budget'
                ? 'border-[#00ad1d] text-[#00ad1d]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <DollarSign className="w-3.5 h-3.5" />
            <span>Structured Budget</span>
            <span className="text-[10px] ml-1 px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600">
              {overallSpentPercent}% spent
            </span>
          </button>

          <button
            onClick={() => setActiveTab('tasks')}
            className={`py-3 px-3 text-xs font-semibold flex items-center gap-1.5 border-b-2 whitespace-nowrap transition ${
              activeTab === 'tasks'
                ? 'border-[#00ad1d] text-[#00ad1d]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <CheckSquare className="w-3.5 h-3.5" />
            <span>Linked Tasks</span>
            <span className={`text-[10px] ml-1 px-1.5 py-0.2 rounded-full font-bold ${
              overdueLinkedTasks.length > 0 ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'
            }`}>
              {linkedTasks.length} {overdueLinkedTasks.length > 0 && `(${overdueLinkedTasks.length} overdue)`}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('log')}
            className={`py-3 px-3 text-xs font-semibold flex items-center gap-1.5 border-b-2 whitespace-nowrap transition ${
              activeTab === 'log'
                ? 'border-[#00ad1d] text-[#00ad1d]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Activity Log</span>
            <span className="text-[10px] ml-1 px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600">
              {activityLog.length}
            </span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">

          {/* TAB 1: MILESTONES & TIMELINE BREAKDOWN */}
          {activeTab === 'milestones' && (
            <div className="space-y-6">
              
              {/* Stepper Timeline at the Top */}
              <div className="bg-slate-50 p-4 sm:p-5 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Phase Execution Pipeline
                  </h3>
                  <span className="text-xs font-semibold text-[#00ad1d]">
                    {milestones.filter(m => m.status === 'Completed').length} of {milestones.length} Phases Completed
                  </span>
                </div>

                {/* Horizontal Stepper */}
                <div className="relative flex items-center justify-between">
                  <div className="absolute top-4 left-6 right-6 h-0.5 bg-slate-200 -z-0">
                    <div
                      className="h-full bg-[#00ad1d] transition-all duration-500"
                      style={{
                        width: `${
                          milestones.length > 1
                            ? (milestones.filter(m => m.status === 'Completed').length / (milestones.length - 1)) * 100
                            : 0
                        }%`
                      }}
                    ></div>
                  </div>

                  {milestones.map((m, idx) => {
                    const isCompleted = m.status === 'Completed';
                    const isCurrent = m.status === 'Current';
                    return (
                      <div key={m.id} className="relative z-10 flex flex-col items-center group text-center max-w-[120px]">
                        <button
                          type="button"
                          onClick={() => handleToggleMilestone(m.id)}
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all shadow-2xs ${
                            isCompleted
                              ? 'bg-emerald-600 text-white ring-4 ring-emerald-50'
                              : isCurrent
                              ? 'bg-[#00ad1d] text-white ring-4 ring-[#00ad1d]/20 ring-offset-2 scale-110'
                              : 'bg-white border-2 border-slate-300 text-slate-400'
                          }`}
                          title={`Milestone: ${m.name} (${m.status}). Click to toggle.`}
                        >
                          {isCompleted ? (
                            <CheckCircle2 className="w-4 h-4 stroke-[3]" />
                          ) : isCurrent ? (
                            <span className="animate-pulse">{idx + 1}</span>
                          ) : (
                            idx + 1
                          )}
                        </button>
                        <span className={`text-[11px] mt-2 font-semibold leading-tight line-clamp-2 ${
                          isCompleted ? 'text-slate-800' : isCurrent ? 'text-[#00ad1d] font-bold' : 'text-slate-400'
                        }`}>
                          {m.name}
                        </span>
                        <span className="text-[10px] text-slate-400 mt-0.5">{m.dueDate}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Stacked list below stepper */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Milestone Details & Delivery Progress
                  </h4>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setShowAddMilestone(!showAddMilestone)}
                      className="text-xs text-[#00ad1d] hover:text-[#009218] font-semibold flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Milestone</span>
                    </button>
                  )}
                </div>

                {showAddMilestone && (
                  <div className="p-3 bg-emerald-50/60 rounded-md border border-emerald-200 flex flex-wrap items-center gap-2 text-xs">
                    <input
                      type="text"
                      placeholder="Milestone name..."
                      value={newMilestoneName}
                      onChange={e => setNewMilestoneName(e.target.value)}
                      className="px-2.5 py-1.5 rounded border border-slate-200 bg-white flex-1 min-w-[180px]"
                    />
                    <input
                      type="date"
                      value={newMilestoneDueDate}
                      onChange={e => setNewMilestoneDueDate(e.target.value)}
                      className="px-2.5 py-1.5 rounded border border-slate-200 bg-white"
                    />
                    <button
                      type="button"
                      onClick={handleAddMilestone}
                      className="px-3 py-1.5 bg-[#00ad1d] text-white rounded font-semibold text-xs"
                    >
                      Save Milestone
                    </button>
                  </div>
                )}

                <div className="space-y-2">
                  {milestones.map((m) => (
                    <div
                      key={m.id}
                      className="bg-white rounded-md border border-slate-200 p-3.5 hover:border-slate-300 transition space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <button
                            type="button"
                            onClick={() => handleToggleMilestone(m.id)}
                            className="text-slate-400 hover:text-emerald-600 transition"
                            title="Toggle status"
                          >
                            {m.status === 'Completed' ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 fill-emerald-50" />
                            ) : (
                              <div className="w-4 h-4 rounded-full border border-slate-300"></div>
                            )}
                          </button>
                          <span className="text-xs font-bold text-slate-800">{m.name}</span>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                            m.status === 'Completed' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                            m.status === 'Current' ? 'bg-blue-50 text-blue-800 border-blue-200' :
                            'bg-slate-100 text-slate-600 border-slate-200'
                          }`}>
                            {m.status}
                          </span>
                          <span className="text-[11px] text-slate-500 font-medium">Due: {m.dueDate}</span>
                          <span className="text-xs font-bold text-slate-700 min-w-[36px] text-right">
                            {m.progress}%
                          </span>
                        </div>
                      </div>

                      {/* Thin % bar per row */}
                      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${
                            m.status === 'Completed' ? 'bg-emerald-600' :
                            m.status === 'Current' ? 'bg-[#00ad1d]' : 'bg-slate-300'
                          }`}
                          style={{ width: `${m.progress}%` }}
                        ></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Attached Project Documents & SharePoint Sync */}
              <div className="space-y-3 pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Paperclip className="w-3.5 h-3.5 text-[#00ad1d]" />
                    <span>Project Documents & SharePoint Sync</span>
                  </h4>
                  {canEdit && (
                    <label className="cursor-pointer inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#00ad1d]/10 hover:bg-[#00ad1d]/20 text-[#00ad1d] rounded-md font-semibold text-xs border border-[#00ad1d]/30 transition">
                      <Plus className="w-3.5 h-3.5" />
                      <span>Upload & Sync Document</span>
                      <input
                        type="file"
                        multiple
                        onChange={handleProjectFileUpload}
                        className="hidden"
                        accept=".pdf,.docx,.doc,.xlsx,.xls,.pptx,.ppt,.png,.jpg,.jpeg,.txt,.csv"
                      />
                    </label>
                  )}
                </div>

                {spUploadError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-md text-rose-700 flex items-start gap-2 text-xs">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                    <div>
                      <p className="font-semibold">Upload Failed</p>
                      <p className="text-[11px] mt-0.5">{spUploadError}</p>
                    </div>
                  </div>
                )}

                {isUploading && (
                  <p className="text-xs text-slate-500 flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#00ad1d]" />
                    <span>Uploading & syncing document to SharePoint...</span>
                  </p>
                )}

                {isLoadingDocs && projectDocs.length === 0 ? (
                  <p className="text-xs text-slate-500 flex items-center gap-1.5 py-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#00ad1d]" />
                    <span>Loading SharePoint documents...</span>
                  </p>
                ) : projectDocs.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {projectDocs.map((doc) => {
                      const ext = (doc.name.split('.').pop() || '').toLowerCase();
                      const isPdf = ext === 'pdf' || doc.fileType === 'pdf';
                      const isExcel = ['xlsx', 'xls', 'csv'].includes(ext) || doc.fileType === 'xlsx';
                      const isPpt = ['pptx', 'ppt'].includes(ext) || doc.fileType === 'pptx';
                      const docUrl = doc.sharePointWebUrl || doc.webUrl || '#';

                      return (
                        <div
                          key={doc.id}
                          className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs shadow-2xs"
                        >
                          <div className="flex items-center gap-2.5 min-w-0 pr-2">
                            <div className={`p-1.5 rounded shrink-0 ${
                              isPdf ? 'bg-rose-100 text-rose-700' :
                              isExcel ? 'bg-emerald-100 text-emerald-800' :
                              isPpt ? 'bg-amber-100 text-amber-800' :
                              'bg-blue-100 text-blue-800'
                            }`}>
                              <FileText className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-800 truncate" title={doc.name}>{doc.name}</p>
                              <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                                <span>{doc.size || '1.0 MB'}</span>
                                <span>•</span>
                                <span className="text-[#008f18] font-semibold flex items-center gap-0.5">
                                  <FolderGit2 className="w-3 h-3" />
                                  <span>SharePoint</span>
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <a
                              href={docUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-semibold text-[11px] flex items-center gap-1 transition shadow-2xs"
                              title="Open in Office 365"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Open</span>
                            </a>
                            <a
                              href={docUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded transition"
                              title="Open in SharePoint"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => handleRemoveProjectDocument(doc.id, doc.name)}
                                className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition"
                                title="Delete document"
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
                  <p className="text-xs text-slate-400 italic bg-slate-50 p-3 rounded-md border border-slate-100">
                    No attached documents yet. Upload project documents above to automatically sync with SharePoint.
                  </p>
                )}
              </div>

            </div>
          )}

          {/* TAB: DEDICATED DOCUMENTS & SHAREPOINT VIEW */}
          {activeTab === 'documents' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <FolderGit2 className="w-4 h-4 text-[#00ad1d]" />
                    <span>Project Documents & SharePoint Archive</span>
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Synced with SharePoint folder: <span className="font-mono font-semibold text-slate-700">Projects/{project.code || project.name}</span>
                  </p>
                </div>
                {canEdit && (
                  <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#00ad1d] hover:bg-[#009218] text-white rounded-md font-semibold text-xs shadow-2xs transition">
                    <Plus className="w-3.5 h-3.5" />
                    <span>Upload to SharePoint</span>
                    <input
                      type="file"
                      multiple
                      onChange={handleProjectFileUpload}
                      className="hidden"
                      accept=".pdf,.docx,.doc,.xlsx,.xls,.pptx,.ppt,.png,.jpg,.jpeg,.txt,.csv"
                    />
                  </label>
                )}
              </div>

              {spUploadError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-md text-rose-700 flex items-start gap-2 text-xs">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                  <div>
                    <p className="font-semibold">Upload Failed</p>
                    <p className="text-[11px] mt-0.5">{spUploadError}</p>
                  </div>
                </div>
              )}

              {isUploading && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-md flex items-center gap-2 text-xs text-emerald-800">
                  <Loader2 className="w-4 h-4 animate-spin text-[#00ad1d]" />
                  <span>Uploading and syncing document to Microsoft SharePoint...</span>
                </div>
              )}

              {isLoadingDocs && projectDocs.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-[#00ad1d]" />
                  <span>Fetching project documents from SharePoint...</span>
                </div>
              ) : projectDocs.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {projectDocs.map((doc) => {
                    const ext = (doc.name.split('.').pop() || '').toLowerCase();
                    const isPdf = ext === 'pdf' || doc.fileType === 'pdf';
                    const isExcel = ['xlsx', 'xls', 'csv'].includes(ext) || doc.fileType === 'xlsx';
                    const isPpt = ['pptx', 'ppt'].includes(ext) || doc.fileType === 'pptx';
                    const docUrl = doc.sharePointWebUrl || doc.webUrl || '#';

                    return (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between p-3 bg-white hover:bg-slate-50/80 border border-slate-200 rounded-lg text-xs shadow-2xs transition"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 pr-2">
                          <div className={`p-2 rounded shrink-0 ${
                            isPdf ? 'bg-rose-50 text-rose-600' :
                            isExcel ? 'bg-emerald-50 text-emerald-700' :
                            isPpt ? 'bg-amber-50 text-amber-700' :
                            'bg-blue-50 text-blue-700'
                          }`}>
                            <FileText className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-800 truncate" title={doc.name}>{doc.name}</p>
                            <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mt-0.5">
                              <span>{doc.size || '1.0 MB'}</span>
                              <span>•</span>
                              <span className="text-[#008f18] font-semibold flex items-center gap-0.5">
                                <FolderGit2 className="w-3 h-3" />
                                <span>SharePoint</span>
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <a
                            href={docUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-semibold text-[11px] flex items-center gap-1 transition shadow-2xs"
                            title="Open in Office 365 / SharePoint"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Open</span>
                          </a>
                          <a
                            href={docUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded transition"
                            title="Open SharePoint Web Link"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => handleRemoveProjectDocument(doc.id, doc.name)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition"
                              title="Delete document"
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
                <div className="text-center p-8 bg-slate-50 rounded-lg border border-slate-200">
                  <FolderGit2 className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-slate-700">No project documents uploaded yet</p>
                  <p className="text-[11px] text-slate-500 mt-1 max-w-sm mx-auto">
                    Upload documents to automatically store them in Microsoft SharePoint and associate them with this project.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: STRUCTURED BUDGET & FINANCIAL OPERATIONS */}
          {activeTab === 'budget' && (() => {
            const isOverBudget = totalSpent > totalAllocated && totalAllocated > 0;
            const isHighBurn = !isOverBudget && overallSpentPercent > 80 && progress < 60;
            const isHealthy = !isOverBudget && !isHighBurn;

            const filteredExpenses = (project.expenses || []).filter(ex => {
              if (expenseStatusFilter !== 'All' && ex.status !== expenseStatusFilter) return false;
              if (expenseCatFilter !== 'All' && ex.category !== expenseCatFilter) return false;
              if (expenseSearch.trim()) {
                const q = expenseSearch.toLowerCase();
                return (
                  ex.title.toLowerCase().includes(q) ||
                  ex.category.toLowerCase().includes(q) ||
                  ex.paymentMethod.toLowerCase().includes(q) ||
                  (ex.createdBy && ex.createdBy.toLowerCase().includes(q))
                );
              }
              return true;
            });

            return (
              <div className="space-y-6 animate-in fade-in">
                {/* 1. Executive Financial Health Summary Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-slate-50/90 p-3.5 rounded-lg border border-slate-200">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Allocated Budget</span>
                      <DollarSign className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                    <p className="text-lg font-extrabold text-slate-900 mt-1 font-mono">${totalAllocated.toLocaleString()}</p>
                    <span className="text-[10px] text-slate-500 mt-0.5 block">{budgetBreakdown.length} cost categories</span>
                  </div>

                  <div className="bg-slate-50/90 p-3.5 rounded-lg border border-slate-200">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Expended</span>
                      <TrendingUp className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                    <p className="text-lg font-extrabold text-slate-900 mt-1 font-mono">${totalSpent.toLocaleString()}</p>
                    <span className="text-[10px] text-slate-500 mt-0.5 block">
                      {(project.expenses || []).filter(e => e.status === 'Active').length} active disbursements
                    </span>
                  </div>

                  <div className={`p-3.5 rounded-lg border ${
                    totalRemaining < 0
                      ? 'bg-rose-50/80 border-rose-200'
                      : 'bg-emerald-50/80 border-emerald-200'
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className={`text-[10px] font-bold uppercase tracking-wider ${
                        totalRemaining < 0 ? 'text-rose-700' : 'text-emerald-700'
                      }`}>
                        {totalRemaining < 0 ? 'Budget Overrun' : 'Uncommitted Balance'}
                      </span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                        totalRemaining < 0 ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {totalAllocated > 0 ? `${Math.round((totalRemaining / totalAllocated) * 100)}%` : '0%'}
                      </span>
                    </div>
                    <p className={`text-lg font-extrabold mt-1 font-mono ${
                      totalRemaining < 0 ? 'text-rose-700' : 'text-emerald-800'
                    }`}>
                      ${Math.abs(totalRemaining).toLocaleString()}
                    </p>
                    <span className={`text-[10px] mt-0.5 block ${
                      totalRemaining < 0 ? 'text-rose-600' : 'text-emerald-600'
                    }`}>
                      {totalRemaining < 0 ? 'Exceeds authorized ceiling' : 'Available for deployment'}
                    </span>
                  </div>

                  <div className="bg-slate-50/90 p-3.5 rounded-lg border border-slate-200">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Spend vs Milestone</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                        isOverBudget ? 'bg-rose-100 text-rose-800' :
                        isHighBurn ? 'bg-amber-100 text-amber-900' :
                        'bg-emerald-100 text-emerald-800'
                      }`}>
                        {isOverBudget ? 'Over Budget' : isHighBurn ? 'High Burn' : 'Healthy Burn'}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-1.5 mt-1">
                      <span className="text-lg font-extrabold text-slate-900 font-mono">{overallSpentPercent}%</span>
                      <span className="text-[10px] text-slate-500">expended vs {progress}% delivered</span>
                    </div>
                    {/* Burn vs Delivery visual micro-bar */}
                    <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden mt-1.5">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          isOverBudget ? 'bg-rose-600' : isHighBurn ? 'bg-amber-500' : 'bg-[#00ad1d]'
                        }`}
                        style={{ width: `${Math.min(overallSpentPercent, 100)}%` }}
                      ></div>
                    </div>
                  </div>
                </div>

                {/* 2. Actions Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-white border border-slate-200 rounded-lg shadow-2xs">
                  <div>
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Budget & Financial Control
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      General ledger reconciliation and project-level expenditure tracking
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={handleExportProjectLedger}
                      className="px-2.5 py-1.5 bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200 rounded-md text-xs font-semibold flex items-center gap-1.5 transition"
                      title="Download CSV audit ledger"
                    >
                      <Download className="w-3.5 h-3.5 text-slate-500" />
                      <span>Export Ledger (.CSV)</span>
                    </button>

                    {canEdit && (
                      <button
                        type="button"
                        onClick={handleOpenBudgetModal}
                        className="px-3 py-1.5 bg-slate-100 text-slate-800 hover:bg-slate-200 border border-slate-300 rounded-md text-xs font-semibold transition flex items-center gap-1.5"
                      >
                        <Pencil className="w-3 h-3 text-slate-600" />
                        <span>Manage Allocations</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        if (budgetBreakdown.length > 0) {
                          setExpenseCategoryId(budgetBreakdown[0].id || '');
                          setExpenseCategory(budgetBreakdown[0].category);
                        } else {
                          setExpenseCategoryId('');
                          setExpenseCategory('');
                        }
                        setShowExpenseModal(true);
                      }}
                      className="px-3.5 py-1.5 bg-[#00ad1d] text-white hover:bg-[#009217] rounded-md text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
                    >
                      <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>Record Expense</span>
                    </button>
                  </div>
                </div>

                {/* 3. Cost Allocation Breakdown Table */}
                <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-2xs">
                  <div className="px-4 py-3 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-slate-800">Departmental Cost Categories</span>
                      <span className="text-[11px] text-slate-500 block">
                        Cost center allocations and real-time reconciled disbursements
                      </span>
                    </div>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={handleOpenBudgetModal}
                        className="text-xs text-[#00ad1d] hover:underline font-semibold flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add / Edit Categories</span>
                      </button>
                    )}
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold">
                        <tr>
                          <th className="py-2.5 px-4">Category</th>
                          <th className="py-2.5 px-4 text-right">Allocated</th>
                          <th className="py-2.5 px-4 text-right">Expended</th>
                          <th className="py-2.5 px-4 text-right">Remaining</th>
                          <th className="py-2.5 px-4 min-w-[150px]">Spend Utilization</th>
                          <th className="py-2.5 px-4 text-center">Status</th>
                          <th className="py-2.5 px-4 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {budgetBreakdown.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="py-8 text-center text-slate-400">
                              <p className="font-semibold text-slate-600">No budget categories defined yet.</p>
                              <button
                                type="button"
                                onClick={handleOpenBudgetModal}
                                className="mt-2 text-xs font-bold text-[#00ad1d] hover:underline inline-flex items-center gap-1"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>Set up budget categories now</span>
                              </button>
                            </td>
                          </tr>
                        ) : (
                          budgetBreakdown.map((row, idx) => {
                            const rowAlloc = Number(row.allocated) || 0;
                            const rowSpent = getCategorySpent(row);
                            const rowRem = rowAlloc - rowSpent;
                            const rowPct = rowAlloc > 0 ? Math.round((rowSpent / rowAlloc) * 100) : (rowSpent > 0 ? 100 : 0);
                            const isOver = rowSpent > rowAlloc;
                            const isHigh = !isOver && rowPct >= 80;

                            return (
                              <tr key={idx} className="hover:bg-slate-50/60 transition">
                                <td className="py-3 px-4">
                                  <span className="font-bold text-slate-800">{row.category}</span>
                                </td>
                                <td className="py-3 px-4 text-right font-medium text-slate-700 font-mono">
                                  ${rowAlloc.toLocaleString()}
                                </td>
                                <td className={`py-3 px-4 text-right font-mono font-bold ${
                                  isOver ? 'text-rose-600' : isHigh ? 'text-amber-700' : 'text-slate-900'
                                }`}>
                                  ${rowSpent.toLocaleString()}
                                </td>
                                <td className={`py-3 px-4 text-right font-mono font-semibold ${
                                  rowRem < 0 ? 'text-rose-600 font-bold' : 'text-slate-600'
                                }`}>
                                  {rowRem < 0 ? `-$${Math.abs(rowRem).toLocaleString()}` : `$${rowRem.toLocaleString()}`}
                                </td>
                                <td className="py-3 px-4">
                                  <div className="flex items-center gap-2">
                                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                      <div
                                        className={`h-full transition-all duration-300 ${
                                          isOver ? 'bg-rose-600' :
                                          isHigh ? 'bg-amber-500' : 'bg-[#00ad1d]'
                                        }`}
                                        style={{ width: `${Math.min(rowPct, 100)}%` }}
                                      ></div>
                                    </div>
                                    <span className="text-[10px] font-bold text-slate-600 w-9 text-right font-mono">
                                      {rowPct}%
                                    </span>
                                  </div>
                                </td>
                                <td className="py-3 px-4 text-center">
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                                    isOver ? 'bg-rose-50 text-rose-800 border-rose-200' :
                                    isHigh ? 'bg-amber-50 text-amber-800 border-amber-200' :
                                    'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  }`}>
                                    {isOver ? 'Over Limit' : isHigh ? 'Near Ceiling' : 'Healthy'}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-right">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setExpenseCategoryId(row.id || '');
                                      setExpenseCategory(row.category);
                                      setShowExpenseModal(true);
                                    }}
                                    className="text-[11px] font-semibold text-[#00ad1d] hover:text-[#008f18] hover:bg-emerald-50 px-2 py-1 rounded transition inline-flex items-center gap-1"
                                    title={`Log an expense in ${row.category}`}
                                  >
                                    <Plus className="w-3 h-3" />
                                    <span>Expense</span>
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                      {budgetBreakdown.length > 0 && (
                        <tfoot className="bg-slate-50/90 font-bold border-t border-slate-200 text-slate-900">
                          <tr>
                            <td className="py-2.5 px-4 font-extrabold">Total Portfolio Envelope</td>
                            <td className="py-2.5 px-4 text-right font-mono">${totalAllocated.toLocaleString()}</td>
                            <td className="py-2.5 px-4 text-right font-mono text-emerald-800">${totalSpent.toLocaleString()}</td>
                            <td className={`py-2.5 px-4 text-right font-mono ${totalRemaining < 0 ? 'text-rose-600' : ''}`}>
                              {totalRemaining < 0 ? `-$${Math.abs(totalRemaining).toLocaleString()}` : `$${totalRemaining.toLocaleString()}`}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono text-xs">{overallSpentPercent}% overall</td>
                            <td colSpan={2}></td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>

                {/* 4. Expense History & Audit Trail Ledger */}
                <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-2xs">
                  <div className="px-4 py-3 bg-slate-50/80 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-800">Expense Ledger & Transaction Audit</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                          {filteredExpenses.length} records
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Individual vouchers, invoices, and payments charged to this initiative
                      </p>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          if (budgetBreakdown.length > 0) {
                            setExpenseCategoryId(budgetBreakdown[0].id || '');
                            setExpenseCategory(budgetBreakdown[0].category);
                          } else {
                            setExpenseCategoryId('');
                            setExpenseCategory('');
                          }
                          setShowExpenseModal(true);
                        }}
                        className="bg-[#00ad1d] text-white px-3 py-1.5 rounded font-semibold text-xs hover:bg-[#008f18] transition flex items-center gap-1.5"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add Expense
                      </button>

                      <div className="relative">
                        <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Search expense..."
                          value={expenseSearch}
                          onChange={(e) => setExpenseSearch(e.target.value)}
                          className="pl-7 pr-2.5 py-1 text-xs rounded border border-slate-200 bg-white w-36 focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
                        />
                      </div>

                      <select
                        value={expenseCatFilter}
                        onChange={(e) => setExpenseCatFilter(e.target.value)}
                        className="py-1 px-2 rounded border border-slate-200 bg-white text-xs text-slate-700"
                      >
                        <option value="All">All Categories</option>
                        {budgetBreakdown.map((b, i) => (
                          <option key={i} value={b.category}>{b.category}</option>
                        ))}
                      </select>

                      <select
                        value={expenseStatusFilter}
                        onChange={(e) => setExpenseStatusFilter(e.target.value as any)}
                        className="py-1 px-2 rounded border border-slate-200 bg-white text-xs text-slate-700"
                      >
                        <option value="All">All Statuses</option>
                        <option value="Active">Active</option>
                        <option value="Voided">Voided</option>
                      </select>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold">
                        <tr>
                          <th className="py-2.5 px-4">Date</th>
                          <th className="py-2.5 px-4">Title / Vendor</th>
                          <th className="py-2.5 px-4">Category</th>
                          <th className="py-2.5 px-4">Payment Method</th>
                          <th className="py-2.5 px-4 text-right">Amount</th>
                          <th className="py-2.5 px-4 text-center">Status</th>
                          <th className="py-2.5 px-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredExpenses.length > 0 ? (
                          filteredExpenses.map((ex: ProjectExpense) => (
                            <tr
                              key={ex.id}
                              className={`hover:bg-slate-50/60 transition ${
                                ex.status === 'Voided' ? 'opacity-60 bg-slate-50/80 line-through-text' : ''
                              }`}
                            >
                              <td className="py-3 px-4 font-medium text-slate-600 whitespace-nowrap">
                                {ex.expenseDate}
                              </td>
                              <td className="py-3 px-4 font-semibold text-slate-800">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span>{ex.title}</span>
                                  {ex.receiptUrl && (() => {
                                    try {
                                      const parsed = JSON.parse(ex.receiptUrl);
                                      if (Array.isArray(parsed)) {
                                        return (
                                          <div className="flex items-center gap-1 flex-wrap mt-0.5">
                                            {parsed.map((doc: any, dIdx: number) => (
                                              <button
                                                key={dIdx}
                                                type="button"
                                                onClick={() => handleOpenReceiptDoc(doc.url, doc.name)}
                                                className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 cursor-pointer"
                                                title={`Open document: ${doc.name}`}
                                              >
                                                <FileText className="w-2.5 h-2.5" />
                                                <span className="truncate max-w-[100px]">{doc.name}</span>
                                                <ExternalLink className="w-2.5 h-2.5" />
                                              </button>
                                            ))}
                                          </div>
                                        );
                                      }
                                    } catch {
                                      // fallback
                                    }
                                    return (
                                      <button
                                        type="button"
                                        onClick={() => handleOpenReceiptDoc(ex.receiptUrl, ex.title)}
                                        className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 cursor-pointer"
                                        title="Open Receipt / Invoice Document"
                                      >
                                        <span>Receipt</span>
                                        <ExternalLink className="w-2.5 h-2.5" />
                                      </button>
                                    );
                                  })()}
                                </div>
                                {ex.createdBy && (
                                  <span className="text-[10px] text-slate-400 font-normal block mt-0.5">
                                    Logged by {ex.createdBy}
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-slate-700">
                                <span className="px-2 py-0.5 bg-slate-100 rounded text-[11px] font-medium text-slate-700">
                                  {ex.category}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-slate-600">{ex.paymentMethod}</td>
                              <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                                ${ex.amount.toLocaleString()}
                              </td>
                              <td className="py-3 px-4 text-center">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                    ex.status === 'Active'
                                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                      : 'bg-rose-50 text-rose-800 border-rose-200'
                                  }`}
                                >
                                  {ex.status}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-right">
                                {canEdit && (
                                  <div className="flex items-center justify-end gap-1.5">
                                    {ex.status === 'Active' && (
                                      <button
                                        type="button"
                                        onClick={() => handleVoidExpense(ex.id, ex.title)}
                                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 px-2 py-0.5 rounded border border-amber-200 transition cursor-pointer"
                                        title="Void this expense (subtracts from totals and keeps record in audit ledger)"
                                      >
                                        <Ban className="w-3 h-3 text-amber-600" />
                                        <span>Void</span>
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteExpense(ex.id, ex.title)}
                                      className="text-slate-400 hover:text-rose-600 p-1 hover:bg-rose-50 rounded transition cursor-pointer"
                                      title="Permanently delete expense record"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={7} className="py-8 text-center text-slate-400">
                              <p className="font-semibold text-slate-600">No recorded expenses found.</p>
                              <p className="text-[11px] text-slate-400 mt-1">
                                Click "Record Expense" to document invoices, procurement vouchers, or operational costs.
                              </p>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {canEdit && (
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-500 flex items-center justify-between">
                    <span>Authorized project leadership can adjust budget allocations or record vouchers at any time.</span>
                    <button
                      type="button"
                      onClick={() => setIsEditing(true)}
                      className="text-[#00ad1d] font-bold hover:underline"
                    >
                      Edit Project Identity
                    </button>
                  </div>
                )}
              </div>
            );
          })()}

          {/* TAB 3: LINKED TASKS */}
          {activeTab === 'tasks' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Initiative Execution Tasks
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    {linkedTasks.length} linked tasks · {overdueLinkedTasks.length} overdue
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setIsAddingTask(!isAddingTask)}
                  className="px-3 py-1.5 bg-[#00ad1d] hover:bg-[#009218] text-white rounded-md text-xs font-semibold flex items-center gap-1.5 transition shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create Linked Task</span>
                </button>
              </div>

              {isAddingTask && (
                <form onSubmit={handleCreateTask} className="p-3.5 bg-slate-50 border border-slate-200 rounded-md text-xs space-y-3 animate-in fade-in">
                  <div className="font-bold text-slate-800">Add Task to {project.name}</div>
                  <input
                    type="text"
                    required
                    placeholder="Task title (e.g. Conduct second water salinity sample test)..."
                    value={newTaskTitle}
                    onChange={e => setNewTaskTitle(e.target.value)}
                    className="w-full px-3 py-1.5 rounded border border-slate-200 bg-white"
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                      <label className="text-[10px] text-slate-500 block mb-1">Assignee</label>
                      <select
                        value={newTaskAssignee}
                        onChange={e => setNewTaskAssignee(e.target.value)}
                        className="w-full px-2 py-1.5 rounded border border-slate-200 bg-white text-xs"
                      >
                        {staff.map(s => (
                          <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500 block mb-1">Due Date</label>
                      <input
                        type="date"
                        value={newTaskDueDate}
                        onChange={e => setNewTaskDueDate(e.target.value)}
                        className="w-full px-2 py-1.5 rounded border border-slate-200 bg-white text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500 block mb-1">Priority</label>
                      <select
                        value={newTaskPriority}
                        onChange={e => setNewTaskPriority(e.target.value as any)}
                        className="w-full px-2 py-1.5 rounded border border-slate-200 bg-white text-xs font-semibold"
                      >
                        <option value="Urgent">Urgent</option>
                        <option value="High">High</option>
                        <option value="Medium">Medium</option>
                        <option value="Low">Low</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsAddingTask(false)}
                      className="px-2.5 py-1 text-slate-500 font-semibold"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-3.5 py-1 bg-[#00ad1d] text-white font-semibold rounded"
                    >
                      Create Task
                    </button>
                  </div>
                </form>
              )}

              <div className="space-y-2">
                {linkedTasks.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-xs bg-slate-50 rounded-md border border-dashed border-slate-200">
                    No linked tasks yet for this project. Click "Create Linked Task" above to assign work.
                  </div>
                ) : (
                  linkedTasks.map(task => {
                    const isOverdue = task.status !== 'Done' && task.dueDate && new Date(task.dueDate) < new Date();
                    return (
                      <div
                        key={task.id}
                        className="p-3 bg-white rounded-md border border-slate-200 hover:border-slate-300 transition flex items-center justify-between gap-3 shadow-2xs"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await actions.updateTaskStatus(task.id, task.status === 'Done' ? 'To Do' : 'Done');
                              } catch (err: any) {
                                alert(`Could not update task: ${err?.message || 'Permission denied or network error'}`);
                              }
                            }}
                            className="text-slate-400 hover:text-emerald-600 transition shrink-0"
                          >
                            {task.status === 'Done' ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 fill-emerald-50" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-300" />
                            )}
                          </button>
                          
                          <div className="min-w-0">
                            <p className={`text-xs font-semibold truncate ${task.status === 'Done' ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                              {task.title}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400">
                              <span className="flex items-center gap-1">
                                <span className={`w-1.5 h-1.5 rounded-full ${
                                  task.status === 'Done' ? 'bg-emerald-500' :
                                  task.status === 'In Progress' ? 'bg-blue-500' :
                                  task.status === 'In Review' ? 'bg-purple-500' : 'bg-slate-400'
                                }`}></span>
                                <span>{task.status}</span>
                              </span>
                              <span>·</span>
                              <span className={isOverdue ? 'text-rose-600 font-bold' : ''}>
                                Due {task.dueDate} {isOverdue && '(Overdue)'}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${
                            task.priority === 'Urgent' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                            task.priority === 'High' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                            'bg-slate-100 text-slate-600 border-slate-200'
                          }`}>
                            {task.priority}
                          </span>

                          <div className="flex items-center gap-1.5">
                            <UserAvatar
                              avatar={task.assignedToAvatar}
                              name={task.assignedToName}
                              className="w-5 h-5 border border-slate-200"
                            />
                            <span className="text-[11px] font-medium text-slate-700 hidden sm:inline">
                              {task.assignedToName.split(' ')[0]}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {activeTab === 'members' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Project Team Members</h3>
                  <p className="text-[11px] text-slate-500">Personnel assigned to this project workspace</p>
                </div>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => setShowAddMemberModal(true)}
                    className="px-3 py-1.5 bg-[#00ad1d] text-white rounded-md text-xs font-semibold hover:bg-[#009217] transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Member</span>
                  </button>
                )}
              </div>

              {(project.members || []).length > 0 ? (
                <div className="bg-white rounded-md border border-slate-200 divide-y divide-slate-100">
                  {(project.members || []).map(member => (
                    <div key={member.id} className="p-3 flex items-center justify-between hover:bg-slate-50/60 transition">
                      <div className="flex items-center gap-3">
                        <UserAvatar name={member.name} avatar={member.avatar} className="w-8 h-8" />
                        <div>
                          <p className="text-xs font-bold text-slate-800">{member.name}</p>
                          <p className="text-[10px] text-slate-500">{member.role || 'Team Member'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] text-slate-400">{member.email}</span>
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => handleRemoveMember(member.id, member.name)}
                            className="text-slate-400 hover:text-rose-600 p-1 hover:bg-rose-50 rounded transition cursor-pointer"
                            title={`Remove ${member.name} from project`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center bg-slate-50/80 rounded-lg border border-dashed border-slate-300">
                  <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-slate-700">No project members assigned yet</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Assign staff colleagues to collaborate on this initiative.
                  </p>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setShowAddMemberModal(true)}
                      className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#00ad1d] text-white rounded text-xs font-semibold hover:bg-[#009218] transition shadow-xs cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add First Member</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: ACTIVITY / UPDATE LOG */}
          {activeTab === 'log' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Audit Trail & Field Progress Updates
                </h4>
                <span className="text-[11px] text-slate-500">Chronological activity feed</span>
              </div>

              <form onSubmit={handlePostLog} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Record an operational update (e.g. Received shipment of 8 solar inverters)..."
                  value={newLogInput}
                  onChange={e => setNewLogInput(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-md border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
                />
                <button
                  type="submit"
                  disabled={!newLogInput.trim()}
                  className="px-4 py-2 bg-[#00ad1d] hover:bg-[#009218] disabled:opacity-50 text-white rounded-md text-xs font-semibold flex items-center gap-1.5 transition"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Post Update</span>
                </button>
              </form>

              {/* Vertical Timeline */}
              <div className="relative pl-6 space-y-4 pt-2">
                <div className="absolute top-2 bottom-2 left-2.5 w-0.5 bg-slate-200"></div>

                {activityLog.length === 0 ? (
                  <p className="text-xs text-slate-400 py-4">No logged updates yet for this project.</p>
                ) : (
                  activityLog.map((log) => (
                    <div key={log.id} className="relative flex items-start gap-3 text-xs">
                      <div className="absolute -left-6 top-1 w-5 h-5 rounded-full bg-white border-2 border-[#00ad1d] flex items-center justify-center">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#00ad1d]"></div>
                      </div>
                      <div className="bg-slate-50 border border-slate-100 rounded-md p-3 flex-1 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900">{log.userName}</span>
                          <span className="text-[10px] text-slate-400">{log.timestamp}</span>
                        </div>
                        <p className="text-slate-700 leading-relaxed">{log.action}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* EDIT PROJECT SECTIONS (Displayed at the bottom of the modal as requested) */}
          {isEditing && (
            <div id="project-edit-section" className="pt-6 border-t-2 border-slate-200 mt-6 animate-in fade-in">
              <form onSubmit={handleSave} className="p-4 sm:p-5 bg-slate-50 rounded-lg border border-slate-200 space-y-4 shadow-2xs">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <Pencil className="w-4 h-4 text-[#00ad1d]" />
                    <span className="font-bold text-xs sm:text-sm text-slate-800">Edit Project Initiative Details</span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-medium">Authorized leadership view</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Project Name *</label>
                    <input
                      type="text"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      required
                      className="w-full px-3 py-1.5 rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Project Code</label>
                    <input
                      type="text"
                      value={code}
                      onChange={e => setCode(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-md border border-slate-200 bg-white font-mono focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
                    />
                  </div>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1 text-xs">Description</label>
                  <textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-1.5 rounded-md border border-slate-200 bg-white text-xs focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
                  />
                </div>

                {/* Status with mandatory reason */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Department</label>
                    <select
                      value={department}
                      onChange={e => setDepartment(e.target.value as any)}
                      className="w-full px-3 py-1.5 rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
                    >
                      {availableDepartments.map(dept => (
                        <option key={dept} value={dept}>
                          {dept}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Status</label>
                    <select
                      value={status}
                      onChange={e => setStatus(e.target.value as any)}
                      className="w-full px-3 py-1.5 rounded-md border border-slate-200 bg-white font-bold focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
                    >
                      <option value="Active">Active</option>
                      <option value="On Track">On Track</option>
                      <option value="At Risk">At Risk</option>
                      <option value="Delayed">Delayed</option>
                      <option value="Completed">Completed</option>
                    </select>
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Progress: {progress}%</label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={progress}
                      onChange={e => setProgress(Number(e.target.value))}
                      className="w-full mt-2 accent-[#00ad1d]"
                    />
                  </div>
                </div>

                {/* Mandatory status reason if At Risk or Delayed */}
                {(status === 'At Risk' || status === 'Delayed') && (
                  <div className="bg-amber-50 p-3 rounded-md border border-amber-200 text-xs animate-in fade-in">
                    <label className="font-bold text-amber-900 block mb-1 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                      <span>Reason for {status} Status * (Required before saving)</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Provide specific reason for delay or risk..."
                      value={statusReason}
                      onChange={e => setStatusReason(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-md border border-amber-300 bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Start Date</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={e => setStartDate(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-md border border-slate-200 bg-white"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Target Date</label>
                    <input
                      type="date"
                      value={targetDate}
                      onChange={e => setTargetDate(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-md border border-slate-200 bg-white"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-200 rounded-md font-semibold transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 text-xs bg-[#00ad1d] hover:bg-[#009218] text-white rounded-md font-semibold flex items-center gap-1.5 shadow-2xs transition"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Save Changes</span>
                  </button>
                </div>
              </form>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50/80 flex items-center justify-between shrink-0 text-xs">
          <div className="flex items-center gap-2 text-slate-500">
            <span>Project Lead: <strong className="text-slate-800">{project.leadName || currentUser.name}</strong></span>
          </div>

          <div className="flex items-center gap-2">
            {canEdit && project.status !== 'Completed' && (
              <button
                type="button"
                onClick={handleMarkProjectAsDone}
                className="px-3 py-1.5 rounded-md text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 transition shadow-xs cursor-pointer"
                title="Mark project as Completed and set progress to 100%"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Mark as Done</span>
              </button>
            )}

            {canEdit && (
              <button
                type="button"
                onClick={handleDeleteProject}
                className="px-3 py-1.5 rounded-md text-xs font-semibold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 flex items-center gap-1.5 transition cursor-pointer"
                title="Permanently delete this project"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Project</span>
              </button>
            )}
            
            <ConfirmationModal />


            {canEdit && (
              <button
                type="button"
                onClick={() => {
                  const next = !isEditing;
                  setIsEditing(next);
                  if (next) {
                    setTimeout(() => {
                      document.getElementById('project-edit-section')?.scrollIntoView({ behavior: 'smooth' });
                    }, 100);
                  }
                }}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition ${
                  isEditing
                    ? 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                    : 'bg-[#00ad1d]/10 text-[#00ad1d] hover:bg-[#00ad1d]/20 border border-[#00ad1d]/30'
                }`}
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>{isEditing ? 'Hide Edit Section' : 'Edit Project'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold transition cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>

      {/* Record Expense Modal */}
      {showExpenseModal && (
        <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-md w-full shadow-2xl border border-slate-200 p-6 animate-in fade-in duration-150">
            <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-emerald-50 text-[#00ad1d]">
                  <DollarSign className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Record Project Expense</h3>
                  <p className="text-[10px] text-slate-500">Log voucher disbursement against project budget</p>
                </div>
              </div>
              <button onClick={() => setShowExpenseModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRecordExpense} className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Expense Title / Vendor *</label>
                <input
                  type="text"
                  required
                  value={expenseTitle}
                  onChange={(e) => setExpenseTitle(e.target.value)}
                  placeholder="e.g. Solar Pump Inverters - Dar Power Ltd"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md focus:border-[#00ad1d] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Amount ($) *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={expenseAmount}
                    onChange={(e) => setExpenseAmount(e.target.value)}
                    placeholder="1250.00"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:border-[#00ad1d] focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Expense Date *</label>
                  <input
                    type="date"
                    required
                    value={expenseDate}
                    onChange={(e) => setExpenseDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:border-[#00ad1d] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Budget Category <span className="text-rose-500">*</span>
                  </label>
                  {budgetBreakdown && budgetBreakdown.length > 0 ? (
                    <select
                      required
                      value={expenseCategoryId || expenseCategory}
                      onChange={(e) => {
                        const val = e.target.value;
                        const selected = budgetBreakdown.find(b => (b.id && b.id === val) || b.category === val);
                        if (selected) {
                          setExpenseCategoryId(selected.id || '');
                          setExpenseCategory(selected.category);
                        } else {
                          setExpenseCategoryId(val);
                          setExpenseCategory(val);
                        }
                      }}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md focus:border-[#00ad1d] focus:outline-none bg-white font-medium text-xs text-slate-800"
                    >
                      <option value="" disabled>-- Select Category --</option>
                      {budgetBreakdown.map((cat, idx) => (
                        <option key={cat.id || idx} value={cat.id || cat.category}>
                          {cat.category} (Alloc: ${(Number(cat.allocated) || 0).toLocaleString()})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="p-2 border border-amber-200 bg-amber-50 rounded text-amber-800 text-[11px] leading-tight">
                      No categories defined yet.
                    </div>
                  )}
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Payment Method *</label>
                  <select
                    value={expensePaymentMethod}
                    onChange={(e) => setExpensePaymentMethod(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:border-[#00ad1d] focus:outline-none bg-white font-medium text-xs"
                  >
                    <option value="Corporate Card">Corporate Card</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Check">Check / Cheque</option>
                    <option value="Mobile Money / M-Pesa">Mobile Money / M-Pesa</option>
                    <option value="Petty Cash">Petty Cash</option>
                    <option value="Wire Transfer">Wire Transfer</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Upload a document, multiples allowed</label>
                <div className="flex items-center gap-2">
                  <label className="flex-1 flex items-center justify-center gap-2 px-3 py-2 border-2 border-dashed border-slate-300 hover:border-[#00ad1d] rounded-md bg-slate-50 cursor-pointer text-xs text-slate-600 hover:text-[#00ad1d] transition">
                    <Upload className="w-4 h-4" />
                    <span>Choose files...</span>
                    <input
                      type="file"
                      multiple
                      onChange={handleExpenseFileChange}
                      className="hidden"
                    />
                  </label>
                </div>
                {isUploadingExpenseFiles && (
                  <p className="text-[10px] text-[#00ad1d] mt-1 flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> Processing selected documents...
                  </p>
                )}
                {expenseFiles.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {expenseFiles.map((f, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-emerald-50/70 border border-emerald-200 px-2.5 py-1 rounded text-xs">
                        <div className="flex items-center gap-2 truncate">
                          <FileText className="w-3.5 h-3.5 text-[#00ad1d] shrink-0" />
                          <span className="font-medium text-slate-800 truncate">{f.name}</span>
                          <span className="text-[10px] text-slate-400">({f.size})</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveExpenseFile(idx)}
                          className="text-slate-400 hover:text-rose-600 p-0.5"
                          title="Remove file"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Upload PDF, invoices, receipts, or contracts (multiple files allowed)
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowExpenseModal(false)}
                  className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-md text-xs font-semibold hover:bg-slate-200 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingExpense}
                  className="px-3.5 py-1.5 bg-[#00ad1d] text-white rounded-md text-xs font-semibold hover:bg-[#009218] transition flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
                >
                  {isSubmittingExpense && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Save Expense</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Real Full-Featured Manage Project Budget Modal */}
      {showBudgetModal && (() => {
        const modalOverallNum = Number(overallBudgetInput) || 0;
        const modalCatSum = editingCategories.reduce((sum, c) => sum + (Number(c.allocated) || 0), 0);
        const effectiveTotalAllocated = modalOverallNum > 0 ? modalOverallNum : modalCatSum;
        const activeVouchers = (project.expenses || []).filter(e => e.status === 'Active');
        const effectiveTotalSpent = activeVouchers.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
        const effectiveRemaining = effectiveTotalAllocated - effectiveTotalSpent;

        const handleAddNewCategory = () => {
          if (!newCatName.trim()) return;
          const amt = Number(newCatAllocated) || 0;
          setEditingCategories(prev => [
            ...prev,
            { category: newCatName.trim(), allocated: amt, spent: 0 }
          ]);
          setNewCatName('');
          setNewCatAllocated('');
        };

        const handleRemoveCategoryRow = (idx: number) => {
          const cat = editingCategories[idx];
          if (cat && cat.spent > 0) {
            setConfirmDialog({
              isOpen: true,
              title: `Category "${cat.category}" has $${cat.spent.toLocaleString()} in active recorded disbursements. Removing it will reassign unlinked expenses. Proceed?`,
              onConfirm: () => {
                setConfirmDialog(null);
                setEditingCategories(prev => prev.filter((_, i) => i !== idx));
              }
            });
            return;
          }
          setEditingCategories(prev => prev.filter((_, i) => i !== idx));
        };

        const handleAllocChange = (idx: number, val: number) => {
          setEditingCategories(prev => prev.map((c, i) => i === idx ? { ...c, allocated: val } : c));
        };

        return (
          <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
            <div className="bg-white rounded-lg max-w-2xl w-full shadow-2xl border border-slate-200 flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in duration-150">
              
              {/* Header */}
              <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-[#00ad1d]/10 text-[#00ad1d]">
                    <DollarSign className="w-5 h-5 stroke-[2.5]" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Manage Project Budget & Allocations</h3>
                    <p className="text-[11px] text-slate-500">
                      Configure authorized project envelope and optional cost category limits
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowBudgetModal(false)}
                  className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
                
                {/* Summary bar */}
                <div className="grid grid-cols-3 gap-2.5 bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400">Authorized Envelope</span>
                    <p className="text-base font-extrabold text-slate-900 font-mono mt-0.5">
                      ${effectiveTotalAllocated.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400">Total Expended</span>
                    <p className="text-base font-extrabold text-slate-800 font-mono mt-0.5">
                      ${effectiveTotalSpent.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400">Remaining Buffer</span>
                    <p className={`text-base font-extrabold font-mono mt-0.5 ${effectiveRemaining < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                      ${effectiveRemaining.toLocaleString()}
                    </p>
                  </div>
                </div>

                {/* Overall Project Budget Ceiling Input */}
                <div className="bg-white p-3.5 rounded-lg border border-slate-200 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-slate-800 text-xs">
                      Overall Project Budget Ceiling ($) *
                    </label>
                    {modalCatSum > 0 && modalOverallNum > 0 && modalCatSum !== modalOverallNum && (
                      <span className={`text-[10px] font-semibold ${modalCatSum > modalOverallNum ? 'text-rose-600' : 'text-amber-700'}`}>
                        {modalCatSum > modalOverallNum
                          ? `Categories ($${modalCatSum.toLocaleString()}) exceed ceiling`
                          : `$${(modalOverallNum - modalCatSum).toLocaleString()} unassigned to categories`}
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      placeholder="e.g. 50000"
                      value={overallBudgetInput}
                      onChange={(e) => setOverallBudgetInput(e.target.value)}
                      className="w-full pl-7 pr-3 py-1.5 rounded-md border border-slate-300 bg-white font-mono font-bold text-slate-900 focus:outline-none focus:border-[#00ad1d]"
                    />
                  </div>
                  <span className="text-[10px] text-slate-500">
                    Total funding authorized for this project. Recorded vouchers will be subtracted directly from this envelope.
                  </span>
                </div>

                {/* Categories List */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                    <span className="font-bold text-slate-700 uppercase tracking-wider text-[11px]">
                      Custom Cost Categories ({editingCategories.length})
                    </span>
                    <span className="text-[10px] text-slate-400">Optional work package breakdown</span>
                  </div>

                  {editingCategories.length === 0 ? (
                    <div className="p-4 bg-slate-50 rounded-md border border-slate-200 text-center text-slate-500">
                      <p className="font-semibold text-slate-700">No custom cost categories defined.</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Recorded vouchers and expenses will be subtracted directly from the Overall Project Budget Ceiling above. You may optionally add custom cost categories below.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {editingCategories.map((c, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between gap-2 p-2.5 bg-white rounded-md border border-slate-200 hover:border-slate-300 transition"
                        >
                          <div className="flex-1 min-w-[140px]">
                            <input
                              type="text"
                              value={c.category}
                              onChange={(e) => {
                                const newName = e.target.value;
                                setEditingCategories(prev => prev.map((item, i) => i === idx ? { ...item, category: newName } : item));
                              }}
                              className="w-full px-2 py-1 font-semibold text-slate-800 rounded border border-transparent hover:border-slate-300 focus:border-[#00ad1d] focus:bg-white focus:outline-none"
                            />
                            {c.spent > 0 && (
                              <span className="text-[10px] text-slate-500 ml-2">
                                Expended: <strong className="text-slate-700 font-mono">${Number(c.spent).toLocaleString()}</strong>
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1">
                              <span className="text-slate-400 font-normal">$</span>
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={c.allocated}
                                onChange={(e) => handleAllocChange(idx, Number(e.target.value) || 0)}
                                className="w-28 px-2 py-1 text-right font-mono font-bold text-slate-800 rounded border border-slate-300 focus:border-[#00ad1d] focus:outline-none bg-white"
                              />
                            </div>

                            <button
                              type="button"
                              onClick={() => handleRemoveCategoryRow(idx)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition"
                              title="Remove category"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add New Category Form */}
                  <div className="flex items-center gap-2 pt-2 p-2.5 bg-slate-50 rounded-md border border-dashed border-slate-300">
                    <input
                      type="text"
                      placeholder="Add custom category name (e.g. Drilling, Medical Supplies)..."
                      value={newCatName}
                      onChange={(e) => setNewCatName(e.target.value)}
                      className="flex-1 px-3 py-1.5 rounded border border-slate-300 bg-white text-xs focus:outline-none focus:border-[#00ad1d]"
                    />
                    <div className="flex items-center gap-1">
                      <span className="text-slate-400">$</span>
                      <input
                        type="number"
                        placeholder="Amount"
                        min="0"
                        value={newCatAllocated}
                        onChange={(e) => setNewCatAllocated(e.target.value)}
                        className="w-24 px-2 py-1.5 rounded border border-slate-300 bg-white text-xs font-mono"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleAddNewCategory}
                      disabled={!newCatName.trim()}
                      className="px-3 py-1.5 bg-[#00ad1d] hover:bg-[#009218] text-white rounded font-semibold text-xs transition disabled:opacity-50 shrink-0 flex items-center gap-1 shadow-2xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Category</span>
                    </button>
                  </div>
                </div>

              </div>

              {/* Footer with compact inline action buttons */}
              <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/80 flex items-center justify-between shrink-0">
                <span className="text-xs text-slate-500">
                  Total Allocated: <strong className="text-slate-900 font-mono">${effectiveTotalAllocated.toLocaleString()}</strong>
                </span>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowBudgetModal(false)}
                    className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-md text-xs font-semibold hover:bg-slate-200 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveBudgetBreakdown}
                    disabled={isSavingBudget}
                    className="px-3.5 py-1.5 bg-[#00ad1d] hover:bg-[#009218] text-white rounded-md text-xs font-semibold transition flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
                  >
                    {isSavingBudget && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <Save className="w-3.5 h-3.5" />
                    <span>Save Budget Allocations</span>
                  </button>
                </div>
              </div>

            </div>
          </div>
        );
      })()}

      {/* In-App Document Preview Modal */}
      {previewDoc && (
        <div className="fixed inset-0 z-70 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-3xl w-full shadow-2xl border border-slate-200 flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in duration-150">
            <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5 truncate">
                <FileText className="w-5 h-5 text-[#00ad1d]" />
                <h3 className="text-sm font-bold text-slate-900 truncate">{previewDoc.name}</h3>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={previewDoc.url}
                  download={previewDoc.name || 'document'}
                  className="px-3 py-1.5 bg-[#00ad1d] text-white rounded text-xs font-semibold hover:bg-[#009218] transition flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewDoc(null)}
                  className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 bg-slate-100 p-4 overflow-y-auto flex items-center justify-center min-h-[400px]">
              {previewDoc.url.startsWith('data:image/') ? (
                <img src={previewDoc.url} alt={previewDoc.name} className="max-w-full max-h-[70vh] object-contain rounded shadow" />
              ) : (
                <iframe
                  src={previewDoc.url}
                  title={previewDoc.name}
                  className="w-full h-[70vh] bg-white rounded border border-slate-300"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Project Member Modal */}
      {showAddMemberModal && (
        <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
              <div className="flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-[#00ad1d]" />
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Add Team Member</h3>
              </div>
              <button
                type="button"
                onClick={() => { setShowAddMemberModal(false); setMemberSearchQuery(''); }}
                className="text-slate-400 hover:text-slate-700 p-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search staff by name or email..."
                  value={memberSearchQuery}
                  onChange={(e) => setMemberSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded border border-slate-200 focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
                  autoFocus
                />
              </div>

              <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-md">
                {(() => {
                  const existingMemberIds = new Set((project.members || []).map(m => m.id));
                  const availableStaff = (staff || []).filter(s => {
                    if (existingMemberIds.has(s.id)) return false;
                    if (!memberSearchQuery.trim()) return true;
                    const q = memberSearchQuery.toLowerCase();
                    return (
                      s.name.toLowerCase().includes(q) ||
                      s.email.toLowerCase().includes(q) ||
                      (s.role && s.role.toLowerCase().includes(q)) ||
                      (s.department && s.department.toLowerCase().includes(q))
                    );
                  });

                  if (availableStaff.length === 0) {
                    return (
                      <p className="p-4 text-center text-xs text-slate-400">
                        {memberSearchQuery.trim() ? 'No matching staff members found.' : 'All staff are already assigned to this project.'}
                      </p>
                    );
                  }

                  return availableStaff.map((s) => (
                    <div
                      key={s.id}
                      className="p-2.5 flex items-center justify-between hover:bg-emerald-50/60 transition group"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <UserAvatar name={s.name} avatar={s.avatar} className="w-7 h-7 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-800 truncate">{s.name}</p>
                          <p className="text-[10px] text-slate-500 truncate">{s.role} • {s.department}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleAddMember(s.id, s.name)}
                        className="px-2.5 py-1 bg-[#00ad1d] hover:bg-[#009218] text-white rounded text-[11px] font-semibold transition shrink-0 shadow-2xs cursor-pointer"
                      >
                        Add
                      </button>
                    </div>
                  ));
                })()}
              </div>
            </div>

            <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => { setShowAddMemberModal(false); setMemberSearchQuery(''); }}
                className="px-3 py-1 bg-slate-200 text-slate-700 hover:bg-slate-300 rounded text-xs font-medium transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}


      </div>
    </div>
  );
};
