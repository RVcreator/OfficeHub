// Verify the built public showcase without contacting staff or Microsoft services.
const {chromium}=require(process.env.OFFICEHUB_PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve(__dirname,'../dist'),origin='https://officehub-fixture.invalid';
 const browser=await chromium.launch({headless:true,executablePath:process.env.OFFICEHUB_BROWSER_EXECUTABLE});
 try{
  const context=await browser.newContext();const requests=[],errors=[];
  await context.addInitScript(()=>{
   for(const key of ['localStorage','sessionStorage','indexedDB'])Object.defineProperty(window,key,{get(){throw Error('Demo tried to read '+key);}});
   Object.defineProperty(document,'cookie',{get(){throw Error('Demo tried to read cookies');},set(){throw Error('Demo tried to set cookies');}});
  });
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());requests.push({url:url.href,method:request.method()});
   const rel=url.pathname==='/demo/'?'demo/index.html':url.pathname.slice(1);
   const allowed=['demo/index.html','demo/demo-v1.css','demo/demo-v1.js','wipahs-icon-v1.png'];
   if(url.origin!==origin||!allowed.includes(rel)||request.method()!=='GET'){await route.abort();throw Error('Unexpected demo request: '+url.href);}
   await route.fulfill({path:path.join(root,rel),contentType:rel.endsWith('.html')?'text/html':rel.endsWith('.js')?'application/javascript':rel.endsWith('.css')?'text/css':'image/png'});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:1440,height:1000});await page.goto(origin+'/demo/');
  await page.getByLabel('Demo password',{exact:true}).fill('WrongDemoPassword');await page.getByRole('button',{name:'Explore the demo →'}).click();
  await page.getByRole('alert').filter({hasText:'Use the public demo details'}).waitFor();
  await page.getByLabel('Demo password',{exact:true}).fill('ExploreOfficeHub!');await page.getByRole('button',{name:'Explore the demo →'}).click();
  await page.getByRole('heading',{name:'Good work starts with a clear day.'}).waitFor();
  const visit=async label=>page.getByRole('navigation',{name:'Demo features'}).getByRole('button',{name:label,exact:true}).click();
  await visit('Tasks & ratings');await page.getByRole('button',{name:'Try completing the task'}).click();await page.getByRole('button',{name:'Try a sample rating'}).click();await page.getByText('Sample feedback: Clear plan, delivered on time.',{exact:true}).waitFor();
  await visit('Meetings & calendar');await page.getByRole('button',{name:'Accept',exact:true}).click();await page.getByText('Accepted',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Responses closed'}).isEnabled(),false);
  await visit('Approvals & decisions');await page.getByRole('button',{name:'Approve sample request'}).click();await page.getByText('Approved',{exact:true}).waitFor();
  await visit('Private messages');await page.getByRole('button',{name:'Try a sample reply'}).click();await page.getByText('Thanks, I’ll review the sample plan.',{exact:true}).waitFor();
  await visit('Documents & Microsoft 365');await page.getByRole('button',{name:'Preview sample document'}).click();await page.getByText('This text was written only for the public demo.',{exact:true}).waitFor();
  await visit('Notices & acknowledgements');await page.getByRole('button',{name:'Acknowledge sample notice'}).click();await page.getByText('Acknowledged',{exact:true}).waitFor();
  for(const label of ['Projects','Alerts & email summaries','People & departments','Personal archive','Account & permissions']){await visit(label);assert.ok(await page.locator('#content h1').innerText());}
  await page.getByRole('button',{name:'Reset sample actions'}).click();await visit('Tasks & ratings');assert.equal(await page.getByRole('button',{name:'Try completing the task'}).isEnabled(),true);
  await page.reload();await page.getByRole('button',{name:'Explore the demo →'}).click();await visit('Tasks & ratings');assert.equal(await page.getByRole('button',{name:'Try completing the task'}).isEnabled(),true);
  for(const width of [390,768,1440]){
   await page.setViewportSize({width,height:1000});
   for(const label of ['Overview','Tasks & ratings','Meetings & calendar','Documents & Microsoft 365','Account & permissions']){
    await visit(label);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`Overflow at ${width}: ${label}`);
   }
  }
  await visit('Overview');await page.screenshot({path:'.auth-qa/screenshots/OfficeHub-guest-demo-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:900});await page.screenshot({path:'.auth-qa/screenshots/OfficeHub-guest-demo-mobile.png',fullPage:true});
  await page.getByRole('button',{name:'Exit demo'}).click();await page.getByRole('heading',{name:'Come and have a look'}).waitFor();
  assert.deepEqual(errors,[]);assert.ok(requests.length>0);assert.ok(requests.every(r=>r.method==='GET'&&r.url.startsWith(origin)));
  console.log('PASS: guest entry, all feature pages, sample actions, reset/reload, 390/768/1440px layouts, no session access or production/API requests, no browser errors.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
