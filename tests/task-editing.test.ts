import {test} from 'node:test';import assert from 'node:assert/strict';
import {taskAssigneeIds,taskAssigneeChanges} from '../src/services/taskEditing';
import {mapTaskToRow,mapTaskRow} from '../src/services/supabaseMappers';
const a='10000000-0000-4000-8000-000000000001',b='10000000-0000-4000-8000-000000000002';
const staff=[{id:a,name:'Alice',department:'IT',organisation:'WIPAHS',avatar:''},{id:b,name:'Bob',department:'Finance',organisation:'HO',avatar:''}] as any;
test('single and multi-assignee edits persist through the database mapper without changing ownership',()=>{
 const changes=taskAssigneeChanges([b,a,b],staff,'owner'),row=mapTaskToRow(changes);
 assert.deepEqual(row.assigned_to_ids,[b,a]);assert.equal(row.assigned_to_id,b);assert.equal(row.assigned_to_name,'Bob, Alice');assert.equal(row.assignment_type,'specific_people');assert.deepEqual(row.assigned_departments,[]);assert.deepEqual(row.assigned_organisations,[]);
 assert.equal(Object.hasOwn(row,'created_by_id'),false);assert.equal(Object.hasOwn(row,'status'),false);assert.deepEqual(taskAssigneeIds(mapTaskRow({id:'t',...row})),[b,a]);
});
test('only assigning the creator to themselves is personal; replacing and removing assignees retain correct audience',()=>{
 assert.equal(taskAssigneeChanges([a],staff,a).assignmentType,'personal');assert.equal(taskAssigneeChanges([b],staff,a).assignmentType,'specific_people');assert.equal(taskAssigneeChanges([a,b],staff,a).assignmentType,'specific_people');
 assert.deepEqual(taskAssigneeIds({assignedToIds:[],assignedToId:a} as any),[a]);assert.deepEqual(taskAssigneeIds({assignedToIds:[b],assignedToId:a} as any),[a,b],'include a primary assignee missing from the multi-assignee list');assert.deepEqual(taskAssigneeIds({assignedToIds:[a,b,a],assignedToId:a} as any),[a,b]);
});
test('empty, missing and deactivated assignees are rejected before saving',()=>{
 assert.throws(()=>taskAssigneeChanges([],staff,'owner'),/at least one/);assert.throws(()=>taskAssigneeChanges(['missing'],staff,'owner'),/active staff/);assert.throws(()=>taskAssigneeChanges([b],staff.map((s:any)=>({...s,deactivated:true})),'owner'),/active staff/);
});
