// Production bundle + synthetic backend and clock; no staff records or outgoing mail.
const {chromium}=require(process.env.OFFICEHUB_PLAYWRIGHT_MODULE||'playwright');const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.OFFICEHUB_BROWSER_EXECUTABLE});
 try{
  const root=path.resolve(__dirname,'../dist'),origin='https://officehub-fixture.invalid',uid=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),user={id:uid(2),email:'archive@example.invalid',role:'authenticated',aud:'authenticated',app_metadata:{must_change_password:false},user_metadata:{name:'Archive Fixture'}};
  const profile={...user,name:'Archive Fixture',role:'Staff',department:'IT',organisation:'WIPAHS'};
  const jwt=[{alg:'HS256',typ:'JWT'},{sub:user.id,exp:4070908800,aud:'authenticated',role:'authenticated'},'fixture'].map(v=>typeof v==='string'?v:Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
  await context.addInitScript(({user,jwt})=>localStorage.setItem('wipahs_supabase_auth_session',JSON.stringify({access_token:jwt,refresh_token:'fixture',expires_at:4070908800,expires_in:99999999,token_type:'bearer',user})),{user,jwt});
  const boundary='2026-11-03T08:00:00Z',old='2026-11-01T08:00:00Z';
  const approvals=[['approved-boundary','Approval boundary','Approved',boundary],['approved-old','Archived approval','Approved',old],['pending','Pending request','Pending',null],['rejected','Rejected request','Rejected',null]].map(([id,title,status,archive_ready_at])=>({id,title,status,archive_ready_at,description:'Approval record retained',requested_by_id:uid(1),requested_by_name:'Requester',approver_ids:[uid(2)],approved_by:'Approver',requested_date:old,approved_date:old,department:'IT'}));
  const decisions=[['decision-boundary','Decision boundary','Approved',boundary],['decision-old','Archived decision','Implemented',old],['decision-progress','Still implementing','In Implementation',null],['decision-review','Still under review','Under Review',null]].map(([id,title,status,archive_ready_at])=>({id,title,status,archive_ready_at,context:'Decision record retained',author_name:'Decision author',date:old,department:'IT'}));
  const notices=[...Array.from({length:26},(_,i)=>({id:'old-'+i,title:i===25?'Older notice outside startup':'Old notice '+i})),{id:'notice-boundary',title:'Notice boundary'},{id:'notice-unacked',title:'Another persons acknowledgement'},{id:'notice-recent',title:'Recent acknowledgement'}].map(n=>({...n,content:'Notice record retained',created_at:old,priority:'Normal',author_id:uid(1),author_name:'Notice author',department:'IT'}));
  const acks=[...notices.filter(n=>n.id.startsWith('old-')).map(n=>({notice_id:n.id,user_id:uid(2),acknowledged_at:old})),{notice_id:'notice-boundary',user_id:uid(2),acknowledged_at:boundary},{notice_id:'notice-unacked',user_id:uid(3),acknowledged_at:old},{notice_id:'notice-recent',user_id:uid(2),acknowledged_at:'2026-11-16T08:00:00Z'}];
  let mutations=0,backendNow=Date.parse('2026-11-17T07:59:00Z');
  await context.route('**/*',route=>{
   const req=route.request(),u=new URL(req.url());
   if(u.origin===origin){const file=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':u.pathname));if(!file.startsWith(root+path.sep))return route.abort();return route.fulfill({path:file,contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html'});}
   if(!u.hostname.endsWith('.supabase.co'))return route.abort();let body=[];
   if(u.pathname==='/auth/v1/user')body=user;
   else if(u.pathname==='/rest/v1/profiles_public')body=[profile];
   else if(u.pathname==='/rest/v1/profiles')body=profile;
   else if(u.pathname==='/rest/v1/approvals')body=approvals;
   else if(u.pathname==='/rest/v1/decisions')body=decisions;
   else if(u.pathname==='/rest/v1/notices')body=notices;
   else if(u.pathname==='/rest/v1/rpc/officehub_active_notices')body=notices.filter(n=>!acks.some(a=>a.notice_id===n.id&&a.user_id===uid(2)&&Date.parse(a.acknowledged_at)+14*86400000<=backendNow));
   else if(u.pathname==='/rest/v1/notice_acknowledgements')body=acks;
   else if(u.pathname.includes('/rpc/officehub_presence_'))body=null;
   else if(u.pathname.endsWith('/sharepoint-list'))body={documents:[]};
   if(Array.isArray(body)){
    const params=u.searchParams;
    for(const key of ['id','notice_id','user_id','status','archive_ready_at']){const filter=params.get(key);if(!filter)continue;
     if(filter.startsWith('eq.'))body=body.filter(r=>String(r[key])===filter.slice(3));
     if(filter.startsWith('in.')){const allowed=filter.slice(4,-1).split(',');body=body.filter(r=>allowed.includes(r[key]));}
     if(filter.startsWith('lte.'))body=body.filter(r=>r[key]&&Date.parse(r[key])<=Date.parse(filter.slice(4)));
    }
    const offset=Number(params.get('offset')||0),limit=Number(params.get('limit')||1000);body=body.slice(offset,offset+limit);
   }
   if(req.method()!=='GET'&&/\/rest\/v1\/(approvals|decisions|notices|notice_acknowledgements)$/.test(u.pathname))mutations++;
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await context.routeWebSocket('**/*',ws=>ws.close());const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date('2026-11-17T07:59:00Z')});await page.goto(origin);await page.getByRole('heading',{name:'Welcome, Archive',exact:true}).waitFor();
  const nav=async name=>{await page.getByRole('button',{name:'Toggle navigation menu'}).click();await page.getByRole('button',{name,exact:true}).click();};
  await nav('Approvals 1');await page.getByText('Approval boundary',{exact:true}).waitFor();assert.equal(await page.getByText('Archived approval',{exact:true}).count(),0);await page.getByText('Pending request',{exact:true}).waitFor();
  await nav('Decisions');await page.getByText('Decision boundary',{exact:true}).waitFor();await page.getByText('Still implementing',{exact:true}).waitFor();assert.equal(await page.getByText('Archived decision',{exact:true}).count(),0);
  await nav('Notices');await page.getByText('Notice boundary',{exact:true}).waitFor();await page.getByText('Another persons acknowledgement',{exact:true}).waitFor();assert.equal(await page.getByText('Old notice 0',{exact:true}).count(),0);
  await nav('Approvals 1');await page.getByText('Approval boundary',{exact:true}).waitFor();backendNow+=61000;await page.clock.fastForward(61000);await page.getByText('Approval boundary',{exact:true}).waitFor({state:'hidden'});await page.getByText('Pending request',{exact:true}).waitFor();
  await nav('Decisions');assert.equal(await page.getByText('Decision boundary',{exact:true}).count(),0);await page.getByText('Still implementing',{exact:true}).waitFor();
  await nav('Notices');assert.equal(await page.getByText('Notice boundary',{exact:true}).count(),0);await page.getByText('Another persons acknowledgement',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Portal & Integration Settings'}).click();await page.getByRole('button',{name:'Personal Archive',exact:true}).click();
  await page.getByText('Older notice outside startup',{exact:true}).waitFor();await page.getByText('Archived approval',{exact:true}).waitFor();await page.getByText('Approval boundary',{exact:true}).waitFor();await page.getByText('Archived decision',{exact:true}).waitFor();await page.getByText('Decision boundary',{exact:true}).waitFor();await page.getByText('Notice boundary',{exact:true}).waitFor();
  for(const id of ['notice-unacked','notice-recent','pending'])assert.equal(await page.locator(`[data-archived-work-id="${id}"]`).count(),0);
  await page.getByText('Archived approval',{exact:true}).click();await page.locator('[data-archived-work-id="approved-old"]').getByText('Approval record retained',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Clear Archived Tasks & Meetings'}).count(),0,'New archive types cannot be permanently cleared');
  await page.screenshot({path:'.auth-qa/screenshots/OfficeHub-work-archive-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:'.auth-qa/screenshots/OfficeHub-work-archive-mobile.png',fullPage:true});
  assert.equal(mutations,0);assert.deepEqual(errors,[]);
  console.log('PASS: active screens exclude old records; 14-day boundary updates without refresh; archive loads older records beyond startup limit; approvals/decisions/notices retained read-only; another member’s or recent acknowledgement stays out; no deletes/mutations; mobile layout fits.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
