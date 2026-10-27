import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderDigest,graphMessage,type PlanningDigest} from '../supabase/functions/_shared/officehubEmailWorker';
const digest:PlanningDigest={version:1,kind:'week',start:'2026-11-02',end:'2026-11-08',timezone:'Africa/Dar_es_Salaam',tasks:[{id:'a',title:'<script>private</script>',date:'2026-11-03',status:'To Do',priority:'High',overdue:false},{id:'b',title:'Overdue task',date:'2026-10-30',status:'To Do',priority:'Normal',overdue:true}],meetings:[{id:'m',title:'Planning',date:'2026-11-04',time:'09:00',endTime:'10:00',type:'Microsoft Teams'}],projects:[]};
test('planning digest escapes content and separates overdue work with clear dates',()=>{
 const html=renderDigest(digest,'<Staff>');
 assert.ok(!html.includes('<script>'));assert.match(html,/&lt;script&gt;/);assert.match(html,/&lt;Staff&gt;/);
 assert.match(html,/2 Nov 2026/);assert.match(html,/8 Nov 2026/);assert.match(html,/09:00/);assert.match(html,/Overdue work/);assert.equal(html.split('Overdue task').length,2);
});
test('empty monthly digest remains useful and Graph targets exactly one internal recipient',()=>{
 const d={...digest,kind:'month' as const,tasks:[],meetings:[],projects:[]};
 const message=graphMessage({id:'digest',lease_token:'lease',attempts:1,recipient_email:'it@wipahs.org',recipient_name:'IT',subject:'Month ahead',body_text:'Fallback',digest_payload:d});
 assert.equal(message.message.toRecipients.length,1);assert.match(message.message.body.content,/Your month ahead/);assert.match(message.message.body.content,/No meetings scheduled/);
});
test('large digest includes all rows without a silent item limit',()=>{
 const tasks=Array.from({length:150},(_,i)=>({...digest.tasks[0],id:String(i),title:'Task '+i}));
 const html=renderDigest({...digest,tasks},'Staff');assert.match(html,/Task 149/);assert.match(html,/\(150\)/);
});
