// Actual App, LoginScreen, ForcedPasswordChangeScreen and client functions;
// isolated SDK/store and unrelated views, with all external requests blocked.
const {chromium}=require(process.env.OFFICEHUB_PLAYWRIGHT_MODULE||'playwright');
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
(async()=>{
 process.chdir(path.resolve(__dirname,'../..'));
 const {build}=await import('vite');
 const app=fs.readFileSync('src/App.tsx','utf8');
 const allowed=['LoginScreen','ForcedPasswordChangeScreen','AppErrorBoundary'];
 const stubNames=[...app.matchAll(/(?:import|const)\s+\{?\s*(\w+)(?:,\s*(\w+))?\s*\}?[^\n]*components\//g)].flatMap(m=>[m[1],m[2]]).filter(Boolean).filter(n=>!allowed.includes(n)&&n!=='TabId'&&n!=='SettingsTabType');
 const stubs=[...new Set(stubNames)].map(n=>`export const ${n}=()=>${n==='DashboardView'?"React.createElement('h1',null,'Fixture dashboard')":'null'};`).join('\n');
 await build({plugins:[{name:'auth-fixture-only',enforce:'pre',resolveId(source,importer){
 if(source==='@supabase/supabase-js')return path.resolve('tests/auth-browser/sdk.ts').replaceAll('\\','/');
 if(importer&&/\/src\//.test(importer.replaceAll('\\','/'))&&source.endsWith('/store'))return path.resolve('tests/auth-browser/store.ts').replaceAll('\\','/');
 if(importer?.replaceAll('\\','/').endsWith('/src/App.tsx')&&source.includes('/components/')&&!allowed.some(n=>source.endsWith('/'+n)))return '\0auth-stubs';
 },load(id){if(id==='\0auth-stubs')return "import React from 'react';\n"+stubs;}}],build:{outDir:'.auth-qa/build',emptyOutDir:true,rollupOptions:{input:'tests/auth-browser/index.html',output:{codeSplitting:false}},cssCodeSplit:false}});
 const dir='.auth-qa/build',assets=fs.readdirSync(dir+'/assets');
 const js=fs.readFileSync(dir+'/assets/'+assets.find(x=>x.endsWith('.js'))),css=fs.readFileSync(dir+'/assets/'+assets.find(x=>x.endsWith('.css')));
 fs.writeFileSync(dir+'/inline.html','<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><div id="root"></div><script type="module" src="data:text/javascript;base64,'+js.toString('base64')+'"></script>');
 const browser=await chromium.launch({headless:true,executablePath:process.env.OFFICEHUB_BROWSER_EXECUTABLE});
 try {
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
 page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE ERROR',e.message);});await page.route('**/*',r=>r.request().url().startsWith('file:')?r.continue():r.abort());
 await page.goto(require('url').pathToFileURL(path.resolve(dir+'/inline.html')).href);
 await page.getByRole('button',{name:'Copy',exact:true}).click();
 await page.getByRole('alert').filter({hasText:'Copy failed.'}).waitFor();assert.equal(await page.getByRole('button',{name:'Copied',exact:true}).count(),0);
 await page.getByRole('button',{name:'Allow fixture clipboard',exact:true}).click();await page.getByRole('button',{name:'Copy',exact:true}).click();await page.getByRole('button',{name:'Copied',exact:true}).waitFor();
 await page.locator('input[type=email]').fill('fixture@example.invalid');await page.locator('input[type=password]').fill('Fixture-only-temp!');
 await page.getByRole('button',{name:'Sign In',exact:true}).click();
 await page.getByRole('heading',{name:'Set a New Password',exact:true}).waitFor();assert.equal(await page.getByRole('heading',{name:'Fixture dashboard'}).count(),0);
 fs.mkdirSync('.auth-qa/screenshots',{recursive:true});await page.screenshot({path:'.auth-qa/screenshots/first-login.png',fullPage:true});
 await page.getByLabel('New Password',{exact:true}).fill('Fixture-new-password!');await page.getByLabel('Confirm New Password',{exact:true}).fill('Fixture-new-password!');
 await page.locator('button[type=submit]').click();await page.getByRole('heading',{name:'Fixture dashboard'}).waitFor();
 await page.getByRole('button',{name:'Simulate untrusted hint'}).click();await page.waitForTimeout(200);assert.equal(await page.getByRole('heading',{name:'Set a New Password'}).count(),0);
 await page.getByRole('button',{name:'Simulate admin reset'}).click();await page.getByRole('heading',{name:'Set a New Password',exact:true}).waitFor();
 await page.getByRole('button',{name:'Reject completion',exact:true}).click();
 await page.getByLabel('New Password',{exact:true}).fill('Fixture-second-password!');await page.getByLabel('Confirm New Password',{exact:true}).fill('Fixture-second-password!');await page.locator('button[type=submit]').click();
 await page.getByText('Failed to update password: Password change could not be confirmed. Please try again.',{exact:true}).waitFor();assert.equal(await page.getByRole('heading',{name:'Fixture dashboard'}).count(),0);
 assert.deepEqual(errors,[]);console.log('PASS: clipboard failure never reports copied, confirmed clipboard success, first login gate, confirmed completion, reset in active session, untrusted hint, failed completion stays gated; zero page errors; network blocked.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
