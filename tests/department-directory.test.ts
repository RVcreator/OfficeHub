import {mapStaffRow,mapStaffToRow} from '../src/services/supabaseMappers';
import {portalStore,setTableData,subscribeTable} from '../src/services/store';
import {supabase} from '../src/services/supabaseClient';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {departmentNamesForOrganisation,organisationName,belongsToDepartment,selectedDepartment,departmentName} from '../src/utils/departmentDirectory';
const departments:any[]=[{id:'a',name:'Finance',organisation:'WIPAHS'},{id:'b',name:' Finance ',organisation:' ho '},{id:'c',name:'finance',organisation:'HO'},{id:'d',name:'Projects and Marketing',organisation:'HO'},{id:'e',name:'Management',organisation:'WEC'}];
test('member choices contain saved departments only for the selected organisation and remove equivalent duplicates',()=>{
 assert.deepEqual(departmentNamesForOrganisation(departments,'HO'),['Finance','Projects and Marketing']);
 assert.deepEqual(departmentNamesForOrganisation(departments,'WEC'),['Management']);
 assert.deepEqual(departmentNamesForOrganisation(departments,'HOP'),[]);
 assert.equal(selectedDepartment(['Finance','Projects and Marketing'],'Top management'),'Finance');
 assert.equal(selectedDepartment([], 'Top management'),'');
 assert.equal(selectedDepartment(['Finance'],' finance '),'Finance');
});
test('department membership matches both organisation and department with harmless whitespace/case normalized',()=>{
 assert.equal(organisationName(' ho '),'HO');
 assert.equal(belongsToDepartment({department:' finance ',organisation:'HO'},{name:'Finance',organisation:' ho '}),true);
 assert.equal(belongsToDepartment({department:'Finance',organisation:'WIPAHS'},{name:'Finance',organisation:'HO'}),false);
 assert.equal(belongsToDepartment({department:'IT',organisation:'HO'},{name:'Finance',organisation:'HO'}),false);
});

test('workbook department names survive staff mapping and keep different organisations isolated',()=>{
 assert.equal(departmentName('Top management','HO'),'Management');
 assert.equal(departmentName('Top management','WIPAHS'),'Top management');
 assert.equal(departmentName('Marketing and Projects','HO'),'Projects and Marketing');
 assert.equal(belongsToDepartment({department:'Top management',organisation:'HO'},{name:'Management',organisation:'HO'}),true);
 assert.equal(belongsToDepartment({department:'Marketing',organisation:'HO'},{name:'Projects and Marketing',organisation:'HO'}),false);
});

test('staff database mapping preserves the selected department instead of folding it into another department',()=>{
 assert.equal(mapStaffRow({id:'fixture',organisation:'HO',department:'Projects and Marketing'}).department,'Projects and Marketing');
 assert.equal(mapStaffToRow({organisation:'HO',department:'Management'}).department,'Management');
 assert.equal(mapStaffToRow({organisation:'HO',department:'Projects and Marketing'}).department,'Projects and Marketing');
});
test('member reassignment waits for the exact Supabase row and does not show success when saving fails',async()=>{
 const id='10000000-0000-4000-8000-000000000001',original=supabase.from;
 setTableData('staff',[{id,name:'Fixture',email:'fixture@example.invalid',organisation:'HO',department:'Management'}] as any);
 let publishes=0,calls:any[]=[];const stop=subscribeTable('staff',()=>publishes++);
 const mock=(result:any)=>{(supabase as any).from=()=>{const q:any={};for(const method of ['update','eq','select'])q[method]=(...args:any[])=>{calls.push([method,...args]);return q;};q.single=async()=>result;return q;};};
 try{
  mock({data:null,error:{message:'Fixture denied'}});await assert.rejects(portalStore.updateStaffMember(id,{department:'Finance',organisation:'HO'}),/Fixture denied/);assert.equal(publishes,0);
  mock({data:{id,name:'Fixture',email:'fixture@example.invalid',organisation:'HO',department:'Projects and Marketing'},error:null});
  await portalStore.updateStaffMember(id,{department:'Projects and Marketing',organisation:'HO'});assert.equal(publishes,1);
  assert.deepEqual(calls.filter(call=>call[0]==='eq'),[['eq','id',id],['eq','id',id]]);
 }finally{stop();supabase.from=original;}
});
