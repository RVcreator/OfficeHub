import React, { useState, useEffect } from 'react';
import { UserAvatar } from './UserAvatar';
import {
  ShieldCheck,
  Search,
  Filter,
  Plus,
  Calendar,
  Building2,
  DollarSign,
  CheckCircle2,
  XCircle,
  Clock,
  User,
  AlertCircle,
  FileCheck,
  X,
  Users,
  UserPlus,
  Paperclip
} from 'lucide-react';
import { usePortalStore } from '../services/store';
import { Approval, Department } from '../types';
import { formatStaffDisplayName, formatStaffDisplayOrgDept } from '../utils/staffHierarchy';
import { StaffPickerTree } from './StaffPickerTree';

export const ApprovalsView: React.FC<{
  selectedApprovalId?: string | null;
}> = ({ selectedApprovalId }) => {
  const { approvals, projects, staff, actions, currentUser } = usePortalStore(['approvals', 'projects', 'staff', 'currentUser']);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [highlightedApprovalId, setHighlightedApprovalId] = useState<string | null>(null);

  // New approval state
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [selectedApproverIds, setSelectedApproverIds] = useState<string[]>([]);
  const [showApproverTree, setShowApproverTree] = useState(false);
  const [newAttachments, setNewAttachments] = useState<File[]>([]);

  // Resolution modal state (Approve / Reject with comment)
  const [resolutionModal, setResolutionModal] = useState<{
    type: 'approve' | 'reject';
    approval: Approval;
    comment: string;
  } | null>(null);

  // Close modals on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (resolutionModal) {
          setResolutionModal(null);
        } else if (isNewModalOpen) {
          setIsNewModalOpen(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isNewModalOpen, resolutionModal]);

  const handleConfirmResolution = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolutionModal) return;
    if (resolutionModal.type === 'reject' && !resolutionModal.comment.trim()) return;

    if (resolutionModal.type === 'approve') {
      actions.approveApproval(resolutionModal.approval.id, resolutionModal.comment.trim() || undefined);
    } else {
      actions.rejectApproval(resolutionModal.approval.id, resolutionModal.comment.trim());
    }
    setResolutionModal(null);
  };

  useEffect(() => {
    if (selectedApprovalId) {
      setSelectedStatus('All');
      setSearchQuery('');
      setHighlightedApprovalId(selectedApprovalId);

      setTimeout(() => {
        const el = document.getElementById(`approval-${selectedApprovalId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);

      const timer = setTimeout(() => {
        setHighlightedApprovalId(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [selectedApprovalId]);

  const filteredApprovals = approvals.filter(appr => {
    const matchesSearch = appr.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          appr.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          appr.requestedBy.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = selectedStatus === 'All' || appr.status === selectedStatus;
    return matchesSearch && matchesStatus;
  });

  const pendingCount = approvals.filter(a => a.status === 'Pending').length;
  const approvedCount = approvals.filter(a => a.status === 'Approved').length;

  const handleCreateApproval = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || selectedApproverIds.length === 0) return;

    actions.addApproval({
      title: newTitle.trim(),
      description: newDescription.trim() || 'Formal operational approval requested for procurement/sign-off.',
      department: currentUser.department || 'Top management',
      projectName: newProjectName.trim() || undefined,
      requestedBy: currentUser.name,
      requestedByAvatar: currentUser.avatar,
      notes: newNotes.trim() || undefined,
      approverIds: selectedApproverIds,
      attachments: newAttachments.map(f => ({
        name: f.name,
        size: `${(f.size / 1024).toFixed(0)} KB`,
        type: 'file',
        url: '#', // Mock URL
      })),
    });

    setNewTitle('');
    setNewDescription('');
    setNewNotes('');
    setSelectedApproverIds([]);
    setShowApproverTree(false);
    setNewAttachments([]);
    setIsNewModalOpen(false);
  };

  const getStatusBadge = (status: Approval['status']) => {
    switch (status) {
      case 'Approved':
        return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
      case 'Rejected':
        return 'bg-rose-50 text-rose-700 border border-rose-200';
      case 'Under Review':
        return 'bg-blue-50 text-blue-700 border border-blue-200';
      case 'Pending':
      default:
        return 'bg-amber-50 text-amber-700 border border-amber-200';
    }
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-8">
      {/* Top Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-4.5 rounded-lg border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-md bg-[#00ad1d]/10 text-[#008f18]">
              <ShieldCheck className="w-5 h-5" />
            </span>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">Project & Operational Approvals</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Review, authorize, and track milestone disbursements, vendor contracts, and departmental purchase orders.
          </p>
        </div>

        <button
          onClick={() => {
            setShowApproverTree(false);
            setIsNewModalOpen(true);
          }}
          className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-[#00ad1d] hover:bg-[#009218] text-white text-xs font-semibold rounded-md shadow-xs transition shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>New Approval Request</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-2xs">
          <p className="text-[11px] text-slate-500 font-medium">Pending Review</p>
          <p className="text-xl font-bold text-amber-600 mt-0.5">{pendingCount}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Awaiting leadership sign-off</p>
        </div>
        <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-2xs">
          <p className="text-[11px] text-slate-500 font-medium">Approved Requests</p>
          <p className="text-xl font-bold text-emerald-600 mt-0.5">{approvedCount}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Disbursements cleared</p>
        </div>
        <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-2xs">
          <p className="text-[11px] text-slate-500 font-medium">Total Volume</p>
          <p className="text-xl font-bold text-slate-900 mt-0.5">{approvals.length}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">All operational items</p>
        </div>
        <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-2xs">
          <p className="text-[11px] text-slate-500 font-medium">Active Projects</p>
          <p className="text-xl font-bold text-purple-600 mt-0.5">{projects.length}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Linked project portfolios</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-2.5">
        <div className="relative w-full sm:w-80">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search approval requests..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#00ad1d] focus:border-[#00ad1d]"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#00ad1d] w-full sm:w-auto"
          >
            <option value="All">All Statuses</option>
            <option value="Pending">Pending</option>
            <option value="Approved">Approved</option>
            <option value="Rejected">Rejected</option>
            <option value="Under Review">Under Review</option>
          </select>
        </div>
      </div>

      {/* Approvals List */}
      <div className="space-y-3">
        {filteredApprovals.length === 0 ? (
          <div className="bg-white p-8 rounded-lg border border-slate-200 text-center shadow-2xs">
            <FileCheck className="w-9 h-9 mx-auto text-slate-300 mb-2" />
            <p className="text-sm font-medium text-slate-700">No approval requests found.</p>
            <p className="text-xs text-slate-400 mt-1">Try modifying your search or create a new request.</p>
          </div>
        ) : (
          filteredApprovals.map((approval) => (
            <div
              key={approval.id}
              id={`approval-${approval.id}`}
              className={`bg-white p-4 sm:p-4.5 rounded-lg border transition-all duration-300 shadow-2xs ${
                highlightedApprovalId === approval.id
                  ? 'ring-2 ring-emerald-500 shadow-md bg-emerald-50/20 border-emerald-400'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="space-y-2 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-[11px] px-2 py-0.5 rounded-md font-medium ${getStatusBadge(approval.status)}`}>
                      {approval.status}
                    </span>
                    <span className="text-[11px] text-slate-500 flex items-center gap-1">
                      <Building2 className="w-3.5 h-3.5 text-slate-400" />
                      {approval.department}
                    </span>
                  </div>

                  <h3 className="text-sm font-semibold text-slate-900">
                    {approval.title}
                  </h3>

                  <p className="text-xs text-slate-600 leading-relaxed">
                    {approval.description}
                  </p>

                  {approval.projectName && (
                    <p className="text-[11px] text-slate-500 font-medium">
                      Project: <span className="text-slate-700">{approval.projectName}</span>
                    </p>
                  )}

                  {/* Assigned Approvers Chips */}
                  {approval.approverIds && approval.approverIds.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Approvers:</span>
                      {approval.approverIds.map(apprId => {
                        const aStaff = staff.find(s => s.id === apprId);
                        if (!aStaff) return null;
                        return (
                          <span
                            key={apprId}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200 text-[10px] text-slate-700 font-medium"
                          >
                            <UserAvatar
                              name={aStaff.name}
                              avatar={aStaff.avatar}
                              className="w-3.5 h-3.5"
                            />
                            <span>{formatStaffDisplayName(aStaff)}</span>
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {approval.notes && (
                    <div className={`p-2.5 rounded-md text-[11px] border ${
                      approval.status === 'Approved'
                        ? 'bg-emerald-50/80 text-emerald-800 border-emerald-200'
                        : approval.status === 'Rejected'
                        ? 'bg-rose-50/80 text-rose-800 border-rose-200'
                        : 'bg-slate-50 text-slate-600 border-slate-100'
                    }`}>
                      <strong>{approval.status === 'Approved' ? 'Approval Note:' : approval.status === 'Rejected' ? 'Rejection Reason:' : 'Audit Note:'}</strong> {approval.notes}
                    </div>
                  )}

                  {approval.attachments && approval.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {approval.attachments.map((att, i) => (
                        <span key={i} className="text-[10px] bg-slate-100 px-2 py-0.5 rounded text-slate-600 flex items-center gap-1">
                          <Paperclip className="w-3 h-3 text-slate-400" />
                          <span>{att.name}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Right: Actions and Request Details */}
                <div className="flex flex-col sm:items-end justify-between gap-3 shrink-0">
                  {(() => {
                    const reqStaff = staff.find(s => s.name === approval.requestedBy);
                    return (
                      <div className="flex items-center gap-2 text-xs">
                        <UserAvatar name={approval.requestedBy} avatar={approval.requestedByAvatar || reqStaff?.avatar || currentUser.avatar} className="w-7 h-7" />
                        <div className="text-right">
                          <p className="font-semibold text-slate-800 text-[11px] leading-tight">
                            {reqStaff ? formatStaffDisplayName(reqStaff) : approval.requestedBy}
                          </p>
                          <p className="text-[10px] text-[#008f18] font-medium leading-tight">
                            {reqStaff ? formatStaffDisplayOrgDept(reqStaff) : approval.department}
                          </p>
                          <p className="text-[10px] text-slate-400 mt-0.5">{approval.requestedDate}</p>
                        </div>
                      </div>
                    );
                  })()}

                  {approval.status === 'Pending' && approval.requestedBy !== currentUser.name ? (
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setResolutionModal({ type: 'reject', approval, comment: '' })}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-medium rounded-md border border-rose-200 transition cursor-pointer"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Reject</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setResolutionModal({ type: 'approve', approval, comment: '' })}
                        className="inline-flex items-center gap-1 px-3.5 py-1.5 bg-[#00ad1d] hover:bg-[#009218] text-white text-xs font-medium rounded-md shadow-xs transition cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Approve</span>
                      </button>
                    </div>
                  ) : (
                    <div className="text-right text-[11px] text-slate-500">
                      {approval.approvedBy && (
                        <p>
                          Resolved by <strong className="text-slate-700">{approval.approvedBy}</strong>
                          {approval.approvedDate && <span> on {approval.approvedDate}</span>}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* New Approval Modal */}
      {isNewModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto"
          onClick={() => setIsNewModalOpen(false)}
        >
          <div
            className="bg-white rounded-xl border border-slate-200 shadow-2xl max-w-xl w-full max-h-[90vh] flex flex-col my-auto overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80 shrink-0">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-md bg-[#00ad1d]/10 text-[#008f18]">
                  <ShieldCheck className="w-4 h-4" />
                </span>
                <h2 className="text-sm font-bold text-slate-900">Submit Approval Request</h2>
              </div>
              <button
                type="button"
                onClick={() => setIsNewModalOpen(false)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCreateApproval} className="flex flex-col flex-1 overflow-hidden">
              <div className="overflow-y-auto p-5 space-y-4 flex-1 text-xs">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Request Title <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="e.g. Science Lab Physics Optics Sets Procurement"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#00ad1d] text-slate-900 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Detailed Justification</label>
                  <textarea
                    rows={2}
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="Specify items, contractor terms, vendor quotes, and budget line item..."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#00ad1d] text-slate-900 text-xs"
                  />
                </div>

                {/* Approvers Selection Section */}
                <div className="space-y-2 pt-1 border-t border-slate-100">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <label className="font-semibold text-slate-700 text-xs flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-[#00ad1d]" />
                        <span>Select Approvers</span>
                        <span className="text-rose-500">*</span>
                      </label>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-[#00ad1d] font-bold text-[10px] border border-emerald-200">
                        {selectedApproverIds.length} {selectedApproverIds.length === 1 ? 'approver' : 'approvers'}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowApproverTree(!showApproverTree)}
                      className="text-xs font-semibold text-[#00ad1d] hover:text-[#008f18] flex items-center gap-1 px-2.5 py-1 bg-emerald-50/80 hover:bg-emerald-100 border border-emerald-200/80 rounded-md transition"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>{showApproverTree ? 'Hide Approvers Picker' : '+ Select Approvers'}</span>
                    </button>
                  </div>

                  {/* Selected Approver Badges */}
                  <div className="flex flex-wrap gap-1.5 p-2 bg-slate-50/90 rounded-md border border-slate-200 min-h-[42px] max-h-28 overflow-y-auto">
                    {selectedApproverIds.length === 0 ? (
                      <span className="text-xs text-slate-400 italic py-1 px-1">
                        No approvers selected yet. Click "+ Select Approvers" to pick reviewers.
                      </span>
                    ) : (
                      selectedApproverIds.map(id => {
                        const s = staff.find(staffMember => staffMember.id === id);
                        if (!s) return null;
                        return (
                          <span
                            key={id}
                            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs border border-slate-200 bg-white text-slate-800 shadow-2xs"
                          >
                            <UserAvatar name={s.name} avatar={s.avatar} className="w-4 h-4" />
                            <span className="font-medium">{formatStaffDisplayName(s)}</span>
                            <span className="text-[10px] text-slate-400 font-normal">
                              ({formatStaffDisplayOrgDept(s)})
                            </span>
                            <button
                              type="button"
                              onClick={() => setSelectedApproverIds(selectedApproverIds.filter(mid => mid !== id))}
                              className="text-slate-400 hover:text-rose-600 font-bold ml-0.5 p-0.5 transition"
                              title="Remove approver"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        );
                      })
                    )}
                  </div>

                  {/* Collapsible Hierarchy Tree Box */}
                  {showApproverTree && (
                    <div className="p-3 bg-white border border-slate-200 rounded-lg shadow-xs space-y-2 animate-in fade-in duration-150">
                      <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                        <span className="text-xs font-semibold text-slate-700">
                          Select leadership / approvers from any department:
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowApproverTree(false)}
                          className="text-xs text-[#00ad1d] font-bold hover:underline"
                        >
                          Done
                        </button>
                      </div>
                      <StaffPickerTree
                        mode="multiple"
                        staff={staff}
                        selectedUserIds={selectedApproverIds}
                        onChange={setSelectedApproverIds}
                      />
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Linked Project (Optional)</label>
                  <select
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#00ad1d] text-slate-800 text-xs"
                  >
                    <option value="">-- General Operational --</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.name}>{p.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Supporting Notes</label>
                  <input
                    type="text"
                    value={newNotes}
                    onChange={(e) => setNewNotes(e.target.value)}
                    placeholder="e.g. Reference for audit or contract quote ID"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#00ad1d] text-slate-800 text-xs"
                  />
                </div>
                
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Attachments</label>
                  <input
                    type="file"
                    multiple
                    onChange={(e) => setNewAttachments(Array.from(e.target.files || []))}
                    className="w-full text-xs text-slate-500 file:mr-4 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer"
                  />
                </div>
              </div>

              {/* Modal Footer */}
              <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/80 flex items-center justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsNewModalOpen(false)}
                  className="px-3.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 rounded-md border border-slate-200 font-medium transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newTitle.trim() || selectedApproverIds.length === 0}
                  className="px-4 py-1.5 bg-[#00ad1d] hover:bg-[#009218] disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-md shadow-xs transition"
                >
                  Submit Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Approve / Reject Resolution Modal */}
      {resolutionModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto"
          onClick={() => setResolutionModal(null)}
        >
          <div
            className="bg-white rounded-xl border border-slate-200 shadow-2xl max-w-md w-full my-auto overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className={`px-5 py-3.5 border-b flex items-center justify-between ${
              resolutionModal.type === 'approve'
                ? 'bg-emerald-50/70 border-emerald-100 text-emerald-900'
                : 'bg-rose-50/70 border-rose-100 text-rose-900'
            }`}>
              <div className="flex items-center gap-2">
                <span className={`p-1.5 rounded-md ${
                  resolutionModal.type === 'approve'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-rose-100 text-rose-700'
                }`}>
                  {resolutionModal.type === 'approve' ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    <XCircle className="w-4 h-4" />
                  )}
                </span>
                <h2 className="text-sm font-bold">
                  {resolutionModal.type === 'approve' ? 'Approve Request' : 'Reject Request'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setResolutionModal(null)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleConfirmResolution} className="p-5 space-y-4 text-xs">
              {/* Target summary pill */}
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                <p className="font-semibold text-slate-900 text-xs line-clamp-1">
                  {resolutionModal.approval.title}
                </p>
                <p className="text-[11px] text-slate-500">
                  Requested by <strong className="text-slate-700">{resolutionModal.approval.requestedBy}</strong> ({resolutionModal.approval.department})
                </p>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  {resolutionModal.type === 'approve' ? (
                    <span>Approval Comment / Audit Note (Optional)</span>
                  ) : (
                    <span>
                      Reason for Rejection <span className="text-rose-500">* (Compulsory)</span>
                    </span>
                  )}
                </label>
                <textarea
                  rows={3}
                  required={resolutionModal.type === 'reject'}
                  value={resolutionModal.comment}
                  onChange={(e) => setResolutionModal({ ...resolutionModal, comment: e.target.value })}
                  placeholder={
                    resolutionModal.type === 'approve'
                      ? 'e.g. Approved as per verified budget allocation and departmental review.'
                      : 'e.g. Budget ceiling exceeded for this milestone; please attach committee quotation approval.'
                  }
                  className={`w-full px-3 py-2 bg-slate-50 border rounded-md focus:outline-none text-slate-900 text-xs ${
                    resolutionModal.type === 'reject' && !resolutionModal.comment.trim()
                      ? 'border-rose-300 focus:ring-1 focus:ring-rose-500'
                      : 'border-slate-200 focus:ring-1 focus:ring-[#00ad1d]'
                  }`}
                />
                {resolutionModal.type === 'reject' && !resolutionModal.comment.trim() && (
                  <p className="text-[10px] text-rose-500 mt-1 font-medium">
                    A rejection note is required to explain the decision to the requester.
                  </p>
                )}
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setResolutionModal(null)}
                  className="px-3.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 rounded-md border border-slate-200 font-medium transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resolutionModal.type === 'reject' && !resolutionModal.comment.trim()}
                  className={`px-4 py-1.5 font-medium rounded-md shadow-xs transition disabled:opacity-50 disabled:cursor-not-allowed text-white ${
                    resolutionModal.type === 'approve'
                      ? 'bg-[#00ad1d] hover:bg-[#009218]'
                      : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  {resolutionModal.type === 'approve' ? 'Confirm Approval' : 'Confirm Rejection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
