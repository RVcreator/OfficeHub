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
  const profile={...user,name:'Performance Fixture',role:'Admin',department:'IT',organisation:'WIPAHS',out_of_office:false,avatar:''};
  const jwt=[{alg:'HS256',typ:'JWT'},{sub:user.id,exp:Math.floor(Date.now()/1000)+3600,aud:'authenticated',role:'authenticated'},'fixture'].map(v=>typeof v==='string'?v:Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
  await context.addInitScript(({user,jwt})=>{localStorage.setItem('wipahs_supabase_auth_session',JSON.stringify({access_token:jwt,refresh_token:'fixture-only',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user}));},{user,jwt});
  let releaseHeld,denyApprovals=true;const held=new Promise(resolve=>releaseHeld=resolve);
  await context.route('**/*',async route=>{
   const u=new URL(route.request().url());if(u.origin===origin){requests.push(u.pathname);const file=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':u.pathname));if(!file.startsWith(root+path.sep))return route.abort();return route.fulfill({contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html',body:fs.readFileSync(file)});}
   if(!u.hostname.endsWith('.supabase.co'))return route.abort();
   requests.push(u.pathname+u.search);let body=[];
   if(u.pathname==='/rest/v1/profiles_public'){await held;body=[profile];}
   else if(u.pathname==='/rest/v1/approvals'){await held;if(denyApprovals)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Fixture approvals unavailable'})});}
   else if(u.pathname==='/rest/v1/tasks')body=[{id:'10000000-0000-4000-8000-000000000002',title:'Startup fixture task',status:'Pending',assigned_to_id:user.id,assigned_to_name:profile.name,created_by_id:user.id,created_at:new Date().toISOString(),department:'IT',organisation:'WIPAHS'}];
   else if(u.pathname==='/auth/v1/user')body=user;
   else if(u.pathname.includes('/profiles'))body=u.searchParams.has('or')||u.searchParams.has('id')?profile:[profile];
   else if(u.pathname.includes('/rpc/officehub_presence_snapshot'))body=[{user_id:user.id,status:'Online',fresh_seconds:120,out_of_office:false}];
   else if(u.pathname.includes('/rpc/officehub_presence_'))body=null;
   else if(u.pathname.endsWith('/sharepoint-list'))body={documents:[]};
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await context.routeWebSocket('**/*',ws=>ws.close());
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  const started=Date.now();await page.goto(origin);
  if(process.env.OFFICEHUB_STARTUP_BASELINE==='1'){
   await page.waitForTimeout(1500);
   assert.equal(await page.getByRole('heading',{name:'Welcome, Performance',exact:true}).count(),0);
   assert.equal(await page.getByText('Loading your workspace…',{exact:true}).count(),1);
   releaseHeld();console.log('BASELINE REPRODUCED: held staff/approvals reads hide the entire workspace after verified sign-in.');return;
  }
  await page.getByRole('heading',{name:'Welcome, Performance',exact:true}).waitFor({timeout:3000});
  const dashboardMs=Date.now()-started;
  const taskCard=page.getByRole('heading',{name:'My Tasks',exact:true}).locator('../..');
  await page.waitForFunction(()=>{const heading=Array.from(document.querySelectorAll('h2')).find(node=>node.textContent.trim()==='My Tasks');return heading?.parentElement.parentElement.querySelector('p.text-3xl')?.textContent==='1';});
  assert.equal(await taskCard.locator('p.text-3xl').first().innerText(),'1','task data is published before staff and approvals return');
  assert.equal(await page.getByText('No pending approvals',{exact:true}).count(),0,'pending data is never advertised as an empty successful result');
  await page.getByRole('button',{name:'Toggle navigation menu'}).click();await page.getByRole('button',{name:'Departments',exact:true}).click();
  await page.getByRole('heading',{name:'Departments Directory',exact:true}).waitFor({timeout:3000});
  releaseHeld();await page.getByRole('button',{name:'Retry workspace data',exact:true}).waitFor();
  denyApprovals=false;await page.getByRole('button',{name:'Retry workspace data',exact:true}).click();
  await page.getByRole('button',{name:'Retry workspace data',exact:true}).waitFor({state:'hidden'});
  await page.getByRole('button',{name:'Toggle navigation menu'}).click();await page.getByRole('button',{name:'Dashboard',exact:true}).click();
  await page.getByText('No pending approvals',{exact:true}).waitFor();
  await page.screenshot({path:'.auth-qa/screenshots/startup-independent.png',fullPage:true});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({result:'PASS',dashboard_fixture_ms:dashboardMs,checks:['verified dashboard visible while staff/approvals held','real task count before directory response','navigation before slow response','no false empty approval state','failed section retries without reloading','zero browser errors'],note:'Isolated fixture timing, not a production network benchmark.'},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
