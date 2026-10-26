import React, { useState, useMemo } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Building2,
  Users,
  User,
  Check,
  Search,
  CheckSquare,
  Square,
  AlertTriangle
} from 'lucide-react';
import { StaffUser } from '../types';
import { getStaffHierarchy, formatStaffDisplayName, formatStaffDisplayOrgDept } from '../utils/staffHierarchy';
import { MeetingConflict } from '../utils/meetingConflict';
import { UserAvatar } from './UserAvatar';

export interface SingleSelection {
  type: 'person' | 'department' | 'organisation';
  id: string; // user id or "dept:ORG:DEPT" or "org:ORG"
  name: string;
  organisation: string;
  department?: string;
  avatar?: string;
}

interface StaffPickerTreeSingleProps {
  mode: 'single';
  staff: StaffUser[];
  selectedId: string; // user id, or "dept:ORG:DEPT", or "org:ORG"
  onSelect: (selection: SingleSelection) => void;
  allowWholeGroup?: boolean; // allow selecting whole dept or org
  conflicts?: MeetingConflict[];
}

interface StaffPickerTreeMultipleProps {
  mode: 'multiple';
  staff: StaffUser[];
  selectedUserIds: string[];
  onChange: (selectedIds: string[]) => void;
  conflicts?: MeetingConflict[];
}

type StaffPickerTreeProps = StaffPickerTreeSingleProps | StaffPickerTreeMultipleProps;

export const StaffPickerTree: React.FC<StaffPickerTreeProps> = (props) => {
  const { staff, mode, conflicts = [] } = props;
  const [searchQuery, setSearchQuery] = useState('');
  
  // Collapse state for organisations and departments
  const [collapsedOrgs, setCollapsedOrgs] = useState<Record<string, boolean>>({});
  const [collapsedDepts, setCollapsedDepts] = useState<Record<string, boolean>>({});

  const toggleOrgCollapse = (org: string) => {
    setCollapsedOrgs(prev => ({ ...prev, [org]: !prev[org] }));
  };

  const toggleDeptCollapse = (key: string) => {
    setCollapsedDepts(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Deduplicate staff by id to prevent any repetition
  const uniqueStaff = useMemo(() => {
    const map = new Map<string, StaffUser>();
    (staff || []).forEach(s => {
      if (s && s.id) map.set(s.id, s);
    });
    return Array.from(map.values());
  }, [staff]);

  // Filter staff by search query if any
  const filteredStaff = useMemo(() => {
    if (!searchQuery.trim()) return uniqueStaff;
    const q = searchQuery.toLowerCase().trim();
    return uniqueStaff.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.role.toLowerCase().includes(q) ||
      (s.organisation || '').toLowerCase().includes(q) ||
      (s.department || '').toLowerCase().includes(q) ||
      s.email.toLowerCase().includes(q)
    );
  }, [uniqueStaff, searchQuery]);

  const hierarchy = useMemo(() => {
    return getStaffHierarchy(filteredStaff);
  }, [filteredStaff]);

  // Multiple selection helpers
  const handleToggleUserMultiple = (userId: string) => {
    if (props.mode !== 'multiple') return;
    if (props.selectedUserIds.includes(userId)) {
      props.onChange(props.selectedUserIds.filter(id => id !== userId));
    } else {
      props.onChange([...props.selectedUserIds, userId]);
    }
  };

  const handleToggleDepartmentMultiple = (deptStaff: StaffUser[]) => {
    if (props.mode !== 'multiple') return;
    const deptUserIds = deptStaff.map(s => s.id);
    const allSelected = deptUserIds.every(id => props.selectedUserIds.includes(id));
    if (allSelected) {
      props.onChange(props.selectedUserIds.filter(id => !deptUserIds.includes(id)));
    } else {
      const merged = Array.from(new Set([...props.selectedUserIds, ...deptUserIds]));
      props.onChange(merged);
    }
  };

  const handleToggleOrganisationMultiple = (orgStaff: StaffUser[]) => {
    if (props.mode !== 'multiple') return;
    const orgUserIds = orgStaff.map(s => s.id);
    const allSelected = orgUserIds.every(id => props.selectedUserIds.includes(id));
    if (allSelected) {
      props.onChange(props.selectedUserIds.filter(id => !orgUserIds.includes(id)));
    } else {
      const merged = Array.from(new Set([...props.selectedUserIds, ...orgUserIds]));
      props.onChange(merged);
    }
  };

  return (
    <div className="border border-slate-200 rounded-lg bg-white overflow-hidden text-xs">
      {/* Search Input */}
      <div className="p-2 border-b border-slate-200 bg-slate-50/70">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, designation, organisation, department..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 rounded-md border border-slate-200 bg-white text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#00ad1d]"
          />
        </div>
      </div>

      {/* Tree Content */}
      <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 p-1">
        {hierarchy.length === 0 ? (
          <div className="p-4 text-center text-slate-400 text-xs">
            No matching staff members found.
          </div>
        ) : (
          hierarchy.map(orgGroup => {
            const org = orgGroup.organisation;
            const isOrgCollapsed = !!collapsedOrgs[org] && !searchQuery.trim();
            const allOrgStaff = orgGroup.departments.flatMap(d => d.staff);

            // In multiple mode, check if all or some org staff are selected
            const orgUserIds = allOrgStaff.map(s => s.id);
            const isOrgFullySelected = mode === 'multiple' && orgUserIds.length > 0 && orgUserIds.every(id => props.selectedUserIds.includes(id));
            const isOrgPartiallySelected = mode === 'multiple' && !isOrgFullySelected && orgUserIds.some(id => props.selectedUserIds.includes(id));

            const isOrgSelectedSingle = mode === 'single' && props.selectedId === `org:${org}`;

            return (
              <div key={org} className="py-1">
                {/* Level 1: Organisation Heading */}
                <div
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded-md transition ${
                    isOrgSelectedSingle
                      ? 'bg-emerald-100 text-emerald-900 font-bold'
                      : 'bg-slate-100/80 hover:bg-slate-200/70 text-slate-800'
                  }`}
                >
                  <div
                    className="flex items-center gap-2 cursor-pointer flex-1 select-none"
                    onClick={() => toggleOrgCollapse(org)}
                  >
                    <span className="text-slate-400 hover:text-slate-700">
                      {isOrgCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </span>
                    <Building2 className="w-4 h-4 text-[#00ad1d]" />
                    <span className="font-bold text-slate-900 tracking-wide">{org}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-600 font-semibold">
                      {orgGroup.totalStaff} staff
                    </span>
                  </div>

                  {/* Actions depending on mode */}
                  {mode === 'multiple' ? (
                    <button
                      type="button"
                      onClick={() => handleToggleOrganisationMultiple(allOrgStaff)}
                      className="flex items-center gap-1 text-[11px] text-[#008f18] hover:text-[#007013] font-semibold px-2 py-0.5 rounded hover:bg-emerald-50"
                      title="Select all staff in this organisation"
                    >
                      {isOrgFullySelected ? (
                        <CheckSquare className="w-3.5 h-3.5 text-[#00ad1d]" />
                      ) : isOrgPartiallySelected ? (
                        <div className="w-3.5 h-3.5 border-2 border-[#00ad1d] bg-[#00ad1d]/30 rounded-xs flex items-center justify-center">
                          <div className="w-1.5 h-1.5 bg-[#00ad1d]" />
                        </div>
                      ) : (
                        <Square className="w-3.5 h-3.5 text-slate-400" />
                      )}
                      <span>Select All Org</span>
                    </button>
                  ) : (
                    props.allowWholeGroup && (
                      <button
                        type="button"
                        onClick={() => props.onSelect({
                          type: 'organisation',
                          id: `org:${org}`,
                          name: `All ${org} Team`,
                          organisation: org,
                        })}
                        className={`text-[10px] px-2 py-0.5 rounded font-semibold transition ${
                          isOrgSelectedSingle
                            ? 'bg-[#00ad1d] text-white'
                            : 'text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        Assign Whole Org
                      </button>
                    )
                  )}
                </div>

                {/* Level 2: Departments nested under Organisation */}
                {!isOrgCollapsed && (
                  <div className="pl-4 pr-1 mt-1 space-y-1">
                    {orgGroup.departments.map(deptGroup => {
                      const deptKey = `${org}:${deptGroup.department}`;
                      const isDeptCollapsed = !!collapsedDepts[deptKey] && !searchQuery.trim();

                      const deptUserIds = deptGroup.staff.map(s => s.id);
                      const isDeptFullySelected = mode === 'multiple' && deptUserIds.length > 0 && deptUserIds.every(id => props.selectedUserIds.includes(id));
                      const isDeptPartiallySelected = mode === 'multiple' && !isDeptFullySelected && deptUserIds.some(id => props.selectedUserIds.includes(id));

                      const isDeptSelectedSingle = mode === 'single' && props.selectedId === `dept:${deptKey}`;

                      return (
                        <div key={deptGroup.department} className="border-l-2 border-slate-200 pl-2 py-0.5">
                          {/* Department Sub-heading */}
                          <div
                            className={`flex items-center justify-between px-2 py-1 rounded transition ${
                              isDeptSelectedSingle
                                ? 'bg-emerald-50 text-emerald-900 font-bold'
                                : 'hover:bg-slate-50 text-slate-700'
                            }`}
                          >
                            <div
                              className="flex items-center gap-1.5 cursor-pointer flex-1 select-none"
                              onClick={() => toggleDeptCollapse(deptKey)}
                            >
                              <span className="text-slate-400">
                                {isDeptCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                              </span>
                              <Users className="w-3.5 h-3.5 text-slate-500" />
                              <span className="font-semibold text-slate-800">{deptGroup.department}</span>
                              <span className="text-[10px] text-slate-400">({deptGroup.staff.length})</span>
                            </div>

                            {/* Department action button */}
                            {mode === 'multiple' ? (
                              <button
                                type="button"
                                onClick={() => handleToggleDepartmentMultiple(deptGroup.staff)}
                                className="flex items-center gap-1 text-[10px] text-slate-600 hover:text-[#008f18] px-1.5 py-0.5 rounded hover:bg-slate-100"
                              >
                                {isDeptFullySelected ? (
                                  <CheckSquare className="w-3 h-3 text-[#00ad1d]" />
                                ) : isDeptPartiallySelected ? (
                                  <div className="w-3 h-3 border border-[#00ad1d] bg-[#00ad1d]/30 rounded-xs flex items-center justify-center">
                                    <div className="w-1.5 h-1.5 bg-[#00ad1d]" />
                                  </div>
                                ) : (
                                  <Square className="w-3 h-3 text-slate-400" />
                                )}
                                <span>Select Dept</span>
                              </button>
                            ) : (
                              props.allowWholeGroup && (
                                <button
                                  type="button"
                                  onClick={() => props.onSelect({
                                    type: 'department',
                                    id: `dept:${deptKey}`,
                                    name: `${deptGroup.department} (${org}) Team`,
                                    organisation: org,
                                    department: deptGroup.department,
                                  })}
                                  className={`text-[10px] px-1.5 py-0.5 rounded font-medium transition ${
                                    isDeptSelectedSingle
                                      ? 'bg-[#00ad1d] text-white font-semibold'
                                      : 'text-slate-500 hover:bg-slate-100'
                                  }`}
                                >
                                  Assign Dept
                                </button>
                              )
                            )}
                          </div>

                          {/* Level 3: Individual Staff Members */}
                          {!isDeptCollapsed && (
                            <div className="pl-4 pr-1 space-y-0.5 mt-0.5">
                              {deptGroup.staff.map(member => {
                                const isSelected = mode === 'multiple'
                                  ? props.selectedUserIds.includes(member.id)
                                  : props.selectedId === member.id;

                                return (
                                  <div
                                    key={member.id}
                                    onClick={() => {
                                      if (mode === 'multiple') {
                                        handleToggleUserMultiple(member.id);
                                      } else {
                                        props.onSelect({
                                          type: 'person',
                                          id: member.id,
                                          name: member.name,
                                          organisation: member.organisation,
                                          department: member.department,
                                          avatar: member.avatar,
                                        });
                                      }
                                    }}
                                    className={`flex items-center justify-between p-1.5 rounded cursor-pointer transition ${
                                      isSelected
                                        ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
                                        : 'hover:bg-slate-50 border border-transparent text-slate-800'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      {mode === 'multiple' ? (
                                        isSelected ? (
                                          <CheckSquare className="w-3.5 h-3.5 text-[#00ad1d] shrink-0" />
                                        ) : (
                                          <Square className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                                        )
                                      ) : isSelected ? (
                                        <div className="w-3.5 h-3.5 rounded-full bg-[#00ad1d] text-white flex items-center justify-center shrink-0">
                                          <Check className="w-2.5 h-2.5 stroke-[3]" />
                                        </div>
                                      ) : (
                                        <div className="w-3.5 h-3.5 rounded-full border border-slate-300 shrink-0" />
                                      )}

                                      <UserAvatar
                                        name={member.name}
                                        avatar={member.avatar}
                                        className="w-6 h-6 border border-slate-200"
                                      />

                                      <div className="min-w-0">
                                        {/* Line 1: Name — Designation */}
                                        <p className="font-semibold text-xs text-slate-900 leading-tight truncate">
                                          {formatStaffDisplayName(member)}
                                        </p>
                                        {/* Line 2: Organisation • Department */}
                                        <p className="text-[10px] text-slate-500 leading-tight truncate">
                                          {formatStaffDisplayOrgDept(member)}
                                        </p>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                      {(() => {
                                        const conflict = conflicts.find(c => c.userId === member.id);
                                        if (!conflict) return null;
                                        return (
                                          <div
                                            className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-800 text-[9px] font-semibold"
                                            title={`Conflicts with ${conflict.conflictingMeetingTitle} (${conflict.startTime} - ${conflict.endTime})`}
                                          >
                                            <AlertTriangle className="w-3 h-3 text-amber-600" />
                                            <span className="hidden sm:inline">Conflict</span>
                                          </div>
                                        );
                                      })()}

                                      {/* Presence Indicator */}
                                      <span
                                        className={`w-2 h-2 rounded-full shrink-0 ${
                                          member.status === 'Online'
                                            ? 'bg-emerald-500'
                                            : member.status === 'In Teams Meeting'
                                            ? 'bg-purple-500'
                                            : member.status === 'Busy'
                                            ? 'bg-rose-500'
                                            : 'bg-slate-300'
                                        }`}
                                        title={member.status}
                                      />
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
          })
        )}
      </div>
    </div>
  );
};
