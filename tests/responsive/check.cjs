const {chromium}=require(process.env.OFFICEHUB_PLAYWRIGHT_MODULE || 'playwright');
const fs=require('fs');
(async()=>{
 process.chdir(require('path').resolve(__dirname,'../..'));
 const {build}=await import('vite');
 await build({build:{outDir:'.responsive-qa/build',emptyOutDir:true,rollupOptions:{input:'tests/responsive/index.html',output:{codeSplitting:false}},cssCodeSplit:false}});
 const browser=await chromium.launch({headless:true,...(process.env.OFFICEHUB_BROWSER_EXECUTABLE?{executablePath:process.env.OFFICEHUB_BROWSER_EXECUTABLE}:{})});
 const page=await browser.newPage();const errors=[];
 page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.message)});
 await page.route('**/*',route=>route.request().url().endsWith('/wipahs-logo.jpg')?route.fulfill({contentType:'image/jpeg',body:fs.readFileSync('public/wipahs-logo.jpg')}):route.request().url().startsWith('file:')?route.continue():route.abort());
 const dir='.responsive-qa/build',files=fs.readdirSync(dir+'/assets');
 const js=fs.readFileSync(dir+'/assets/'+files.find(f=>f.endsWith('.js')),'utf8').replace(/<\/script/gi,'<\\/script');
 const css=fs.readFileSync(dir+'/assets/'+files.find(f=>f.endsWith('.css')),'utf8');
 fs.writeFileSync(dir+'/inline.html','<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><div id="root"></div><script type="module" src="data:text/javascript;base64,'+Buffer.from(js).toString('base64')+'"></script>');
 const base=require('url').pathToFileURL(require('path').resolve(dir+'/inline.html')).href;
 const results=[];
 const out='.responsive-qa/screenshots';fs.mkdirSync(out,{recursive:true});
 for(const width of [320,390,640,768,1024,1280,1440]){
  await page.setViewportSize({width,height:900});
  for(const view of ['dashboard','tasks-my-work','calendar','documents','projects','messages',...([320,768,1440].includes(width)?['staff','notices','approvals','departments','roles-permissions','my-day','analytics','users']:[])]){
   await page.goto(`${base}?view=${view}`);await page.locator('.oh-header').waitFor();await page.waitForTimeout(350);
   const report=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('main *')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.right>innerWidth+1&&!e.closest('.overflow-x-auto,.oh-tabs')}).slice(0,8).map(e=>({tag:e.tagName,text:e.textContent?.slice(0,55),class:e.className}))}));
   results.push({width,view,...report});
   if([390,768,1440].includes(width)&&view==='dashboard')await page.screenshot({path:`${out}/dashboard-${width}.png`,fullPage:true});
   if(width===320&&['calendar','tasks-my-work','documents','projects'].includes(view))await page.screenshot({path:`${out}/${view}-320.png`,fullPage:true});
  }
  for(const modal of ['quick','settings',...([320,768,1440].includes(width)?['create-project','project']:[])]){
   await page.goto(`${base}?modal=${modal}`);await page.locator('.oh-dialog').waitFor();await page.waitForTimeout(250);
   results.push({width,modal,...await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,panel:[...document.querySelectorAll('.oh-dialog > div')].map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom}})}))});
   if(width===390)await page.screenshot({path:`${out}/${modal}-${width}.png`});
  }
 }
 await page.setViewportSize({width:390,height:700});await page.goto(base);await page.getByRole('button',{name:'Toggle navigation menu'}).click();await page.getByRole('button',{name:'Close navigation',exact:true}).waitFor();await page.keyboard.press('Escape');await page.waitForTimeout(350);
 results.push({drawerEscape:await page.getByRole('button',{name:'Toggle navigation menu'}).getAttribute('aria-expanded'),focusRestored:await page.getByRole('button',{name:'Toggle navigation menu'}).evaluate(e=>e===document.activeElement)});
 for(const size of [{width:320,height:568},{width:844,height:390}]){
  await page.setViewportSize(size);
  for(const modal of ['quick','settings','create-project','project']){
   await page.goto(`${base}?modal=${modal}`);await page.locator('.oh-dialog').waitFor();
   const panel=await page.locator('.oh-dialog > div').boundingBox();if(panel.y<0||panel.y+panel.height>size.height+1)throw Error('Dialog outside short viewport');
   if(modal==='settings'){
    const tabs=await page.locator('.oh-tabs > button').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,right:r.right}}));
    if(tabs.some((r,i)=>i&&r.x<tabs[i-1].right-1))throw Error('Settings tabs overlap');
   }
   if(modal==='quick'){
    const submit=page.getByRole('button',{name:'Create Task',exact:true});await submit.scrollIntoViewIfNeeded();
    const box=await submit.boundingBox();if(box.y<0||box.y+box.height>size.height+1)throw Error('Task submit cannot be reached');
   }
   if(modal==='project'){
    const footer=await page.locator('.oh-project-footer').boundingBox();if(footer.y<0||footer.y+footer.height>size.height+1)throw Error('Project actions outside viewport');
    const labels=await page.locator('.oh-project-footer button span').evaluateAll(es=>es.map(e=>({height:e.getBoundingClientRect().height,line:parseFloat(getComputedStyle(e).lineHeight)})));
    if(labels.some(r=>r.height>r.line*1.5))throw Error('Project action labels wrap into narrow columns');
   }
   if(size.width===844)await page.screenshot({path:`${out}/${modal}-landscape.png`});
  }
  await page.goto(`${base}?view=calendar`);await page.getByRole('button',{name:'Week',exact:true}).click();const region=page.getByRole('region',{name:/Weekly calendar/});
  if(!await region.evaluate(e=>e.scrollWidth>e.clientWidth))throw Error('Weekly calendar should scroll within panel');
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('Weekly calendar overflows page');
  await page.goto(base);await page.getByRole('button',{name:'Notifications',exact:true}).click();const menu=await page.locator('.oh-notifications').boundingBox();if(menu.x<0||menu.x+menu.width>size.width+1)throw Error('Notification menu outside viewport');
 }
 if(results.some(r=>r.scroll>r.width+1)||errors.length)throw Error('Overflow or browser errors found');
 fs.writeFileSync(`${out}/results.json`,JSON.stringify({results,errors},null,2));console.log(JSON.stringify({overflow:results.filter(r=>r.scroll>r.width+1),errors,drawer:results.at(-1)},null,2));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
