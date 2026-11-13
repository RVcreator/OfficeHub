import {test} from 'node:test';import assert from 'node:assert/strict';
import {notificationTarget} from '../src/services/notificationNavigation';
import type {AppNotification} from '../src/types';
const alert=(extra:Partial<AppNotification>):AppNotification=>({id:'alert',title:'Fixture',message:'Fixture',type:'general',targetUserId:'user',createdAt:'2030-01-01',read:false,...extra});
test('notifications resolve saved record IDs, including meeting and document aliases',()=>{
 for(const [field,kind] of [['taskId','task'],['meetingId','meeting'],['noticeId','notice'],['approvalId','approval'],['conversationId','conversation'],['documentId','document'],['docId','document'],['decisionId','decision'],['projectId','project']])assert.deepEqual(notificationTarget(alert({metadata:{[field]:'record'}})),{kind,id:'record'});
 assert.deepEqual(notificationTarget(alert({meetingId:'meeting',metadata:{meetingId:'other'}})),{kind:'meeting',id:'meeting'});
 assert.deepEqual(notificationTarget(alert({metadata:{decisionId:'decision',projectId:'project'}})),{kind:'decision',id:'decision'});
});
test('legacy and malformed metadata use a fixed section; supplied URLs never become destinations',()=>{
 assert.deepEqual(notificationTarget(alert({type:'meeting_rsvp'})),{kind:'section',id:'meetings'});
 assert.deepEqual(notificationTarget(alert({type:'task_rating_required',metadata:{taskId:{id:'wrong'},url:'https://other.example'}})),{kind:'section',id:'tasks-my-work'});
 assert.deepEqual(notificationTarget(alert({metadata:{url:'javascript:alert(1)'}})),{kind:'section',id:'teams-notifications'});
});
