import { test } from 'node:test';
import assert from 'node:assert/strict';
import { documentAudience, grantDocumentAccess } from '../supabase/functions/_shared/documentSharing';
import { taskCreatedAlert } from '../src/services/taskCreatedAlert';
const profiles = [{ id:'owner',department:'IT' }, { id:'reader',department:'Marketing' }, { id:'other',department:'IT' }];
test('specific document audiences never include unselected colleagues', () => {
  assert.deepEqual(documentAudience({ visibility:'Specific People', allowedUserIds:['reader'], editableUserIds:[] },profiles,'owner'), [{ id:'reader',role:'read' },{ id:'owner',role:'write' }]);
  assert.throws(() => documentAudience({ visibility:'Specific People', allowedUserIds:[], editableUserIds:['reader'] },profiles,'owner'), /Editors/);
  assert.throws(() => documentAudience({ visibility:'Everyone', allowedUserIds:['unknown'], editableUserIds:[] },profiles,'owner'), /existing staff/);
});
test('department sharing resolves actual staff IDs and keeps the owner', () => {
  assert.deepEqual(documentAudience({ visibility:'Department',targetDepartment:'marketing',allowedUserIds:[],editableUserIds:[] },profiles,'owner'), [{ id:'reader',role:'read' },{ id:'owner',role:'write' }]);
});
test('sharing requires Microsoft confirmation and sends no second invitation email', async () => {
  let request:any;
  const fetcher = async (_url:any, options:any) => { request=JSON.parse(options.body); return new Response(JSON.stringify({value:[{id:'permission',roles:['read']}]}),{status:200}); };
  assert.equal(await grantDocumentAccess(fetcher as any,'token','drive','item',{id:'reader',email:'reader@wipahs.org',role:'read'}),'permission');
  assert.equal(request.sendInvitation,false);
  assert.equal(request.requireSignIn,true);
  assert.equal(request.retainInheritedPermissions,true);
  assert.deepEqual(request.recipients,[{email:'reader@wipahs.org'}]);
  for (const status of [403,207,500]) await assert.rejects(grantDocumentAccess((async()=>new Response(JSON.stringify({value:[{id:'permission',roles:['read']}]}),{status})) as any,'token','drive','item',{id:'reader',email:'reader@wipahs.org',role:'read'}), /did not confirm/);
});
test('creating a task produces a deterministic self-targeted confirmation', () => {
  const result=taskCreatedAlert({id:'task',title:'Work'} as any,{id:'owner',name:'Owner'} as any);
  assert.equal(result.id,'task-created:task:owner');
  assert.equal(result.targetUserId,'owner');
  assert.equal(result.actorId,'owner');
  assert.equal(result.title,'Task created: Work');
});
