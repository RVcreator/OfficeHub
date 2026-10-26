import React, { useState, useEffect, useRef, useMemo } from 'react';
import { UserAvatar } from './UserAvatar';
import {
  X,
  Plus,
  Trash2,
  Upload,
  Calendar,
  DollarSign,
  Users,
  Building2,
  MapPin,
  CheckCircle2,
  Sparkles,
  ExternalLink,
  Save,
  FolderGit2,
  Paperclip,
  FileText,
  Loader2,
  UserPlus
} from 'lucide-react';
import { Department, Project, Milestone, BudgetCategory, MessageAttachment } from '../types';
import { usePortalStore } from '../services/store';
import { getStaffHierarchy, formatStaffDisplayName, formatStaffDisplayOrgDept } from '../utils/staffHierarchy';
import { parseUploadedFile } from '../utils/fileParser';
import { StaffPickerTree } from './StaffPickerTree';

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProjectCreated?: (newProject: Project) => void;
}

export const CreateProjectModal: React.FC<CreateProjectModalProps> = ({
  isOpen,
  onClose,
  onProjectCreated,
}) => {
  const { actions, currentUser, staff, projects, departments } = usePortalStore();

  const availableDepartments = useMemo(() => {
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

  // Basic Details
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [department, setDepartment] = useState<Department>(() => {
    return currentUser.department && !currentUser.department.toLowerCase().includes('relief')
      ? currentUser.department
      : 'Top management';
  });
  const [leadId, setLeadId] = useState(currentUser.id);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [showMemberTree, setShowMemberTree] = useState(false);
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [targetDate, setTargetDate] = useState('');

  // Initial Phases / Milestones
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [newPhaseName, setNewPhaseName] = useState('');
  const [newPhaseDueDate, setNewPhaseDueDate] = useState('');

  // Budget
  const [categories, setCategories] = useState<{ category: string; allocated: number }[]>([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryAmount, setNewCategoryAmount] = useState<number | ''>('');

  // Attachments
  const [attachments, setAttachments] = useState<MessageAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  // Reset all fields whenever the modal opens (Clean without mock data pre-fill)
  useEffect(() => {
    if (isOpen) {
      const today = new Date();
      const target = new Date();
      target.setMonth(today.getMonth() + 4);

      const todayStr = today.toISOString().split('T')[0];
      const targetStr = target.toISOString().split('T')[0];

      // Generate a fresh project code
      const nextNum = projects.length + 1;
      const genCode = `WIP-${today.getFullYear()}-${nextNum < 10 ? '0' + nextNum : nextNum}`;

      const initialDept = currentUser.department && !currentUser.department.toLowerCase().includes('relief') && availableDepartments.includes(currentUser.department)
        ? currentUser.department
        : (availableDepartments[0] || 'Top management');

      setName('');
      setCode(genCode);
      setDepartment(initialDept);
      setLeadId(currentUser.id);
      setMemberIds([currentUser.id]);
      setShowMemberTree(false);
      setDescription('');
      setStartDate(todayStr);
      setTargetDate(targetStr);
      setMilestones([]);
      setCategories([]);
      setAttachments([]);
      setNewPhaseName('');
      setNewPhaseDueDate('');
      setNewCategoryName('');
      setNewCategoryAmount('');
    }
  }, [isOpen, currentUser.id, currentUser.department, availableDepartments, projects.length]);

  if (!isOpen) return null;

  const totalAllocated = categories.reduce((sum, c) => sum + (Number(c.allocated) || 0), 0);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setIsUploading(true);
    try {
      const files = Array.from(e.target.files);
      const parsedList: MessageAttachment[] = [];
      const projectCode = code || 'WIP-PROJECT';
      for (const file of files) {
        const att = await parseUploadedFile(file);
        // Sync document to SharePoint URL
        att.url = `https://wipahs.sharepoint.com/sites/projects/${projectCode}/${encodeURIComponent(file.name)}`;
        parsedList.push(att);
      }
      setAttachments(prev => [...prev, ...parsedList]);
    } catch (err) {
      console.error('Error attaching project document:', err);
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  };

  const handleAddPhase = () => {
    if (!newPhaseName.trim()) return;
    const newPhase: Milestone = {
      id: `m-${Date.now()}`,
      name: newPhaseName.trim(),
      status: 'Upcoming',
      dueDate: newPhaseDueDate || targetDate || new Date().toISOString().split('T')[0],
      progress: 0,
    };
    setMilestones([...milestones, newPhase]);
    setNewPhaseName('');
    setNewPhaseDueDate('');
  };

  const handleRemovePhase = (id: string) => {
    setMilestones(milestones.filter(m => m.id !== id));
  };

  const handleAddCategory = () => {
    if (!newCategoryName.trim() || !newCategoryAmount) return;
    setCategories([
      ...categories,
      { category: newCategoryName.trim(), allocated: Number(newCategoryAmount) }
    ]);
    setNewCategoryName('');
    setNewCategoryAmount('');
  };

  const handleRemoveCategory = (index: number) => {
    setCategories(categories.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      return;
    }

    const budgetBreakdown: BudgetCategory[] = categories.map(c => ({
      category: c.category,
      allocated: Number(c.allocated) || 0,
      spent: 0,
    }));

    const formattedBudget = `$${totalAllocated.toLocaleString()}`;
    const selectedLead = staff.find(s => s.id === leadId) || currentUser;

    const allMemberIds = Array.from(new Set([...(selectedLead?.id ? [selectedLead.id] : []), ...memberIds]));
    const memberObjects = allMemberIds.map(id => {
      const p = staff.find(s => s.id === id);
      return {
        id,
        name: p?.name || 'Staff Member',
        role: p?.role || 'Team Member',
        avatar: p?.avatar,
        email: p?.email
      };
    });

    const newProject = await actions.addProject({
      name: name.trim(),
      code: code.trim() || `WIP-${Date.now().toString().slice(-4)}`,
      description: description.trim() || 'Strategic community welfare and infrastructure development initiative.',
      department,
      leadId: selectedLead.id,
      leadName: selectedLead.name,
      leadRole: selectedLead.role,
      leadAvatar: selectedLead.avatar,
      status: 'Active',
      progress: 0,
      budget: formattedBudget,
      spent: '$0',
      startDate: startDate || new Date().toISOString().split('T')[0],
      targetDate: targetDate || new Date().toISOString().split('T')[0],
      membersCount: allMemberIds.length,
      memberIds: allMemberIds,
      members: memberObjects,
      sharePointFolderUrl: `https://wipahs.sharepoint.com/sites/projects/${code}`,
      milestones,
      budgetBreakdown,
      impactMetrics: [],
      attachments,
      notes: [],
    } as any);

    if (newProject) {
      actions.addProjectActivityLog(newProject.id, `Project chartered and initiated by ${currentUser.name}`);
      if (onProjectCreated) {
        onProjectCreated(newProject);
      }
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-lg max-w-3xl w-full shadow-2xl border border-slate-200 my-6 flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in duration-150">
        
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#00ad1d]/10 flex items-center justify-center text-[#00ad1d]">
              <Plus className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
                Create New Strategic Project
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Initiate a new departmental welfare, infrastructure, or operational initiative.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6 text-xs">
          
          {/* Section 1: Basic Information */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 pb-1.5 border-b border-slate-100">
              <span className="w-2 h-2 rounded-full bg-[#00ad1d]"></span>
              <h3 className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
                1. Project Identity & Governance
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="font-semibold text-slate-700 block mb-1">
                  Project Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Solar Clean Water Boreholes Phase V"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Project Code <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-slate-200 bg-white font-mono uppercase focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Department</label>
                <select
                  value={department}
                  onChange={e => setDepartment(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-md border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
                >
                  {availableDepartments.map(dept => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Project Lead</label>
                <select
                  value={leadId}
                  onChange={e => {
                    const newLeadId = e.target.value;
                    setLeadId(newLeadId);
                    setMemberIds(prev => Array.from(new Set([newLeadId, ...prev])));
                  }}
                  className="w-full px-3 py-2 rounded-md border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
                >
                  {getStaffHierarchy(staff).map(orgGroup => (
                    <optgroup key={orgGroup.organisation} label={orgGroup.organisation}>
                      {orgGroup.departments.flatMap(deptGroup =>
                        deptGroup.staff.map(s => (
                          <option key={s.id} value={s.id}>
                            {s.name} — {s.role} ({orgGroup.organisation} • {deptGroup.department})
                          </option>
                        ))
                      )}
                    </optgroup>
                  ))}
                </select>
              </div>
            </div>

            {/* Team Members Section */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <label className="font-semibold text-slate-700 text-xs flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-[#00ad1d]" />
                    <span>Project Members</span>
                  </label>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-[#00ad1d] font-bold text-[10px] border border-emerald-200">
                    {memberIds.length} {memberIds.length === 1 ? 'member' : 'members'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const deptStaffIds = staff
                        .filter(s => s.department === department)
                        .map(s => s.id);
                      setMemberIds(prev => Array.from(new Set([...prev, ...deptStaffIds])));
                    }}
                    className="text-[11px] text-slate-600 hover:text-[#00ad1d] font-medium flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-100 transition"
                    title={`Add all staff in ${department}`}
                  >
                    <Plus className="w-3 h-3 text-[#00ad1d]" />
                    <span>Add all from {department}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowMemberTree(!showMemberTree)}
                    className="text-xs font-semibold text-[#00ad1d] hover:text-[#008f18] flex items-center gap-1 px-2.5 py-1 bg-emerald-50/80 hover:bg-emerald-100 border border-emerald-200/80 rounded-md transition"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>{showMemberTree ? 'Hide Member Picker' : '+ Add Members'}</span>
                  </button>
                </div>
              </div>

              {/* Selected Member Badges */}
              <div className="flex flex-wrap gap-1.5 p-2 bg-slate-50/90 rounded-md border border-slate-200 min-h-[42px] max-h-32 overflow-y-auto">
                {memberIds.length === 0 ? (
                  <span className="text-xs text-slate-400 italic py-1 px-1">
                    No members selected yet. Click "+ Add Members" to add staff from any department or organisation.
                  </span>
                ) : (
                  memberIds.map(id => {
                    const s = staff.find(staffMember => staffMember.id === id);
                    if (!s) return null;
                    const isLead = id === leadId;
                    return (
                      <span
                        key={id}
                        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs border shadow-2xs transition ${
                          isLead
                            ? 'bg-emerald-50 border-emerald-300 text-slate-900 font-semibold'
                            : 'bg-white border-slate-200 text-slate-800'
                        }`}
                      >
                        <UserAvatar name={s.name} avatar={s.avatar} className="w-4 h-4" />
                        <span>{formatStaffDisplayName(s)}</span>
                        {isLead ? (
                          <span className="text-[9px] font-bold text-[#00ad1d] bg-emerald-100/80 px-1 py-0.2 rounded uppercase tracking-wider">
                            Lead
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-normal">
                            ({formatStaffDisplayOrgDept(s)})
                          </span>
                        )}
                        {!isLead && (
                          <button
                            type="button"
                            onClick={() => setMemberIds(memberIds.filter(mid => mid !== id))}
                            className="text-slate-400 hover:text-rose-600 font-bold ml-0.5 p-0.5 transition"
                            title="Remove member"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </span>
                    );
                  })
                )}
              </div>

              {/* Collapsible Hierarchy Tree Box */}
              {showMemberTree && (
                <div className="p-3 bg-white border border-slate-200 rounded-lg shadow-xs space-y-2 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                    <span className="text-xs font-semibold text-slate-700">
                      Pick members across organisations & departments:
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowMemberTree(false)}
                      className="text-xs text-[#00ad1d] font-bold hover:underline"
                    >
                      Done
                    </button>
                  </div>
                  <StaffPickerTree
                    mode="multiple"
                    staff={staff}
                    selectedUserIds={memberIds}
                    onChange={(newIds) => {
                      const withLead = Array.from(new Set([leadId, ...newIds]));
                      setMemberIds(withLead);
                    }}
                  />
                </div>
              )}
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                Strategic Scope & Description <span className="text-rose-500">*</span>
              </label>
              <textarea
                required
                rows={2}
                placeholder="Describe key outcomes, target communities, and technical scope..."
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
              />
            </div>
          </div>

          {/* Section 2: Timeline & Milestones */}
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#00ad1d]"></span>
                <h3 className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
                  2. Timeline & Execution Phases
                </h3>
              </div>
              <span className="text-[10px] text-slate-400">Sequential milestones</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Commencement Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Target Completion Date</label>
                <input
                  type="date"
                  value={targetDate}
                  onChange={e => setTargetDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
                />
              </div>
            </div>

            {/* Milestones List */}
            <div className="space-y-2 bg-slate-50 p-3 rounded-md border border-slate-200">
              <span className="font-semibold text-slate-700 block">Initial Phase Stepper Plan</span>
              
              <div className="space-y-1.5">
                {milestones.map((m, idx) => (
                  <div key={m.id} className="flex items-center justify-between gap-2 p-2 bg-white rounded border border-slate-200">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-[#00ad1d]/10 text-[#00ad1d] font-bold flex items-center justify-center text-[10px]">
                        {idx + 1}
                      </span>
                      <span className="font-medium text-slate-800">{m.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-500">Due {m.dueDate}</span>
                      <button
                        type="button"
                        onClick={() => handleRemovePhase(m.id)}
                        className="text-slate-400 hover:text-rose-600 p-0.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add Phase Inline */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  placeholder="New phase name..."
                  value={newPhaseName}
                  onChange={e => setNewPhaseName(e.target.value)}
                  className="flex-1 px-2.5 py-1.5 rounded border border-slate-200 bg-white text-xs"
                />
                <input
                  type="date"
                  value={newPhaseDueDate}
                  onChange={e => setNewPhaseDueDate(e.target.value)}
                  className="px-2 py-1.5 rounded border border-slate-200 bg-white text-xs"
                />
                <button
                  type="button"
                  onClick={handleAddPhase}
                  className="px-3 py-1.5 bg-[#00ad1d] text-white rounded font-semibold text-xs shrink-0"
                >
                  Add Phase
                </button>
              </div>
            </div>
          </div>

          {/* Section 3: Structured Budget Allocation */}
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#00ad1d]"></span>
                <h3 className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
                  3. Structured Financial Budget
                </h3>
              </div>
              <span className="font-bold text-[#00ad1d]">Total: ${totalAllocated.toLocaleString()}</span>
            </div>

            <div className="space-y-2 bg-slate-50 p-3 rounded-md border border-slate-200">
              <div className="space-y-1.5">
                {categories.map((c, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 p-2 bg-white rounded border border-slate-200">
                    <span className="font-medium text-slate-800">{c.category}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-700">${Number(c.allocated).toLocaleString()}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveCategory(i)}
                        className="text-slate-400 hover:text-rose-600 p-0.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  placeholder="Category (e.g. Solar Hardware, Concrete Works)..."
                  value={newCategoryName}
                  onChange={e => setNewCategoryName(e.target.value)}
                  className="flex-1 px-2.5 py-1.5 rounded border border-slate-200 bg-white text-xs"
                />
                <input
                  type="number"
                  placeholder="Amount ($)"
                  value={newCategoryAmount}
                  onChange={e => setNewCategoryAmount(e.target.value ? Number(e.target.value) : '')}
                  className="w-28 px-2 py-1.5 rounded border border-slate-200 bg-white text-xs font-mono"
                />
                <button
                  type="button"
                  onClick={handleAddCategory}
                  className="px-3 py-1.5 bg-[#00ad1d] text-white rounded font-semibold text-xs shrink-0"
                >
                  Add Category
                </button>
              </div>
            </div>
          </div>

          {/* Section 4: Project Documents & SharePoint Cloud Sync */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 pb-1.5 border-b border-slate-100">
              <span className="w-2 h-2 rounded-full bg-[#00ad1d]"></span>
              <h3 className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
                4. Project Documents & SharePoint Sync
              </h3>
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                Attach Official Project Documents / Files (Optional)
              </label>
              <div className="flex items-center gap-2">
                <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#00ad1d]/10 hover:bg-[#00ad1d]/20 text-[#00ad1d] rounded-md font-semibold text-xs border border-[#00ad1d]/30 transition">
                  <Paperclip className="w-3.5 h-3.5" />
                  <span>Attach Documents</span>
                  <input
                    type="file"
                    multiple
                    onChange={handleFileUpload}
                    className="hidden"
                    accept=".pdf,.docx,.doc,.xlsx,.xls,.png,.jpg,.jpeg,.txt,.csv"
                  />
                </label>
                {isUploading && (
                  <span className="flex items-center gap-1 text-slate-500 text-xs">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#00ad1d]" />
                    <span>Parsing & syncing to SharePoint...</span>
                  </span>
                )}
              </div>

              {attachments.length > 0 && (
                <div className="space-y-2 pt-2">
                  {attachments.map(att => (
                    <div key={att.id} className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs shadow-2xs">
                      <div className="flex items-center gap-2.5 min-w-0 pr-2">
                        <div className="p-1.5 bg-emerald-100 text-emerald-800 rounded shrink-0">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-800 truncate">{att.name}</p>
                          <div className="flex items-center gap-2 text-[10px] text-slate-500">
                            <span>{att.size}</span>
                            <span>•</span>
                            <span className="text-[#008f18] font-semibold flex items-center gap-1">
                              <FolderGit2 className="w-3 h-3" />
                              <span>Synced to SharePoint</span>
                            </span>
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveAttachment(att.id)}
                        className="p-1 hover:bg-slate-200 text-slate-400 hover:text-slate-700 rounded-md transition"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 font-semibold rounded-md transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-[#00ad1d] hover:bg-[#009218] text-white font-bold rounded-md shadow-2xs flex items-center gap-2 transition"
            >
              <Save className="w-4 h-4" />
              <span>Create Project Initiative</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
