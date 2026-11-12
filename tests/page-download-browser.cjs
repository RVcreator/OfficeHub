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
  let releaseGraph,graphStarted=false;const graphWait=new Promise(r=>releaseGraph=r);
  await context.route('**/*',async route=>{
   const u=new URL(route.request().url());if(u.origin===origin){requests.push(u.pathname);const file=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':u.pathname));if(!file.startsWith(root+path.sep))return route.abort();return route.fulfill({contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html',body:fs.readFileSync(file)});}
   if(!u.hostname.endsWith('.supabase.co'))return route.abort();
   requests.push(u.pathname+u.search);let body=[];
   if(u.pathname==='/auth/v1/user')body=user;
   else if(u.pathname==='/rest/v1/tasks')body=Array.from({length:80},(_,i)=>({id:'archive-'+i,title:'Archive fixture '+i,status:'Done',priority:'Medium',created_by_id:user.id,assigned_to_id:user.id,created_by_name:profile.name,assigned_to_name:profile.name,assignment_type:'personal',created_at:'2020-01-01T00:00:00Z',due_date:'2020-01-01',completed_at:'2020-01-01T00:00:00Z',department:'IT',organisation:'WIPAHS'}));
   else if(u.pathname.includes('/profiles'))body=u.searchParams.has('or')||u.searchParams.has('id')?profile:[profile];
   else if(u.pathname.includes('/rpc/officehub_presence_snapshot'))body=[{user_id:user.id,status:'Online',fresh_seconds:120,out_of_office:false}];
   else if(u.pathname.includes('/rpc/officehub_presence_'))body=null;
   else if(u.pathname.endsWith('/sharepoint-list')){graphStarted=true;await graphWait;body={documents:[]};}
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await context.routeWebSocket('**/*',ws=>ws.close());
  const failures=new Map();
  await context.route(/\/(SharePointView|MeetingsTeamsView|StaffDirectoryView)-[^/]+\.js(?:\?.*)?$/,async route=>{
   const key=new URL(route.request().url()).pathname;
   const calls=(failures.get(key)||0)+1;failures.set(key,calls);
   if(calls===1)return route.fulfill({status:503,contentType:'text/plain',body:'Temporary outage'});
   return route.fallback();
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  let navigations=0;page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations++;});

  await page.goto(origin);await page.getByRole('heading',{name:'Welcome, Performance'}).waitFor();releaseGraph();
  for(const [button,heading] of [['Documents','SharePoint Document Library'],['Meetings','Meetings, RSVP & Conferencing'],['Staff Directory','Authorized Staff Directory']]){
   await page.getByRole('button',{name:'Toggle navigation menu'}).click();
   await page.getByRole('button',{name:new RegExp('^'+button+'(?:$| \\d)')}).click();
   await page.getByRole('heading',{name:heading,exact:true}).waitFor({timeout:15000});
   assert.equal(await page.getByText('This screen could not open',{exact:true}).count(),0);
  }
  assert.equal(failures.size,3);for(const calls of failures.values())assert.ok(calls>=2);
  assert.equal(navigations,1,'download recovery must not reload the app');
  assert.deepEqual(errors,[]);console.log('PASS: Documents, Meetings and Staff recover from failed page downloads without reloading or showing unavailable.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
