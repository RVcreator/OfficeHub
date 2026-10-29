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
   else if(u.pathname.includes('/profiles'))body=u.searchParams.has('or')||u.searchParams.has('id')?profile:[profile];
   else if(u.pathname.includes('/rpc/officehub_presence_snapshot'))body=[{user_id:user.id,status:'Online',fresh_seconds:120,out_of_office:false}];
   else if(u.pathname.includes('/rpc/officehub_presence_'))body=null;
   else if(u.pathname.endsWith('/sharepoint-list')){graphStarted=true;await graphWait;body={documents:[]};}
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await context.routeWebSocket('**/*',ws=>ws.close());
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  const started=Date.now();await page.goto(origin);await page.getByRole('heading',{name:'Welcome, Performance'}).waitFor({timeout:10000});
  const dashboardMs=Date.now()-started;assert.equal(graphStarted,false,'dashboard does not wait for deferred Graph listing');
  const initialScripts=requests.filter(x=>x.startsWith('/assets/')&&x.endsWith('.js'));
  assert.equal(initialScripts.some(x=>/xlsx|fileParser|QuickActionModal|ProjectModal|lib-/.test(x)),false,'parsers/modals are not initial requests');
  await page.getByRole('button',{name:'Create task Assign work and a deadline'}).click();
  await page.waitForFunction(()=>!!document.querySelector('.oh-dialog'));
  assert.ok(requests.some(x=>x.includes('QuickActionModal')),'task modal loads on demand');
  assert.equal(requests.some(x=>/\/xlsx-|\/lib-/.test(x)),false,'opening task form does not load document parsers');
  const XLSX=require('xlsx'),book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['Fixture'],[42]]),'Fixture');
  await page.locator('.oh-dialog input[type=file]').setInputFiles({name:'performance-fixture.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:XLSX.write(book,{type:'buffer',bookType:'xlsx'})});
  await page.getByText('performance-fixture.xlsx',{exact:true}).waitFor();
  assert.ok(requests.some(x=>x.includes('/xlsx-')),'spreadsheet parser loads only after selecting a spreadsheet');
  await page.getByRole('button',{name:'Close new record',exact:true}).click();
  await page.screenshot({path:'.auth-qa/screenshots/performance-modal.png',fullPage:true});
  releaseGraph();
  const failurePage=await context.newPage(),failureErrors=[];failurePage.on('pageerror',e=>failureErrors.push(e.message));
  await failurePage.route('**/QuickActionModal-*.js',r=>r.abort());
  await failurePage.goto(origin);await failurePage.getByRole('heading',{name:'Welcome, Performance'}).waitFor();
  await failurePage.getByRole('button',{name:'Create task Assign work and a deadline'}).click();
  await failurePage.getByRole('heading',{name:'This screen could not open',exact:true}).waitFor();
  assert.equal(await failurePage.getByRole('button',{name:'Reload OfficeHub',exact:true}).count(),1);
  assert.equal(await failurePage.getByRole('button',{name:'Toggle navigation menu'}).count(),1,'failed lazy chunk cannot blank the app');
  await failurePage.getByRole('button',{name:'Return to dashboard',exact:true}).click();
  assert.equal(await failurePage.getByRole('heading',{name:'This screen could not open',exact:true}).count(),0);
  assert.deepEqual(failureErrors,[]);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({result:'PASS',dashboard_fixture_ms:dashboardMs,initialScripts,checks:['dashboard before slow Graph response','no initial parsers/modals','task modal loads on demand','real spreadsheet parses on demand','failed chunk has recovery without blanking app','zero browser errors'],note:'Local fixture timing, not a Lighthouse score or production network benchmark.'},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
