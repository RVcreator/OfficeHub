import React, { useState, useMemo } from 'react';
import {
  Users,
  Mail,
  Phone,
  MessageSquare,
  CheckSquare,
  Search,
  ShieldCheck,
  Plus,
  Edit2,
  Trash2,
  KeyRound,
  X,
  CheckCircle2,
  Copy,
  AlertCircle,
  Building2,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import { StaffUser, UserPresenceStatus } from '../types';
import { UserAvatar } from './UserAvatar';
import { usePortalStore } from '../services/store';
import {
  getStaffHierarchy,
  formatStaffDisplayName,
  formatStaffDisplayOrgDept,
  FIXED_ORGANISATION_ORDER,
  sortOrganisations
} from '../utils/staffHierarchy';
import { UserRatingDisplay } from './UserRatingDisplay';
import { StaffProfileModal } from './StaffProfileModal';
import { getUserRatingSummary } from '../utils/staffRatings';

interface UsersViewProps {
  onAssignTaskToUser?: (user: StaffUser) => void;
}

const COMMON_DEPTS_BY_ORG: Record<string, string[]> = {
  WIPAHS: ['Top management', 'IT', 'Finance', 'Marketing', 'Logistics and Operations', 'Tabligh'],
  HO: ['Top management', 'IT', 'Finance', 'Marketing', 'Logistics and Operations', 'Tabligh'],
  HOP: ['Top management', 'IT', 'Finance', 'Marketing'],
  WEC: ['Top management', 'IT', 'Finance', 'Marketing'],
  MEDEWELL: ['Top management', 'IT', 'Finance', 'Marketing']
};

export const UsersView: React.FC<UsersViewProps> = ({ onAssignTaskToUser }) => {
  const { staff, actions, currentUser, tasks, departments } = usePortalStore();

  const [organisationFilter, setOrganisationFilter] = useState<string>('All');
  const [departmentFilter, setDepartmentFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<UserPresenceStatus | 'All'>('All');
  const [ratingFilter, setRatingFilter] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStaffProfile, setSelectedStaffProfile] = useState<StaffUser | null>(null);

  // Collapse state for organisations and departments
  const [collapsedOrgs, setCollapsedOrgs] = useState<Record<string, boolean>>({});
  const [collapsedDepts, setCollapsedDepts] = useState<Record<string, boolean>>({});

  const toggleOrg = (org: string) => {
    setCollapsedOrgs(prev => ({ ...prev, [org]: !prev[org] }));
  };

  const toggleDept = (deptKey: string) => {
    setCollapsedDepts(prev => ({ ...prev, [deptKey]: !prev[deptKey] }));
  };

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<StaffUser | null>(null);
  const [passwordResetInfo, setPasswordResetInfo] = useState<{ user: StaffUser; tempPass: string; isNewAccount?: boolean } | null>(null);
  const [copiedPass, setCopiedPass] = useState(false);
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<StaffUser | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: '',
    organisation: 'WIPAHS',
    department: 'Top management',
    phone: '+255 778 123 456',
    outOfOffice: false,
    status: 'Online' as UserPresenceStatus,
    teamsHandle: '',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80'
  });

  const availableOrganisations = useMemo(() => {
    const raw = Array.from(new Set(staff.map(s => s.organisation || 'WIPAHS')));
    return sortOrganisations(raw);
  }, [staff]);

  const availableDepartments = useMemo(() => {
    const relevantStaff = organisationFilter === 'All'
      ? staff
      : staff.filter(s => (s.organisation || 'WIPAHS') === organisationFilter);
    return Array.from(new Set(relevantStaff.map(s => s.department || 'General'))).sort();
  }, [staff, organisationFilter]);

  const resetForm = () => {
    setFormData({
      name: '',
      email: '',
      role: '',
      organisation: 'WIPAHS',
      department: 'Top management',
      phone: '+255 778 123 456',
      outOfOffice: false,
      status: 'Online',
      teamsHandle: '',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80'
    });
  };

  const handleOpenAdd = () => {
    resetForm();
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (user: StaffUser) => {
    setEditingUser(user);
    const isOoo = Boolean(user.outOfOffice || user.status === 'Out of Office');
    setFormData({
      name: user.name,
      email: user.email,
      role: user.role,
      organisation: user.organisation || 'WIPAHS',
      department: user.department || 'General',
      phone: user.phone,
      outOfOffice: isOoo,
      status: isOoo ? 'Out of Office' : user.status,
      teamsHandle: user.teamsHandle || '',
      avatar: user.avatar
    });
  };

  const handleSaveMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.email.trim() || !formData.role.trim() || !formData.department.trim()) {
      alert('Please fill in all required fields (Name, Email, Role, Department)');
      return;
    }

    const isOoo = formData.outOfOffice;

    if (editingUser) {
      await actions.updateStaffMember(editingUser.id, {
        name: formData.name.trim(),
        email: formData.email.trim(),
        role: formData.role.trim(),
        organisation: formData.organisation.trim(),
        department: formData.department.trim(),
        phone: formData.phone.trim(),
        outOfOffice: isOoo,
        status: isOoo ? 'Out of Office' : (editingUser.status === 'Out of Office' ? 'Online' : editingUser.status),
        teamsHandle: formData.teamsHandle.trim() || undefined,
        avatar: formData.avatar
      });
      setEditingUser(null);
    } else {
      let newStaff: StaffUser | null;
      try {
      newStaff = await actions.addStaffMember({
        name: formData.name.trim(),
        email: formData.email.trim(),
        role: formData.role.trim(),
        organisation: formData.organisation.trim(),
        department: formData.department.trim(),
        phone: formData.phone.trim(),
        outOfOffice: isOoo,
        status: isOoo ? 'Out of Office' : 'Online',
        teamsHandle: formData.teamsHandle.trim() || undefined,
        avatar: formData.avatar
      });
      } catch(error) {
        window.alert(error instanceof Error ? error.message : 'Account creation failed. Please try again.');
        return;
      }
      setIsAddModalOpen(false);
      if (newStaff && newStaff.temporaryPassword) {
        setPasswordResetInfo({
          user: newStaff,
          tempPass: newStaff.temporaryPassword,
          isNewAccount: true
        });
        setCopiedPass(false);
      }
    }
    resetForm();
  };

  const handleDeleteUser = async (user: StaffUser) => {
    if (user.id === currentUser.id) {
      alert('You cannot delete your own logged-in account.');
      return;
    }
    await actions.removeStaffMember(user.id);
    setDeleteConfirmUser(null);
  };

  const handleResetPassword = async (user: StaffUser) => {
    try {
      const res = await actions.resetUserPassword(user.id);
      if (!res.success || !res.message) throw new Error('Password reset was not confirmed.');
      setPasswordResetInfo({user,tempPass:res.message,isNewAccount:false});
      setCopiedPass(false);
    } catch(error) {
      window.alert(error instanceof Error ? error.message : 'Password reset failed. Please try again.');
    }
  };

  const filteredStaff = useMemo(() => {
    return staff.filter(user => {
      const userOrg = user.organisation || 'WIPAHS';
      const userDept = user.department || 'General';

      if (organisationFilter !== 'All' && userOrg !== organisationFilter) return false;
      if (departmentFilter !== 'All' && userDept !== departmentFilter) return false;
      if (statusFilter !== 'All') {
        if (statusFilter === 'Out of Office') {
          if (user.status !== 'Out of Office' && !user.outOfOffice) return false;
        } else if (user.status !== statusFilter) {
          return false;
        }
      }

      // Rating filter
      if (ratingFilter !== 'All') {
        const summary = getUserRatingSummary(user.id, tasks, staff);
        const avg = summary.averageRating;
        const count = summary.totalRatingsCount;

        if (ratingFilter === '5') {
          if (count === 0 || avg < 4.95) return false;
        } else if (ratingFilter === '4plus') {
          if (count === 0 || avg < 4.0) return false;
        } else if (ratingFilter === '3plus') {
          if (count === 0 || avg < 3.0) return false;
        } else if (ratingFilter === 'below3') {
          if (count === 0 || avg >= 3.0) return false;
        } else if (ratingFilter === 'rated') {
          if (count === 0) return false;
        } else if (ratingFilter === 'unrated') {
          if (count > 0) return false;
        }
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          user.name.toLowerCase().includes(q) ||
          user.role.toLowerCase().includes(q) ||
          user.email.toLowerCase().includes(q) ||
          userOrg.toLowerCase().includes(q) ||
          userDept.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [staff, tasks, organisationFilter, departmentFilter, statusFilter, ratingFilter, searchQuery]);

  // Two-level hierarchy: Organisation -> Department -> Staff
  const hierarchy = useMemo(() => {
    return getStaffHierarchy(filteredStaff);
  }, [filteredStaff]);

  const getStatusBadge = (status: UserPresenceStatus) => {
    switch (status) {
      case 'Online':
        return { bg: 'bg-emerald-50 text-emerald-800 border-emerald-200', dot: 'bg-emerald-500' };
      case 'In Teams Meeting':
        return { bg: 'bg-purple-50 text-purple-800 border-purple-200', dot: 'bg-purple-500 animate-pulse' };
      case 'Busy':
        return { bg: 'bg-rose-50 text-rose-800 border-rose-200', dot: 'bg-rose-500' };
      case 'Away':
        return { bg: 'bg-amber-50 text-amber-800 border-amber-200', dot: 'bg-amber-500' };
      case 'Out of Office':
        return { bg: 'bg-amber-100 text-amber-900 border-amber-300 font-bold', dot: 'bg-amber-500' };
      case 'Offline':
      default:
        return { bg: 'bg-slate-100 text-slate-700 border-slate-200', dot: 'bg-slate-400' };
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-lg border border-slate-200 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-md bg-[#00ad1d]/10 text-[#008f18]">
              <Users className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">User Account Administration</h1>
            <span className="text-xs px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 font-semibold border border-emerald-200">
              {staff.length} Team Accounts
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Two-level organizational administration: Organisation → Department → Staff with Microsoft Teams presence and security credentials.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleOpenAdd}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#00ad1d] hover:bg-[#009218] text-white text-xs font-semibold rounded-md shadow-2xs transition"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Member</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-lg border border-slate-200 text-xs shadow-2xs">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-[200px]">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search users by name, role, email, org, dept..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-md border border-slate-200 text-xs bg-slate-50 focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
            />
          </div>

          {/* Organisation Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 font-medium">Organisation:</span>
            <select
              value={organisationFilter}
              onChange={(e) => {
                setOrganisationFilter(e.target.value);
                setDepartmentFilter('All');
              }}
              className="py-1.5 px-2.5 rounded-md border border-slate-200 bg-slate-50 text-slate-700 font-medium focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
            >
              <option value="All">All Organisations</option>
              {availableOrganisations.map(org => (
                <option key={org} value={org}>{org}</option>
              ))}
            </select>
          </div>

          {/* Department Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 font-medium">Department:</span>
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
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
            <span className="text-slate-500 font-medium">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="py-1.5 px-2.5 rounded-md border border-slate-200 bg-slate-50 text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
            >
              <option value="All">All Statuses</option>
              <option value="Online">Online</option>
              <option value="In Teams Meeting">In Teams Meeting</option>
              <option value="Busy">Busy</option>
              <option value="Away">Away</option>
              <option value="Offline">Offline</option>
              <option value="Out of Office">Out of Office / Leave</option>
            </select>
          </div>

          {/* Rating Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 font-medium text-xs">Rating:</span>
            <select
              value={ratingFilter}
              onChange={(e) => setRatingFilter(e.target.value)}
              className="py-1 px-2 rounded border border-slate-200 bg-slate-50 text-slate-700 text-xs focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
            >
              <option value="All">All Ratings</option>
              <option value="5">5.0 (Top Rated)</option>
              <option value="4plus">4.0+ (High Performing)</option>
              <option value="3plus">3.0+ (Good)</option>
              <option value="below3">Below 3.0</option>
              <option value="rated">Evaluated ({'>'}0)</option>
              <option value="unrated">Unrated</option>
            </select>
          </div>
        </div>

        <div className="text-[11px] text-slate-500">
          Showing <b>{filteredStaff.length}</b> of {staff.length} staff members
        </div>
      </div>

      {/* Two-Level Hierarchical Grouped View */}
      {hierarchy.length === 0 ? (
        <div className="bg-white rounded-md border border-slate-200 p-12 text-center text-slate-500 text-xs">
          <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="font-semibold text-slate-700">No staff accounts match your criteria</p>
          <p className="text-slate-400 mt-1">Try adjusting your filters or search terms.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {hierarchy.map(orgGroup => {
            const org = orgGroup.organisation;
            const isOrgCollapsed = !!collapsedOrgs[org] && !searchQuery.trim();

            return (
              <div
                key={org}
                className="bg-white rounded-md border border-slate-200 shadow-2xs overflow-hidden"
              >
                {/* Level 1: Organisation Heading */}
                <div
                  onClick={() => toggleOrg(org)}
                  className="flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100/80 cursor-pointer select-none border-b border-slate-200 transition"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="p-1 rounded text-slate-400 hover:text-slate-700">
                      {isOrgCollapsed ? (
                        <ChevronRight className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </span>
                    <Building2 className="w-5 h-5 text-[#00ad1d]" />
                    <span className="font-bold text-base text-slate-900 tracking-tight">{org}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200/80 text-slate-700 font-semibold">
                      {orgGroup.totalStaff} {orgGroup.totalStaff === 1 ? 'member' : 'members'}
                    </span>
                  </div>

                  <span className="text-xs text-slate-500 font-medium">
                    {orgGroup.departments.length} {orgGroup.departments.length === 1 ? 'department' : 'departments'}
                  </span>
                </div>

                {/* Level 2 Sub-headings: Departments within Organisation */}
                {!isOrgCollapsed && (
                  <div className="p-4 space-y-4 bg-white">
                    {orgGroup.departments.map(deptGroup => {
                      const deptKey = `${org}:${deptGroup.department}`;
                      const isDeptCollapsed = !!collapsedDepts[deptKey] && !searchQuery.trim();

                      return (
                        <div
                          key={deptGroup.department}
                          className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50/40"
                        >
                          {/* Department Sub-heading Bar */}
                          <div
                            onClick={() => toggleDept(deptKey)}
                            className="flex items-center justify-between px-3.5 py-2 bg-slate-100/90 hover:bg-slate-200/70 cursor-pointer select-none border-b border-slate-200 text-xs transition"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-slate-400 hover:text-slate-700">
                                {isDeptCollapsed ? (
                                  <ChevronRight className="w-3.5 h-3.5" />
                                ) : (
                                  <ChevronDown className="w-3.5 h-3.5" />
                                )}
                              </span>
                              <Users className="w-4 h-4 text-slate-600" />
                              <span className="font-bold text-slate-900">{deptGroup.department}</span>
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-white text-slate-600 font-medium border border-slate-200">
                                {deptGroup.staff.length}
                              </span>
                            </div>

                            <span className="text-[11px] text-slate-500">
                              {org} • {deptGroup.department}
                            </span>
                          </div>

                          {/* Level 3: Staff Members Cards */}
                          {!isDeptCollapsed && (
                            <div className="p-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                              {deptGroup.staff.map(member => {
                                const statusBadge = getStatusBadge(member.status);
                                const teamsChatUrl = `https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(member.email)}`;
                                const isMe = member.id === currentUser.id;

                                return (
                                  <div
                                    key={member.id}
                                    className="bg-white rounded-md border border-slate-200 p-3.5 shadow-2xs hover:border-[#00ad1d]/50 hover:shadow-xs transition flex flex-col justify-between space-y-3"
                                  >
                                    <div>
                                      {/* Top Row: Avatar, Name & Designation, Org & Dept */}
                                      <div className="flex items-start justify-between gap-2.5">
                                        <div className="flex items-start gap-2.5 min-w-0">
                                          <div className="relative shrink-0 mt-0.5">
                                            <UserAvatar
                                              name={member.name}
                                              avatar={member.avatar}
                                              className="w-10 h-10 border border-slate-200"
                                            />
                                            <span
                                              className={`w-2.5 h-2.5 rounded-full absolute bottom-0 right-0 ring-2 ring-white ${statusBadge.dot}`}
                                            />
                                          </div>

                                          <div className="min-w-0">
                                            {/* Line 1: Name — Designation */}
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                              <h3 className="font-bold text-sm text-slate-900 leading-snug truncate">
                                                {formatStaffDisplayName(member)}
                                              </h3>
                                              {isMe && (
                                                <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded font-semibold">
                                                  You
                                                </span>
                                              )}
                                            </div>

                                            {/* Line 2: Organisation • Department */}
                                            <p className="text-xs text-[#008f18] font-semibold mt-0.5 truncate">
                                              {formatStaffDisplayOrgDept(member)}
                                            </p>
                                          </div>
                                        </div>

                                        {/* Status Badge */}
                                        <span
                                          className={`text-[10px] px-2 py-0.5 rounded font-medium border shrink-0 ${statusBadge.bg}`}
                                        >
                                          {member.status}
                                        </span>
                                      </div>

                                      {/* Contact Information */}
                                      <div className="space-y-1 mt-3 pt-2.5 border-t border-slate-100 text-xs text-slate-600">
                                        <div className="flex items-center gap-2 truncate">
                                          <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                          <a
                                            href={`mailto:${member.email}`}
                                            className="hover:text-[#008f18] truncate"
                                          >
                                            {member.email}
                                          </a>
                                        </div>
                                        <div className="flex items-center gap-2 truncate">
                                          <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                          <span>{member.phone}</span>
                                        </div>
                                      </div>

                                      {/* Out of Office Leave Banner if active */}
                                      {(member.outOfOffice || member.status === 'Out of Office') && (
                                        <div className="mt-2.5 p-2 bg-amber-50 rounded-md border border-amber-200 text-[11px] text-amber-950 flex items-start gap-1.5 shadow-2xs">
                                          <div className="min-w-0 flex-1 leading-snug">
                                            <div className="flex items-center justify-between gap-1 flex-wrap">
                                              <span className="font-bold text-amber-900">{member.leaveType || 'Out of Office'}</span>
                                              {member.leaveEndDate && (
                                                <span className="text-[10px] text-amber-800 font-semibold bg-amber-100/80 px-1 rounded">
                                                  Until {member.leaveEndDate}
                                                </span>
                                              )}
                                            </div>
                                            {member.outOfOfficeMessage && (
                                              <p className="text-[10px] italic text-amber-800 truncate mt-0.5">
                                                "{member.outOfOfficeMessage}"
                                              </p>
                                            )}
                                          </div>
                                        </div>
                                      )}

                                      {/* Staff Task Rating Average */}
                                      <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                                        <div
                                          onClick={() => setSelectedStaffProfile(member)}
                                          className="cursor-pointer group flex items-center gap-1.5"
                                          title="Click to view full performance ratings and evaluated tasks breakdown"
                                        >
                                          <span className="text-[10px] text-slate-400 font-medium group-hover:text-slate-700">Rating:</span>
                                          <UserRatingDisplay
                                            userId={member.id}
                                            size="xs"
                                            showZeroState={true}
                                            className="group-hover:scale-105 transition-transform"
                                          />
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => setSelectedStaffProfile(member)}
                                          className="text-[10px] text-[#008f18] hover:text-[#006e12] font-semibold hover:underline cursor-pointer"
                                        >
                                          Reviews
                                        </button>
                                      </div>
                                    </div>

                                    {/* Action Controls for Admin */}
                                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-1.5 text-xs">
                                      <a
                                        href={teamsChatUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-1 text-[11px] text-purple-700 bg-purple-50 hover:bg-purple-100 px-2 py-1 rounded font-medium transition"
                                      >
                                        <MessageSquare className="w-3 h-3" />
                                        <span>Teams</span>
                                      </a>

                                      {onAssignTaskToUser && (
                                        <button
                                          onClick={() => onAssignTaskToUser(member)}
                                          className="inline-flex items-center gap-1 text-[11px] text-[#008f18] hover:bg-emerald-50 px-2 py-1 rounded font-medium border border-[#00ad1d]/30 transition"
                                        >
                                          <CheckSquare className="w-3 h-3" />
                                          <span>Task</span>
                                        </button>
                                      )}

                                      <button
                                        onClick={() => handleResetPassword(member)}
                                        className="inline-flex items-center gap-1 text-[11px] text-amber-700 bg-amber-50 hover:bg-amber-100 px-2 py-1 rounded font-medium transition"
                                        title="Reset Password"
                                      >
                                        <KeyRound className="w-3 h-3" />
                                        <span>Pass</span>
                                      </button>

                                      <button
                                        onClick={() => handleOpenEdit(member)}
                                        className="p-1 rounded text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition"
                                        title="Edit Member"
                                      >
                                        <Edit2 className="w-3.5 h-3.5" />
                                      </button>

                                      {!isMe && (
                                        <button
                                          onClick={() => setDeleteConfirmUser(member)}
                                          className="p-1 rounded text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition"
                                          title="Remove Member"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Member Modal */}
      {(isAddModalOpen || editingUser) && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-lg w-full p-5 sm:p-6 shadow-xl border border-slate-200 space-y-4 animate-in fade-in duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-md bg-[#00ad1d]/10 text-[#008f18]">
                  <Users className="w-4 h-4" />
                </span>
                <h2 className="text-base font-bold text-slate-900">
                  {editingUser ? 'Edit Team Member Profile' : 'Add New Member to Staff Directory'}
                </h2>
              </div>
              <button
                onClick={() => {
                  setIsAddModalOpen(false);
                  setEditingUser(null);
                }}
                className="p-1 text-slate-400 hover:text-slate-700 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveMember} className="space-y-3.5 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Full Name (EMPL) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Amina Hassan"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-md border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Designation (DESIG) / Role <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Head of Tabligh, Director, Fin manager"
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-md border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Work Email <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="name@wipahs.org"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-md border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
                  />
                </div>
              </div>

              {/* Organisation and Department */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Organisation (ORG) <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formData.organisation}
                    onChange={(e) => {
                      const newOrg = e.target.value;
                      const suggestedDepts = COMMON_DEPTS_BY_ORG[newOrg] || ['General'];
                      setFormData({
                        ...formData,
                        organisation: newOrg,
                        department: suggestedDepts[0] || 'General'
                      });
                    }}
                    className="w-full px-3 py-1.5 rounded-md border border-slate-200 text-xs bg-white font-semibold focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
                  >
                    {FIXED_ORGANISATION_ORDER.map(org => (
                      <option key={org} value={org}>{org}</option>
                    ))}
                    {availableOrganisations.filter(o => !FIXED_ORGANISATION_ORDER.includes(o as any)).map(org => (
                      <option key={org} value={org}>{org}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Department (under {formData.organisation}) <span className="text-rose-500">*</span>
                  </label>
                  <select
                    required
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-md border border-slate-200 text-xs bg-white font-semibold focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
                  >
                    {departments
                      .filter(d => !formData.organisation || (d.organisation || 'WIPAHS') === formData.organisation)
                      .map(d => (
                        <option key={d.id} value={d.name}>{d.name}</option>
                      ))}
                    {departments.filter(d => !formData.organisation || (d.organisation || 'WIPAHS') === formData.organisation).length === 0 && (
                      (COMMON_DEPTS_BY_ORG[formData.organisation] || ['General']).map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))
                    )}
                    {!departments.some(d => d.name.toLowerCase() === formData.department.toLowerCase()) && (
                      <option value={formData.department}>{formData.department}</option>
                    )}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Phone / Extension
                  </label>
                  <input
                    type="text"
                    placeholder="+255 778 123 456"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-md border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Office Location & Availability
                  </label>
                  <select
                    value={formData.outOfOffice ? 'Out of Office' : 'In Office'}
                    onChange={(e) => {
                      const isOoo = e.target.value === 'Out of Office';
                      setFormData({
                        ...formData,
                        outOfOffice: isOoo,
                        status: isOoo ? 'Out of Office' : 'Online'
                      });
                    }}
                    className="w-full px-3 py-1.5 rounded-md border border-slate-200 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
                  >
                    <option value="In Office">In Office (System auto-detects status)</option>
                    <option value="Out of Office">Out of Office (On Leave / Travel)</option>
                  </select>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Teams meeting, online, and offline states are automatically detected.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Avatar Image URL
                  </label>
                  <input
                    type="text"
                    value={formData.avatar}
                    onChange={(e) => setFormData({ ...formData, avatar: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-md border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Microsoft Teams User Handle
                  </label>
                  <input
                    type="text"
                    placeholder="@user or user.teams"
                    value={formData.teamsHandle}
                    onChange={(e) => setFormData({ ...formData, teamsHandle: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-md border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
                  />
                </div>
              </div>

              {!editingUser && (
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-md text-[11px] text-slate-600">
                  <span className="font-semibold">Security Note:</span> A temporary initial password (<code className="bg-slate-200 px-1 rounded">Wipahs@2026</code>) will be generated for the new member. They can change it via their profile settings upon logging in.
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddModalOpen(false);
                    setEditingUser(null);
                  }}
                  className="px-3.5 py-1.5 text-slate-600 font-semibold hover:bg-slate-100 rounded-md text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#00ad1d] hover:bg-[#009218] text-white font-semibold rounded-md text-xs shadow-2xs"
                >
                  {editingUser ? 'Update Member' : 'Create Member Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Password Reset Modal */}
      {passwordResetInfo && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-5 sm:p-6 shadow-xl border border-slate-200 space-y-4 animate-in fade-in duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-md bg-amber-100 text-amber-800">
                  <KeyRound className="w-4 h-4" />
                </span>
                <h2 className="text-base font-bold text-slate-900">
                  {passwordResetInfo.isNewAccount ? 'Staff Account Created' : 'Password Reset Successful'}
                </h2>
              </div>
              <button
                onClick={() => setPasswordResetInfo(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-slate-600">
                A temporary password has been issued for <b>{passwordResetInfo.user.name}</b> ({passwordResetInfo.user.email}).
              </p>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-md flex items-center justify-between">
                <code className="text-sm font-bold text-slate-800 font-mono tracking-wide">
                  {passwordResetInfo.tempPass}
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(passwordResetInfo.tempPass);
                    setCopiedPass(true);
                    setTimeout(() => setCopiedPass(false), 2000);
                  }}
                  className="inline-flex items-center gap-1 text-xs px-2.5 py-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded shadow-2xs font-medium cursor-pointer"
                >
                  {copiedPass ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-700">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-500" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>

              <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-md text-[11px] text-amber-800 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Forced Password Change Active:</strong> This account has been provisioned with <code className="bg-amber-100/70 px-1 py-0.2 rounded font-mono text-amber-900">app_metadata: &#123; must_change_password: true &#125;</code>. Upon first sign-in, the user will be presented with a full-screen prompt to set a new permanent password before entering the portal.
                </span>
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-100">
              <button
                onClick={() => setPasswordResetInfo(null)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white font-semibold rounded-md text-xs shadow-2xs"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-5 shadow-xl border border-slate-200 space-y-4 animate-in fade-in duration-150">
            <div className="flex items-center gap-2 text-rose-600 font-bold text-base pb-2 border-b border-slate-100">
              <Trash2 className="w-5 h-5" />
              <span>Confirm Member Removal</span>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to remove <b>{deleteConfirmUser.name}</b> ({deleteConfirmUser.role}, {deleteConfirmUser.organisation || 'WIPAHS'} • {deleteConfirmUser.department}) from the active staff directory?
            </p>

            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-md text-[11px] text-rose-800">
              Their past audit trail logs and completed historical task records will be preserved for organizational accountability.
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setDeleteConfirmUser(null)}
                className="px-3.5 py-1.5 text-slate-600 font-semibold hover:bg-slate-100 rounded-md text-xs"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteUser(deleteConfirmUser)}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-md text-xs shadow-2xs"
              >
                Remove Member
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Staff Profile and Rating Breakdown Modal */}
      {selectedStaffProfile && (
        <StaffProfileModal
          staffMember={selectedStaffProfile}
          isOpen={true}
          onClose={() => setSelectedStaffProfile(null)}
          onAssignTask={onAssignTaskToUser ? (u) => {
            setSelectedStaffProfile(null);
            onAssignTaskToUser(u);
          } : undefined}
        />
      )}
    </div>
  );
};
