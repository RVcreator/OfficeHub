// Isolated production bundle fixture. Every external request is intercepted.
const {chromium}=require(process.env.OFFICEHUB_PLAYWRIGHT_MODULE||'playwright');
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
(async()=>{
 const root=path.resolve(__dirname,'../dist'),origin='https://officehub-fixture.invalid',uid=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 const browser=await chromium.launch({headless:true,executablePath:process.env.OFFICEHUB_BROWSER_EXECUTABLE});
 try{for(const n of [1,3]){
  const user={id:uid(n),email:`fixture${n}@example.invalid`,aud:'authenticated',role:'authenticated',created_at:new Date().toISOString(),app_metadata:{must_change_password:false},user_metadata:{name:'Chat Fixture'}};
  const profile={...user,name:'Chat Fixture',role:n===3?'Admin':'Staff',department:'IT',organisation:'WIPAHS',out_of_office:false,avatar:''};
  const jwt=[{alg:'HS256',typ:'JWT'},{sub:user.id,exp:Math.floor(Date.now()/1000)+3600,aud:'authenticated',role:'authenticated'},'fixture'].map(v=>typeof v==='string'?v:Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
  const context=await browser.newContext({viewport:{width:1440,height:900}});
  await context.addInitScript(({user,jwt})=>localStorage.setItem('wipahs_supabase_auth_session',JSON.stringify({access_token:jwt,refresh_token:'fixture-only',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user})),{user,jwt});
  const convs=[{id:'own-dm',title:'Member direct chat',type:'direct'},{id:'own-group',title:'Member group',type:'group'},{id:'not-mine',title:'Forbidden conversation title',type:'direct',last_message:'Forbidden preview'}];
  const participants=[...['own-dm','own-group'].flatMap(conversation_id=>[1,2].map(n=>({conversation_id,user_id:uid(n)}))),...[2,4].map(n=>({conversation_id:'not-mine',user_id:uid(n)}))];
  const messages=[{id:'own-message',conversation_id:'own-dm',sender_id:uid(2),sender_name:'Colleague',text:'Visible member message',timestamp:new Date().toISOString()},{id:'secret',conversation_id:'not-mine',sender_id:uid(4),sender_name:'Other',text:'Forbidden message body',timestamp:new Date().toISOString()}];
  let sent=0;
  await context.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());
   if(u.origin===origin){const file=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':u.pathname));if(!file.startsWith(root+path.sep))return route.abort();return route.fulfill({contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html',body:fs.readFileSync(file)});}
   if(!u.hostname.endsWith('.supabase.co'))return route.abort();let body=[];
   if(u.pathname==='/auth/v1/user')body=user;
   else if(u.pathname==='/rest/v1/profiles_public')body=[profile];
   else if(u.pathname.includes('/profiles'))body=u.searchParams.has('id')?profile:[profile];
   // Deliberately overbroad fixture responses exercise client defense as well as RLS tests.
   else if(u.pathname==='/rest/v1/conversations')body=convs;
   else if(u.pathname==='/rest/v1/conversation_participants')body=participants;
   else if(u.pathname==='/rest/v1/messages'){
    if(req.method()==='POST'){const row=req.postDataJSON();assert.equal(row.sender_id,user.id);assert.equal(row.conversation_id,'own-dm');sent++;body={...row,timestamp:new Date().toISOString()};messages.push(body);}else body=messages;
   }
   else if(u.pathname.includes('/rpc/officehub_presence_'))body=null;
   else if(u.pathname.endsWith('/sharepoint-list'))body={documents:[]};
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await context.routeWebSocket('**/*',ws=>ws.close());const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin);await page.getByRole('heading',{name:'Welcome, Chat',exact:true}).waitFor();
  await page.getByRole('button',{name:'Toggle navigation menu'}).click();await page.getByRole('button',{name:/^Messages/}).click();
  await page.getByPlaceholder('Search conversations, staff, groups, messages...').waitFor();
  if(n===1){await page.getByText('Member group',{exact:true}).waitFor();await page.getByText('Visible member message',{exact:true}).waitFor();
   const composer=page.locator('textarea');await composer.fill('Confirmed private send');await composer.press('Control+Enter');await page.locator('p.whitespace-pre-wrap').filter({hasText:'Confirmed private send'}).waitFor();assert.equal(sent,1);
  }else{assert.equal(await page.getByText('Member group',{exact:true}).count(),0);assert.equal(await page.getByText('Visible member message',{exact:true}).count(),0);}
  for(const text of ['Forbidden conversation title','Forbidden preview','Forbidden message body'])assert.equal((await page.locator('body').innerText()).includes(text),false);
  await page.getByPlaceholder('Search conversations, staff, groups, messages...').fill('Forbidden');for(const text of ['Forbidden conversation title','Forbidden preview','Forbidden message body'])assert.equal((await page.locator('body').innerText()).includes(text),false);
  assert.deepEqual(errors,[]);await page.screenshot({path:`.auth-qa/screenshots/chat-private-${n}.png`,fullPage:true});await context.close();
 }console.log('PASS: production UI member DM/group access and confirmed send; unrelated admin sees no chats/history/previews; search cannot reveal private fixture content; no browser errors.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
