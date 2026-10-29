// Actual UsersView and store action, isolated SDK responses, external requests blocked.
const {chromium}=require(process.env.OFFICEHUB_PLAYWRIGHT_MODULE||'playwright');
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
(async()=>{
 process.chdir(path.resolve(__dirname,'..'));
 const {build}=await import('vite');
 await build({build:{outDir:'.auth-qa/deletion',emptyOutDir:true,rollupOptions:{input:'tests/responsive/index.html',output:{codeSplitting:false}},cssCodeSplit:false}});
 const dir='.auth-qa/deletion',files=fs.readdirSync(dir+'/assets');
 const js=fs.readFileSync(dir+'/assets/'+files.find(f=>f.endsWith('.js'))),css=fs.readFileSync(dir+'/assets/'+files.find(f=>f.endsWith('.css')));
 fs.writeFileSync(dir+'/inline.html','<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><div id="root"></div><script type="module" src="data:text/javascript;base64,'+js.toString('base64')+'"></script>');
 const browser=await chromium.launch({headless:true,executablePath:process.env.OFFICEHUB_BROWSER_EXECUTABLE});
 try {
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>r.request().url().startsWith('file:')?r.continue():r.abort());
  for(const width of [320,768,1440]){
   await page.setViewportSize({width,height:760});await page.goto(require('url').pathToFileURL(path.resolve(dir+'/inline.html')).href+'?view=users&deletion-test=1');
   await page.getByTitle('Delete User',{exact:true}).click();
   const confirm=page.getByRole('button',{name:'Delete User Permanently',exact:true});assert.equal(await confirm.isDisabled(),true);
   await page.getByLabel('Email to confirm deletion',{exact:true}).fill('wrong@example.invalid');assert.equal(await confirm.isDisabled(),true);
   await page.getByLabel('Email to confirm deletion',{exact:true}).fill('delete-fixture@example.invalid');assert.equal(await confirm.isEnabled(),true);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   if(width===320){fs.mkdirSync('.auth-qa/screenshots',{recursive:true});await page.screenshot({path:'.auth-qa/screenshots/permanent-user-deletion-320.png',fullPage:true});}
   await confirm.click();await page.getByRole('alert').filter({hasText:'Fixture deletion blocked'}).waitFor();assert.equal(await page.getByTitle('Delete User',{exact:true}).count(),1);
   await confirm.click();await page.getByTitle('Delete User',{exact:true}).waitFor({state:'detached'});assert.equal(await page.getByText('Deletion Fixture',{exact:true}).count(),0);
  }
  assert.deepEqual(errors,[]);console.log('PASS: actual deletion dialog and store at 320/768/1440px, typed-email confirmation, visible failure without local removal, successful retry, zero browser errors.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
