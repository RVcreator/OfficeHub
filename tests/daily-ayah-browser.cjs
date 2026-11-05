// Isolated production-bundle fixture; no real accounts or business services.
const {chromium}=require('playwright');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve('dist'),origin='https://officehub-fixture.invalid';
 const browser=await chromium.launch({headless:true,executablePath:process.env.OFFICEHUB_BROWSER_EXECUTABLE});
 const results=[];
 try {for(const width of [390,1440]){
  const context=await browser.newContext({viewport:{width,height:900}});
  const profile={id:'10000000-0000-4000-8000-000000000001',email:'fixture@example.invalid',name:'Ayah Fixture',role:'Staff',department:'IT',organisation:'WIPAHS',avatar:''};
  const user={...profile,aud:'authenticated',role:'authenticated',app_metadata:{must_change_password:false}};
  const jwt=[{alg:'HS256'},{sub:user.id,exp:4070908800,aud:'authenticated',role:'authenticated'},'fixture'].map(v=>typeof v==='string'?v:Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
  await context.addInitScript(({user,jwt})=>{
   localStorage.setItem('wipahs_supabase_auth_session',JSON.stringify({access_token:jwt,refresh_token:'fixture',expires_at:4070908800,expires_in:99999999,token_type:'bearer',user}));
   window.shifts=[];new PerformanceObserver(list=>{for(const e of list.getEntries())if(!e.hadRecentInput)window.shifts.push(e.value);}).observe({type:'layout-shift',buffered:true});
  },{user,jwt});
  let calls=0,fail=false,long=false,delay=1600;
  await context.route('**/*',async r=>{
   const u=new URL(r.request().url());
   if(u.origin===origin){const file=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':u.pathname));if(!file.startsWith(root+path.sep))return r.abort();return r.fulfill({path:file,contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html'});}
   let data=[];
   if(u.hostname==='api.alquran.cloud'){
    calls++;const n=Number(u.pathname.split('/')[3]);await new Promise(resolve=>setTimeout(resolve,delay));
    if(fail)return r.fulfill({status:503,body:'Unavailable'});
    data={code:200,data:[{number:n,text:'آية الاختبار',numberInSurah:5,surah:{number:54,englishName:`Fixture ${n}`,name:'Fixture'},edition:{identifier:'quran-uthmani'}},{number:n,text:long ? 'Long verse content '.repeat(120) : `Selected verse ${n}`,numberInSurah:5,surah:{number:54},edition:{identifier:'en.qarai'}}]};
   }else if(u.hostname.endsWith('.supabase.co')){
    if(u.pathname==='/auth/v1/user')data=user;
    else if(u.pathname.includes('/profiles'))data=u.searchParams.has('id')?profile:[profile];
   }else return r.abort();
   return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
  await context.routeWebSocket('**/*',ws=>ws.close());
  const page=await context.newPage();await page.clock.setFixedTime(new Date('2026-11-05T10:00:00Z'));
  await page.goto(origin);await page.getByRole('heading',{name:'Welcome, Ayah'}).waitFor();
  await page.getByText('Loading today’s ayah…').waitFor();
  const card=page.getByLabel('Ayah of the Day',{exact:true});
  const before=await card.boundingBox();await card.getByText('Selected verse 4851',{exact:false}).waitFor();
  const after=await card.boundingBox();assert.ok(after.height < (width < 640 ? 256 : 224), 'short verses must not retain the old fixed-height gap');
  const selected=await card.innerText();assert.equal(calls,1);
  await page.reload();await card.getByText('Selected verse 4851',{exact:false}).waitFor();assert.equal(await card.innerText(),selected);assert.equal(calls,1,'refresh uses the same date-scoped verse');
  await page.screenshot({path:`../../outputs/OfficeHub-daily-ayah-${width}.png`,fullPage:true});
  delay=0;await page.clock.setFixedTime(new Date('2026-11-05T21:00:00Z'));await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await card.getByText('Selected verse 4541',{exact:false}).waitFor();assert.equal(calls,2,'midnight refreshes without reloading the workspace');
  fail=true;await page.clock.setFixedTime(new Date('2026-11-06T21:00:00Z'));await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await card.getByRole('button',{name:'Try again'}).waitFor();assert.doesNotMatch(await card.innerText(),/Selected verse/,'yesterday is not relabelled today');
  fail=false;await card.getByRole('button',{name:'Try again'}).click();await card.getByText('Selected verse 5136',{exact:false}).waitFor();
  results.push({width,calls,loadedHeight:after.height,refreshStable:true,midnightRollover:true,retry:true,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});
  assert.equal(results.at(-1).overflow,false);
  long=true;await page.clock.setFixedTime(new Date('2026-11-07T21:00:00Z'));await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await card.getByText(/Long verse content/).waitFor();
  const longBox=await card.boundingBox();assert.ok(longBox.height <= (width < 640 ? 256 : 224),'long verses remain within the panel height limit');
  assert.ok(await card.evaluate(el=>el.scrollHeight>el.clientHeight),'long verses remain readable by scrolling');
  await context.close();
 }fs.writeFileSync('../../outputs/OfficeHub-daily-ayah-browser.json',JSON.stringify(results,null,2));console.log(results);
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
