import {test} from 'node:test';import assert from 'node:assert/strict';
import {inlineAppStyles} from '../scripts/inlineAppStyles';
import {portalStore} from '../src/services/store';
test('production HTML embeds exactly the generated app CSS and retains remote fonts and hashed assets',()=>{
 const html='<head><link rel="stylesheet" crossorigin href="/assets/index-hash.css"><link href="https://fonts.example.invalid/css" rel="stylesheet"></head>';
 const css='.fixture{color:green}/* </style><script> */';
 const bundle:any={'index.html':{type:'asset',fileName:'index.html',source:html},'assets/index-hash.css':{type:'asset',fileName:'assets/index-hash.css',source:css}};
 (inlineAppStyles().generateBundle as Function)({},bundle);
 assert.match(bundle['index.html'].source,/<style data-officehub-app-styles>/);
 assert.doesNotMatch(bundle['index.html'].source,/href="\/assets\/index-hash.css"/);
 assert.match(bundle['index.html'].source,/https:\/\/fonts.example.invalid\/css/);
 assert.ok(bundle['index.html'].source.includes('<\\/style><script>'));
 assert.equal(bundle['assets/index-hash.css'].source,css,'Keep hashed CSS available for old documents and lazy consumers');
});
test('prefetched profile still requires the verified Auth UUID and canonical email',async()=>{
 const id='10000000-0000-4000-8000-000000000001',user={id,email:'fixture@example.invalid'};
 await assert.rejects(portalStore.syncAuthenticatedUserProfile(user,Promise.resolve({data:{id:'10000000-0000-4000-8000-000000000002',email:user.email},error:null})),/no matching staff profile/);
 await assert.rejects(portalStore.syncAuthenticatedUserProfile(user,Promise.resolve({data:{id,email:'other@example.invalid'},error:null})),/do not match/);
 await assert.rejects(portalStore.syncAuthenticatedUserProfile(user,Promise.resolve({data:null,error:Error('offline')})),/could not be loaded/);
 const saved=await portalStore.syncAuthenticatedUserProfile({...user,app_metadata:{must_change_password:true}},Promise.resolve({data:{id,email:user.email,name:'Fixture'},error:null}));
 assert.equal(saved.id,id);assert.equal(saved.mustChangePassword,true);
});
