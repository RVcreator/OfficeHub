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
  let stalled=true;const never=new Promise(()=>{});
  await context.route('**/*',async route=>{
   const u=new URL(route.request().url());if(u.origin===origin){const file=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':u.pathname));if(!file.startsWith(root+path.sep))return route.abort();return route.fulfill({contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html',body:fs.readFileSync(file)});}
   if(!u.hostname.endsWith('.supabase.co'))return route.abort();let body=[];
   if(u.pathname==='/auth/v1/user'){if(stalled)await never;body=user;}
   else if(u.pathname==='/auth/v1/token'){if(stalled)await never;body={user,access_token:jwt,refresh_token:'fixture',expires_in:3600,token_type:'bearer'};}
   else if(u.pathname==='/rest/v1/profiles_public')body=[profile];
   else if(u.pathname.includes('/profiles'))body=profile;
   else if(u.pathname.includes('/rpc/officehub_presence_'))body=[];
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)}).catch(()=>{});
  });
  await context.routeWebSocket('**/*',ws=>ws.close());const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin);await page.getByText(/OfficeHub could not finish verifying your account/).waitFor({timeout:25000});
  assert.equal(await page.getByRole('heading',{name:'Welcome, Performance',exact:true}).count(),0,'cached identity never bypasses failed verification');
  stalled=false;await page.getByRole('button',{name:'Try again',exact:true}).click();await page.getByRole('heading',{name:'Welcome, Performance',exact:true}).waitFor({timeout:10000});
  // A refresh request can hang before INITIAL_SESSION is emitted: the startup deadline must cover this too.
  const expiredContext=await browser.newContext({viewport:{width:1440,height:900}});
  await expiredContext.addInitScript(({user,jwt})=>localStorage.setItem('wipahs_supabase_auth_session',JSON.stringify({access_token:jwt,refresh_token:'fixture-expired',expires_at:1,expires_in:1,token_type:'bearer',user})),{user,jwt});
  await expiredContext.route('**/*',async route=>{
   const u=new URL(route.request().url());if(u.origin===origin){const file=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':u.pathname));return route.fulfill({path:file,contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html'});}
   if(u.hostname.endsWith('.supabase.co')){await never;return;}return route.abort();
  });await expiredContext.routeWebSocket('**/*',ws=>ws.close());const expired=await expiredContext.newPage();await expired.goto(origin);
  await expired.getByText(/OfficeHub could not finish verifying your account/).waitFor({timeout:25000});assert.equal(await expired.getByRole('heading',{name:'Welcome, Performance',exact:true}).count(),0);
  await expired.screenshot({path:'.auth-qa/screenshots/auth-startup-stall-recovery.png',fullPage:true});assert.deepEqual(errors,[]);
  console.log('Built-browser authentication recovery passed: stalled account request and missing initial-session event stop loading, neither trusts cached identity, successful retry restores verified dashboard.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
