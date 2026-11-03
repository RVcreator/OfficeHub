/* Standalone public showcase. No imports, API calls, cookies, storage or staff sessions.
   The published credentials are a demo entry step, not an authentication boundary.
   All content below is fictional; sample actions affect this page's memory only. */
'use strict';
const pages = [
  ['overview','Overview'],['tasks','Tasks & ratings'],['projects','Projects'],
  ['meetings','Meetings & calendar'],['approvals','Approvals & decisions'],
  ['messages','Private messages'],['documents','Documents & Microsoft 365'],
  ['notices','Notices & acknowledgements'],['notifications','Alerts & email summaries'],
  ['people','People & departments'],['archives','Personal archive'],['access','Account & permissions']
];
let active = 'overview';
let sample = freshSample();
function freshSample(){ return {task:'In progress',rated:false,rsvp:'Pending',approval:'Pending',notice:false,message:false,preview:false}; }
const byId = id => document.getElementById(id);
const pill = text => `<span class="pill">${text}</span>`;
const card = (title,body) => `<section class="card"><h2>${title}</h2>${body}</section>`;
const row = (title,description,status='') => `<div class="row"><div><strong>${title}</strong><p>${description}</p></div>${status ? pill(status) : ''}</div>`;
const note = text => `<p class="feature-note">${text}</p>`;
const action = (id,label,disabled=false) => `<button data-action="${id}"${disabled?' disabled':''}>${label}</button>`;
const heading = (title,description) => `<div class="page-head"><div><p class="eyebrow">OfficeHub · Guest workspace</p><h1>${title}</h1><p>${description}</p></div></div>`;
function overview(){return heading('Good work starts with a clear day.','A single starting point for what needs your attention. Every name, record and activity in this demo is fictional.')+
  `<div class="stats"><div class="card stat"><strong>${sample.task==='Done'?1:2}</strong><span>Sample open tasks</span></div><div class="card stat"><strong>1</strong><span>Upcoming meeting</span></div><div class="card stat"><strong>${sample.approval==='Pending'?1:0}</strong><span>Pending approval</span></div></div>`+
  `<div class="grid">${card('Your next steps',row('Prepare the outreach plan','Assigned to Alex Morgan and Sam Patel · Due Friday',sample.task)+row('Team planning session','Sample calendar · Tomorrow, 10:00–10:45 EAT','Upcoming')+row('Equipment request','Submitted by Jamie Reed',sample.approval))}${card('One place to follow the work',`<ul><li>Assign work and track tasks through completion.</li><li>Plan projects, meetings and decisions.</li><li>Share documents and collaborate privately.</li><li>Follow up with ratings, alerts and personal archives.</li></ul><div class="actions">${action('go-tasks','Explore tasks →')}${action('go-documents','Explore Microsoft 365 →')}</div>`)}</div>`+
  note('Use the feature menu to explore. Sample actions are simulated locally and reset when you refresh, exit or select “Reset sample actions”.');}
function tasks(){return heading('Tasks, subtasks & ratings','Keep ownership, deadlines and follow-up together. Views include My Tasks, Assigned By Me and permitted department or shared tasks.')+
  `<div class="grid">${card('Prepare the outreach plan',`<p class="small">Created by Jamie Reed · Assigned to Alex Morgan and Sam Patel</p><div class="chips">${pill(sample.task)}${pill('High priority')}${pill('Community programmes')}</div>`+row('Draft the activity schedule','Subtask · Alex Morgan','Done')+row('Confirm equipment requirements','Subtask · Sam Patel',sample.task==='Done'?'Done':'In progress')+`<div class="actions">${action('complete-task',sample.task==='Done'?'Task completed':'Try completing the task',sample.task==='Done')}${action('rate-task',sample.rated?'Rated 5/5':'Try a sample rating',sample.task!=='Done'||sample.rated)}</div>`)}${card('A clear completion trail',`<p>Any assignee can complete the shared task. A completed task can then be rated by its creator.</p><p class="stars">${sample.rated?'★★★★★':'☆☆☆☆☆'}</p><p class="small">${sample.rated?'Sample feedback: Clear plan, delivered on time.':'Complete the sample task, then apply a sample rating.'}</p><p class="small">The staff portal also supports priorities, deadlines, attachments, comments, delegation and subtasks.</p>`)}</div>`+
  note('Live task alerts follow the saved action. Subtask completion produces an in-app notification rather than an email. Demo buttons send neither.');}
function projects(){return heading('Projects with the details attached','Bring related tasks, milestones and activity into one programme of work.')+
  `<div class="grid">${card('Community outreach programme',`<p>Sample project · Community Services Demo</p>${pill('Active')}<div class="progress" aria-label="Sample progress 65 percent"><span></span></div><p class="small">65% sample progress</p>`+row('Planning and preparation','Milestone 1','Done')+row('Team readiness','Milestone 2','In progress')+row('Programme review','Milestone 3','Planned'))}${card('More than a task list',`<ul><li>Milestones and linked tasks</li><li>Budget categories and expenses</li><li>Project activity and progress history</li><li>Impact and outcome tracking</li></ul><p class="small">Figures and progress here are illustrative; no organisation budget is included.</p>`)}</div>`;}
function meetings(){return heading('Meetings & the office calendar','Schedule a session, invite the right people and keep responses in one place.')+
  `<div class="grid">${card('Team planning session',`<p>Tomorrow · 10:00–10:45 EAT<br>Chair: Jamie Reed · Attendee: Alex Morgan</p>${row('Your response','Try the sample RSVP controls',sample.rsvp)}<div class="actions">${action('accept','Accept')}${action('decline','Decline')}${action('propose','Propose another time')}</div><p class="small muted">Microsoft Teams join link: simulated in this demo.</p>`)}${card('After a meeting ends',row('Earlier planning session','Ended recently · response window closed','Dormant')+`<div class="actions">${action('closed','Responses closed',true)}</div><p class="small">Ended meetings leave Upcoming Schedule, stay dormant for 48 hours, then appear in Personal Archive. Previous responses are retained.</p>`)}</div>`+
  note('The staff portal supports agendas, RSVP notes and time proposals, meeting minutes, calendar views and .ics calendar imports. Teams conferencing uses the configured Microsoft integration.');}
function approvals(){return heading('Approvals & decisions','Keep requests with the people who need to decide, then retain a clear outcome.')+
  `<div class="grid">${card('Sample equipment request',`<p>Requester: Jamie Reed<br>Selected approver: Alex Morgan</p>${row('Approval status','Choose a simulated outcome below',sample.approval)}<div class="actions">${action('approve','Approve sample request',sample.approval!=='Pending')}${action('reject','Reject sample request',sample.approval!=='Pending')}</div>`)}${card('A private decision trail',`<p>Requesters and selected approvers can see the request and its result. Only selected approvers can decide.</p>${row('Programme review outcome','Example recorded decision','Recorded')}<p class="small">Requests and decisions are separate workflows in the staff portal. This showcase does not change either.</p>`)}</div>`;}
function messages(){return heading('Conversations stay with their members','Direct and group messages bring work discussions into the portal.')+
  `<div class="grid">${card('Outreach planning · Sample group',`<p class="small">Alex Morgan · Sam Patel · Jamie Reed</p><div class="conversation"><strong>Sam Patel</strong><p>The draft schedule is ready for review.</p></div><div class="conversation"><strong>Jamie Reed</strong><p>Thank you. Let’s review it before the planning session.</p></div>${sample.message?'<div class="conversation"><strong>You · Demo guest</strong><p>Thanks, I’ll review the sample plan.</p></div>':''}<div class="actions">${action('message','Try a sample reply',sample.message)}</div>`)}${card('Private by membership',`<ul><li>Direct messages and group conversations</li><li>Conversation previews and attachments</li><li>Access limited to conversation members</li></ul><p class="small">No staff messages are included. This sample reply stays only on your screen.</p>`)}</div>`;}
function documents(){return heading('Documents & Microsoft 365','Bring document collaboration and meetings into the same workday.')+
  `<div class="grid">${card('Sample document library',row('Outreach planning notes','Fictional text document · Shared with Alex Morgan','Read access')+`<div class="actions">${action('preview',sample.preview?'Close sample preview':'Preview sample document')}</div>${sample.preview?'<div class="conversation"><h3>Outreach planning notes</h3><p>Sample agenda: confirm the activity schedule, assign responsibilities and agree the next review date.</p><p class="fine">This text was written only for the public demo.</p></div>':''}`)}${card('Connected tools',`<ul><li><strong>SharePoint:</strong> document storage, sharing and Microsoft file permissions.</li><li><strong>Teams:</strong> conferencing and meeting join links.</li><li><strong>Microsoft Graph:</strong> server-side notification email delivery.</li><li><strong>Calendar files:</strong> import meetings using .ics files.</li></ul>`)}</div>`+
  note('No Microsoft sign-in, file download, upload or sharing action runs here. A real document share uses the staff portal’s configured Microsoft service and recipient permissions.');}
function notices(){return heading('Notices people can acknowledge','Share an update and make it clear when someone has seen it.')+
  `<div class="grid">${card('Sample team briefing',`<p>Please review the outreach plan before the next planning session.</p><p class="small">From: Jamie Reed · Audience: Sample programme team</p>${row('Your acknowledgement','This is an example notice',sample.notice?'Acknowledged':'Awaiting acknowledgement')}<div class="actions">${action('acknowledge','Acknowledge sample notice',sample.notice)}</div>`)}${card('Keep updates visible',`<p>Notices and circulars give teams a shared reference for announcements. Acknowledgements help follow up with the intended recipients.</p><p class="small">The dashboard surfaces notices alongside tasks, meetings and pending approvals.</p>`)}</div>`;}
function notifications(){return heading('Useful follow-up, without the chasing','In-app alerts and email keep people informed about the work relevant to them.')+
  `<div class="grid">${card('Sample notification centre',row('Task assigned','Prepare the outreach plan','Task')+row('Meeting invitation','Team planning session','Meeting')+row('Document shared','Outreach planning notes','Document')+(sample.task==='Done'?row('Task completed','Prepare the outreach plan','Task'):''))}${card('Weekly & monthly summaries',`<p><strong>Monday:</strong> a summary of the coming week’s tasks, meetings and projects.</p><p><strong>First day of the month:</strong> a summary for the month ahead.</p><p class="small">Live notification emails use a server-side queue with deduplication and retries. Recipients are selected for the relevant action.</p>`)}</div>`+
  note('All notifications shown here are examples. The demo has no email address book, sending service, notification chime or background scheduler.');}
function people(){return heading('People, departments & organisations','Find colleagues and keep department membership in the right organisation.')+
  `<div class="grid">${card('Community Services Demo',row('Programmes','Alex Morgan · Sample programme officer','Online')+row('Operations','Sam Patel · Sample coordinator','Away')+row('Administration','Jamie Reed · Sample team lead','Offline'))}${card('Know who is available',`<p>The staff directory includes department and organisation details, with presence based on activity and office availability.</p><p class="small">Staff administration covers accounts, roles and department membership. The public demo cannot create or change staff accounts.</p>`)}</div>`+
  note('All names and presence indicators in this demo are fictional examples. No staff directory or live member status is loaded.');}
function archives(){return heading('Finished work, still easy to find','A personal archive keeps the active workspace focused without losing the record.')+
  `<div class="grid">${card('Your sample archive',row('Previous outreach checklist','Completed task · Sample rating 5/5','Archived')+row('Earlier programme review','Meeting ended more than 48 hours ago','Archived'))}${card('What moves here?',`<ul><li>Completed or cancelled tasks</li><li>Meetings 48 hours after their scheduled end</li><li>Retained task details and meeting records within your permissions</li></ul><p class="small">Search and filters help find older work. Archive visibility continues to follow the person’s access.</p>`)}</div>`;}
function access(){return heading('Accounts & access controls','The live portal uses authenticated accounts and database permissions to protect organisation records.')+
  `<div class="grid">${card('Designed around responsibility',`<ul><li>Temporary passwords and a required password-change flow</li><li>Role and permission management</li><li>Participant-based task and meeting visibility</li><li>Requester and approver access for approvals</li><li>Conversation membership for private chats</li><li>Audit history for relevant actions</li></ul>`)}${card('How this guest demo is separate',`<p>These public credentials open only this fictional showcase. They are not a Supabase account and grant no access to the staff portal.</p><p class="small">The demo loads static files, makes no application API requests, and never reads or stores a staff session. Resetting or refreshing clears sample actions.</p><p class="small">Built with static HTML, CSS and JavaScript so the demo does not import the production application.</p>`)}</div>`;}
const renderers={overview,tasks,projects,meetings,approvals,messages,documents,notices,notifications,people,archives,access};
function render(focus=false){
  byId('nav').innerHTML=pages.map(([key,label])=>`<button data-page="${key}"${key===active?' aria-current="page"':''}>${label}</button>`).join('');
  byId('content').innerHTML=renderers[active]();
  if(focus)byId('content').focus();
}
function announce(text){byId('announcement').textContent=text;}
function enter(){
  if(byId('email').value.trim().toLowerCase()!=='guest@officehub.example.invalid'||byId('password').value!=='ExploreOfficeHub!'){
    byId('entry-error').textContent='Use the public demo details shown above. Staff passwords do not work here.';return;
  }
  byId('entry-error').textContent='';byId('welcome').hidden=true;byId('workspace').hidden=false;byId('exit').hidden=false;render(true);
}
byId('enter').addEventListener('click',enter);
for(const id of ['email','password'])byId(id).addEventListener('keydown',e=>{if(e.key==='Enter')enter();});
byId('exit').addEventListener('click',()=>{sample=freshSample();active='overview';byId('content').replaceChildren();byId('nav').replaceChildren();byId('workspace').hidden=true;byId('exit').hidden=true;byId('welcome').hidden=false;byId('enter').focus();});
byId('reset').addEventListener('click',()=>{sample=freshSample();render();announce('Sample actions reset.');});
byId('nav').addEventListener('click',e=>{const button=e.target.closest('button[data-page]');if(!button)return;active=button.dataset.page;render(true);});
byId('content').addEventListener('click',e=>{
  const button=e.target.closest('button[data-action]');if(!button||button.disabled)return;
  const key=button.dataset.action;
  if(key.startsWith('go-')){active=key.slice(3);render(true);return;}
  if(key==='complete-task')sample.task='Done';
  if(key==='rate-task'&&sample.task==='Done')sample.rated=true;
  if(key==='accept')sample.rsvp='Accepted';
  if(key==='decline')sample.rsvp='Declined';
  if(key==='propose')sample.rsvp='Proposed: tomorrow, 11:00 EAT';
  if(key==='approve')sample.approval='Approved';
  if(key==='reject')sample.approval='Rejected';
  if(key==='message')sample.message=true;
  if(key==='acknowledge')sample.notice=true;
  if(key==='preview')sample.preview=!sample.preview;
  render();announce('Sample updated on this screen only. No live action was sent.');
  const replacement=byId('content').querySelector(`[data-action="${key}"]`);
  if(replacement&&!replacement.disabled)replacement.focus();else byId('content').focus();
});
