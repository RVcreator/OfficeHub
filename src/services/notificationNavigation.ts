import type {AppNotification} from '../types';
export type NotificationTarget={kind:'task'|'meeting'|'notice'|'approval'|'conversation'|'document'|'decision'|'project';id:string}|{kind:'section';id:'tasks-my-work'|'meetings'|'notices'|'approvals'|'messages'|'documents'|'decisions'|'projects'|'teams-notifications'};
/** Only saved record IDs and fixed app sections; never execute a supplied URL. */
export function notificationTarget(notification:AppNotification):NotificationTarget {
 const meta=notification.metadata||{};
 const id=(value:unknown)=>typeof value==='string'&&value.trim().length>0&&value.length<=512?value.trim():null;
 for(const [kind,value] of [
  ['task',meta.taskId],['meeting',notification.meetingId||meta.meetingId],['notice',meta.noticeId],
  ['approval',meta.approvalId],['conversation',meta.conversationId],['document',meta.documentId||meta.docId],
  ['decision',meta.decisionId],['project',meta.projectId],
 ] as const){const key=id(value);if(key)return {kind,id:key};}
 const type=notification.type||'';
 const section=/^task/.test(type)?'tasks-my-work':/^meeting/.test(type)?'meetings':/^notice/.test(type)?'notices':/^approval/.test(type)?'approvals':/^(new_message|message)/.test(type)?'messages':/^document/.test(type)?'documents':/^decision/.test(type)?'decisions':/^project/.test(type)?'projects':'teams-notifications';
 return {kind:'section',id:section};
}
