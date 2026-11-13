// Production bundle with an isolated SDK/network fixture. No real accounts or services are contacted.
const {chromium}=require(process.env.OFFICEHUB_PLAYWRIGHT_MODULE||'playwright');
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict');
(async()=>{
 process.chdir(path.resolve(__dirname,'..'));
 const root=path.resolve('dist'),requests=[],errors=[];
 const origin='https://officehub-fixture.invalid';
 const browser=await chromium.launch({headless:true,executablePath:process.env.OFFICEHUB_BROWSER_EXECUTABLE});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:900}});
  const user={id:'10000000-0000-4000-8000-000000000001',email:'fixture@example.invalid',aud:'authenticated',role:'authenticated',created_at:new Date().toISOString(),app_metadata:{must_change_password:false,role:'Admin'},user_metadata:{name:'Performance Fixture'}};
  const profile={...user,name:'Performance Fixture',role:'Staff',department:'IT',organisation:'WIPAHS',out_of_office:false,avatar:''};

  const task={id:'task-target',title:'Exact task',status:'To Do',priority:'Medium',created_by_id:user.id,assigned_to_id:user.id,assignment_type:'personal',created_at:new Date().toISOString(),due_date:'2030-12-01',department:'IT',organisation:'WIPAHS'};
  const ratingTask={...task,id:'rating-task',title:'Exact rating task',status:'Done',pending_rating:true,assignment_type:'specific_people',assigned_to_id:'10000000-0000-4000-8000-000000000002',completed_at:new Date().toISOString()};
  const meeting={id:'meeting-target',title:'Exact meeting',date:'2030-12-01',start_time:'11:00',end_time:'12:00',time:'11:00',duration_minutes:60,organizer_id:user.id,chair_id:user.id,status:'Scheduled',department:'IT'};
  const conversations=[{id:'first-chat',title:'First group',type:'group'},{id:'target-chat',title:'Target group',type:'group'}];
  const notices=[{id:'notice-target',title:'Exact notice',content:'Notice contents',organisation:'WIPAHS',department:'IT',author_id:user.id,created_at:new Date().toISOString()}];
  const approvals=[{id:'approval-target',title:'Exact approval',status:'Pending',requested_by_id:user.id,approver_ids:[user.id],requested_date:new Date().toISOString(),department:'IT'}];
  const documents=[{id:'document-target',name:'Exact document.pdf',folder:'Operations',visibility:'Specific People',allowed_user_ids:[user.id],created_by_id:user.id,content_summary:'Selected document contents'}];
  const notifications=[['task','task',{taskId:task.id}],['meeting','meeting_scheduled',{meetingId:meeting.id}],['notice','notice',{noticeId:notices[0].id}],['approval','approval',{approvalId:approvals[0].id}],['chat','new_message',{conversationId:'target-chat'}],['document','document_shared',{documentId:documents[0].id}],['rating-alert','task_rating_required',{taskId:ratingTask.id,requiresRating:true}],['missing-chat','new_message',{conversationId:'unavailable-chat'}],['missing-doc','document_shared',{documentId:'unavailable-doc'}],['delete-only','general',{}]].map(([id,type,metadata])=>({id,title:'Alert '+id,message:'Body '+id,type,metadata,target_user_id:user.id,created_at:new Date().toISOString(),read:false}));
  const jwt=[{alg:'HS256',typ:'JWT'},{sub:user.id,exp:Math.floor(Date.now()/1000)+3600,aud:'authenticated',role:'authenticated'},'fixture'].map(v=>typeof v==='string'?v:Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
  await context.addInitScript(({user,jwt})=>{localStorage.setItem('wipahs_supabase_auth_session',JSON.stringify({access_token:jwt,refresh_token:'fixture-only',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user}));},{user,jwt});
  let releaseGraph,graphStarted=false;const graphWait=new Promise(r=>releaseGraph=r);
  await context.route('**/*',async route=>{
   const u=new URL(route.request().url());if(u.origin===origin){requests.push(u.pathname);const file=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':u.pathname));if(!file.startsWith(root+path.sep))return route.abort();return route.fulfill({contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html',body:fs.readFileSync(file)});}
   if(!u.hostname.endsWith('.supabase.co'))return route.abort();
   requests.push(u.pathname+u.search);let body=[];
   if(u.pathname==='/auth/v1/user')body=user;
   else if(u.pathname==='/rest/v1/tasks')body=[task,ratingTask];
   else if(u.pathname==='/rest/v1/meetings')body=[meeting];
   else if(u.pathname==='/rest/v1/meeting_attendees')body=[{meeting_id:meeting.id,user_id:user.id,name:profile.name,status:'Accepted'}];
   else if(u.pathname==='/rest/v1/notices'||u.pathname==='/rest/v1/rpc/officehub_active_notices')body=notices;
   else if(u.pathname==='/rest/v1/approvals')body=approvals;
   else if(u.pathname==='/rest/v1/sharepoint_documents')body=documents;
   else if(u.pathname==='/rest/v1/conversations')body=conversations;
   else if(u.pathname==='/rest/v1/conversation_participants')body=conversations.map(c=>({conversation_id:c.id,user_id:user.id}));
   else if(u.pathname==='/rest/v1/notifications')body=notifications;
   else if(u.pathname.includes('/profiles'))body=u.searchParams.has('or')||u.searchParams.has('id')?profile:[profile];
   else if(u.pathname.includes('/rpc/officehub_presence_snapshot'))body=[{user_id:user.id,status:'Online',fresh_seconds:120,out_of_office:false}];
   else if(u.pathname.includes('/rpc/officehub_presence_'))body=null;
   else if(u.pathname.endsWith('/sharepoint-list')){graphStarted=true;await graphWait;body={documents:[]};}
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await context.routeWebSocket('**/*',ws=>ws.close());

  const page=await context.newPage();page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin);await page.getByRole('heading',{name:'Welcome, Performance'}).waitFor();releaseGraph();
  const openAlert=async(id,keyboard=false)=>{console.log('Opening alert',id);await page.getByRole('button',{name:'Notifications',exact:true}).click();const button=page.getByRole('button',{name:'Open notification: Alert '+id,exact:true});if(keyboard)await button.press('Enter');else await button.click();};
  await openAlert('task',true);await page.getByRole('heading',{name:'Exact task',exact:true}).waitFor();
  await page.getByRole('button',{name:'Close task details drawer',exact:true}).click();
  await openAlert('task');await page.getByRole('heading',{name:'Exact task',exact:true}).waitFor();
  await page.getByRole('button',{name:'Close task details drawer',exact:true}).click();
  await openAlert('rating-alert');await page.getByRole('heading',{name:'Exact rating task',exact:true}).waitFor();
  assert.equal(requests.some(url=>url.includes('id=eq.rating-alert')),false,'opening does not dismiss compulsory rating');
  await page.getByRole('button',{name:'Close task details drawer',exact:true}).click();
  await openAlert('meeting');await page.getByRole('heading',{name:'Exact meeting',exact:true}).waitFor();
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await page.getByRole('button',{name:'Notifications',exact:true}).click();
  await page.getByText('Body notice',{exact:true}).click();await page.locator('#notice-notice-target').waitFor();
  await openAlert('approval');await page.locator('#approval-approval-target').waitFor();
  await openAlert('chat');await page.getByRole('heading',{name:'Target group',exact:true,level:2}).waitFor();
  await openAlert('missing-chat');await page.waitForTimeout(150);
  assert.equal(await page.getByRole('heading',{name:'First group',exact:true,level:2}).count(),0);
  assert.equal(await page.getByRole('heading',{name:'Target group',exact:true,level:2}).count(),0);
  await openAlert('document');await page.getByRole('heading',{name:'Exact document.pdf',exact:true,level:3}).waitFor();
  await page.getByRole('button',{name:'✕',exact:true}).click();
  await openAlert('document');await page.getByRole('heading',{name:'Exact document.pdf',exact:true,level:3}).waitFor();
  await page.getByRole('button',{name:'✕',exact:true}).click();
  await openAlert('missing-doc');await page.waitForTimeout(150);
  assert.equal(await page.getByRole('heading',{name:'Exact document.pdf',exact:true,level:3}).count(),0);
  await page.getByRole('button',{name:'Notifications',exact:true}).click();
  await page.locator('[data-notification-id="delete-only"]').getByRole('button',{name:'Delete notification',exact:true}).click();
  assert.ok(await page.getByText('Notifications & Alerts',{exact:true}).isVisible(),'delete cannot navigate or close the bell');
  assert.deepEqual(errors,[]);console.log('PASS: keyboard/pointer bell links open exact task, meeting, notice, approval, chat and document; repeat opening works; delete stays independent; no real network.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
