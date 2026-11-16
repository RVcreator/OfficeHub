// Built application with intercepted services and synthetic records only.
const {chromium}=require(process.env.OFFICEHUB_PLAYWRIGHT_MODULE||'playwright');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve(process.env.OFFICEHUB_TEST_ROOT||'dist'),origin='https://officehub-fixture.invalid',uid=n=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0');
 const browser=await chromium.launch({headless:true,executablePath:process.env.OFFICEHUB_BROWSER_EXECUTABLE});
 try{for(const width of [1440,390]){
  const profiles=[1,2,3].map((n)=>({id:uid(n),name:['Owner Fixture','Member Two','Member Three'][n-1],email:'member'+n+'@example.invalid',department:'IT',organisation:'WIPAHS',role:'Staff',avatar:'',app_metadata:{must_change_password:false}}));
  const attachment=name=>({id:name,name:name+'.txt',size:'5 B',type:'file',url:'storage://officehub-records/task/edit-task/'+uid(1)+'/'+name});
  let task={id:'edit-task',title:'Editor fixture',description:'Original details',priority:'Medium',status:'To Do',created_by_id:uid(1),created_by_name:profiles[0].name,assigned_to_id:uid(2),assigned_to_ids:[uid(2)],assigned_to_name:profiles[1].name,assignment_type:'specific_people',department:'IT',organisation:'WIPAHS',due_date:'2030-12-01',created_at:new Date().toISOString(),delivery_event_version:1,attachments:[attachment('First'),attachment('Second')]};
  let patches=0,uploads=0,failPatch=false,failUpload=false,holdWrites=false,releaseWrite,onPatchStarted=()=>{};const errors=[],payloads=[];
  async function session(n){
   const context=await browser.newContext({viewport:{width,height:950}}),user={...profiles[n-1],aud:'authenticated',role:'authenticated',user_metadata:{name:profiles[n-1].name}};
   const jwt=[{alg:'HS256',typ:'JWT'},{sub:user.id,exp:4070908800,aud:'authenticated',role:'authenticated'},'fixture'].map(v=>typeof v==='string'?v:Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
   await context.addInitScript(({user,jwt})=>localStorage.setItem('wipahs_supabase_auth_session',JSON.stringify({access_token:jwt,refresh_token:'fixture',expires_at:4070908800,expires_in:99999999,token_type:'bearer',user})),{user,jwt});
   await context.route('**/*',async route=>{
    const req=route.request(),u=new URL(req.url());if(u.origin===origin){const file=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':u.pathname));if(!file.startsWith(root+path.sep))return route.abort();return route.fulfill({path:file,contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html'});}
    if(!u.hostname.endsWith('.supabase.co'))return route.abort();let body=[];
    if(u.pathname==='/auth/v1/user')body=user;
    else if(u.pathname==='/rest/v1/profiles_public')body=profiles;
    else if(u.pathname==='/rest/v1/profiles')body=profiles[n-1];
    else if(u.pathname==='/rest/v1/tasks'){
     if(req.method()==='PATCH'){
      patches++;onPatchStarted();const changes=req.postDataJSON();payloads.push(changes);if(holdWrites)await new Promise(r=>releaseWrite=r);
      if(failPatch)return route.fulfill({status:403,json:{message:'Fixture save denied'}});
      if(n!==1&&Object.hasOwn(changes,'assigned_to_ids'))return route.fulfill({status:403,json:{message:'Only the creator may change task access'}});
      assert.equal(changes.created_by_id,undefined);task={...task,...changes,delivery_event_version:task.delivery_event_version+(changes.assigned_to_ids?1:0)};body=task;
     }else body=[task];
    }else if(u.pathname.startsWith('/storage/v1/object/')){
     if(req.method()==='POST'){uploads++;if(failUpload)return route.fulfill({status:500,json:{message:'Fixture upload failed'}});return route.fulfill({json:{Key:'fixture',Id:'fixture'}});}
     return route.fulfill({contentType:'text/plain',body:'hello'});
    }else if(u.pathname.includes('/rpc/officehub_presence_'))body=null;
    else if(u.pathname.endsWith('/sharepoint-list'))body={documents:[]};
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
   });
   await context.routeWebSocket('**/*',ws=>ws.close());const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
   await page.goto(origin);await page.getByRole('heading',{name:n===1?'Welcome, Owner':'Welcome, Member',exact:true}).waitFor();
   async function open(){await page.getByRole('button',{name:'Toggle navigation menu'}).click();await page.getByRole('button',{name:n===1?/^Assigned By Me/:/^My Tasks/}).click();await page.getByText(task.title,{exact:true}).first().click();await page.getByRole('button',{name:'Edit Task',exact:true}).waitFor();}
   await open();return {context,page,open};
  }
  const owner=await session(1),page=owner.page;
  // These actions must settle after ONE click and must never restore old drawer state.
  await page.getByRole('button',{name:'Remove attachment First.txt',exact:true}).click();
  await page.getByRole('button',{name:'Remove attachment First.txt',exact:true}).waitFor({state:'hidden'});assert.equal(patches,1);
  await page.getByLabel('Attach document to task',{exact:true}).setInputFiles({name:'Direct.txt',mimeType:'text/plain',buffer:Buffer.from('hello')});
  await page.getByRole('button',{name:'Remove attachment Direct.txt',exact:true}).waitFor();assert.equal(patches,2);
  await page.getByRole('button',{name:'Edit Task',exact:true}).click();let form=page.getByRole('form',{name:'Edit task'});
  await form.getByLabel('Task Title *',{exact:true}).fill('Cancelled title');await form.getByRole('button',{name:'Remove attachment Second.txt',exact:true}).click();
  assert.equal(patches,2);await form.getByRole('button',{name:'Cancel',exact:true}).click();await page.getByRole('button',{name:'Remove attachment Second.txt',exact:true}).waitFor();assert.equal(task.title,'Editor fixture');
  await page.getByRole('button',{name:'Edit Task',exact:true}).click();form=page.getByRole('form',{name:'Edit task'});
  await form.getByLabel('Task Title *',{exact:true}).fill('Edited fixture');
  await form.getByRole('button',{name:'Remove attachment Second.txt',exact:true}).click();
  const file={name:'Edited.txt',mimeType:'text/plain',buffer:Buffer.from('hello')};await form.getByLabel('Add task attachments',{exact:true}).setInputFiles(file);await form.getByRole('button',{name:'Remove attachment Edited.txt',exact:true}).waitFor();
  const search=form.getByPlaceholder(/^Search by name/);await search.fill('Member');await search.press('Enter');assert.equal(patches,2,'staff search does not submit the editor');await search.fill('');
  await form.getByRole('button',{name:'Remove assignee Member Two',exact:true}).click();await form.getByText(/^Member Three(?: —|$)/).first().click();
  assert.equal(patches,2);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:path.resolve('../../outputs/task-editor-'+width+'.png'),fullPage:true});
  holdWrites=true;failPatch=true;const arrived=new Promise(r=>onPatchStarted=r);const write=page.waitForRequest(r=>r.method()==='PATCH'&&r.url().includes('/rest/v1/tasks'));
  await form.getByRole('button',{name:'Save Changes',exact:true}).evaluate(el=>{el.click();el.click();});await write;await arrived;onPatchStarted=()=>{};
  assert.equal(patches,3,'double click saves once');assert.equal(await form.getByRole('button',{name:'Saving…',exact:true}).isDisabled(),true);
  assert.equal(await form.getByRole('button',{name:'Cancel',exact:true}).isDisabled(),true);await page.getByRole('button',{name:'Close task details drawer',exact:true}).click();assert.equal(await form.count(),1);
  holdWrites=false;releaseWrite();await form.getByRole('alert').filter({hasText:'Fixture save denied'}).waitFor();
  assert.equal(await form.getByLabel('Task Title *',{exact:true}).inputValue(),'Edited fixture');assert.equal(await form.getByRole('button',{name:'Remove attachment Edited.txt',exact:true}).count(),1);assert.equal(await form.getByRole('button',{name:'Remove assignee Member Three',exact:true}).count(),1);
  failPatch=false;await form.getByRole('button',{name:'Save Changes',exact:true}).click();await form.waitFor({state:'hidden'});assert.equal(patches,4);assert.equal(task.title,'Edited fixture');assert.deepEqual(task.assigned_to_ids,[uid(3)]);assert.deepEqual(task.attachments.map(a=>a.name),['Direct.txt','Edited.txt']);
  await page.getByRole('button',{name:'Remove attachment Edited.txt',exact:true}).waitFor();
  // Add then remove people in the editor, persisting each confirmed result.
  await page.getByRole('button',{name:'Edit Task',exact:true}).click();form=page.getByRole('form',{name:'Edit task'});await form.getByText(/^Member Two(?: —|$)/).first().click();await form.getByRole('button',{name:'Save Changes',exact:true}).click();await form.waitFor({state:'hidden'});assert.deepEqual(task.assigned_to_ids,[uid(3),uid(2)]);
  await page.getByRole('button',{name:'Edit Task',exact:true}).click();form=page.getByRole('form',{name:'Edit task'});await form.getByRole('button',{name:'Remove assignee Member Three',exact:true}).click();await form.getByRole('button',{name:'Save Changes',exact:true}).click();await form.waitFor({state:'hidden'});assert.deepEqual(task.assigned_to_ids,[uid(2)]);
  // Upload failure retains the entire draft and does not PATCH the task.
  await page.getByRole('button',{name:'Edit Task',exact:true}).click();form=page.getByRole('form',{name:'Edit task'});await form.getByLabel('Add task attachments',{exact:true}).setInputFiles({name:'Retry.txt',mimeType:'text/plain',buffer:Buffer.from('hello')});await form.getByRole('button',{name:'Remove attachment Retry.txt',exact:true}).waitFor();
  const before=patches;failUpload=true;await form.getByRole('button',{name:'Save Changes',exact:true}).click();await form.getByRole('alert').waitFor();assert.equal(patches,before);assert.equal(await form.getByRole('button',{name:'Remove attachment Retry.txt',exact:true}).count(),1);
  failUpload=false;await form.getByRole('button',{name:'Save Changes',exact:true}).click();await form.waitFor({state:'hidden'});assert.equal(patches,before+1);
  await page.reload();await page.getByRole('heading',{name:'Welcome, Owner',exact:true}).waitFor();await owner.open();await page.getByRole('button',{name:'Remove attachment Retry.txt',exact:true}).waitFor();
  await page.getByRole('button',{name:'Edit Task',exact:true}).click();form=page.getByRole('form',{name:'Edit task'});await form.getByRole('button',{name:'Remove assignee Member Two',exact:true}).click();const noAssignees=patches;await form.getByRole('button',{name:'Save Changes',exact:true}).click();await form.getByRole('alert').filter({hasText:'Select at least one assignee'}).waitFor();assert.equal(patches,noAssignees);await form.getByRole('button',{name:'Cancel',exact:true}).click();
  const member=await session(2);await member.page.getByRole('button',{name:'Edit Task',exact:true}).click();const memberForm=member.page.getByRole('form',{name:'Edit task'});assert.equal(await memberForm.getByText('Only the task creator can change assignees.',{exact:false}).count(),1);assert.equal(await memberForm.getByRole('button',{name:/^Remove assignee/}).count(),0);await memberForm.getByLabel('Description',{exact:true}).fill('Participant details');await memberForm.getByRole('button',{name:'Save Changes',exact:true}).click();await memberForm.waitFor({state:'hidden'});assert.equal(Object.hasOwn(payloads.at(-1),'assigned_to_ids'),false);

  await member.context.close();
  // Existing team audiences stay untouched unless the creator explicitly converts them.
  task={...task,id:'group-task',title:'Group fixture',assignment_type:'department',assigned_to_id:null,assigned_to_ids:[],assigned_to_name:'IT (Department)',assigned_departments:['IT'],attachments:[]};
  await page.reload();await page.getByRole('heading',{name:'Welcome, Owner',exact:true}).waitFor();await owner.open();await page.getByRole('button',{name:'Edit Task',exact:true}).click();form=page.getByRole('form',{name:'Edit task'});
  await form.getByLabel('Description',{exact:true}).fill('Preserved group');await form.getByRole('button',{name:'Save Changes',exact:true}).click();await form.waitFor({state:'hidden'});assert.equal(task.assignment_type,'department');assert.equal(Object.hasOwn(payloads.at(-1),'assigned_to_ids'),false);
  await page.getByRole('button',{name:'Edit Task',exact:true}).click();form=page.getByRole('form',{name:'Edit task'});await form.getByLabel('Assignment audience',{exact:true}).selectOption('people');await form.getByText(/^Member Three(?: —|$)/).first().click();await form.getByRole('button',{name:'Save Changes',exact:true}).click();await form.waitFor({state:'hidden'});assert.equal(task.assignment_type,'specific_people');assert.deepEqual(task.assigned_to_ids,[uid(3)]);assert.deepEqual(task.assigned_departments,[]);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({width,result:'PASS',patches,uploads,checks:['single-click drawer remove/add','cancel discards draft','edit removes/adds files and replaces/adds/removes assignees','one pending save','failed save/upload retains draft','empty assignees rejected','reload persists','creator-only access changes','group assignments preserved or explicitly converted','no horizontal overflow or browser errors']}));
  await owner.context.close();
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
