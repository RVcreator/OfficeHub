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
  let repairCalls=0;let documents=[{id:'document-fixture',name:'Deletion fixture.pdf',folder:'General',created_by_id:user.id,graph_drive_item_id:'item',web_url:'https://files.example.invalid/file',visibility:'Specific People',modified_at:'2026-11-03T10:00:00Z'}],denyDelete=true,deleteCalls=0;
  const dialogs=[];
  await context.addInitScript(()=>localStorage.setItem('wipahs_sharepoint_documents',JSON.stringify([{id:'stale-cache',name:'Must not return.pdf'}])));
  await context.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());
   if(u.origin===origin){const file=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':u.pathname));if(!file.startsWith(root+path.sep))return route.abort();return route.fulfill({contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html',body:fs.readFileSync(file)});}
   if(!u.hostname.endsWith('.supabase.co'))return route.abort();let body=[];
   if(u.pathname==='/auth/v1/user')body=user;
   else if(u.pathname==='/rest/v1/profiles_public')body=[profile];
   else if(u.pathname==='/rest/v1/profiles')body=profile;
   else if(u.pathname==='/rest/v1/sharepoint_documents'){
    assert.equal(req.method(),'GET','app never directly deletes database metadata');body=documents;
   }else if(u.pathname==='/functions/v1/sharepoint-document-action'){
    const args=req.postDataJSON();
    if(args.action==='reconcile'){repairCalls++;body={success:true,repaired:1,unresolved:[]};}
    else if(args.action==='delete'){deleteCalls++;if(denyDelete)return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'Microsoft did not confirm deletion (412). The document has been kept; refresh and retry.'})});documents=[];body={success:true,deleted:true};}
    else if(args.action==='sync'){documents[0].name='Renamed in Microsoft.pdf';body={success:true,document:documents[0]};}
    else body={success:true,folder:args.folderName};
   }else if(u.pathname.includes('/rpc/officehub_presence_'))body=[];
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await context.routeWebSocket('**/*',ws=>ws.close());
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async dialog=>{dialogs.push(dialog.message());await dialog.accept();});
  const openDocuments=async()=>{await page.getByRole('heading',{name:'Welcome, Performance',exact:true}).waitFor();await page.getByRole('button',{name:'Toggle navigation menu'}).click();await page.getByRole('button',{name:/^Documents/}).click();await page.getByRole('heading',{name:'SharePoint Document Library'}).waitFor();};
  await page.goto(origin);await openDocuments();await page.getByText('Deletion fixture.pdf',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Repair older links',exact:true}).click();
  await page.getByRole('status').getByText('1 Microsoft link(s) repaired. 0 record(s) need administrator review. No files were deleted.').waitFor();
  assert.equal(repairCalls,1);assert.equal(deleteCalls,0);
  await page.getByTitle('Delete Document',{exact:true}).click();
  await page.waitForFunction(()=>document.body.innerText.includes('Deletion fixture.pdf'));await page.waitForTimeout(150);
  assert.ok(dialogs.some(message=>message.includes('412')));assert.equal(deleteCalls,1);assert.equal(await page.getByText('Deletion fixture.pdf',{exact:true}).count(),1);
  await page.getByRole('button',{name:'Sync All',exact:true}).click();await page.getByText('Renamed in Microsoft.pdf',{exact:true}).waitFor();
  denyDelete=false;await page.getByTitle('Delete Document',{exact:true}).click();await page.getByText('Renamed in Microsoft.pdf',{exact:true}).waitFor({state:'hidden'});assert.equal(deleteCalls,2);
  await page.reload();await openDocuments();assert.equal(await page.getByText('Renamed in Microsoft.pdf',{exact:true}).count(),0);assert.equal(await page.getByText('Must not return.pdf',{exact:true}).count(),0);
  await page.screenshot({path:'.auth-qa/screenshots/document-confirmed-deletion.png',fullPage:true});assert.deepEqual(errors,[]);
  console.log('Built-browser document checks passed: failed Microsoft deletion preserves card, real sync uses server metadata, success removes after confirmation, refresh does not resurrect old cache, no direct database delete or browser errors.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
