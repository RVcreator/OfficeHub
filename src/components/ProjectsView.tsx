import React, { useState, useMemo, useEffect } from 'react';
import {
  FolderGit2,
  Plus,
  ExternalLink,
  Users,
  Calendar,
  DollarSign,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  ShieldCheck,
  Search,
  Filter,
  Download,
  AlertTriangle,
  FileSpreadsheet,
  FileText,
  X,
  Droplets,
  GraduationCap,
  Building2,
  MapPin,
  Activity,
  CheckSquare,
  Lock,
  ChevronDown,
  LayoutGrid,
  TrendingUp,
  Percent,
  Wallet
} from 'lucide-react';
import { Department, Project } from '../types';
import { usePortalStore, setTableData } from '../services/store';
import { CreateProjectModal } from './CreateProjectModal';
import { formatStaffDisplayName, formatStaffDisplayOrgDept } from '../utils/staffHierarchy';

interface ProjectsViewProps {
  onOpenNewProjectModal: (proj: Project, tab?: 'milestones' | 'budget' | 'tasks' | 'log') => void;
}

import {parseDollar,getProjectFinancials} from '../utils/projectFinancials';
export {parseDollar,getProjectFinancials} from '../utils/projectFinancials';

export const ProjectsView: React.FC<ProjectsViewProps> = ({ onOpenNewProjectModal }) => {
  const { projects, currentUser, tasks, staff, actions } = usePortalStore(['projects', 'currentUser', 'tasks', 'staff']);

  useEffect(() => {
    if (projects.length === 0) {
      actions.getProjects().then(data => setTableData('projects', data));
    }
  }, []);

  // View Mode: 'cards' grid or 'financials' detailed ledger table
  const [viewMode, setViewMode] = useState<'cards' | 'financials'>('cards');

  // Create Project Modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Filters state
  const [departmentFilter, setDepartmentFilter] = useState<Department | 'All'>('All');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [leadFilter, setLeadFilter] = useState<string>('All');
  const [budgetHealthFilter, setBudgetHealthFilter] = useState<'All' | 'Healthy' | 'HighBurn' | 'OverBudget'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  // Export Modal state
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportScope, setExportScope] = useState<'all' | 'single'>('all');
  const [selectedExportProject, setSelectedExportProject] = useState<Project | null>(null);
  const [exportFormat, setExportFormat] = useState<'excel' | 'pdf'>('excel');

  // Extract unique leads for the lead filter dropdown
  const uniqueLeads = useMemo(() => {
    const leads = new Set<string>();
    projects.forEach(p => {
      if (p.leadName) leads.add(p.leadName);
    });
    return Array.from(leads);
  }, [projects]);

  const availableDepartments = useMemo(() => {
    const fromProjects = projects.map(p => p.department);
    const fromStaff = staff.map(s => s.department);
    const set = Array.from(new Set([...fromProjects, ...fromStaff]))
      .filter(Boolean)
      .map(d => d.trim())
      .filter(d => !d.toLowerCase().includes('relief') && d !== 'All Departments' && d !== 'All');
    if (set.length === 0) {
      return ['Top management', 'IT', 'Finance', 'Logistics and Operations', 'Tabligh', 'management', 'projects and Mkt'];
    }
    return set.sort();
  }, [projects, staff]);

  // Aggregate Portfolio Financials
  const portfolioFinancials = useMemo(() => {
    let totalAllocated = 0;
    let totalSpent = 0;
    let healthyCount = 0;
    let highBurnCount = 0;
    let overBudgetCount = 0;

    projects.forEach(p => {
      const { alloc, spent, burnPct } = getProjectFinancials(p);

      totalAllocated += alloc;
      totalSpent += spent;

      if (spent > alloc && alloc > 0) {
        overBudgetCount++;
      } else if (burnPct >= 80) {
        highBurnCount++;
      } else {
        healthyCount++;
      }
    });

    const totalRemaining = totalAllocated - totalSpent;
    const portfolioBurn = totalAllocated > 0 ? Math.round((totalSpent / totalAllocated) * 100) : 0;

    return {
      totalAllocated,
      totalSpent,
      totalRemaining,
      portfolioBurn,
      healthyCount,
      highBurnCount,
      overBudgetCount
    };
  }, [projects]);

  // Filtered projects
  const filteredProjects = useMemo(() => {
    return projects.filter(p => {
      if (departmentFilter !== 'All' && p.department !== departmentFilter) return false;
      if (statusFilter !== 'All' && p.status !== statusFilter) return false;
      if (leadFilter !== 'All' && p.leadName !== leadFilter) return false;

      // Budget health filter
      if (budgetHealthFilter !== 'All') {
        const { alloc, spent, burnPct } = getProjectFinancials(p);

        if (budgetHealthFilter === 'OverBudget' && !(spent > alloc && alloc > 0)) return false;
        if (budgetHealthFilter === 'HighBurn' && !(burnPct >= 80 && spent <= alloc)) return false;
        if (budgetHealthFilter === 'Healthy' && (burnPct >= 80 || spent > alloc)) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = p.name.toLowerCase().includes(q);
        const matchesCode = p.code ? p.code.toLowerCase().includes(q) : false;
        const matchesDesc = p.description.toLowerCase().includes(q);
        const matchesLead = p.leadName.toLowerCase().includes(q);
        return matchesName || matchesCode || matchesDesc || matchesLead;
      }
      return true;
    });
  }, [projects, departmentFilter, statusFilter, leadFilter, budgetHealthFilter, searchQuery]);

  // Helper to calculate tasks and overdue count per project
  const getProjectTaskCounts = (project: Project) => {
    const projectTasks = tasks.filter(t => t.projectId === project.id || t.tags?.some(tag => tag.toLowerCase() === project.name.toLowerCase()));
    const totalCount = projectTasks.length > 0 ? projectTasks.length : project.activeTasksCount || 0;
    const overdueCount = projectTasks.filter(t => t.status !== 'Done' && t.dueDate && new Date(t.dueDate) < new Date()).length;
    return {
      total: totalCount,
      overdue: overdueCount > 0 ? overdueCount : project.overdueTasksCount || 0,
    };
  };

  // Helper to render icon for impact metrics
  const renderImpactIcon = (iconName: string) => {
    switch (iconName.toLowerCase()) {
      case 'droplets':
        return <Droplets className="w-3.5 h-3.5 text-sky-600 shrink-0" />;
      case 'graduationcap':
        return <GraduationCap className="w-3.5 h-3.5 text-purple-600 shrink-0" />;
      case 'building2':
        return <Building2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />;
      case 'mappin':
        return <MapPin className="w-3.5 h-3.5 text-rose-600 shrink-0" />;
      case 'activity':
        return <Activity className="w-3.5 h-3.5 text-emerald-600 shrink-0" />;
      default:
        return <Users className="w-3.5 h-3.5 text-[#00ad1d] shrink-0" />;
    }
  };

  // Export handlers
  const handleOpenExport = (proj?: Project) => {
    if (proj) {
      setSelectedExportProject(proj);
      setExportScope('single');
    } else {
      setSelectedExportProject(filteredProjects[0] || null);
      setExportScope('all');
    }
    setIsExportModalOpen(true);
  };

  const handleGenerateExport = () => {
    const targetProjects = exportScope === 'single' && selectedExportProject
      ? [selectedExportProject]
      : filteredProjects;

    if (exportFormat === 'excel') {
      // Generate CSV file
      const headers = [
        'Project Code',
        'Initiative Name',
        'Department',
        'Lead',
        'Status',
        'Status Reason',
        'Progress (%)',
        'Budget',
        'Spent',
        'Target Date',
        'Active Tasks',
        'Overdue Tasks',
        'Milestones (Summary)'
      ];

      const rows = targetProjects.map(p => {
        const milestonesStr = (p.milestones || []).map(m => `${m.name} [${m.status} - ${m.progress}%]`).join(' | ');
        return [
          `"${p.code || ''}"`,
          `"${p.name.replace(/"/g, '""')}"`,
          `"${p.department}"`,
          `"${p.leadName}"`,
          `"${p.status}"`,
          `"${(p.statusReason || '').replace(/"/g, '""')}"`,
          p.progress,
          `"${p.budget || ''}"`,
          `"${p.spent || ''}"`,
          `"${p.targetDate}"`,
          p.activeTasksCount || 0,
          p.overdueTasksCount || 0,
          `"${milestonesStr.replace(/"/g, '""')}"`
        ].join(',');
      });

      const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `WIPAHS_Projects_Report_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } else {
      // Printable PDF view
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>WIPAHS Projects & Strategic Initiatives Report</title>
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 30px; color: #1e293b; }
                h1 { color: #0f172a; margin-bottom: 4px; }
                .sub { color: #64748b; font-size: 13px; margin-bottom: 24px; }
                table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 12px; }
                th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; }
                th { background-color: #f1f5f9; font-weight: 600; color: #334155; }
                .status-badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold; }
                .brand { color: #00ad1d; font-weight: bold; }
                .footer { margin-top: 30px; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 10px; }
              </style>
            </head>
            <body>
              <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #00ad1d; padding-bottom: 12px; margin-bottom: 20px;">
                <div>
                  <h1 style="margin: 0; font-size: 22px;">WIPAHS Strategic Initiatives Report</h1>
                  <div class="sub" style="margin: 4px 0 0 0;">Generated on ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} · OfficeHub Executive Export</div>
                </div>
                <div style="text-align: right; font-size: 12px;">
                  <div class="brand">WIPAHS Head Office</div>
                  <div style="color: #64748b;">Dar es Salaam, Tanzania</div>
                </div>
              </div>

              <table>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Initiative Name</th>
                    <th>Department</th>
                    <th>Lead</th>
                    <th>Status</th>
                    <th>Progress</th>
                    <th>Budget</th>
                    <th>Spent</th>
                    <th>Target Date</th>
                  </tr>
                </thead>
                <tbody>
                  ${targetProjects.map(p => `
                    <tr>
                      <td style="font-family: monospace; font-weight: bold;">${p.code || ''}</td>
                      <td>
                        <strong>${p.name}</strong>
                        ${p.statusReason ? `<div style="font-size: 10px; color: #b45309; font-style: italic;">Reason: ${p.statusReason}</div>` : ''}
                      </td>
                      <td>${p.department}</td>
                      <td>${p.leadName}</td>
                      <td>${p.status}</td>
                      <td><strong>${p.progress}%</strong></td>
                      <td>${p.budget || 'N/A'}</td>
                      <td>${p.spent || 'N/A'}</td>
                      <td>${p.targetDate}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>

              <div class="footer">
                Confidential Document · WIPAHS Central Information Directorate · SharePoint Unified Architecture
              </div>
              <script>
                window.onload = function() { window.print(); };
              </script>
            </body>
          </html>
        `);
        printWindow.document.close();
      }
    }

    setIsExportModalOpen(false);
  };

  return (
    <div className="space-y-5">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-lg border border-slate-200 shadow-2xs">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold text-[#19232d]">Projects & Strategic Workflows</h1>
            <span className="text-xs px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 font-semibold border border-emerald-200">
              {filteredProjects.length} {filteredProjects.length === 1 ? 'initiative' : 'initiatives'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Inter-departmental welfare, school development, and medical infrastructure projects connected with SharePoint.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 self-start md:self-auto flex-wrap">
          {/* View Switcher: Cards vs Financials */}
          <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs">
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`px-3 py-1.5 rounded-md font-semibold flex items-center gap-1.5 transition ${
                viewMode === 'cards'
                  ? 'bg-white text-slate-900 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Initiative Cards Grid"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Initiatives</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('financials')}
              className={`px-3 py-1.5 rounded-md font-semibold flex items-center gap-1.5 transition ${
                viewMode === 'financials'
                  ? 'bg-[#00ad1d] text-white shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Detailed Budget & Financial Health Ledger"
            >
              <DollarSign className="w-3.5 h-3.5" />
              <span>Budget & Financials</span>
              {portfolioFinancials.overBudgetCount > 0 && (
                <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse ml-0.5" title="Over-budget initiatives require review"></span>
              )}
            </button>
          </div>

          <button
            onClick={() => handleOpenExport()}
            className="px-3 py-2 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition shadow-2xs"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Export</span>
          </button>

          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-3.5 py-2 rounded-md bg-[#00ad1d] hover:bg-[#009218] text-white text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>New Project</span>
          </button>
        </div>
      </div>

      {/* Portfolio Financial Health Overview Banner */}
      <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-[#00ad1d]/10 text-[#00ad1d]">
              <Wallet className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Portfolio Capital & Expenditure Overview
              </h2>
              <span className="text-[11px] text-slate-500">
                Consolidated allocations across all strategic initiatives
              </span>
            </div>
          </div>

          {/* Quick Filter Pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setBudgetHealthFilter('All')}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold border transition ${
                budgetHealthFilter === 'All'
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              All Budgets ({projects.length})
            </button>
            <button
              type="button"
              onClick={() => setBudgetHealthFilter('Healthy')}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold border transition ${
                budgetHealthFilter === 'Healthy'
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
              }`}
            >
              Healthy ({portfolioFinancials.healthyCount})
            </button>
            <button
              type="button"
              onClick={() => setBudgetHealthFilter('HighBurn')}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold border transition ${
                budgetHealthFilter === 'HighBurn'
                  ? 'bg-amber-600 text-white border-amber-600'
                  : 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100'
              }`}
            >
              High Burn ({portfolioFinancials.highBurnCount})
            </button>
            {portfolioFinancials.overBudgetCount > 0 && (
              <button
                type="button"
                onClick={() => setBudgetHealthFilter('OverBudget')}
                className={`px-2.5 py-1 rounded text-[11px] font-semibold border transition ${
                  budgetHealthFilter === 'OverBudget'
                    ? 'bg-rose-600 text-white border-rose-600'
                    : 'bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100'
                }`}
              >
                Over Budget ({portfolioFinancials.overBudgetCount})
              </button>
            )}
          </div>
        </div>

        {/* 4 Executive Metric Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="bg-slate-50 p-3 rounded-md border border-slate-200">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Portfolio Capital</span>
            <p className="text-base font-extrabold text-slate-900 font-mono mt-1">
              ${portfolioFinancials.totalAllocated.toLocaleString()}
            </p>
            <span className="text-[10px] text-slate-400 mt-0.5 block">{projects.length} chartered initiatives</span>
          </div>

          <div className="bg-slate-50 p-3 rounded-md border border-slate-200">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Disbursed to Date</span>
            <p className="text-base font-extrabold text-slate-900 font-mono mt-1">
              ${portfolioFinancials.totalSpent.toLocaleString()}
            </p>
            <span className="text-[10px] text-slate-400 mt-0.5 block">Reconciled project expenses</span>
          </div>

          <div className={`p-3 rounded-md border ${
            portfolioFinancials.totalRemaining < 0
              ? 'bg-rose-50/70 border-rose-200'
              : 'bg-emerald-50/70 border-emerald-200'
          }`}>
            <span className={`text-[10px] font-bold uppercase tracking-wider ${
              portfolioFinancials.totalRemaining < 0 ? 'text-rose-700' : 'text-emerald-700'
            }`}>
              {portfolioFinancials.totalRemaining < 0 ? 'Portfolio Overrun' : 'Uncommitted Portfolio Funds'}
            </span>
            <p className={`text-base font-extrabold font-mono mt-1 ${
              portfolioFinancials.totalRemaining < 0 ? 'text-rose-700' : 'text-emerald-800'
            }`}>
              ${Math.abs(portfolioFinancials.totalRemaining).toLocaleString()}
            </p>
            <span className={`text-[10px] mt-0.5 block ${
              portfolioFinancials.totalRemaining < 0 ? 'text-rose-600' : 'text-emerald-600'
            }`}>
              {portfolioFinancials.totalRemaining < 0 ? 'Exceeds budget envelope' : 'Available for new allocations'}
            </span>
          </div>

          <div className="bg-slate-50 p-3 rounded-md border border-slate-200">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Portfolio Burn Rate</span>
              <span className="text-[10px] font-bold font-mono text-slate-700 shrink-0">{portfolioFinancials.portfolioBurn}%</span>
            </div>
            <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden mt-2">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  portfolioFinancials.portfolioBurn > 100 ? 'bg-rose-600' :
                  portfolioFinancials.portfolioBurn > 80 ? 'bg-amber-500' : 'bg-[#00ad1d]'
                }`}
                style={{ width: `${Math.min(portfolioFinancials.portfolioBurn, 100)}%` }}
              ></div>
            </div>
            <span className="text-[10px] text-slate-500 mt-1 block">
              {portfolioFinancials.healthyCount} on budget · {portfolioFinancials.highBurnCount + portfolioFinancials.overBudgetCount} require attention
            </span>
          </div>
        </div>
      </div>

      {/* Filter Bar Extended */}
      <div className="bg-white p-3 rounded-md border border-slate-200 text-xs shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          
          {/* Desktop Inline Dropdowns */}
          <div className="hidden md:flex items-center gap-3 flex-wrap">
            {/* Department Filter */}
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-slate-500">Department:</span>
              <select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value as any)}
                className="py-1.5 px-2.5 rounded-md border border-slate-200 bg-slate-50 text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
              >
                <option value="All">All Departments</option>
                {availableDepartments.map(dept => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-slate-500">Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="py-1.5 px-2.5 rounded-md border border-slate-200 bg-slate-50 text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
              >
                <option value="All">All Statuses</option>
                <option value="Active">Active</option>
                <option value="On Track">On Track</option>
                <option value="At Risk">At Risk</option>
                <option value="Delayed">Delayed</option>
                <option value="Completed">Completed</option>
              </select>
            </div>

            {/* Lead Filter */}
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-slate-500">Lead:</span>
              <select
                value={leadFilter}
                onChange={(e) => setLeadFilter(e.target.value)}
                className="py-1.5 px-2.5 rounded-md border border-slate-200 bg-slate-50 text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
              >
                <option value="All">All Leads</option>
                {uniqueLeads.map(lead => (
                  <option key={lead} value={lead}>{lead}</option>
                ))}
              </select>
            </div>

            {/* Budget Health Filter */}
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-slate-500">Budget Health:</span>
              <select
                value={budgetHealthFilter}
                onChange={(e) => setBudgetHealthFilter(e.target.value as any)}
                className="py-1.5 px-2.5 rounded-md border border-slate-200 bg-slate-50 text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
              >
                <option value="All">All Budget Statuses</option>
                <option value="Healthy">Healthy (&lt;80%)</option>
                <option value="HighBurn">High Burn (80-100%)</option>
                <option value="OverBudget">Over Budget (&gt;100%)</option>
              </select>
            </div>
          </div>

          {/* Mobile Filters Toggle Button */}
          <div className="flex md:hidden items-center gap-2">
            <button
              onClick={() => setShowMobileFilters(!showMobileFilters)}
              className="px-2.5 py-1.5 rounded-md border border-slate-200 bg-slate-50 text-slate-700 font-semibold flex items-center gap-1.5 text-xs"
            >
              <Filter className="w-3.5 h-3.5 text-slate-500" />
              <span>Filters</span>
              <ChevronDown className={`w-3 h-3 transition-transform ${showMobileFilters ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {/* Search Box */}
          <div className="relative flex-1 md:flex-initial min-w-[200px] md:w-64">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search initiatives by name, code or lead..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-md border border-slate-200 text-xs bg-slate-50 focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
            />
          </div>
        </div>

        {/* Collapsible Mobile Filters Panel */}
        {showMobileFilters && (
          <div className="md:hidden pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
            <div>
              <label className="text-[10px] text-slate-500 font-semibold block mb-1">Department</label>
              <select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value as any)}
                className="w-full py-1.5 px-2 rounded-md border border-slate-200 bg-slate-50 text-slate-700"
              >
                <option value="All">All Departments</option>
                {availableDepartments.map(dept => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] text-slate-500 font-semibold block mb-1">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full py-1.5 px-2 rounded-md border border-slate-200 bg-slate-50 text-slate-700"
              >
                <option value="All">All Statuses</option>
                <option value="Active">Active</option>
                <option value="On Track">On Track</option>
                <option value="At Risk">At Risk</option>
                <option value="Delayed">Delayed</option>
                <option value="Completed">Completed</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] text-slate-500 font-semibold block mb-1">Lead</label>
              <select
                value={leadFilter}
                onChange={(e) => setLeadFilter(e.target.value)}
                className="w-full py-1.5 px-2 rounded-md border border-slate-200 bg-slate-50 text-slate-700"
              >
                <option value="All">All Leads</option>
                {uniqueLeads.map(lead => (
                  <option key={lead} value={lead}>{lead}</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Empty State */}
      {filteredProjects.length === 0 && (
        <div className="bg-white rounded-lg border border-slate-200 p-12 text-center shadow-2xs space-y-3">
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
            <Search className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-800">No Initiatives Found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            No projects matched your active filters. Try clearing your search query or reset the budget health filter.
          </p>
          <button
            type="button"
            onClick={() => {
              setDepartmentFilter('All');
              setStatusFilter('All');
              setLeadFilter('All');
              setBudgetHealthFilter('All');
              setSearchQuery('');
            }}
            className="px-3.5 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition"
          >
            Clear All Filters
          </button>
        </div>
      )}

      {/* VIEW MODE 1: CARDS GRID */}
      {filteredProjects.length > 0 && viewMode === 'cards' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredProjects.map(proj => {
            const taskStats = getProjectTaskCounts(proj);
            const isAtRiskOrDelayed = proj.status === 'At Risk' || proj.status === 'Delayed';

            // Calculate live totals using centralized helper
            const { alloc, spent, burnPct } = getProjectFinancials(proj);

            return (
              <div
                key={proj.id}
                className="bg-white rounded-md border border-slate-200 p-4 shadow-2xs hover:border-slate-300 transition space-y-3.5 flex flex-col justify-between"
              >
                <div className="space-y-3">
                  {/* Header with Status and Reason */}
                  <div className="flex items-start justify-between gap-3">
                    <div
                      onClick={() => onOpenNewProjectModal(proj, 'milestones')}
                      className="cursor-pointer group flex-1"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 group-hover:bg-slate-200 transition">
                          {proj.code}
                        </span>
                        <span className="text-xs font-semibold text-slate-500">{proj.department}</span>
                      </div>
                      <h3 className="text-base font-bold text-slate-900 group-hover:text-[#00ad1d] transition">
                        {proj.name}
                      </h3>
                    </div>

                    {/* Status badge */}
                    <div className="flex flex-col items-end shrink-0 max-w-[160px]">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                        proj.status === 'Completed' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                        proj.status === 'On Track' ? 'bg-blue-50 text-blue-800 border-blue-200' :
                        proj.status === 'At Risk' ? 'bg-amber-50 text-amber-900 border-amber-300' :
                        proj.status === 'Delayed' ? 'bg-rose-50 text-rose-900 border-rose-300' :
                        'bg-slate-100 text-slate-700 border-slate-200'
                      }`}>
                        {proj.status}
                      </span>

                      {/* Small italic reason line under badge */}
                      {isAtRiskOrDelayed && proj.statusReason && (
                        <p
                          className="text-[10px] italic text-amber-800 mt-1 truncate max-w-[150px] text-right cursor-help"
                          title={proj.statusReason}
                        >
                          {proj.statusReason}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">
                    {proj.description}
                  </p>

                  {/* Progress Bar (Milestones) */}
                  <div
                    onClick={() => onOpenNewProjectModal(proj, 'milestones')}
                    className="space-y-1 cursor-pointer group"
                  >
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                      <span className="group-hover:text-[#00ad1d] transition">Milestone Execution</span>
                      <span>{proj.progress}%</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#00ad1d] transition-all duration-500"
                        style={{ width: `${proj.progress}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Metrics Row with "View breakdown" link */}
                  <div className="bg-slate-50 p-2.5 rounded-md border border-slate-100 text-xs space-y-1.5">
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <p className="text-[10px] text-slate-400 font-medium">Budget</p>
                        <p className="font-bold text-slate-900 mt-0.5">${alloc.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400 font-medium">Spent</p>
                        <p className={`font-bold mt-0.5 ${spent > alloc && alloc > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                          ${spent.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400 font-medium">Target Date</p>
                        <p className="font-bold text-slate-900 mt-0.5">{proj.targetDate}</p>
                      </div>
                    </div>

                    {/* Budget burn badge & "View breakdown" link */}
                    <div className="pt-1.5 border-t border-slate-200/60 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                          spent > alloc && alloc > 0 ? 'bg-rose-100 text-rose-800' :
                          burnPct >= 80 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {burnPct}% Burn
                        </span>
                        {proj.budgetBreakdown && proj.budgetBreakdown.length > 0 && (
                          <span className="text-[10px] text-slate-400">
                            ({proj.budgetBreakdown.length} {proj.budgetBreakdown.length === 1 ? 'category' : 'categories'})
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => onOpenNewProjectModal(proj, 'budget')}
                        className="text-[11px] font-semibold text-[#00ad1d] hover:underline flex items-center gap-0.5"
                      >
                        <span>Budget & Ledger</span>
                        <ArrowUpRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Card Footer */}
                <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs gap-2">
                  {(() => {
                    const leadStaff = staff.find(s => s.name === proj.leadName);
                    return (
                      <span className="text-slate-500 truncate">
                        Lead: <b className="text-slate-800">{leadStaff ? formatStaffDisplayName(leadStaff) : proj.leadName}</b>
                        {leadStaff && (
                          <span className="text-[#008f18] text-[11px] font-semibold ml-1.5">
                            ({formatStaffDisplayOrgDept(leadStaff)})
                          </span>
                        )}
                        <span className="text-slate-400 ml-1.5 font-normal">({proj.membersCount} members)</span>
                      </span>
                    );
                  })()}

                  <div className="flex items-center gap-2 shrink-0">
                    {/* Small pill next to SharePoint link: "12 tasks · 3 overdue" */}
                    <button
                      type="button"
                      onClick={() => onOpenNewProjectModal(proj, 'tasks')}
                      className={`px-2 py-0.5 rounded text-[11px] font-semibold transition border ${
                        taskStats.overdue > 0
                          ? 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100'
                          : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                      }`}
                      title="Click to view linked tasks"
                    >
                      <span>{taskStats.total} {taskStats.total === 1 ? 'task' : 'tasks'}</span>
                      {taskStats.overdue > 0 && (
                        <span className="text-rose-600 font-bold ml-1">· {taskStats.overdue} overdue</span>
                      )}
                    </button>

                    {/* Quick export download icon in footer */}
                    <button
                      type="button"
                      onClick={() => handleOpenExport(proj)}
                      className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                      title="Quick Export Project Report"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>

                    <a
                      href={proj.sharePointFolderUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="px-2.5 py-1 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold flex items-center gap-1 transition text-xs"
                    >
                      <span>SharePoint</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* VIEW MODE 2: DEDICATED BUDGET & FINANCIALS LEDGER TABLE */}
      {filteredProjects.length > 0 && viewMode === 'financials' && (() => {
        // Compute sub-totals for currently filtered view using centralized helper
        const subtotalAlloc = filteredProjects.reduce((sum, p) => sum + getProjectFinancials(p).alloc, 0);
        const subtotalSpent = filteredProjects.reduce((sum, p) => sum + getProjectFinancials(p).spent, 0);
        const subtotalRemaining = subtotalAlloc - subtotalSpent;
        const subtotalBurn = subtotalAlloc > 0 ? Math.round((subtotalSpent / subtotalAlloc) * 100) : 0;

        return (
          <div className="bg-white rounded-lg border border-slate-200 shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50/50">
              <div>
                <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-[#00ad1d]" />
                  <span>Strategic Initiatives Financial Ledger</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Comprehensive audit of capital allocations, disbursements, remaining reserves, and burn efficiency.
                </p>
              </div>
              <div className="text-xs text-slate-500 font-medium">
                Showing {filteredProjects.length} {filteredProjects.length === 1 ? 'initiative' : 'initiatives'}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-semibold">
                    <th className="py-3 px-3.5">Initiative</th>
                    <th className="py-3 px-3">Lead / Dept</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3 text-right">Allocated Budget</th>
                    <th className="py-3 px-3 text-right">Disbursed (Spent)</th>
                    <th className="py-3 px-3 text-right">Remaining Capital</th>
                    <th className="py-3 px-3 text-center">Burn & Health</th>
                    <th className="py-3 px-3 text-center">Cost Categories</th>
                    <th className="py-3 px-3.5 text-right">Operations</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredProjects.map((proj) => {
                    const { alloc, spent, remaining, burnPct } = getProjectFinancials(proj);
                    const burn = burnPct;
                    const isOver = spent > alloc && alloc > 0;
                    const isHigh = !isOver && burn >= 80;

                    const leadStaff = staff.find(s => s.name === proj.leadName);

                    return (
                      <tr key={proj.id} className="hover:bg-slate-50/80 transition group">
                        <td className="py-3 px-3.5">
                          <button
                            type="button"
                            onClick={() => onOpenNewProjectModal(proj, 'budget')}
                            className="text-left group-hover:text-[#00ad1d] transition"
                          >
                            <div className="font-bold text-slate-900 leading-tight">
                              {proj.name}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="font-mono text-[10px] font-bold text-slate-500 bg-slate-100 px-1 rounded">
                                {proj.code}
                              </span>
                              <span className="text-[11px] text-slate-400">Target: {proj.targetDate}</span>
                            </div>
                          </button>
                        </td>

                        <td className="py-3 px-3">
                          <div className="font-semibold text-slate-800">
                            {leadStaff ? formatStaffDisplayName(leadStaff) : proj.leadName}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {proj.department}
                          </div>
                        </td>

                        <td className="py-3 px-3">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border inline-block ${
                            proj.status === 'Completed' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                            proj.status === 'On Track' ? 'bg-blue-50 text-blue-800 border-blue-200' :
                            proj.status === 'At Risk' ? 'bg-amber-50 text-amber-900 border-amber-300' :
                            proj.status === 'Delayed' ? 'bg-rose-50 text-rose-900 border-rose-300' :
                            'bg-slate-100 text-slate-700 border-slate-200'
                          }`}>
                            {proj.status}
                          </span>
                        </td>

                        <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                          ${alloc.toLocaleString()}
                        </td>

                        <td className={`py-3 px-3 text-right font-mono font-bold ${
                          isOver ? 'text-rose-600' : 'text-slate-800'
                        }`}>
                          ${spent.toLocaleString()}
                        </td>

                        <td className={`py-3 px-3 text-right font-mono font-bold ${
                          remaining < 0 ? 'text-rose-600' : 'text-emerald-700'
                        }`}>
                          ${remaining.toLocaleString()}
                        </td>

                        <td className="py-3 px-3 text-center min-w-[130px]">
                          <div className="flex items-center justify-between text-[11px] font-semibold mb-1 px-1">
                            <span className={isOver ? 'text-rose-700 font-bold' : isHigh ? 'text-amber-700 font-bold' : 'text-emerald-700'}>
                              {burn}%
                            </span>
                            <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                              isOver ? 'bg-rose-100 text-rose-800' :
                              isHigh ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                            }`}>
                              {isOver ? 'Overrun' : isHigh ? 'High Burn' : 'Healthy'}
                            </span>
                          </div>
                          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${
                                isOver ? 'bg-rose-500' : isHigh ? 'bg-amber-500' : 'bg-[#00ad1d]'
                              }`}
                              style={{ width: `${Math.min(burn, 100)}%` }}
                            ></div>
                          </div>
                        </td>

                        <td className="py-3 px-3 text-center">
                          {proj.budgetBreakdown && proj.budgetBreakdown.length > 0 ? (
                            <button
                              type="button"
                              onClick={() => onOpenNewProjectModal(proj, 'budget')}
                              className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold transition"
                              title={proj.budgetBreakdown.map(c => `${c.category}: $${Number(c.allocated).toLocaleString()}`).join(' • ')}
                            >
                              {proj.budgetBreakdown.length} {proj.budgetBreakdown.length === 1 ? 'category' : 'categories'}
                            </button>
                          ) : (
                            <span className="text-slate-400 text-[11px]">Uncategorized</span>
                          )}
                        </td>

                        <td className="py-3 px-3.5 text-right">
                          <button
                            type="button"
                            onClick={() => onOpenNewProjectModal(proj, 'budget')}
                            className="px-3 py-1 rounded bg-[#00ad1d]/10 hover:bg-[#00ad1d]/20 text-[#00ad1d] font-bold text-xs inline-flex items-center gap-1 transition"
                          >
                            <span>Ledger</span>
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>

                {/* Sub-total summary footer */}
                <tfoot>
                  <tr className="bg-slate-100/80 font-bold border-t-2 border-slate-200 text-slate-800">
                    <td colSpan={3} className="py-3 px-3.5 text-right uppercase tracking-wider text-[11px] text-slate-600">
                      Filtered Totals ({filteredProjects.length} initiatives):
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-sm text-slate-900">
                      ${subtotalAlloc.toLocaleString()}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-sm text-slate-900">
                      ${subtotalSpent.toLocaleString()}
                    </td>
                    <td className={`py-3 px-3 text-right font-mono text-sm ${
                      subtotalRemaining < 0 ? 'text-rose-600' : 'text-emerald-700'
                    }`}>
                      ${subtotalRemaining.toLocaleString()}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className="text-xs font-mono font-extrabold text-slate-900">
                        {subtotalBurn}% Avg Burn
                      </span>
                    </td>
                    <td colSpan={2} className="py-3 px-3.5 text-right text-xs text-slate-500 font-medium">
                      All amounts in USD ($)
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        );
      })()}

      {/* Requirement 9: Export Report Modal */}
      {isExportModalOpen && (
        <div className="oh-dialog fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-5 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Download className="w-4 h-4 text-[#00ad1d]" />
                <h3 className="font-bold text-sm text-slate-900">Export Strategic Reports</h3>
              </div>
              <button
                onClick={() => setIsExportModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Scope Selector */}
              <div>
                <label className="font-semibold text-slate-700 block mb-1.5">Export Scope</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setExportScope('all')}
                    className={`p-2.5 rounded-md border text-left transition ${
                      exportScope === 'all'
                        ? 'border-[#00ad1d] bg-emerald-50/50 text-[#00ad1d] font-bold'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <div>All Filtered Projects</div>
                    <div className="text-[10px] text-slate-500 font-normal mt-0.5">{filteredProjects.length} initiatives</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setExportScope('single')}
                    className={`p-2.5 rounded-md border text-left transition ${
                      exportScope === 'single'
                        ? 'border-[#00ad1d] bg-emerald-50/50 text-[#00ad1d] font-bold'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <div>Single Project</div>
                    <div className="text-[10px] text-slate-500 font-normal mt-0.5 truncate">
                      {selectedExportProject ? selectedExportProject.name : 'Select project'}
                    </div>
                  </button>
                </div>

                {exportScope === 'single' && (
                  <select
                    value={selectedExportProject?.id || ''}
                    onChange={(e) => {
                      const found = projects.find(p => p.id === e.target.value);
                      if (found) setSelectedExportProject(found);
                    }}
                    className="w-full mt-2 px-2.5 py-1.5 rounded-md border border-slate-200 bg-white"
                  >
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>{p.code ? `${p.code} - ` : ''}{p.name}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Format Toggle: Excel / PDF */}
              <div>
                <label className="font-semibold text-slate-700 block mb-1.5">Format</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setExportFormat('excel')}
                    className={`p-2.5 rounded-md border flex items-center gap-2 transition ${
                      exportFormat === 'excel'
                        ? 'border-[#00ad1d] bg-emerald-50/50 text-[#00ad1d] font-bold'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
                    <span>Excel (.CSV)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setExportFormat('pdf')}
                    className={`p-2.5 rounded-md border flex items-center gap-2 transition ${
                      exportFormat === 'pdf'
                        ? 'border-[#00ad1d] bg-emerald-50/50 text-[#00ad1d] font-bold'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <FileText className="w-4 h-4 text-rose-600" />
                    <span>PDF Printable</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsExportModalOpen(false)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-md font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleGenerateExport}
                className="px-4 py-1.5 bg-[#00ad1d] hover:bg-[#009218] text-white rounded-md text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Generate</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dedicated Create Project Initiative Modal */}
      <CreateProjectModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onProjectCreated={(newProject) => {
          setIsCreateModalOpen(false);
          onOpenNewProjectModal(newProject, 'milestones');
        }}
      />
    </div>
  );
};
