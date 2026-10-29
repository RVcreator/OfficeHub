import { StaffUser } from '../types';
import {departmentName,organisationName,sameOrganisation} from './departmentDirectory';

export const FIXED_ORGANISATION_ORDER = ['WIPAHS', 'HO', 'HOP', 'WEC', 'MEDEWELL'] as const;

export interface DepartmentGroup {
  department: string;
  organisation: string;
  staff: StaffUser[];
}

export interface OrganisationGroup {
  organisation: string;
  departments: DepartmentGroup[];
  totalStaff: number;
}

/**
 * Sorts organisation names according to the fixed order:
 * WIPAHS, HO, HOP, WEC, MEDEWELL, then any others alphabetically.
 */
export function sortOrganisations(orgs: string[]): string[] {
  return [...orgs].sort((a, b) => {
    const indexA = FIXED_ORGANISATION_ORDER.indexOf(a as any);
    const indexB = FIXED_ORGANISATION_ORDER.indexOf(b as any);

    if (indexA !== -1 && indexB !== -1) {
      return indexA - indexB;
    }
    if (indexA !== -1) return -1;
    if (indexB !== -1) return 1;

    return a.localeCompare(b);
  });
}

export const CORE_DEPARTMENTS_LIST = [
  'Top management',
  'IT',
  'Finance',
  'Marketing',
  'Logistics and Operations',
  'Tabligh'
] as const;

/**
 * Groups and sorts staff into a two-level hierarchy:
 * Organisation (sorted by fixed order)
 *   └ Department (sorted alphabetically within Organisation)
 *       └ Staff members (sorted alphabetically by Name within Department)
 */
export function getStaffHierarchy(staffList: StaffUser[]): OrganisationGroup[] {
  // Collect all distinct organisations present in staff list
  const rawOrgs = Array.from(new Set(
    (staffList || []).map(s => organisationName(s.organisation))
  ));
  const sortedOrgs = sortOrganisations(rawOrgs);

  return sortedOrgs.map(org => {
    const staffInOrg = (staffList || []).filter(s => (organisationName(s.organisation)) === org);
    
    // Collect distinct departments within this organisation that have staff
    const staffDeptNames = Array.from(new Set(
      staffInOrg.map(s => departmentName(s.department,s.organisation))
    )).sort((a, b) => a.localeCompare(b));

    const departments: DepartmentGroup[] = staffDeptNames.map(dept => {
      const staffInDept = staffInOrg
        .filter(s => departmentName(s.department,s.organisation) === dept)
        .sort((a, b) => a.name.localeCompare(b.name));

      return {
        department: dept,
        organisation: org,
        staff: staffInDept,
      };
    }).filter(d => d.staff.length > 0);

    return {
      organisation: org,
      departments,
      totalStaff: departments.flatMap(d => d.staff).length,
    };
  }).filter(orgGroup => orgGroup.departments.length > 0);
}

/**
 * Formats a staff member display:
 * Name — Designation
 * Organisation • Department
 */
export function formatStaffDisplayName(member: { name: string; role: string }): string {
  return `${member.name} — ${member.role}`;
}

export function formatStaffDisplayOrgDept(member: { organisation?: string; department?: string }): string {
  const org = member.organisation || 'WIPAHS';
  const dept = member.department || 'General';
  return `${org} • ${dept}`;
}
