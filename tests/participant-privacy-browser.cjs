// Isolated production bundle: no production accounts, writes, emails or network.
const {chromium}=require(process.env.OFFICEHUB_PLAYWRIGHT_MODULE||'playwright');
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
(async()=>{
 const root=path.resolve(__dirname,'../dist'),origin='https://officehub-fixture.invalid',uid=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 const browser=await chromium.launch({headless:true,executablePath:process.env.OFFICEHUB_BROWSER_EXECUTABLE});
 try{
  for(const role of ['requester','approver','unrelated-admin']){
   const n=role==='requester'?1:role==='approver'?2:3;
   const user={id:uid(n),email:`fixture${n}@example.invalid`,aud:'authenticated',role:'authenticated',created_at:new Date().toISOString(),app_metadata:{must_change_password:false},user_metadata:{name:'Privacy Fixture'}};
   const profile={...user,name:'Privacy Fixture',role:n===3?'Admin':'Staff',department:'IT',organisation:'WIPAHS',out_of_office:false,avatar:''};
   const jwt=[{alg:'HS256',typ:'JWT'},{sub:user.id,exp:Math.floor(Date.now()/1000)+3600,aud:'authenticated',role:'authenticated'},'fixture'].map(v=>typeof v==='string'?v:Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
   const context=await browser.newContext({viewport:{width:1440,height:900}});
   await context.addInitScript(({user,jwt})=>localStorage.setItem('wipahs_supabase_auth_session',JSON.stringify({access_token:jwt,refresh_token:'fixture-only',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user})),{user,jwt});
   const rows=[{id:'request-1',title:'Private pending approval',description:'Confidential fixture',requested_by_id:uid(1),requested_by_name:'Requester',requested_date:new Date().toISOString(),approver_ids:[uid(2)],status:'Pending',department:'IT'},
    {id:'request-2',title:'Private resolved approval',description:'Resolved fixture',requested_by_id:uid(1),requested_by_name:'Requester',approver_ids:[uid(2)],status:'Approved',approved_by:'Selected Approver',department:'IT'}];
   await context.route('**/*',route=>{
    const u=new URL(route.request().url());
    if(u.origin===origin){const file=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':u.pathname));if(!file.startsWith(root+path.sep))return route.abort();return route.fulfill({contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html',body:fs.readFileSync(file)});}
    if(!u.hostname.endsWith('.supabase.co'))return route.abort();
    let body=[];
    if(u.pathname==='/auth/v1/user')body=user;
    else if(u.pathname==='/rest/v1/profiles_public')body=[profile];
    else if(u.pathname.includes('/profiles'))body=u.searchParams.has('id')?profile:[profile];
    // Deliberately return stale, overbroad approval rows to also exercise the UI membership check.
    else if(u.pathname==='/rest/v1/approvals')body=rows;
    else if(u.pathname.includes('/rpc/officehub_presence_'))body=null;
    else if(u.pathname.endsWith('/sharepoint-list'))body={documents:[]};
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
   });
   await context.routeWebSocket('**/*',ws=>ws.close());
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(origin);await page.getByRole('heading',{name:'Welcome, Privacy',exact:true}).waitFor();
   await page.getByRole('button',{name:'Toggle navigation menu'}).click();await page.getByRole('button',{name:/^Approvals/}).click();
   await page.getByRole('heading',{name:/Approvals/}).first().waitFor();
   if(n===3){assert.equal(await page.getByText('Private pending approval',{exact:true}).count(),0);assert.equal(await page.getByText('Private resolved approval',{exact:true}).count(),0);}
   else{await page.getByText('Private pending approval',{exact:true}).waitFor();await page.getByText('Private resolved approval',{exact:true}).waitFor();}
   assert.equal(await page.getByRole('button',{name:'Approve',exact:true}).count(),n===2?1:0);
   assert.equal(await page.getByRole('button',{name:'Reject',exact:true}).count(),n===2?1:0);
   assert.deepEqual(errors,[]);await page.screenshot({path:`.auth-qa/screenshots/privacy-${role}.png`,fullPage:true});await context.close();
  }
  console.log('PASS: production UI requester sees results without decision controls; only selected approver has decision controls; unrelated administrator sees no private requests, even with an overbroad stale fixture response.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
