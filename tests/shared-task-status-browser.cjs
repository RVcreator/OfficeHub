// Two separate authenticated browser contexts share an isolated backend fixture.
const {chromium}=require(process.env.OFFICEHUB_PLAYWRIGHT_MODULE||'playwright');const fs=require('fs'),path=require('path'),assert=require('assert/strict');
(async()=>{
 const origin='https://officehub-fixture.invalid',root=path.resolve(__dirname,'../dist'),uid=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 const browser=await chromium.launch({headless:true,executablePath:process.env.OFFICEHUB_BROWSER_EXECUTABLE});
 const profiles=[1,2,3].map(n=>({id:uid(n),name:n===1?'Creator':`Assignee ${n}`,email:`fixture${n}@example.invalid`,department:'IT',organisation:'WIPAHS',role:'Staff',app_metadata:{must_change_password:false}}));
 let task={id:'shared',title:'Shared completion verification',status:'To Do',delivery_event_version:1,created_by_id:uid(1),created_by_name:'Creator',assigned_to_id:uid(2),assigned_to_ids:[uid(2),uid(3)],assigned_to_name:'Assignee 2',assignment_type:'specific_people',department:'IT',organisation:'WIPAHS',priority:'Medium',created_at:new Date().toISOString(),due_date:'2026-12-01',pending_rating:false};
 let completions=0,reopens=0;const errors=[];
 async function session(n){
  const profile=profiles[n-1],user={...profile,aud:'authenticated',role:'authenticated',user_metadata:{name:profile.name}};
  const jwt=[{alg:'HS256',typ:'JWT'},{sub:user.id,exp:Math.floor(Date.now()/1000)+3600,aud:'authenticated',role:'authenticated'},'fixture'].map(v=>typeof v==='string'?v:Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
  const context=await browser.newContext({viewport:{width:1440,height:900}});
  await context.addInitScript(({user,jwt})=>localStorage.setItem('wipahs_supabase_auth_session',JSON.stringify({access_token:jwt,refresh_token:'fixture-only',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user})),{user,jwt});
  await context.route('**/*',route=>{
   const req=route.request(),u=new URL(req.url());
   if(u.origin===origin){const file=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':u.pathname));if(!file.startsWith(root+path.sep))return route.abort();return route.fulfill({contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html',body:fs.readFileSync(file)});}
   if(!u.hostname.endsWith('.supabase.co'))return route.abort();let body=[];
   if(u.pathname==='/auth/v1/user')body=user;
   else if(u.pathname==='/rest/v1/profiles_public')body=profiles;
   else if(u.pathname==='/rest/v1/profiles')body=profile;
   else if(u.pathname==='/rest/v1/tasks'){assert.equal(req.method(),'GET','status must use the atomic RPC');body=[task];}
   else if(u.pathname==='/rest/v1/rpc/officehub_set_task_status'){
    const p=req.postDataJSON();let changed=false,conflict=false;
    if(p.p_status!==task.status){
     if(p.p_expected_version!==task.delivery_event_version)conflict=true;
     else{if(task.status==='Done')assert.equal(p.p_reopen,true);if(p.p_status==='Done')completions++;else reopens++;task={...task,status:p.p_status,delivery_event_version:task.delivery_event_version+1,pending_rating:p.p_status==='Done',completed_at:p.p_status==='Done'?new Date().toISOString():null};changed=true;}
    }
    body={task,changed,conflict};
   }else if(u.pathname.includes('/rpc/officehub_presence_'))body=null;
   else if(u.pathname.endsWith('/sharepoint-list'))body={documents:[]};
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await context.routeWebSocket('**/*',ws=>ws.close());const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin);await page.getByRole('heading',{name:'Welcome, Assignee',exact:true}).waitFor();
  await page.getByRole('button',{name:'Toggle navigation menu'}).click();await page.getByRole('button',{name:/^My Tasks/}).click();await page.getByText(task.title,{exact:true}).waitFor();return {page,context};
 }
 try{
  const a=await session(2),b=await session(3);
  await a.page.getByRole('button',{name:'Mark task completed',exact:true}).click();await a.page.getByRole('button',{name:'Mark task incomplete',exact:true}).waitFor();assert.equal(task.status,'Done');
  await b.page.getByRole('button',{name:'Mark task completed',exact:true}).click();await b.page.getByRole('button',{name:'Mark task incomplete',exact:true}).waitFor();assert.equal(completions,1,'both assignees completing creates one transition');
  b.page.once('dialog',async dialog=>{assert.match(dialog.message(),/for everyone/);await dialog.dismiss();});await b.page.getByRole('button',{name:'Mark task incomplete',exact:true}).click();assert.equal(reopens,0);
  await b.page.screenshot({path:'.auth-qa/screenshots/shared-task-both-done.png',fullPage:true});
  b.page.once('dialog',async dialog=>{await dialog.accept();});await b.page.getByRole('button',{name:'Mark task incomplete',exact:true}).click();await b.page.getByRole('button',{name:'Mark task completed',exact:true}).waitFor();assert.equal(reopens,1);
  await a.page.reload();await a.page.getByRole('heading',{name:'Welcome, Assignee',exact:true}).waitFor();await a.page.getByRole('button',{name:'Toggle navigation menu'}).click();await a.page.getByRole('button',{name:/^My Tasks/}).click();await a.page.getByRole('button',{name:'Mark task completed',exact:true}).waitFor();
  assert.deepEqual(errors,[]);console.log('PASS: two assignees share one completed state, duplicate completion is idempotent, cancellation does not reopen, explicit confirmation reopens, reloaded other session sees saved state; no browser errors.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
