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
  const directory=new Map([['persisted',{id:'persisted',name:'Saved In Supabase',organisation:'WIPAHS',member_count:0}]]);let attempts=0,denyReads=false;directory.set('ho-finance',{id:'ho-finance',name:'Finance',organisation:'HO'});directory.set('ho-custom',{id:'ho-custom',name:'Custom Support',organisation:'HO'});directory.set('ho-duplicate',{id:'ho-duplicate',name:'finance',organisation:'HO'});directory.set('wec-management',{id:'wec-management',name:'Management',organisation:'WEC'});const initialSize=directory.size;
  let releaseGraph,graphStarted=false;const graphWait=new Promise(r=>releaseGraph=r);
  await context.route('**/*',async route=>{
   const u=new URL(route.request().url());if(u.origin===origin){requests.push(u.pathname);const file=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':u.pathname));if(!file.startsWith(root+path.sep))return route.abort();return route.fulfill({contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html',body:fs.readFileSync(file)});}
   if(!u.hostname.endsWith('.supabase.co'))return route.abort();
   requests.push(u.pathname+u.search);let body=[];
   if(u.pathname==='/rest/v1/departments'){
    if(denyReads&&route.request().method()==='GET')return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Fixture connection unavailable'})});
    if(route.request().method()==='POST'){
     attempts++;await new Promise(r=>setTimeout(r,300));
     if(attempts===1)return route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({message:'Fixture save denied',code:'42501'})});
     body=JSON.parse(route.request().postData());directory.set(body.id,body);
    }else body=[...directory.values()];
    return route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
   }

   if(u.pathname==='/auth/v1/user')body=user;
   else if(u.pathname.includes('/profiles'))body=u.searchParams.has('or')||u.searchParams.has('id')?profile:[profile];
   else if(u.pathname.includes('/rpc/officehub_presence_snapshot'))body=[{user_id:user.id,status:'Online',fresh_seconds:120,out_of_office:false}];
   else if(u.pathname.includes('/rpc/officehub_presence_'))body=null;
   else if(u.pathname.endsWith('/sharepoint-list')){graphStarted=true;await graphWait;body={documents:[]};}
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await context.routeWebSocket('**/*',ws=>ws.close());
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  const started=Date.now();await page.goto(origin);await page.getByRole('heading',{name:'Welcome, Performance'}).waitFor({timeout:10000});
  releaseGraph();
  await page.getByRole('button',{name:'Toggle navigation menu'}).click();await page.getByRole('button',{name:'User Management',exact:true}).click();
  await page.getByRole('button',{name:'Add New Member',exact:true}).waitFor();
  denyReads=true;await page.getByRole('button',{name:'Add New Member',exact:true}).click();
  await page.getByRole('button',{name:'Retry department connection',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Create Member Account',exact:true}).isDisabled(),true);
  denyReads=false;await page.getByRole('button',{name:'Retry department connection',exact:true}).click();
  const org=page.getByRole('combobox',{name:'Member organisation',exact:true}),dept=page.getByRole('combobox',{name:'Member department',exact:true});
  await dept.waitFor({state:'visible'});await page.waitForFunction(()=>!document.querySelector('[aria-label="Member department"]').disabled);
  await org.selectOption('HO');
  assert.deepEqual(await dept.locator('option').evaluateAll(options=>options.filter(o=>!o.disabled).map(o=>o.value)),['Custom Support','Finance']);
  assert.equal(await dept.inputValue(),'Custom Support');await dept.selectOption('Finance');
  await org.selectOption('WEC');assert.equal(await dept.inputValue(),'Management');
  assert.deepEqual(await dept.locator('option').evaluateAll(options=>options.filter(o=>!o.disabled).map(o=>o.value)),['Management']);
  await org.selectOption('MEDEWELL');assert.equal(await dept.inputValue(),'');
  assert.equal(await page.getByRole('button',{name:'Create Member Account',exact:true}).isDisabled(),true);
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  const openDepartments=async()=>{await page.getByRole('button',{name:'Toggle navigation menu'}).click();await page.getByRole('button',{name:'Departments',exact:true}).click();};
  await openDepartments();await page.getByRole('heading',{name:'Saved In Supabase',exact:true}).waitFor();
  await page.getByRole('button',{name:'Add Department',exact:true}).click();
  const name=page.getByPlaceholder('e.g. management, Finance, IT...');await name.fill('Persistent New Unit');
  const save=page.getByRole('button',{name:'Create Department',exact:true});await save.click();assert.equal(await save.isDisabled(),true);
  await page.locator('form').getByRole('alert').filter({hasText:'Fixture save denied'}).waitFor();
  assert.equal(await name.inputValue(),'Persistent New Unit');assert.equal(await page.getByRole('heading',{name:'Persistent New Unit',exact:true}).count(),0);
  await save.click();await page.getByRole('heading',{name:'Persistent New Unit',exact:true}).waitFor();assert.equal(attempts,2);assert.equal(directory.size,initialSize+1);
  await page.reload();await page.getByRole('heading',{name:'Welcome, Performance'}).waitFor();await openDepartments();
  await page.getByRole('heading',{name:'Persistent New Unit',exact:true}).waitFor();await page.getByRole('heading',{name:'Saved In Supabase',exact:true}).waitFor();
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.screenshot({path:'.auth-qa/screenshots/departments-persisted.png',fullPage:true});
  assert.deepEqual(errors,[]);console.log('PASS: actual department page loads database records, rejected insert stays visible with retained form, confirmed insert appears immediately and survives reload; member form loads independently, retries connection failures, uses saved organisation-specific choices and blocks missing departments; 390px layout and zero browser errors.');

 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
