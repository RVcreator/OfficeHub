// Production UI, intercepted backend, controlled clock: no real meetings or mail.
const {chromium}=require(process.env.OFFICEHUB_PLAYWRIGHT_MODULE||'playwright');const fs=require('fs'),path=require('path'),assert=require('assert/strict');
(async()=>{
 const root=path.resolve(__dirname,'../dist'),origin='https://officehub-fixture.invalid',uid=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 const browser=await chromium.launch({headless:true,executablePath:process.env.OFFICEHUB_BROWSER_EXECUTABLE});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  const user={id:uid(2),email:'invitee@example.invalid',role:'authenticated',aud:'authenticated',app_metadata:{must_change_password:false},user_metadata:{name:'Meeting Fixture'}};
  const profile={...user,name:'Meeting Fixture',department:'IT',organisation:'WIPAHS',role:'Staff'};
  const jwt=[{alg:'HS256',typ:'JWT'},{sub:user.id,exp:4070908800,aud:'authenticated',role:'authenticated'},'fixture'].map(v=>typeof v==='string'?v:Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
  await context.addInitScript(({user,jwt})=>localStorage.setItem('wipahs_supabase_auth_session',JSON.stringify({access_token:jwt,refresh_token:'fixture-only',expires_at:4070908800,expires_in:99999999,token_type:'bearer',user})),{user,jwt});
  const meetings=[['ending','Ending shortly','2026-11-03','11:00'],['past','Dormant fixture','2026-11-03','10:00'],['archived','Archived fixture','2026-10-30','11:00'],['future','Tomorrow fixture','2026-11-04','11:00']].map(([id,title,date,end_time])=>({id,title,date,start_time:'09:00',end_time,department:'IT',organizer_id:uid(1),organizer_name:'Organizer',chair_id:uid(1),status:'Scheduled',teams_join_url:'https://teams.example.invalid/'+id,created_at:'2026-11-01T00:00:00Z'}));
  const attendees=meetings.map(m=>({meeting_id:m.id,user_id:uid(2),name:profile.name,email:user.email,status:'Pending'}));let responses=0;
  await context.route('**/*',route=>{
   const req=route.request(),u=new URL(req.url());if(u.origin===origin){const file=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':u.pathname));if(!file.startsWith(root+path.sep))return route.abort();return route.fulfill({contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html',body:fs.readFileSync(file)});}
   if(!u.hostname.endsWith('.supabase.co'))return route.abort();let body=[];
   if(u.pathname==='/auth/v1/user')body=user;
   else if(u.pathname==='/rest/v1/profiles_public')body=[profile];
   else if(u.pathname==='/rest/v1/profiles')body=profile;
   else if(u.pathname==='/rest/v1/meetings')body=meetings;
   else if(u.pathname==='/rest/v1/meeting_attendees'){
    if(req.method()==='PATCH'){const id=(u.searchParams.get('meeting_id')||'').replace('eq.','');assert.equal(id,'ending');responses++;const row=attendees.find(a=>a.meeting_id===id);Object.assign(row,req.postDataJSON());body=row;}else body=attendees;
   }else if(u.pathname==='/rest/v1/notifications'&&req.method()==='POST')body=req.postDataJSON();
   else if(u.pathname.includes('/rpc/officehub_presence_'))body=null;
   else if(u.pathname.endsWith('/sharepoint-list'))body={documents:[]};
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await context.routeWebSocket('**/*',ws=>ws.close());const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date('2026-11-03T07:58:00Z')});await page.goto(origin);await page.getByRole('heading',{name:'Welcome, Meeting',exact:true}).waitFor();
  await page.getByText('Ending shortly',{exact:true}).waitFor();await page.getByText('Tomorrow fixture',{exact:true}).waitFor();assert.equal(await page.getByText('Dormant fixture',{exact:true}).count(),0);
  const navigate=async name=>{await page.getByRole('button',{name:'Toggle navigation menu'}).click();await page.getByRole('button',{name,exact:true}).click();};
  await navigate('Meetings 2');
  const ending=page.locator('[data-meeting-id="ending"]'),past=page.locator('[data-meeting-id="past"]');await ending.waitFor();await past.getByText('Dormant — responses closed',{exact:true}).first().waitFor();assert.equal(await past.getByRole('button',{name:'Accept',exact:true}).count(),0);assert.equal(await page.locator('[data-meeting-id="archived"]').count(),0);
  await ending.getByRole('button',{name:'Accept',exact:true}).click();await ending.getByText('✓ Accepted',{exact:true}).waitFor();assert.equal(responses,1);
  await page.clock.fastForward(125000);await ending.getByText('Dormant — responses closed',{exact:true}).first().waitFor();assert.equal(await ending.getByRole('button',{name:'Accept',exact:true}).count(),0);assert.equal(await ending.getByRole('button',{name:'Decline',exact:true}).count(),0);assert.equal(responses,1);
  await page.screenshot({path:'.auth-qa/screenshots/meeting-dormant-deadline.png',fullPage:true});
  await navigate('Dashboard');await page.getByRole('heading',{name:'Upcoming Schedule',exact:true}).waitFor();assert.equal(await page.getByText('Ending shortly',{exact:true}).count(),0);await page.getByText('Tomorrow fixture',{exact:true}).waitFor();
  await navigate('Meetings 1');await ending.waitFor();await page.clock.fastForward(48*60*60*1000);await ending.waitFor({state:'hidden'});
  await page.getByRole('button',{name:'Portal & Integration Settings',exact:true}).click();await page.getByRole('button',{name:'Personal Archive',exact:true}).click();await page.getByText('Ending shortly',{exact:true}).waitFor();
  assert.equal(attendees.find(a=>a.meeting_id==='ending').status,'Accepted');assert.equal(responses,1);assert.deepEqual(errors,[]);
  console.log('PASS: expired meetings absent from Upcoming, future RSVP succeeds, boundary closes all RSVP controls without refresh, dormant row retained before 48h, removed from active and present in archive after 48h, previous response preserved, no browser errors.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
