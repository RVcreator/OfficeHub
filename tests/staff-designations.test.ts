import {test} from 'node:test';import assert from 'node:assert/strict';
import {portalStore,setTableData} from '../src/services/store';import {supabase} from '../src/services/supabaseClient';
import {formatStaffDisplayName,getStaffHierarchy} from '../src/utils/staffHierarchy';
test('directory designations override stale browser titles and a failed read cannot resurrect them',async()=>{
 const from=supabase.from,storage=globalThis.localStorage;
 const saved={id:'member',name:'Haider',role:'Finance manager - WEC',organisation:'WEC',department:'Management'};
 (globalThis as any).localStorage={getItem:()=>JSON.stringify([{...saved,role:'CEO'},{id:'ghost',name:'Invented',role:'CEO'}]),setItem(){},removeItem(){}};
 try{
  (supabase as any).from=()=>({select(){return this;},order:async()=>({data:[saved],error:null})});
  const rows=await portalStore.getStaff();assert.equal(rows.length,1);assert.equal(rows[0].role,saved.role);assert.equal(formatStaffDisplayName(rows[0]),'Haider — Finance manager - WEC');assert.equal(getStaffHierarchy(rows)[0].departments[0].staff[0].role,saved.role);
  setTableData('staff',rows);
  (supabase as any).from=()=>({select(){return this;},order:async()=>({data:null,error:{message:'offline'}})});
  assert.equal((await portalStore.getStaff())[0].role,saved.role);await assert.rejects(portalStore.getStaff(true));
  setTableData('staff',[]);assert.deepEqual(await portalStore.getStaff(),[]);
 }finally{supabase.from=from;(globalThis as any).localStorage=storage;setTableData('staff',[]);}
});
