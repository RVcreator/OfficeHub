const {chromium}=require(process.env.OFFICEHUB_PLAYWRIGHT_MODULE||'playwright');const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.OFFICEHUB_BROWSER_EXECUTABLE});
try{
 const root=path.resolve(__dirname,'../dist'),origin='https://officehub-fixture.invalid',uid=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 for(const mode of ['ordinary','delegate','manager']){
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),access={view:mode!=='ordinary',manage:mode==='manager'},writes=[],reads=[],errors=[];
  const profile={id:uid(1),name:'Access Fixture',email:'access@example.invalid',role:mode==='ordinary'?'Hospitality Manager':mode==='manager'?'COO':'Staff',department:mode==='manager'?'Top management':'Hospitality',organisation:'WIPAHS',out_of_office:false};
  const other={id:uid(2),name:'Other Fixture',email:'other@example.invalid',role:'Staff',department:'Finance',organisation:'WIPAHS'};
  const user={...profile,role:'authenticated',aud:'authenticated',app_metadata:{must_change_password:false,role:'Admin',department:'IT'},user_metadata:{name:profile.name}};
  const jwt=[{alg:'HS256',typ:'JWT'},{sub:user.id,exp:4070908800,aud:'authenticated',role:'authenticated'},'fixture'].map(value=>typeof value==='string'?value:Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
  let grants=[{user_id:user.id,can_manage:true,automatic:true,active:true,granted_at:null}];
  await context.addInitScript(({user,jwt})=>localStorage.setItem('wipahs_supabase_auth_session',JSON.stringify({access_token:jwt,refresh_token:'fixture',expires_at:4070908800,expires_in:99999999,token_type:'bearer',user})),{user,jwt});
  await context.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());if(u.origin===origin){const file=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':u.pathname));if(!file.startsWith(root+path.sep))return route.abort();return route.fulfill({path:file,contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html'});}
   if(!u.hostname.endsWith('.supabase.co'))return route.abort();let body=[];
   if(u.pathname==='/auth/v1/user')body=user;
   else if(u.pathname==='/rest/v1/profiles_public')body=[profile,other];
   else if(u.pathname==='/rest/v1/profiles'){if(req.method()==='PATCH')writes.push({path:u.pathname});body=profile;}
   else if(u.pathname.endsWith('/rpc/officehub_administration_access'))body={user_id:user.id,can_view:access.view,can_manage:access.manage,automatic:mode==='manager'};
   else if(u.pathname.endsWith('/rpc/officehub_list_administration_access')){assert.equal(access.manage,true);body=grants;}
   else if(u.pathname.endsWith('/rpc/officehub_set_administration_access')){assert.equal(access.manage,true);const args=req.postDataJSON();writes.push(args);assert.equal(args.p_user,other.id);if(args.p_enabled)grants.push({user_id:other.id,can_manage:false,automatic:false,active:true,granted_at:new Date().toISOString()});else grants=grants.filter(grant=>grant.user_id!==other.id);body={success:true,user_id:args.p_user,enabled:args.p_enabled};}
   else if(u.pathname==='/rest/v1/role_permissions'){reads.push('roles');assert.notEqual(mode,'ordinary');body=access.view?[{role_id:'fixture-role',role_name:'Fixture role',permissions:[{module:'Tasks',view:true,create:false,edit:false,approve:false}],description:'Read test'}]:[];}
   else if(u.pathname==='/rest/v1/audit_log'){if(req.method()==='GET'){reads.push('audit');assert.notEqual(mode,'ordinary');}body=[];}
   else if(u.pathname.startsWith('/functions/v1/admin-')){writes.push({path:u.pathname});return route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({error:'Unexpected account mutation'})});}
   else if(u.pathname.includes('/rpc/officehub_presence_'))body=[];
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await context.routeWebSocket('**/*',ws=>ws.close());const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin);await page.getByRole('heading',{name:'Welcome, Access',exact:true}).waitFor();await page.getByRole('button',{name:'Toggle navigation menu'}).click();
  if(mode==='ordinary'){
   await page.waitForTimeout(200);assert.equal(await page.getByRole('button',{name:'Roles & Permissions',exact:true}).count(),0);assert.equal(await page.getByText('Administration',{exact:true}).count(),0);assert.deepEqual(reads,[]);assert.deepEqual(writes,[]);
   await page.screenshot({path:'.auth-qa/screenshots/administration-ordinary.png',fullPage:true});
  }else{
   await page.getByRole('button',{name:'Roles & Permissions',exact:true}).click();await page.getByRole('heading',{name:'Roles & Permissions Management',exact:true}).waitFor();await page.getByText('Fixture role',{exact:true}).first().waitFor();
   if(mode==='delegate'){
    assert.equal(await page.getByRole('button',{name:'Add Custom Role',exact:true}).isEnabled(),false);assert.equal(await page.getByRole('button',{name:'Grant Administration view',exact:true}).count(),0);
    await page.getByRole('button',{name:'Toggle navigation menu'}).click();await page.getByRole('button',{name:'User Management',exact:true}).click();await page.getByRole('heading',{name:'User Account Administration',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Add New Member',exact:true}).isEnabled(),false);
    access.view=false;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.getByRole('heading',{name:'Welcome, Access',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Roles & Permissions',exact:true}).count(),0);assert.deepEqual(writes,[]);
   }else{
    const panel=page.getByRole('region',{name:'Administration access',exact:true});await panel.getByText('Top management — automatic',{exact:true}).waitFor();
    await panel.getByRole('combobox',{name:'Staff member for administration access',exact:true}).selectOption(other.id);await panel.getByRole('button',{name:'Grant Administration view',exact:true}).click();await panel.getByRole('status').getByText('Administration viewing access granted.',{exact:true}).waitFor();
    assert.deepEqual(writes,[{p_user:other.id,p_enabled:true}]);await panel.getByRole('button',{name:'Remove access',exact:true}).click();await panel.getByRole('status').getByText('Administration viewing access removed.',{exact:true}).waitFor();assert.deepEqual(writes,[{p_user:other.id,p_enabled:true},{p_user:other.id,p_enabled:false}]);
    await page.screenshot({path:'.auth-qa/screenshots/administration-manager.png',fullPage:true});
   }
  }
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log('Built-browser administration checks passed: substring/metadata user denied, explicit viewer reads but cannot mutate, focus revocation closes admin pages, access manager grants/revokes with confirmed server replies and no account/profile writes.');
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1});
