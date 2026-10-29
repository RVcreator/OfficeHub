import type {DepartmentInfo} from '../types';

const key=(value?:string)=>value?.trim().toLowerCase()||'';
export function organisationName(value?:string):string {
  const clean=value?.trim()||'WIPAHS';
  return ['WIPAHS','HO','HOP','WEC','MEDEWELL'].find(org=>key(org)===key(clean))||clean;
}
export function sameOrganisation(a?:string,b?:string):boolean {
  return key(organisationName(a))===key(organisationName(b));
}
export function departmentName(value:string|undefined,organisation?:string):string {
  const clean=value?.trim()||'General',org=organisationName(organisation),name=key(clean);
  if(['HO','HOP','WEC','MEDEWELL'].includes(org)&&['top management','management'].includes(name))return 'Management';
  if(org==='HO'&&['marketing and projects','projects and mkt','projects & mkt','projects and marketing','projects & marketing'].includes(name))return 'Projects and Marketing';
  return ['Top management','IT','Finance','Management','Logistics and Operations','Tabligh'].find(value=>key(value)===name)||clean;
}
export function belongsToDepartment(member:{department?:string;organisation?:string},department:{name:string;organisation?:string}):boolean {
  return sameOrganisation(member.organisation,department.organisation)&&key(departmentName(member.department,member.organisation))===key(departmentName(department.name,department.organisation));
}
export function departmentNamesForOrganisation(departments:DepartmentInfo[],organisation:string):string[] {
  const names=new Map<string,string>();
  for(const department of departments){
    const name=department.name.trim();
    if(name&&sameOrganisation(department.organisation,organisation)&&!names.has(key(name)))names.set(key(name),name);
  }
  return [...names.values()].sort((a,b)=>a.localeCompare(b));
}
export function selectedDepartment(names:string[],current:string):string {
  return names.find(name=>key(name)===key(current))||names[0]||'';
}
