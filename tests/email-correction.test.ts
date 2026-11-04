import{test}from'node:test';import assert from'node:assert/strict';import{readFile}from'node:fs/promises';import{transformSync}from'esbuild';
const id='10000000-0000-4000-8000-000000000001';
async function fixture(options:{user?:boolean;allowed?:unknown;duplicate?:boolean;found?:boolean;stale?:boolean}={}){
 let current='ho.fin@wipahs.org';const writes:any[]=[];let graphCalls=0;
 const caller={auth:{getUser:async()=>({data:{user:options.user===false?null:{id:'actor'}},error:null})}};
 const admin={rpc:async()=>({data:options.allowed===undefined?true:options.allowed,error:null}),auth:{admin:{getUserById:async()=>({data:{user:{id,email:current}},error:null}),updateUserById:async(target:string,body:any)=>{writes.push({target,body});current=body.email;return{data:{user:{id,email:current}},error:null};}}},from:()=>({select:()=>({eq:()=>({single:async()=>({data:{id,email:options.stale?'different@wipahs.org':current},error:null})}),ilike:async()=>({data:options.duplicate?[{id:'other'}]:[],error:null})})})};
 let code=await readFile(new URL('../supabase/functions/admin-change-user-email/index.ts',import.meta.url),'utf8');code=code.replace(/^import .*;\r?\n/gm,'').replace('export async function handler','async function handler').replace('Deno.serve(handler);','return handler;');let clients=0;
 const fn=new Function('createClient','getMsGraphAppToken','fetch','Deno',transformSync(code,{loader:'ts',target:'es2022'}).code)(()=>++clients===1?caller:admin,async()=>'private',async()=>{graphCalls++;return Response.json(options.found===false?{}:{id:'microsoft',userPrincipalName:'hofin@wipahs.org'},{status:options.found===false?404:200});},{env:{get:()=> 'configured'}});
 const send=(body:any={userId:id,expectedEmail:'ho.fin@wipahs.org',email:'hofin@wipahs.org'})=>fn(new Request('https://fixture.invalid',{method:'POST',headers:{authorization:'Bearer verified'},body:JSON.stringify(body)}));
 return{send,writes,graphs:()=>graphCalls};
}
test('Email correction rejects anonymous, unrelated and view-only callers without accessing identities',async()=>{
 for(const options of[{user:false},{allowed:false},{allowed:'true'}]){const f=await fixture(options);assert.ok([401,403].includes((await f.send()).status));assert.equal(f.writes.length,0);assert.equal(f.graphs(),0);}
});
test('Email correction preserves UUID and changes only email through Auth Admin after Microsoft verification',async()=>{
 const f=await fixture();const response=await f.send();assert.equal(response.status,200);assert.deepEqual(f.writes,[{target:id,body:{email:'hofin@wipahs.org',email_confirm:true}}]);assert.deepEqual(await response.json(),{success:true,userId:id,email:'hofin@wipahs.org'});
});
test('Email correction blocks duplicate accounts, mismatches and missing Microsoft identities',async()=>{
 for(const options of[{duplicate:true},{stale:true},{found:false}]){const f=await fixture(options);assert.ok([400,409].includes((await f.send()).status));assert.equal(f.writes.length,0);}
 const f=await fixture();assert.equal((await f.send({userId:id,expectedEmail:'stale@wipahs.org',email:'hofin@wipahs.org'})).status,409);assert.equal(f.writes.length,0);
});
test('Email correction rejects arbitrary privilege fields and external addresses',async()=>{
 for(const body of[{userId:id,expectedEmail:'ho.fin@wipahs.org',email:'outside@example.org'},{userId:id,expectedEmail:'ho.fin@wipahs.org',email:'hofin@wipahs.org',password:'forbidden'}]){const f=await fixture();assert.equal((await f.send(body)).status,400);assert.equal(f.writes.length,0);}
});
