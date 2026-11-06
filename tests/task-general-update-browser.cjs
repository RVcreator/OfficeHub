// Production bundle against an isolated shared backend. No real task is changed.
const {chromium}=require('playwright');const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
(async()=>{
 const origin='https://officehub-fixture.invalid',root=path.resolve('dist'),uid=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 const browser=await chromium.launch({headless:true,executablePath:process.env.OFFICEHUB_BROWSER_EXECUTABLE});
 const profiles=[1,2].map(n=>({id:uid(n),name:`Member ${n}`,email:`fixture${n}@example.invalid`,department:'IT',organisation:'WIPAHS',role:'Staff',app_metadata:{must_change_password:false}}));
 let task={id:'note-test',title:'General update verification',status:'In Progress',delivery_event_version:1,general_update:null,general_update_version:0,created_by_id:uid(1),created_by_name:'Member 1',assigned_to_id:uid(2),assigned_to_ids:[uid(2)],assigned_to_name:'Member 2',assignment_type:'specific_people',department:'IT',organisation:'WIPAHS',priority:'Medium',created_at:new Date().toISOString(),due_date:'2026-12-01',pending_rating:false};
 let calls=0,fail=true,release;let gate=new Promise(resolve=>{release=resolve;});const errors=[];
 async function session(n){
  const profile=profiles[n-1],user={...profile,aud:'authenticated',role:'authenticated',user_metadata:{name:profile.name}};
  const jwt=[{alg:'HS256'},{sub:user.id,exp:4070908800,aud:'authenticated',role:'authenticated'},'fixture'].map(v=>typeof v==='string'?v:Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
  const context=await browser.newContext({viewport:{width:1440,height:900}});
  await context.addInitScript(({user,jwt})=>localStorage.setItem('wipahs_supabase_auth_session',JSON.stringify({access_token:jwt,refresh_token:'fixture',expires_at:4070908800,expires_in:99999999,token_type:'bearer',user})),{user,jwt});
  await context.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());
   if(u.origin===origin){const file=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':u.pathname));if(!file.startsWith(root+path.sep))return route.abort();return route.fulfill({path:file,contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html'});}
   if(!u.hostname.endsWith('.supabase.co'))return route.abort();let body=[];
   if(u.pathname==='/auth/v1/user')body=user;
   else if(u.pathname==='/rest/v1/profiles_public')body=profiles;
   else if(u.pathname==='/rest/v1/profiles')body=profile;
   else if(u.pathname==='/rest/v1/tasks')body=[task];
   else if(u.pathname==='/rest/v1/rpc/officehub_save_task_update'){
    calls++;const p=req.postDataJSON();await gate;
    if(fail)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Fixture save failed',code:'fixture_failure'})});
    const conflict=JSON.stringify(p.p_expected)!==JSON.stringify(task.general_update);
    if(!conflict){task={...task,general_update:{text:p.p_text.trim(),authorId:uid(n),authorName:profile.name,updatedAt:new Date().toISOString()},general_update_version:task.general_update_version+1};}
    body={conflict,update:task.general_update,version:task.general_update_version};
   }else if(u.pathname.includes('/rpc/officehub_presence_'))body=null;
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await context.routeWebSocket('**/*',ws=>ws.close());const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin);await page.getByRole('heading',{name:'Welcome, Member',exact:true}).waitFor();
  async function open(){await page.getByRole('button',{name:'Toggle navigation menu'}).click();await page.getByRole('button',{name:/^All Tasks/}).click();await page.getByLabel('Group tasks by').selectOption('None');await page.getByText(task.title,{exact:true}).click();await page.getByText('General Task Update',{exact:true}).waitFor();}
  await open();return {page,context,open};
 }
 try{
  const a=await session(2);const p=a.page;const input=p.getByPlaceholder('Type a general update or progress note on this task...');
  await p.getByRole('button',{name:'Add Update',exact:true}).click();await input.fill('Keep this progress note');
  await p.getByRole('button',{name:'Save Update',exact:true}).click();await p.getByRole('button',{name:'Saving…',exact:true}).waitFor();
  assert.equal(await input.inputValue(),'Keep this progress note');assert.equal(await input.isDisabled(),true);assert.equal(task.general_update,null);
  await input.press('Enter');assert.equal(calls,1,'duplicate submission is blocked');release();
  await p.getByRole('alert').filter({hasText:'Fixture save failed'}).waitFor();assert.equal(await input.inputValue(),'Keep this progress note');assert.equal(await input.isEnabled(),true);
  await p.screenshot({path:'../../outputs/OfficeHub-task-update-draft-kept.png',fullPage:true});
  fail=false;await p.getByRole('button',{name:'Save Update',exact:true}).click();await p.getByRole('button',{name:'Edit Update',exact:true}).waitFor();assert.equal(task.general_update.text,'Keep this progress note');
  assert.equal(await input.count(),0,'editor closes only after confirmation');await p.getByRole('button',{name:'Close task details drawer',exact:true}).click();
  await p.reload();await p.getByRole('heading',{name:'Welcome, Member',exact:true}).waitFor();await a.open();await p.getByText('"Keep this progress note"',{exact:true}).waitFor();
  const b=await session(1);await b.page.getByText('"Keep this progress note"',{exact:true}).waitFor();
  await p.getByRole('button',{name:'Edit Update',exact:true}).click();await input.fill('My unsaved concurrent draft');
  await b.page.getByRole('button',{name:'Edit Update',exact:true}).click();await b.page.getByPlaceholder('Type a general update or progress note on this task...').fill('Newer note from another member');
  await b.page.getByRole('button',{name:'Save Update',exact:true}).click();await b.page.getByRole('button',{name:'Edit Update',exact:true}).waitFor();
  await p.getByRole('button',{name:'Save Update',exact:true}).click();await p.getByRole('alert').filter({hasText:'Another member saved'}).waitFor();assert.equal(await input.inputValue(),'My unsaved concurrent draft');
  p.once('dialog',d=>d.dismiss());await p.getByRole('button',{name:'Save My Draft Instead',exact:true}).click();assert.equal(task.general_update.text,'Newer note from another member');
  p.once('dialog',d=>d.accept());await p.getByRole('button',{name:'Save My Draft Instead',exact:true}).click();await p.getByRole('button',{name:'Edit Update',exact:true}).waitFor();assert.equal(task.general_update.text,'My unsaved concurrent draft');
  await p.screenshot({path:'../../outputs/OfficeHub-task-update-saved.png',fullPage:true});
  assert.deepEqual(errors,[]);console.log('PASS: draft retained on failed save, pending editor locked, duplicate save blocked, retry persists across reload/other member, concurrent draft preserved, replacement requires confirmation, no browser errors.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
