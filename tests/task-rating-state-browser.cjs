// Production bundle with isolated legacy-rated and pending-rating fixtures.
const {chromium}=require(process.env.OFFICEHUB_PLAYWRIGHT_MODULE||'playwright');const fs=require('fs'),path=require('path'),assert=require('assert/strict');
(async()=>{
 const origin='https://officehub-fixture.invalid',root=path.resolve(__dirname,'../dist'),uid=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 const browser=await chromium.launch({headless:true,executablePath:process.env.OFFICEHUB_BROWSER_EXECUTABLE});
 try{for(const legacyRated of [true,false]){
  const profile={id:uid(1),name:'Rating Fixture',email:'creator@example.invalid',department:'IT',organisation:'WIPAHS',role:'Staff',app_metadata:{must_change_password:false}};
  const user={...profile,role:'authenticated',aud:'authenticated',user_metadata:{name:profile.name}};
  const jwt=[{alg:'HS256',typ:'JWT'},{sub:user.id,exp:Math.floor(Date.now()/1000)+3600,aud:'authenticated',role:'authenticated'},'fixture'].map(v=>typeof v==='string'?v:Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
  let task={id:'rating-task',title:legacyRated?'Already rated task':'Task awaiting rating',status:'Done',delivery_event_version:1,created_by_id:uid(1),created_by_name:profile.name,assigned_to_id:uid(2),assigned_to_ids:[uid(2)],assigned_to_name:'Colleague',assignment_type:'specific_people',department:'IT',organisation:'WIPAHS',priority:'Medium',created_at:new Date().toISOString(),completed_at:new Date().toISOString(),due_date:'2026-12-01',pending_rating:true,rating:legacyRated?{stars:4,comment:'Saved feedback',raterUserId:uid(1),ratedAt:new Date().toISOString()}:null};
  let releaseFailure,started;const failureHeld=new Promise(r=>releaseFailure=r),saveStarted=new Promise(r=>started=r);let fail=true;
  const context=await browser.newContext({viewport:{width:1440,height:900}});
  await context.addInitScript(({user,jwt})=>localStorage.setItem('wipahs_supabase_auth_session',JSON.stringify({access_token:jwt,refresh_token:'fixture-only',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user})),{user,jwt});
  await context.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());if(u.origin===origin){const file=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':u.pathname));if(!file.startsWith(root+path.sep))return route.abort();return route.fulfill({contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html',body:fs.readFileSync(file)});}
   if(!u.hostname.endsWith('.supabase.co'))return route.abort();let body=[];
   if(u.pathname==='/auth/v1/user')body=user;
   else if(u.pathname==='/rest/v1/profiles_public')body=[profile,{id:uid(2),name:'Colleague',email:'colleague@example.invalid',organisation:'WIPAHS',department:'IT'}];
   else if(u.pathname==='/rest/v1/profiles')body=profile;
   else if(u.pathname==='/rest/v1/tasks'){
    if(req.method()==='PATCH'){
     if(fail){started();await failureHeld;return route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({message:'Fixture rating save rejected'})});}
     task={...task,...req.postDataJSON(),pending_rating:false,delivery_event_version:2};body=task;
    }else body=[task];
   }else if(u.pathname.includes('/rpc/officehub_presence_'))body=null;
   else if(u.pathname.endsWith('/sharepoint-list'))body={documents:[]};
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await context.routeWebSocket('**/*',ws=>ws.close());const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin);await page.getByRole('heading',{name:'Welcome, Rating',exact:true}).waitFor();await page.getByRole('button',{name:'Toggle navigation menu'}).click();await page.getByRole('button',{name:/^Assigned By Me/}).click();
  await page.getByLabel('Group tasks by').selectOption('None');await page.getByText(task.title,{exact:true}).waitFor();
  if(legacyRated){assert.equal((await page.getByRole('button',{name:/Assigned By Me \(1\)/}).innerText()).includes('★'),false);assert.equal(await page.getByText(/Pinned — Awaiting Your Performance Rating/).count(),0);await page.locator('[title^="Rated 4 stars"]').waitFor();
   await page.screenshot({path:'.auth-qa/screenshots/rated-task-visible-flat.png',fullPage:true});await page.getByLabel('Group tasks by').selectOption('Department');await page.getByText(task.title,{exact:true}).waitFor();
  }else{
   await page.getByText(task.title,{exact:true}).click();await page.getByRole('button',{name:'Submit Performance Rating',exact:true}).waitFor();const input=page.getByPlaceholder(/^E.g., Delivered/);await input.fill('Keep my feedback');
   await page.getByRole('button',{name:'Submit Performance Rating',exact:true}).click();await saveStarted;assert.equal(await page.getByRole('button',{name:'Submit Performance Rating',exact:true}).isDisabled(),true);assert.equal(await page.getByText('✓ Submitted',{exact:true}).count(),0);
   releaseFailure();await page.getByRole('alert').filter({hasText:'Fixture rating save rejected'}).waitFor();assert.equal(await input.inputValue(),'Keep my feedback');assert.equal(await page.getByText('✓ Submitted',{exact:true}).count(),0);
   fail=false;await page.getByRole('button',{name:'Submit Performance Rating',exact:true}).click();await page.getByText('Task Performance Rating',{exact:true}).waitFor();await page.getByRole('button',{name:'Close task details drawer',exact:true}).click();
   await page.getByText(task.title,{exact:true}).waitFor();assert.equal((await page.getByRole('button',{name:/Assigned By Me \(1\)/}).innerText()).includes('★'),false);assert.equal(await page.getByText(/Pinned — Awaiting Your Performance Rating/).count(),0);
  }
  assert.deepEqual(errors,[]);await context.close();
 }console.log('PASS: legacy-rated task remains visible in flat/grouped views without false badge; pending save shows no false success; rejected save preserves form/error; confirmed rating updates drawer and moves task to normal list.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
