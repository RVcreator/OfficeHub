import React, { useState } from 'react';
import {
  ShieldCheck,
  Users,
  Check,
  X,
  Info,
  Building2,
  Lock,
  Unlock,
  CheckCircle2,
  Plus,
  Edit2,
  Trash2,
  UserCheck,
  AlertCircle
} from 'lucide-react';
import { usePortalStore } from '../services/store';
import { RolePermission } from '../types';
import { UserAvatar } from './UserAvatar';

export const RolesPermissionsView: React.FC = () => {
  const { roles, staff, actions, departments } = usePortalStore();
  const [selectedRoleId, setSelectedRoleId] = useState(roles[0]?.id || 'role-01');

  // Modals state
  const [isAddRoleModalOpen, setIsAddRoleModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<RolePermission | null>(null);
  const [deleteConfirmRole, setDeleteConfirmRole] = useState<RolePermission | null>(null);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [selectedStaffToAssign, setSelectedStaffToAssign] = useState('');

  // Form state
  const [formData, setFormData] = useState({
    roleTitle: '',
    department: 'Executive & Admin',
    description: '',
  });

  const activeRole = roles.find(r => r.id === selectedRoleId) || roles[0];

  const defaultModules = [
    'Tasks & Action Items',
    'Microsoft Teams & Meetings',
    'SharePoint Documents',
    'Operational Notices',
    'Financial Approvals',
    'Decisions & Resolutions',
    'Departments & Units',
    'User Accounts & Staff',
  ];

  const handleOpenAddRole = () => {
    setFormData({
      roleTitle: '',
      department: departments[0]?.name || 'Executive & Admin',
      description: '',
    });
    setIsAddRoleModalOpen(true);
  };

  const handleOpenEditRole = (role: RolePermission) => {
    setEditingRole(role);
    setFormData({
      roleTitle: role.roleTitle,
      department: role.department,
      description: role.description,
    });
  };

  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.roleTitle.trim()) {
      alert('Please provide a role title.');
      return;
    }

    if (editingRole) {
      await actions.updateRole(editingRole.id, {
        roleTitle: formData.roleTitle.trim(),
        department: formData.department,
        description: formData.description.trim() || 'Role defining operational scope and governance privileges.',
      });
      setEditingRole(null);
    } else {
      const newPermissions = defaultModules.map(module => ({
        module,
        view: true,
        create: true,
        edit: true,
        approve: false,
      }));

      const created = await actions.addRole({
        roleTitle: formData.roleTitle.trim(),
        department: formData.department,
        description: formData.description.trim() || 'Custom authorization role with specified system capabilities.',
        permissions: newPermissions,
      });
      if (created) setSelectedRoleId(created.id);
      setIsAddRoleModalOpen(false);
    }
  };

  const handleDeleteRole = (role: RolePermission) => {
    if (roles.length <= 1) {
      alert('You must keep at least one role in the system.');
      return;
    }
    actions.deleteRole(role.id);
    setDeleteConfirmRole(null);
    const remaining = roles.filter(r => r.id !== role.id);
    if (remaining.length > 0) {
      setSelectedRoleId(remaining[0].id);
    }
  };

  const handleTogglePermission = (
    moduleName: string,
    field: 'view' | 'create' | 'edit' | 'approve',
    currentVal: boolean
  ) => {
    if (!activeRole) return;
    actions.updateRolePermission(activeRole.id, moduleName, field, !currentVal);
  };

  const handleAssignUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStaffToAssign || !activeRole) return;
    actions.updateStaffMember(selectedStaffToAssign, {
      role: activeRole.roleTitle,
      department: (departments.some(d => d.name === activeRole.department) ? activeRole.department : undefined) as any,
    });
    setIsAssignModalOpen(false);
    setSelectedStaffToAssign('');
  };

  const staffWithThisRole = staff.filter(
    s => s.role.toLowerCase() === activeRole?.roleTitle.toLowerCase()
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-lg border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-md bg-[#00ad1d]/10 text-[#008f18]">
              <ShieldCheck className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Roles & Permissions Management</h1>
            <span className="text-xs px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 font-semibold border border-emerald-200">
              {roles.length} Defined Roles
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Configure granular access controls, view/edit privileges, and approval rights per organizational role.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleOpenAddRole}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#00ad1d] hover:bg-[#009218] text-white text-xs font-semibold rounded-md shadow-xs transition"
          >
            <Plus className="w-4 h-4" />
            <span>Add Custom Role</span>
          </button>
        </div>
      </div>

      {/* Role Selection Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {roles.map((role) => {
          const isSelected = activeRole?.id === role.id;
          const assignedCount = staff.filter(s => s.role.toLowerCase() === role.roleTitle.toLowerCase()).length;

          return (
            <button
              key={role.id}
              onClick={() => setSelectedRoleId(role.id)}
              className={`p-4 rounded-lg border text-left transition flex flex-col justify-between ${
                isSelected
                  ? 'bg-white border-[#00ad1d] ring-2 ring-[#00ad1d]/15 shadow-xs'
                  : 'bg-white border-slate-200 hover:border-slate-300'
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className={`p-1.5 rounded-md ${isSelected ? 'bg-[#00ad1d]/10 text-[#008f18]' : 'bg-slate-100 text-slate-600'}`}>
                    <ShieldCheck className="w-4 h-4" />
                  </span>
                  <span className="text-[10px] text-slate-500 font-semibold px-2 py-0.5 bg-slate-100 rounded">
                    {assignedCount} Assigned
                  </span>
                </div>
                <h3 className="text-xs font-bold text-slate-900 mt-2 truncate">{role.roleTitle}</h3>
                <p className="text-[11px] text-slate-400 font-medium">{role.department}</p>
                <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{role.description}</p>
              </div>

              <div className="pt-2 mt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
                <span>{role.permissions.length} Modules</span>
                <span className={isSelected ? 'text-[#00ad1d] font-bold' : ''}>
                  {isSelected ? 'Active Selection' : 'Click to Edit'}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Permissions Matrix & Role Management */}
      {activeRole && (
        <div className="bg-white rounded-lg border border-slate-200 shadow-xs overflow-hidden">
          {/* Header of Active Role */}
          <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">{activeRole.roleTitle}</h2>
                <span className="text-[11px] font-medium text-slate-600 bg-white border border-slate-200 px-2 py-0.5 rounded">
                  {activeRole.department}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">{activeRole.description}</p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsAssignModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-md border border-slate-200 transition"
              >
                <UserCheck className="w-3.5 h-3.5 text-slate-600" />
                <span>Assign Staff Member</span>
              </button>

              <button
                onClick={() => handleOpenEditRole(activeRole)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-md border border-slate-200 transition"
              >
                <Edit2 className="w-3.5 h-3.5 text-slate-600" />
                <span>Edit Role</span>
              </button>

              <button
                onClick={() => setDeleteConfirmRole(activeRole)}
                className="p-1.5 rounded-md text-rose-500 hover:text-rose-700 hover:bg-rose-50 border border-rose-200 transition"
                title="Delete this role"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Members Assigned to this Role */}
          <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-700">Currently Assigned Members:</span>
              {staffWithThisRole.length === 0 ? (
                <span className="text-slate-400 italic">No users currently assigned to this role.</span>
              ) : (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {staffWithThisRole.map(s => (
                    <span
                      key={s.id}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-700 font-medium text-[11px]"
                    >
                      <UserAvatar name={s.name} avatar={s.avatar} className="w-3.5 h-3.5 text-[9px]" />
                      <span>{s.name}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <span className="text-[11px] text-slate-400">
              Click checkboxes below to toggle permissions in real-time.
            </span>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                  <th className="py-3 px-4">System Module</th>
                  <th className="py-3 px-4 text-center">View / Read</th>
                  <th className="py-3 px-4 text-center">Create / Submit</th>
                  <th className="py-3 px-4 text-center">Edit / Update</th>
                  <th className="py-3 px-4 text-center">Approve / Authorize</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activeRole.permissions.map((perm, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/70 transition">
                    <td className="py-3 px-4 font-medium text-slate-800">
                      {perm.module}
                    </td>

                    {/* View */}
                    <td className="py-3 px-4 text-center">
                      <button
                        type="button"
                        onClick={() => handleTogglePermission(perm.module, 'view', perm.view)}
                        className={`inline-flex items-center justify-center w-7 h-7 rounded-md border transition cursor-pointer ${
                          perm.view
                            ? 'bg-emerald-500 text-white border-emerald-600 shadow-2xs hover:bg-emerald-600'
                            : 'bg-slate-100 text-slate-400 border-slate-200 hover:bg-slate-200'
                        }`}
                        title="Click to toggle View permission"
                      >
                        {perm.view ? <Check className="w-4 h-4 stroke-[2.5]" /> : <X className="w-4 h-4" />}
                      </button>
                    </td>

                    {/* Create */}
                    <td className="py-3 px-4 text-center">
                      <button
                        type="button"
                        onClick={() => handleTogglePermission(perm.module, 'create', perm.create)}
                        className={`inline-flex items-center justify-center w-7 h-7 rounded-md border transition cursor-pointer ${
                          perm.create
                            ? 'bg-emerald-500 text-white border-emerald-600 shadow-2xs hover:bg-emerald-600'
                            : 'bg-slate-100 text-slate-400 border-slate-200 hover:bg-slate-200'
                        }`}
                        title="Click to toggle Create permission"
                      >
                        {perm.create ? <Check className="w-4 h-4 stroke-[2.5]" /> : <X className="w-4 h-4" />}
                      </button>
                    </td>

                    {/* Edit */}
                    <td className="py-3 px-4 text-center">
                      <button
                        type="button"
                        onClick={() => handleTogglePermission(perm.module, 'edit', perm.edit)}
                        className={`inline-flex items-center justify-center w-7 h-7 rounded-md border transition cursor-pointer ${
                          perm.edit
                            ? 'bg-emerald-500 text-white border-emerald-600 shadow-2xs hover:bg-emerald-600'
                            : 'bg-slate-100 text-slate-400 border-slate-200 hover:bg-slate-200'
                        }`}
                        title="Click to toggle Edit permission"
                      >
                        {perm.edit ? <Check className="w-4 h-4 stroke-[2.5]" /> : <X className="w-4 h-4" />}
                      </button>
                    </td>

                    {/* Approve */}
                    <td className="py-3 px-4 text-center">
                      <button
                        type="button"
                        onClick={() => handleTogglePermission(perm.module, 'approve', perm.approve)}
                        className={`inline-flex items-center justify-center w-7 h-7 rounded-md border transition cursor-pointer ${
                          perm.approve
                            ? 'bg-emerald-500 text-white border-emerald-600 shadow-2xs hover:bg-emerald-600'
                            : 'bg-slate-100 text-slate-400 border-slate-200 hover:bg-slate-200'
                        }`}
                        title="Click to toggle Approve permission"
                      >
                        {perm.approve ? <Check className="w-4 h-4 stroke-[2.5]" /> : <X className="w-4 h-4" />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / Edit Role Modal */}
      {(isAddRoleModalOpen || editingRole) && (
        <div className="oh-dialog fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-5 sm:p-6 shadow-xl border border-slate-200 space-y-4 animate-in fade-in duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-md bg-[#00ad1d]/10 text-[#008f18]">
                  <ShieldCheck className="w-4 h-4" />
                </span>
                <h2 className="text-base font-bold text-slate-900">
                  {editingRole ? 'Edit Role Details' : 'Create Custom Role'}
                </h2>
              </div>
              <button
                onClick={() => {
                  setIsAddRoleModalOpen(false);
                  setEditingRole(null);
                }}
                className="p-1 text-slate-400 hover:text-slate-700 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveRole} className="space-y-3.5 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Role Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Finance Auditor"
                  value={formData.roleTitle}
                  onChange={(e) => setFormData({ ...formData, roleTitle: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-md border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Target Department
                </label>
                <select
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-md border border-slate-200 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
                >
                  {departments.map(dept => (
                    <option key={dept.id} value={dept.name}>{dept.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Scope & Responsibilities
                </label>
                <textarea
                  rows={3}
                  placeholder="Briefly describe what this role oversees..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-md border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddRoleModalOpen(false);
                    setEditingRole(null);
                  }}
                  className="px-3.5 py-1.5 text-slate-600 font-semibold hover:bg-slate-100 rounded-md text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#00ad1d] hover:bg-[#009218] text-white font-semibold rounded-md text-xs shadow-xs"
                >
                  {editingRole ? 'Save Changes' : 'Create Role'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign User to Role Modal */}
      {isAssignModalOpen && (
        <div className="oh-dialog fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-5 sm:p-6 shadow-xl border border-slate-200 space-y-4 animate-in fade-in duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-md bg-[#00ad1d]/10 text-[#008f18]">
                  <UserCheck className="w-4 h-4" />
                </span>
                <h2 className="text-base font-bold text-slate-900">
                  Assign Staff to {activeRole.roleTitle}
                </h2>
              </div>
              <button
                onClick={() => setIsAssignModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAssignUser} className="space-y-3.5 text-xs">
              <p className="text-slate-600">
                Select a staff member to grant the <b>{activeRole.roleTitle}</b> role and its associated permissions.
              </p>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Select Staff Member
                </label>
                <select
                  required
                  value={selectedStaffToAssign}
                  onChange={(e) => setSelectedStaffToAssign(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-md border border-slate-200 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
                >
                  <option value="">-- Choose team member --</option>
                  {staff.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} — Current: {s.role} ({s.department})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAssignModalOpen(false)}
                  className="px-3.5 py-1.5 text-slate-600 font-semibold hover:bg-slate-100 rounded-md text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!selectedStaffToAssign}
                  className="px-4 py-1.5 bg-[#00ad1d] hover:bg-[#009218] disabled:opacity-50 text-white font-semibold rounded-md text-xs shadow-xs"
                >
                  Assign Role
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmRole && (
        <div className="oh-dialog fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-5 shadow-xl border border-slate-200 space-y-4 animate-in fade-in duration-150">
            <div className="flex items-center gap-2 text-rose-600 font-bold text-base pb-2 border-b border-slate-100">
              <Trash2 className="w-5 h-5" />
              <span>Confirm Role Deletion</span>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to delete the <b>{deleteConfirmRole.roleTitle}</b> authorization role?
            </p>

            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-md text-[11px] text-rose-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>
                Staff members currently holding this role will remain active with their existing department credentials.
              </span>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setDeleteConfirmRole(null)}
                className="px-3.5 py-1.5 text-slate-600 font-semibold hover:bg-slate-100 rounded-md text-xs"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteRole(deleteConfirmRole)}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-md text-xs shadow-xs"
              >
                Delete Role
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
