import {test} from 'node:test';import assert from 'node:assert/strict';
import type {Approval,Decision,Notice} from '../src/types';
import {TWO_WEEKS_MS,workArchiveDeadline,isApprovalArchived,isDecisionArchived,isNoticeArchived} from '../src/utils/workArchive';
import {mapApprovalRow,mapDecisionRow,mapNoticeRow} from '../src/services/supabaseMappers';
const timestamp='2026-11-03T11:00:00+03:00',end=Date.parse(timestamp)+TWO_WEEKS_MS;
test('approved work archives at exactly 14 days from the saved event, not from creation or a status label alone',()=>{
 const approval={status:'Approved',archiveReadyAt:timestamp,requestedDate:'2000-01-01'} as Approval;
 assert.equal(isApprovalArchived(approval,end-1),false);assert.equal(isApprovalArchived(approval,end),true);
 for(const status of ['Pending','Under Review','Rejected'])assert.equal(isApprovalArchived({...approval,status:status as Approval['status']},end),false);
 for(const status of ['Approved','Adopted','Implemented'])assert.equal(isDecisionArchived({status,archiveReadyAt:timestamp} as Decision,end),true);
 for(const status of ['Under Review','In Implementation'])assert.equal(isDecisionArchived({status,archiveReadyAt:timestamp} as Decision,end),false);
 assert.equal(isApprovalArchived({...approval,archiveReadyAt:undefined},end),false);
 assert.equal(isDecisionArchived({status:'Approved',date:'2000-01-01'} as Decision,end),false);
});
test('notice archiving is personal and uses the first acknowledgement timestamp',()=>{
 const notice={acknowledgedBy:['one','two'],acknowledgedAtBy:{one:timestamp,two:new Date(end-1000).toISOString()}} as Notice;
 assert.equal(isNoticeArchived(notice,'one',end-1),false);assert.equal(isNoticeArchived(notice,'one',end),true);
 assert.equal(isNoticeArchived(notice,'two',end),false);assert.equal(isNoticeArchived(notice,'three',end),false);
 assert.equal(isNoticeArchived({...notice,acknowledgedBy:[]},'one',end),false);
 assert.equal(isNoticeArchived({...notice,acknowledgedAtBy:{}},'one',end),false);
 assert.equal(workArchiveDeadline('bad date'),null);assert.equal(workArchiveDeadline('2026-11-03T11:00:00'),null);
 assert.equal(workArchiveDeadline('2026-11-03'),Date.parse('2026-11-03T00:00:00+03:00')+TWO_WEEKS_MS);
});
test('server clocks survive mapping and acknowledgement timestamps stay linked to the right person',()=>{
 assert.equal(mapApprovalRow({id:'a',archive_ready_at:timestamp}).archiveReadyAt,timestamp);
 assert.equal(mapDecisionRow({id:'d',archive_ready_at:timestamp}).archiveReadyAt,timestamp);
 const notice=mapNoticeRow({id:'n'},['one'],{one:timestamp});assert.equal(notice.acknowledgedAtBy?.one,timestamp);assert.equal(notice.acknowledgedAtBy?.two,undefined);
});
