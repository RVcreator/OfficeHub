import React, { useState, useMemo, useRef } from 'react';
import {
  Building2,
  Users,
  Search,
  ArrowRight,
  Plus,
  Edit2,
  Trash2,
  X,
  AlertCircle,
  Filter,
  Layers
} from 'lucide-react';
import { usePortalStore } from '../services/store';
import { Department, DepartmentInfo, StaffUser } from '../types';
import {
  sortOrganisations,
  FIXED_ORGANISATION_ORDER
} from '../utils/staffHierarchy';
import { UserAvatar } from './UserAvatar';
import {useDepartmentDirectory} from '../hooks/useDepartmentDirectory';
import {organisationName,sameOrganisation,belongsToDepartment,departmentName} from '../utils/departmentDirectory';

interface DepartmentsViewProps {
  onSelectDepartmentTasks?: (dept: string) => void;
}

export const DepartmentsView: React.FC<DepartmentsViewProps> = ({ onSelectDepartmentTasks }) => {
  const { departments, tasks, projects, staff, actions } = usePortalStore(['departments', 'tasks', 'projects', 'staff']);
  const [dataError,setDataError]=useState<string|null>(null);
  const [saving,setSaving]=useState(false);
  const savePending=useRef(false);
  const directory=useDepartmentDirectory();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrgFilter, setSelectedOrgFilter] = useState<string>('All');
  const [groupByOrg, setGroupByOrg] = useState<boolean>(true);

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<DepartmentInfo | null>(null);
  const [deleteConfirmDept, setDeleteConfirmDept] = useState<DepartmentInfo | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    organisation: 'WIPAHS',
    budget: '$100,000',
  });

  const availableOrgs = useMemo(() => {
    const orgsSet = new Set<string>();
    FIXED_ORGANISATION_ORDER.forEach((org: string) => orgsSet.add(org));
    departments.forEach(d => {
      orgsSet.add(organisationName(d.organisation));
    });
    staff.forEach(s => {
      orgsSet.add(organisationName(s.organisation));
    });
    return sortOrganisations(Array.from(orgsSet));
  }, [departments, staff]);

  const resetForm = () => {
    setFormData({
      name: '',
      organisation: 'WIPAHS',
      budget: '$100,000',
    });
  };

  const handleOpenAdd = () => {
    resetForm();
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (dept: DepartmentInfo) => {
    setEditingDept(dept);
    setFormData({
      name: dept.name,
      organisation: dept.organisation || 'WIPAHS',
      budget: dept.budget || '$100,000',
    });
  };

  const handleSaveDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = formData.name.trim();
    if (!cleanName) {
      alert('Please provide a department name.');
      return;
    }

    if(savePending.current)return;savePending.current=true;setSaving(true);setDataError(null);
    try{
    const org = formData.organisation || 'WIPAHS';
    const headStaff = staff.find(s => (s.organisation || 'WIPAHS') === org && s.department === cleanName) ||
                      staff.find(s => (s.organisation || 'WIPAHS') === org);
    const headAvatar = headStaff?.avatar || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80';
    const headRole = headStaff?.role || 'Staff Member';
    const headName = headStaff?.name || cleanName;

    if (editingDept) {
      await actions.updateDepartment(editingDept.id, {
        name: cleanName as Department,
        organisation: org,
        headName,
        headRole,
        headAvatar,
        budget: formData.budget.trim() || '$100,000',
        description: ''
      });
      setEditingDept(null);
    } else {
      await actions.addDepartment({
        name: cleanName as Department,
        organisation: org,
        headName,
        headRole,
        headAvatar,
        budget: formData.budget.trim() || '$100,000',
        description: ''
      });
      setIsAddModalOpen(false);
    }
    resetForm();
    }catch(error){setDataError(error instanceof Error?error.message:'Department could not be saved.');}
    finally{savePending.current=false;setSaving(false);}
  };

  const handleDeleteDepartment = async (dept: DepartmentInfo) => {
    try{await actions.deleteDepartment(dept.id);setDeleteConfirmDept(null);setDataError(null);}
    catch(error){setDataError(error instanceof Error?error.message:'Department could not be deleted.');}
  };

  // Filter departments by organization and search query
  const filteredDepartments = useMemo(() => {
    return departments.filter(dept => {
      const org = organisationName(dept.organisation);
      const matchesOrg = selectedOrgFilter === 'All' || sameOrganisation(org,selectedOrgFilter);
      if (!matchesOrg) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const matchesDept = dept.name.toLowerCase().includes(q);
      const matchesOrgName = org.toLowerCase().includes(q);
      const deptMembers = staff.filter(s => belongsToDepartment(s,dept));
      const matchesStaff = deptMembers.some(m => m.name.toLowerCase().includes(q) || m.role.toLowerCase().includes(q));
      return matchesDept || matchesOrgName || matchesStaff;
    });
  }, [departments, staff, selectedOrgFilter, searchQuery]);

  // Group filtered departments by organisation
  const groupedDepartments = useMemo(() => {
    const map = new Map<string, DepartmentInfo[]>();
    filteredDepartments.forEach(dept => {
      const org = organisationName(dept.organisation);
      if (!map.has(org)) {
        map.set(org, []);
      }
      map.get(org)!.push(dept);
    });

    const sortedOrgKeys = sortOrganisations(Array.from(map.keys()));
    return sortedOrgKeys.map(org => ({
      org,
      departments: map.get(org)!.sort((a, b) => a.name.localeCompare(b.name))
    }));
  }, [filteredDepartments]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {directory.loading&&<p role="status" className="text-sm text-slate-500">Loading departments from Supabase…</p>}
      {directory.error&&<p role="alert" className="rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{directory.error} <button onClick={directory.retry} className="underline">Retry department connection</button></p>}
      {dataError&&<p role="alert" className="rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{dataError}</p>}
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-lg border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-md bg-[#00ad1d]/10 text-[#008f18]">
              <Building2 className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Departments Directory</h1>
            <span className="text-xs px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 font-semibold border border-emerald-200">
              {departments.length} Units Across {availableOrgs.length} Organisations
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Departmental units and assigned staff matching the authorized staff directory.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setGroupByOrg(!groupByOrg)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-md border transition ${
              groupByOrg
                ? 'bg-slate-100 text-slate-800 border-slate-300'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
            title="Toggle Organisation Grouping"
          >
            <Layers className="w-3.5 h-3.5 text-slate-500" />
            <span>{groupByOrg ? 'Grouped by Org' : 'Flat Grid'}</span>
          </button>

          <button
            onClick={handleOpenAdd}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#00ad1d] hover:bg-[#009218] text-white text-xs font-semibold rounded-md shadow-xs transition"
          >
            <Plus className="w-4 h-4" />
            <span>Add Department</span>
          </button>
        </div>
      </div>

      {/* Organisation Filter Tabs and Search Bar */}
      <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-xs space-y-3">
        {/* Organisation Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 pb-3 border-b border-slate-100">
          <span className="text-xs font-bold text-slate-500 mr-1 flex items-center gap-1">
            <Filter className="w-3 h-3 text-slate-400" />
            Organisation:
          </span>
          <button
            onClick={() => setSelectedOrgFilter('All')}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
              selectedOrgFilter === 'All'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All Organisations ({departments.length})
          </button>
          {availableOrgs.map(org => {
            const count = departments.filter(d => sameOrganisation(d.organisation,org)).length;
            const isSelected = selectedOrgFilter === org;
            return (
              <button
                key={org}
                onClick={() => setSelectedOrgFilter(org)}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-[#00ad1d] text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <span>{org}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isSelected ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search Input */}
        <div className="flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search departments, staff names, roles..."
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#00ad1d] focus:border-[#00ad1d]"
            />
          </div>

          <div className="text-xs text-slate-500 font-medium">
            Showing <strong className="text-slate-800">{filteredDepartments.length}</strong> department unit(s)
          </div>
        </div>
      </div>

      {/* Render Department Cards */}
      {filteredDepartments.length === 0 && directory.loading ? null : filteredDepartments.length === 0 ? (
        <div className="bg-white rounded-lg border border-slate-200 p-12 text-center shadow-xs">
          <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-700">No departments found</p>
          <p className="text-xs text-slate-400 mt-1">Try selecting another organisation or adjusting your search query.</p>
        </div>
      ) : groupByOrg ? (
        /* Grouped by Organisation Layout */
        <div className="space-y-6">
          {groupedDepartments.map(({ org, departments: orgDepts }) => (
            <div key={org} className="space-y-3">
              {/* Group Header */}
              <div className="flex items-center justify-between bg-slate-50 border border-slate-200/80 px-4 py-2.5 rounded-lg">
                <div className="flex items-center gap-2.5">
                  <span className="text-xs font-bold px-2 py-0.5 rounded bg-white text-slate-900 border border-slate-200 shadow-2xs uppercase tracking-wider">
                    {org}
                  </span>
                  <span className="text-xs font-semibold text-slate-700">
                    {org === 'WIPAHS' ? 'WIPAHS Main Headquarters' :
                     org === 'HO' ? 'Head Office' :
                     org === 'HOP' ? 'House of Peace' :
                     org === 'WEC' ? 'WIPAHS Education Centre' :
                     org === 'MEDEWELL' ? 'Medewell Charitable Health Centre' : org}
                  </span>
                </div>
                <span className="text-xs font-medium text-slate-500">
                  {orgDepts.length} Department{orgDepts.length > 1 ? 's' : ''}
                </span>
              </div>

              {/* Cards for this Org */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {orgDepts.map(dept => renderDepartmentCard(dept))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Flat Grid Layout */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredDepartments.map(dept => renderDepartmentCard(dept))}
        </div>
      )}

      {/* Add / Edit Department Modal */}
      {(isAddModalOpen || editingDept) && (
        <div className="oh-dialog fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-lg w-full p-5 sm:p-6 shadow-xl border border-slate-200 space-y-4 animate-in fade-in duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-md bg-[#00ad1d]/10 text-[#008f18]">
                  <Building2 className="w-4 h-4" />
                </span>
                <h2 className="text-base font-bold text-slate-900">
                  {editingDept ? 'Edit Department Unit' : 'Add New Department Unit'}
                </h2>
              </div>
              <button
                onClick={() => {
                  setIsAddModalOpen(false);
                  setEditingDept(null);
                }}
                className="p-1 text-slate-400 hover:text-slate-700 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveDepartment} aria-busy={saving} className="space-y-3.5 text-xs">
              {/* Level 1: Organisation */}
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Organisation (Level 1) <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={formData.organisation}
                  onChange={(e) => setFormData({ ...formData, organisation: e.target.value })}
                  className="w-full px-3 py-2 rounded-md border border-slate-200 text-xs font-semibold text-slate-800 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
                >
                  {availableOrgs.map(org => (
                    <option key={org} value={org}>
                      {org} — {
                        org === 'WIPAHS' ? 'WIPAHS Main Headquarters' :
                        org === 'HO' ? 'Head Office' :
                        org === 'HOP' ? 'House of Peace' :
                        org === 'WEC' ? 'WIPAHS Education Centre' :
                        org === 'MEDEWELL' ? 'Medewell Charitable Health Centre' : org
                      }
                    </option>
                  ))}
                </select>
              </div>

              {/* Level 2: Department Name */}
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Department Name (Level 2) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. management, Finance, IT..."
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-md border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddModalOpen(false);
                    setEditingDept(null);
                  }}
                  className="px-3.5 py-1.5 text-slate-600 font-semibold hover:bg-slate-100 rounded-md text-xs"
                >
                  Cancel
                </button>
                {dataError&&<p role="alert" className="text-xs text-rose-700">{dataError}</p>}
                <button
                  type="submit" disabled={saving}
                  className="px-4 py-1.5 bg-[#00ad1d] hover:bg-[#009218] text-white font-semibold rounded-md text-xs shadow-xs"
                >
                  {editingDept ? 'Update Department' : 'Create Department'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmDept && (
        <div className="oh-dialog fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-5 shadow-xl border border-slate-200 space-y-4 animate-in fade-in duration-150">
            <div className="flex items-center gap-2 text-rose-600 font-bold text-base pb-2 border-b border-slate-100">
              <Trash2 className="w-5 h-5" />
              <span>Confirm Department Deletion</span>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to remove the <b>{deleteConfirmDept.name}</b> department in <b>{deleteConfirmDept.organisation || 'WIPAHS'}</b>?
            </p>

            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-md text-[11px] text-rose-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>
                Reassign staff before deleting their department. Existing tasks, meetings and history remain unchanged.
              </span>
            </div>

            {dataError&&<p role="alert" className="text-xs text-rose-700">{dataError}</p>}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setDeleteConfirmDept(null)}
                className="px-3.5 py-1.5 text-slate-600 font-semibold hover:bg-slate-100 rounded-md text-xs"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteDepartment(deleteConfirmDept)}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-md text-xs shadow-xs"
              >
                Delete Department
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // Department Card Render Helper
  function renderDepartmentCard(dept: DepartmentInfo) {
    const org = organisationName(dept.organisation);
    const deptMembers = staff.filter(s => belongsToDepartment(s,dept))
                             .sort((a, b) => a.name.localeCompare(b.name));

    const deptTasks = tasks.filter(t => {
      const taskDept = t.department || '';
      const taskOrg = t.organisation || 'WIPAHS';
      if (t.assignedDepartments && t.assignedDepartments.includes(dept.name)) return true;
      return taskDept.toLowerCase() === dept.name.toLowerCase() && (taskOrg === org || !t.organisation);
    });

    const deptProjects = projects.filter(p => p.department.toLowerCase() === dept.name.toLowerCase());

    return (
      <div
        key={dept.id}
        className="bg-white rounded-lg border border-slate-200 p-5 flex flex-col justify-between hover:border-slate-300 transition shadow-xs"
      >
        <div className="space-y-3.5">
          {/* Card Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-md bg-slate-100 text-slate-700">
                <Building2 className="w-4 h-4" />
              </span>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-purple-50 text-purple-700 border border-purple-200">
                    {org}
                  </span>
                  <h3 className="text-sm font-bold text-slate-900 leading-tight">
                    {dept.name}
                  </h3>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => handleOpenEdit(dept)}
                className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition"
                title="Edit Department"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setDeleteConfirmDept(dept)}
                className="p-1 text-rose-400 hover:text-rose-700 hover:bg-rose-50 rounded transition"
                title="Delete Department"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Assigned Staff Members from Staff Directory */}
          <div className="space-y-2">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Department Members ({deptMembers.length})
            </p>
            {deptMembers.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-2">No staff currently assigned</p>
            ) : (
              <div className="space-y-1.5">
                {deptMembers.map(member => (
                  <div
                    key={member.id}
                    className="p-2.5 bg-slate-50 rounded-md border border-slate-100 flex items-center justify-between gap-2.5"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <UserAvatar
                        avatar={member.avatar}
                        name={member.name}
                        className="w-7 h-7 border border-white shadow-2xs shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 truncate">
                          {member.name} — {member.role}
                        </p>
                        <p className="text-[11px] text-[#008f18] font-medium truncate">
                          {organisationName(member.organisation)} • {departmentName(member.department,member.organisation)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Metrics Breakdown */}
          <div className="grid grid-cols-3 gap-2 py-2 border-y border-slate-100 text-center">
            <div>
              <p className="text-[10px] text-slate-400 uppercase font-medium">Staff</p>
              <p className="text-sm font-bold text-slate-800 mt-0.5">
                {deptMembers.length}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 uppercase font-medium">Projects</p>
              <p className="text-sm font-bold text-purple-700 mt-0.5">
                {deptProjects.length}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 uppercase font-medium">Tasks</p>
              <p className="text-sm font-bold text-blue-700 mt-0.5">
                {deptTasks.length}
              </p>
            </div>
          </div>
        </div>

        {/* Bottom Quick Action */}
        <div className="pt-3 mt-2 flex items-center justify-between border-t border-slate-100">
          <span className="text-[11px] text-slate-400">
            {org} Operations
          </span>
          {onSelectDepartmentTasks && (
            <button
              onClick={() => onSelectDepartmentTasks(dept.name)}
              className="text-xs font-medium text-[#00ad1d] hover:text-[#008f18] inline-flex items-center gap-1"
            >
              <span>View Tasks</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    );
  }
};
