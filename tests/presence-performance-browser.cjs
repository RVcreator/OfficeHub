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

  await context.addInitScript(()=>{
   let visible=true;const pulses=[];Object.defineProperty(document,'visibilityState',{get:()=>visible?'visible':'hidden'});
   const interval=window.setInterval.bind(window);window.setInterval=(fn,ms,...args)=>{if(ms===30000){pulses.push(()=>fn(...args));return -pulses.length;}return interval(fn,ms,...args);};
   window.__presenceVisibility=value=>{visible=value;document.dispatchEvent(new Event('visibilitychange'));};
   window.__presencePulses=()=>{for(let i=0;i<120;i++)pulses.forEach(fn=>fn());};
  });
  let beats=0,leaves=0,snapshots=0,holdLeaves=false,releaseLeave;
  const heldLeave=new Promise(r=>releaseLeave=r);
  await context.route('**/*',async route=>{
   const u=new URL(route.request().url());if(u.origin===origin){const file=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':u.pathname));if(!file.startsWith(root+path.sep))return route.abort();return route.fulfill({contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html',body:fs.readFileSync(file)});}
   if(!u.hostname.endsWith('.supabase.co'))return route.abort();let body=[];
   if(u.pathname==='/auth/v1/user')body=user;
   else if(u.pathname.includes('/profiles'))body=u.searchParams.has('or')||u.searchParams.has('id')?profile:[profile];
   else if(u.pathname.endsWith('/officehub_presence_snapshot')){snapshots++;body=[{user_id:user.id,status:'Online',fresh_seconds:120,out_of_office:false}];}
   else if(u.pathname.endsWith('/officehub_presence_heartbeat_v2')){beats++;body=null;}
   else if(u.pathname.endsWith('/officehub_presence_leave')){leaves++;if(holdLeaves)await heldLeave;body=null;}
   else if(u.pathname.endsWith('/sharepoint-list'))body={documents:[]};
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await context.routeWebSocket('**/*',ws=>ws.close());const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  const initial=page.waitForResponse(r=>r.url().endsWith('/officehub_presence_snapshot'));await page.goto(origin);await initial;
  await page.getByRole('heading',{name:'Welcome, Performance',exact:true}).waitFor();
  const hidden=page.waitForResponse(r=>r.url().endsWith('/officehub_presence_snapshot'));await page.evaluate(()=>window.__presenceVisibility(false));await hidden;
  const before={beats,leaves,snapshots};assert.deepEqual(before,{beats:1,leaves:1,snapshots:2});
  await page.evaluate(()=>window.__presencePulses());await page.waitForTimeout(100);assert.deepEqual({beats,leaves,snapshots},before,'120 hidden pulses send no presence requests');
  const resumed=page.waitForResponse(r=>r.url().endsWith('/officehub_presence_snapshot'));await page.evaluate(()=>window.__presenceVisibility(true));await resumed;assert.equal(beats,2);
  holdLeaves=true;await page.getByRole('button',{name:'Account and presence',exact:true}).click();await page.getByRole('button',{name:'Sign Out',exact:true}).click();
  await page.getByRole('heading',{name:'Sign in to your account',exact:true}).waitFor({timeout:3000});assert.ok(leaves>=2,'cleanup started without holding local logout');
  releaseLeave();assert.deepEqual(errors,[]);
  console.log(JSON.stringify({result:'PASS',checks:['one initial heartbeat','one withdrawal on hide','zero presence requests across 120 hidden timer pulses','visible return refreshes immediately','stalled leave does not block sign-out','no browser errors']},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
