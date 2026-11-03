// Built app, synthetic staff and intercepted backend. No production task or email is created.
const {chromium}=require(process.env.OFFICEHUB_PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve(__dirname,'../dist'),origin='https://officehub-fixture.invalid';
 const browser=await chromium.launch({headless:true,executablePath:process.env.OFFICEHUB_BROWSER_EXECUTABLE});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  const user={id:'10000000-0000-4000-8000-000000000002',email:'search@example.invalid',role:'authenticated',aud:'authenticated',app_metadata:{must_change_password:false},user_metadata:{name:'Search Fixture'}};
  const profile={...user,name:'Search Fixture',department:'IT',organisation:'WIPAHS',role:'Staff'};
  const jwt=[{alg:'HS256',typ:'JWT'},{sub:user.id,exp:4070908800,aud:'authenticated',role:'authenticated'},'fixture'].map(v=>typeof v==='string'?v:Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
  await context.addInitScript(({user,jwt})=>localStorage.setItem('wipahs_supabase_auth_session',JSON.stringify({access_token:jwt,refresh_token:'fixture-only',expires_at:4070908800,expires_in:99999999,token_type:'bearer',user})),{user,jwt});
  let taskWrites=0;
  await context.route('**/*',route=>{
   const req=route.request(),u=new URL(req.url());
   if(u.origin===origin){const file=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':u.pathname));if(!file.startsWith(root+path.sep))return route.abort();return route.fulfill({path:file,contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html'});}
   if(!u.hostname.endsWith('.supabase.co'))return route.abort();let body=[];
   if(u.pathname==='/auth/v1/user')body=user;
   else if(u.pathname==='/rest/v1/profiles_public')body=[profile];
   else if(u.pathname==='/rest/v1/profiles')body=profile;
   else if(u.pathname==='/rest/v1/tasks'&&req.method()==='POST'){taskWrites++;body=req.postDataJSON();}
   else if(u.pathname.includes('/rpc/officehub_presence_'))body=null;
   else if(u.pathname.endsWith('/sharepoint-list'))body={documents:[]};
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await context.routeWebSocket('**/*',ws=>ws.close());
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin);await page.getByRole('heading',{name:'Welcome, Search',exact:true}).waitFor();
  await page.getByRole('button',{name:'Create task Assign work and a deadline'}).click();
  const title=page.getByPlaceholder('e.g. Conduct Secondary School Teacher Workshop');await title.fill('Draft must survive member search');
  const description=page.getByPlaceholder('Operational context and expected deliverables...');await description.fill('Unsaved draft fixture');
  await page.locator('select').filter({has:page.locator('option[value="specific_people"]')}).selectOption('specific_people');
  const search=page.getByRole('textbox',{name:'Search staff members',exact:true});
  await page.locator('form p').getByText('Search Fixture — Staff',{exact:true}).click();
  // Verify editing cannot reach an ancestor navigation shortcut. Native text deletion still runs.
  await page.evaluate(()=>{window.testSearchKeys=[];document.addEventListener('keydown',e=>{if(e.key==='Backspace'||e.key==='Enter')window.testSearchKeys.push(e.key);});});
  await search.fill('Search');await search.press('Backspace');assert.equal(await search.inputValue(),'Searc');
  await search.press('Control+a');await search.press('Backspace');await search.press('Backspace');assert.equal(await search.inputValue(),'');
  await search.fill('abcdef');await search.evaluate(e=>e.setSelectionRange(2,5));await search.press('Backspace');assert.equal(await search.inputValue(),'abf');
  await search.press('Enter');assert.equal(taskWrites,0,'Search Enter must not submit the task');
  assert.deepEqual(await page.evaluate(()=>window.testSearchKeys),[]);
  assert.equal(await title.inputValue(),'Draft must survive member search');assert.equal(await description.inputValue(),'Unsaved draft fixture');
  await search.fill('Search');await page.locator('form p').getByText('Search Fixture — Staff',{exact:true}).waitFor();
  assert.equal(await page.locator('form span.font-semibold').getByText('Search Fixture — Staff',{exact:true}).count(),1,'Selected member badge remains');
  let warned=false;page.once('dialog',async dialog=>{assert.equal(dialog.type(),'beforeunload');warned=true;await dialog.dismiss();});
  await page.reload().catch(()=>{});assert.equal(warned,true,'Browser navigation must warn about the draft');
  assert.equal(await title.inputValue(),'Draft must survive member search');
  await page.screenshot({path:'.auth-qa/screenshots/OfficeHub-task-member-search-verified.png',fullPage:true});
  // Explicit form submission still saves once; search edits never save.
  await page.getByRole('button',{name:'Create Task',exact:true}).click();await title.waitFor({state:'hidden'});assert.equal(taskWrites,1);
  assert.deepEqual(errors,[]);
  console.log('PASS: Backspace deletes text/selection normally, empty search stays open, ancestor shortcuts isolated, Enter cannot submit search, fields and member selection retained, unload warns, explicit save works once.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});