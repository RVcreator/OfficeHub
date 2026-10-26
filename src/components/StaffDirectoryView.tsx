import React, { useState, useMemo } from 'react';
import {
  Users,
  Mail,
  Phone,
  Video,
  CheckSquare,
  Search,
  Filter,
  ShieldCheck,
  Building2,
  ChevronDown,
  ChevronRight,
  UserCheck,
  ChevronsUpDown,
  ExternalLink
} from 'lucide-react';
import { StaffUser, UserPresenceStatus } from '../types';
import { usePortalStore } from '../services/store';
import {
  getStaffHierarchy,
  formatStaffDisplayName,
  formatStaffDisplayOrgDept,
  FIXED_ORGANISATION_ORDER
} from '../utils/staffHierarchy';
import { UserAvatar } from './UserAvatar';
import { UserRatingDisplay } from './UserRatingDisplay';
import { StaffProfileModal } from './StaffProfileModal';

interface StaffDirectoryViewProps {
  onAssignTaskToUser: (user: StaffUser) => void;
}

export const StaffDirectoryView: React.FC<StaffDirectoryViewProps> = ({
  onAssignTaskToUser
}) => {
  const { staff } = usePortalStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [organisationFilter, setOrganisationFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<UserPresenceStatus | 'All'>('All');
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

  const toggleAll = (expand: boolean) => {
    if (expand) {
      setCollapsedOrgs({});
      setCollapsedDepts({});
    } else {
      const allOrgs: Record<string, boolean> = {};
      const allDepts: Record<string, boolean> = {};
      staff.forEach(s => {
        allOrgs[s.organisation || 'WIPAHS'] = true;
        allDepts[`${s.organisation || 'WIPAHS'}:${s.department || 'General'}`] = true;
      });
      setCollapsedOrgs(allOrgs);
      setCollapsedDepts(allDepts);
    }
  };

  // Get distinct organisations
  const availableOrganisations = useMemo(() => {
    const raw = Array.from(new Set(staff.map(s => s.organisation || 'WIPAHS')));
    return [...raw].sort((a, b) => {
      const idxA = FIXED_ORGANISATION_ORDER.indexOf(a as any);
      const idxB = FIXED_ORGANISATION_ORDER.indexOf(b as any);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [staff]);

  // Filter staff by search and filter controls
  const filteredStaff = useMemo(() => {
    return staff.filter(user => {
      if (organisationFilter !== 'All' && (user.organisation || 'WIPAHS') !== organisationFilter) {
        return false;
      }
      if (statusFilter !== 'All') {
        if (statusFilter === 'Out of Office') {
          if (user.status !== 'Out of Office' && !user.outOfOffice) return false;
        } else if (user.status !== statusFilter) {
          return false;
        }
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = user.name.toLowerCase().includes(q);
        const matchesRole = user.role.toLowerCase().includes(q);
        const matchesEmail = user.email.toLowerCase().includes(q);
        const matchesOrg = (user.organisation || '').toLowerCase().includes(q);
        const matchesDept = (user.department || '').toLowerCase().includes(q);
        return matchesName || matchesRole || matchesEmail || matchesOrg || matchesDept;
      }
      return true;
    });
  }, [staff, organisationFilter, statusFilter, searchQuery]);

  // Two-level hierarchy: Organisation -> Department -> Staff
  const hierarchy = useMemo(() => {
    return getStaffHierarchy(filteredStaff);
  }, [filteredStaff]);

  const getStatusBadge = (status: UserPresenceStatus) => {
    switch (status) {
      case 'Online':
        return { bg: 'bg-emerald-50 text-emerald-800 border-emerald-200', dot: 'bg-emerald-500' };
      case 'Out of Office':
        return { bg: 'bg-amber-100 text-amber-900 border-amber-300 font-bold', dot: 'bg-amber-500' };
      case 'In Teams Meeting':
        return { bg: 'bg-purple-50 text-purple-800 border-purple-200', dot: 'bg-purple-500 animate-pulse' };
      case 'Busy':
        return { bg: 'bg-rose-50 text-rose-800 border-rose-200', dot: 'bg-rose-500' };
      case 'Away':
        return { bg: 'bg-amber-50 text-amber-800 border-amber-200', dot: 'bg-amber-500' };
      case 'Offline':
      default:
        return { bg: 'bg-slate-100 text-slate-700 border-slate-200', dot: 'bg-slate-400' };
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-md border border-slate-200 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-[#19232d]">Authorized Staff Directory</h1>
            <span className="text-xs px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 font-semibold border border-emerald-200">
              {filteredStaff.length} of {staff.length} staff
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Two-level organizational hierarchy: Organisation → Department → Staff with Microsoft Teams presence.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => toggleAll(true)}
            className="text-xs text-slate-600 hover:text-slate-900 font-medium px-2 py-1 rounded hover:bg-slate-100"
          >
            Expand All
          </button>
          <span className="text-slate-300">|</span>
          <button
            type="button"
            onClick={() => toggleAll(false)}
            className="text-xs text-slate-600 hover:text-slate-900 font-medium px-2 py-1 rounded hover:bg-slate-100"
          >
            Collapse All
          </button>

          <div className="flex items-center gap-2 text-xs bg-slate-50 px-3 py-1.5 rounded-md border border-slate-200 ml-2">
            <ShieldCheck className="w-4 h-4 text-[#00ad1d]" />
            <span className="text-slate-600 font-medium hidden sm:inline">Active Directory Synced</span>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-md border border-slate-200 text-xs">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          <div className="relative min-w-[220px] flex-1 max-w-sm">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name, designation, organisation, department..."
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
              onChange={(e) => setOrganisationFilter(e.target.value)}
              className="py-1.5 px-2.5 rounded-md border border-slate-200 bg-slate-50 text-slate-700 font-medium focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
            >
              <option value="All">All Organisations</option>
              {availableOrganisations.map(org => (
                <option key={org} value={org}>{org}</option>
              ))}
            </select>
          </div>

          {/* Presence Status Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 font-medium">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="py-1.5 px-2.5 rounded-md border border-slate-200 bg-slate-50 text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
            >
              <option value="All">All Presence Statuses</option>
              <option value="Online">Online</option>
              <option value="In Teams Meeting">In Teams Meeting</option>
              <option value="Busy">Busy</option>
              <option value="Away">Away</option>
              <option value="Offline">Offline</option>
              <option value="Out of Office">Out of Office / Leave</option>
            </select>
          </div>
        </div>

        <div className="text-[11px] text-slate-500">
          Online: <b className="text-emerald-700">{staff.filter(s => s.status === 'Online' || s.status === 'In Teams Meeting').length}</b> staff
        </div>
      </div>

      {/* Two-Level Hierarchical Tree / Grouped View */}
      {hierarchy.length === 0 ? (
        <div className="bg-white rounded-md border border-slate-200 p-12 text-center text-slate-500 text-xs">
          <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="font-semibold text-slate-700">No staff members match your criteria</p>
          <p className="text-slate-400 mt-1">Try clearing filters or search terms.</p>
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
                {/* Level 1 Heading: Organisation */}
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

                          {/* Level 3: Staff Members in this Department */}
                          {!isDeptCollapsed && (
                            <div className="p-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                              {deptGroup.staff.map(member => {
                                const statusBadge = getStatusBadge(member.status);
                                const teamsChatUrl = `https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(member.email)}`;

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
                                            <h3
                                              onClick={() => setSelectedStaffProfile(member)}
                                              className="font-bold text-sm text-slate-900 leading-snug truncate hover:text-[#008f18] cursor-pointer"
                                              title="Click to view full staff profile and evaluation history"
                                            >
                                              {formatStaffDisplayName(member)}
                                            </h3>

                                            {/* Line 2: Organisation • Department */}
                                            <p className="text-xs text-[#008f18] font-semibold mt-0.5 truncate">
                                              {formatStaffDisplayOrgDept(member)}
                                            </p>

                                            {/* Line 3: Compact Task Rating Row */}
                                            <div className="mt-1">
                                              <UserRatingDisplay
                                                userId={member.id}
                                                size="xs"
                                                onClick={() => setSelectedStaffProfile(member)}
                                              />
                                            </div>
                                          </div>
                                        </div>

                                        {/* Status Badge */}
                                        <span
                                          className={`text-[10px] px-2 py-0.5 rounded font-medium border shrink-0 ${statusBadge.bg}`}
                                        >
                                          {member.status}
                                        </span>
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
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="flex items-center gap-1.5 pt-2 border-t border-slate-100">
                                      <button
                                        type="button"
                                        onClick={() => setSelectedStaffProfile(member)}
                                        className="py-1.5 px-2 bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold rounded text-xs border border-slate-200 transition cursor-pointer"
                                        title="View staff profile & ratings"
                                      >
                                        Profile
                                      </button>

                                      <a
                                        href={teamsChatUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2 bg-purple-50 hover:bg-purple-100 text-purple-700 font-semibold rounded text-xs transition"
                                      >
                                        <Video className="w-3.5 h-3.5" />
                                        <span>Teams</span>
                                      </a>

                                      <button
                                        type="button"
                                        onClick={() => onAssignTaskToUser(member)}
                                        className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2 bg-[#00ad1d]/10 hover:bg-[#00ad1d]/20 text-[#008f18] font-semibold rounded text-xs transition cursor-pointer"
                                      >
                                        <CheckSquare className="w-3.5 h-3.5" />
                                        <span>Assign</span>
                                      </button>
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

      {/* Staff Profile and Performance Rating Modal */}
      <StaffProfileModal
        staffMember={selectedStaffProfile}
        isOpen={!!selectedStaffProfile}
        onClose={() => setSelectedStaffProfile(null)}
        onAssignTask={onAssignTaskToUser}
      />
    </div>
  );
};
