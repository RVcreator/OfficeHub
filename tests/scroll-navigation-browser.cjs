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
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  const started=Date.now();await page.goto(origin);await page.getByRole('heading',{name:'Welcome, Performance'}).waitFor({timeout:10000});
  releaseGraph();
  const results=[];
  for(const {width,height} of [{width:320,height:568},{width:390,height:900},{width:768,height:900},{width:1440,height:900},{width:844,height:390}]){
   await page.setViewportSize({width,height});
   await page.evaluate(()=>{const box=document.createElement('div');box.style.height='2000px';box.className='fixture-scroll-spacer';document.querySelector('.oh-main').append(box);});
   const headerBefore=await page.locator('.oh-header').boundingBox();
   await page.locator('.oh-main').evaluate(e=>e.scrollTop=600);
   const headerAfter=await page.locator('.oh-header').boundingBox();
   assert.equal(headerAfter.y,headerBefore.y,'main header stays in place while content scrolls');
   assert.equal(await page.evaluate(()=>window.scrollY),0);
   await page.getByRole('button',{name:'Toggle navigation menu'}).click();
   await page.locator('#officehub-navigation nav').evaluate(e=>e.scrollTop=400);
   assert.equal((await page.locator('.oh-header').boundingBox()).y,headerBefore.y,'scrolling navigation cannot move main header');
   await page.getByRole('button',{name:'Toggle navigation menu'}).count();
   if(width<1280)await page.getByRole('button',{name:'Close navigation',exact:true}).click();
   else await page.getByRole('button',{name:'Toggle navigation menu'}).click();
   await page.locator('.oh-main').evaluate(e=>e.scrollTop=0);
   await page.getByRole('button',{name:'Portal & Integration Settings',exact:true}).click();
   await page.getByRole('button',{name:'Personal Archive',exact:true}).click();
   await page.locator('.oh-archive-scroll').waitFor({state:'attached'});
   console.log('archive viewport',width,height,await page.locator('.oh-archive-scroll').evaluate(e=>({height:e.clientHeight,parent:e.parentElement.clientHeight,banner:e.previousElementSibling.clientHeight})));
   await page.screenshot({path:'.auth-qa/screenshots/archive-check-'+width+'.png'});
   const banner=page.getByText('Your Personal Archive',{exact:true});
   const top=await banner.boundingBox();
   assert.ok(await page.locator('.oh-archive-scroll').evaluate(e=>e.scrollHeight>e.clientHeight),'archive list really scrolls');
   assert.ok(await page.locator('.oh-archive-scroll').evaluate(e=>e.clientHeight>40),'archive records remain reachable in short viewports');
   await page.locator('.oh-archive-scroll').evaluate(e=>e.scrollTop=600);
   assert.equal((await banner.boundingBox()).y,top.y,'archive banner stays fixed while records scroll');
   assert.ok((await page.getByRole('button',{name:/All Archived/}).boundingBox()).y>=0);
   if(width===390)await page.screenshot({path:'.auth-qa/screenshots/archive-sticky-390.png',fullPage:true});
   await page.getByRole('button',{name:'Close settings',exact:true}).click();results.push({width,headerFixed:true,archiveFixed:true});
  }
  await page.setViewportSize({width:1440,height:900});
  let delayed=false;
  await page.route('**/MyDayView-*.js',async r=>{delayed=true;await new Promise(resolve=>setTimeout(resolve,1200));return r.fulfill({contentType:'application/javascript',body:fs.readFileSync(path.join(root,new URL(r.request().url()).pathname))});});
  await page.getByRole('button',{name:'Toggle navigation menu'}).click();
  await page.getByRole('button',{name:'My Day',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('main').getAttribute('aria-busy')==='true');
  assert.equal(await page.getByRole('heading',{name:'Welcome, Performance'}).isVisible(),true,'previous screen stays visible while chunk downloads');
  assert.equal(await page.getByText('Loading view...',{exact:true}).count(),0);
  await page.waitForFunction(()=>document.querySelector('main').getAttribute('aria-busy')==='false');
  assert.ok(delayed);assert.equal(await page.getByRole('heading',{name:'Welcome, Performance'}).count(),0);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'PASS',results,delayedNavigationRetainsScreen:true,errors},null,2));

 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
