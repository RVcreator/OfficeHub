import React, { useState, useEffect } from 'react';
import {
  CheckSquare,
  Search,
  Filter,
  Plus,
  Calendar,
  Building2,
  UserCheck,
  CheckCircle2,
  Clock,
  ExternalLink,
  Tag,
  AlertCircle,
  X
} from 'lucide-react';
import { usePortalStore } from '../services/store';
import { Decision } from '../types';

interface DecisionsViewProps {
  onOpenNewDecisionModal?: () => void;
}

export const DecisionsView: React.FC<DecisionsViewProps> = () => {
  const { decisions, actions, currentUser } = usePortalStore(['decisions', 'currentUser']);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);

  // New decision form state
  const [newTitle, setNewTitle] = useState('');
  const [newSummary, setNewSummary] = useState('');
  const [newMeetingTitle, setNewMeetingTitle] = useState('');
  const [newActionItems, setNewActionItems] = useState(1);

  // Close modal on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isNewModalOpen) {
        setIsNewModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isNewModalOpen]);

  const departmentsList = [
    'All',
    'Top management',
    'IT',
    'Finance',
    'Logistics and Operations',
    'Tabligh',
    'management',
    'projects and Mkt'
  ];

  const filteredDecisions = decisions.filter(dec => {
    const matchesSearch = dec.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          dec.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          dec.decidedBy.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDept = selectedDept === 'All' || dec.department === selectedDept;
    const matchesStatus = selectedStatus === 'All' || dec.status === selectedStatus;
    return matchesSearch && matchesDept && matchesStatus;
  });

  const handleCreateDecision = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newSummary.trim()) return;

    actions.addDecision({
      title: newTitle.trim(),
      summary: newSummary.trim(),
      department: (currentUser.department as any) || 'Top management',
      meetingTitle: newMeetingTitle.trim() ? newMeetingTitle.trim() : undefined,
      decidedBy: currentUser.name,
      status: 'Adopted',
      actionItemsCount: Number(newActionItems) || 1,
    });

    setNewTitle('');
    setNewSummary('');
    setNewMeetingTitle('');
    setNewActionItems(1);
    setIsNewModalOpen(false);
  };

  const getStatusBadge = (status: Decision['status']) => {
    switch (status) {
      case 'Approved':
      case 'Adopted':
        return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
      case 'In Implementation':
        return 'bg-blue-50 text-blue-700 border border-blue-200';
      case 'Under Review':
        return 'bg-amber-50 text-amber-700 border border-amber-200';
      default:
        return 'bg-slate-100 text-slate-700 border border-slate-200';
    }
  };

  const getCategoryBadge = (category: Decision['category']) => {
    switch (category) {
      case 'Strategic':
        return 'bg-purple-50 text-purple-700 border border-purple-200';
      case 'Financial':
        return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
      case 'Governance':
        return 'bg-rose-50 text-rose-700 border border-rose-200';
      case 'Operational':
      default:
        return 'bg-slate-100 text-slate-700 border border-slate-200';
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-lg border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-md bg-[#00ad1d]/10 text-[#008f18]">
              <CheckSquare className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Decisions & Resolutions</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Official operational decisions, board resolutions, and committee action directives across WIPAHS departments.
          </p>
        </div>

        <button
          onClick={() => setIsNewModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 px-3.5 py-2 bg-[#00ad1d] hover:bg-[#009218] text-white text-xs font-medium rounded-md shadow-xs transition"
        >
          <Plus className="w-4 h-4" />
          <span>Log Decision</span>
        </button>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg border border-slate-200">
          <p className="text-xs text-slate-500 font-medium">Total Decisions</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{decisions.length}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Formal resolutions logged</p>
        </div>
        <div className="bg-white p-4 rounded-lg border border-slate-200">
          <p className="text-xs text-slate-500 font-medium">In Implementation</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">
            {decisions.filter(d => d.status === 'In Implementation').length}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">Active field rollouts</p>
        </div>
        <div className="bg-white p-4 rounded-lg border border-slate-200">
          <p className="text-xs text-slate-500 font-medium">Adopted & Approved</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">
            {decisions.filter(d => d.status === 'Approved' || d.status === 'Adopted').length}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">Enacted organizational policies</p>
        </div>
        <div className="bg-white p-4 rounded-lg border border-slate-200">
          <p className="text-xs text-slate-500 font-medium">Linked Action Items</p>
          <p className="text-2xl font-bold text-purple-600 mt-1">
            {decisions.reduce((acc, d) => acc + (d.actionItemsCount || 0), 0)}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">Delegated tasks to staff</p>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-3.5 rounded-lg border border-slate-200 flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search decisions by title, keyword, lead..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#00ad1d] focus:border-[#00ad1d]"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto">
          <div className="flex items-center gap-1 text-xs text-slate-500">
            <Filter className="w-3.5 h-3.5" />
            <span>Department:</span>
          </div>
          <select
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
          >
            {departmentsList.map(dept => (
              <option key={dept} value={dept}>{dept}</option>
            ))}
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
          >
            <option value="All">All Statuses</option>
            <option value="Adopted">Adopted</option>
            <option value="Approved">Approved</option>
            <option value="In Implementation">In Implementation</option>
            <option value="Under Review">Under Review</option>
          </select>
        </div>
      </div>

      {/* Decisions List */}
      <div className="space-y-3">
        {filteredDecisions.length === 0 ? (
          <div className="bg-white p-8 rounded-lg border border-slate-200 text-center">
            <CheckSquare className="w-10 h-10 mx-auto text-slate-300 mb-2" />
            <p className="text-sm font-medium text-slate-700">No decisions match your filter criteria.</p>
            <p className="text-xs text-slate-400 mt-1">Try clearing filters or search keyword.</p>
          </div>
        ) : (
          filteredDecisions.map((decision) => (
            <div
              key={decision.id}
              className="bg-white p-5 rounded-lg border border-slate-200 hover:border-slate-300 transition shadow-xs"
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="space-y-1.5 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-[11px] px-2 py-0.5 rounded-md font-medium ${getStatusBadge(decision.status)}`}>
                      {decision.status}
                    </span>
                    {decision.category && (
                      <span className={`text-[11px] px-2 py-0.5 rounded-md font-medium ${getCategoryBadge(decision.category)}`}>
                        {decision.category}
                      </span>
                    )}
                    <span className="text-[11px] text-slate-500 flex items-center gap-1">
                      <Building2 className="w-3.5 h-3.5 text-slate-400" />
                      {decision.department}
                    </span>
                    <span className="text-[11px] text-slate-400 flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      {decision.date}
                    </span>
                  </div>

                  <h3 className="text-sm font-semibold text-slate-900 leading-snug">
                    {decision.title}
                  </h3>

                  <p className="text-xs text-slate-600 leading-relaxed">
                    {decision.summary}
                  </p>
                </div>

                <div className="flex sm:flex-col items-end justify-between sm:justify-start gap-2 shrink-0">
                  <select
                    value={decision.status}
                    onChange={(e) => actions.updateDecisionStatus(decision.id, e.target.value as Decision['status'])}
                    className="text-[11px] bg-slate-50 border border-slate-200 rounded-md px-2 py-1 text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
                  >
                    <option value="Adopted">Adopted</option>
                    <option value="Approved">Approved</option>
                    <option value="In Implementation">In Implementation</option>
                    <option value="Under Review">Under Review</option>
                  </select>
                </div>
              </div>

              {/* Bottom Metadata */}
              <div className="mt-3.5 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                    Passed by: <strong className="text-slate-700 font-medium">{decision.decidedBy}</strong>
                  </span>
                  {decision.meetingTitle && decision.meetingTitle.trim() && (
                    <span className="hidden md:inline text-slate-400">
                      • Session: {decision.meetingTitle.trim()}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 bg-purple-50 text-purple-700 px-2 py-0.5 rounded text-[11px]">
                    <CheckCircle2 className="w-3 h-3" />
                    {decision.actionItemsCount} Action Items
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Log Decision Modal */}
      {isNewModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs"
          onClick={() => setIsNewModalOpen(false)}
        >
          <div
            className="bg-white rounded-lg border border-slate-200 shadow-xl max-w-lg w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-900">Log Formal Decision / Resolution</h2>
              <button
                type="button"
                onClick={() => setIsNewModalOpen(false)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateDecision} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-700 font-medium mb-1">Decision Title *</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Authorize Q4 Secondary Scholarship Tranche"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">
                  Summary / Resolution Text <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  value={newSummary}
                  onChange={(e) => setNewSummary(e.target.value)}
                  placeholder="Provide the context, conditions, and required implementation steps..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Session / Meeting (Optional)</label>
                  <input
                    type="text"
                    value={newMeetingTitle}
                    onChange={(e) => setNewMeetingTitle(e.target.value)}
                    placeholder="e.g. Weekly Executive Sync (leave blank if none)"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-medium mb-1">Action Items Count</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={newActionItems}
                    onChange={(e) => setNewActionItems(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsNewModalOpen(false)}
                  className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newTitle.trim() || !newSummary.trim()}
                  className="px-4 py-1.5 bg-[#00ad1d] hover:bg-[#009218] disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-md shadow-xs transition"
                >
                  Save Decision
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
