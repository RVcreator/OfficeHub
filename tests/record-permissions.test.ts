import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canViewApproval,canResolveApproval,canViewTask,canViewMeeting,canManageMeeting} from '../src/utils/recordPermissions';
import {portalStore,setTableData,subscribeTable} from '../src/services/store';
import {supabase} from '../src/services/supabaseClient';
import type {Approval,Task,Meeting,StaffUser} from '../src/types';
const requester={id:'10000000-0000-4000-8000-000000000001',name:'Requester',department:'Finance',organisation:'HO'} as StaffUser;
const approver={...requester,id:'10000000-0000-4000-8000-000000000002',name:'Approver'};
const unrelated={...requester,id:'10000000-0000-4000-8000-000000000003',name:'Unrelated',role:'Admin'} as StaffUser;
const approval={id:'private',requestedById:requester.id,approverIds:[approver.id],status:'Pending'} as Approval;
test('requesters and selected approvers see results; department and admin roles do not grant access',()=>{
 for(const status of ['Pending','Approved','Rejected']){
  const record={...approval,status} as Approval;
  assert.equal(canViewApproval(record,requester),true);assert.equal(canViewApproval(record,approver),true);assert.equal(canViewApproval(record,unrelated),false);
 }
 assert.equal(canResolveApproval(approval,requester),false);assert.equal(canResolveApproval(approval,approver),true);assert.equal(canResolveApproval(approval,unrelated),false);
 assert.equal(canResolveApproval({...approval,status:'Approved'},approver),false);
 const task={createdById:requester.id,assignedToIds:[approver.id],department:'Finance',organisation:'HO',assignmentType:'specific_people'} as Task;
 assert.equal(canViewTask(task,unrelated),false);assert.equal(canViewTask(task,approver),true);
 assert.equal(canViewTask({...task,assignmentType:'department',assignedDepartments:['finance']},unrelated),true);
 const meeting={organizerId:requester.id,attendees:[{userId:approver.id}]} as Meeting;
 assert.equal(canViewMeeting(meeting,approver),true);assert.equal(canManageMeeting(meeting,approver),false);assert.equal(canViewMeeting(meeting,unrelated),false);
});
test('store rejects unauthorized approval decisions and never publishes a denied save',async()=>{
 const from=supabase.from;let calls=0,publishes=0;
 setTableData('currentUser',requester);setTableData('approvals',[approval]);
 const stop=subscribeTable('approvals',()=>publishes++);
 (supabase as any).from=()=>{calls++;const q:any={};for(const key of ['update','eq','select'])q[key]=()=>q;q.single=async()=>({data:null,error:{message:'permission denied'}});return q;};
 try{
  await assert.rejects(portalStore.approveApproval('private'),/selected approvers/);assert.equal(calls,0);
  setTableData('currentUser',approver);await assert.rejects(portalStore.rejectApproval('private'),/permission denied/);assert.equal(publishes,0);
 }finally{stop();supabase.from=from;}
});
test('meeting edits persist invitation membership atomically and do not publish failed saves',async()=>{
 const rpc=supabase.rpc;let args:any,publishes=0;
 setTableData('currentUser',requester);setTableData('meetings',[]);const stop=subscribeTable('meetings',()=>publishes++);
 (supabase as any).rpc=async(name:string,body:any)=>{assert.equal(name,'officehub_save_meeting');args=body;return {data:null,error:{message:'invalid attendee'}};};
 try{
  await assert.rejects(portalStore.updateMeeting('meeting',{title:'Private',attendees:[{userId:approver.id} as any]}),/invalid attendee/);
  assert.deepEqual(args.p_attendees,[{user_id:approver.id}]);assert.equal(publishes,0);
  await assert.rejects(portalStore.respondToMeeting('meeting',approver.id,'Accepted'),/only respond for yourself/);
 }finally{stop();supabase.rpc=rpc;}
});
