import {test}from'node:test';import assert from'node:assert/strict';import{readFile}from'node:fs/promises';import{transformSync}from'esbuild';
async function handler(user:any,allowed:any){
 const calls:any[]=[];let code=await readFile(new URL('../supabase/functions/teams-meeting-sync/index.ts',import.meta.url),'utf8');
 code=code.replace(/^import .*;\r?\n/gm,'').replace('export async function handler','async function handler').replace('Deno.serve(handler);','return handler;');
 const caller={auth:{getUser:async()=>({data:{user},error:user?null:Error('Invalid')})},rpc:async(name:string,args:any)=>{calls.push({name,args});return{data:null,error:null};}};
 const admin={rpc:async(name:string,args:any)=>{calls.push({name,args});return{data:allowed,error:null};}};let clients=0;
 const run=new Function('createClient','getMsGraphAppToken','processTeamsSync','Deno',transformSync(code,{loader:'ts',target:'es2022'}).code);
 const fn=run(()=>++clients===1?caller:admin,async()=>'private-token',async(_deps:any,id:string)=>{calls.push({sync:id});return'synced';},{env:{get:()=> 'configured'}});
 return{fn,calls};
}
test('Teams sync rejects anonymous and non-manager callers before accessing Microsoft',async()=>{
 for(const [user,allowed,status]of[[null,true,401],[{id:'verified'},false,403],[{id:'verified'},'true',403]]as const){const{fn,calls}=await handler(user,allowed);const response=await fn(new Request('https://fixture.invalid',{method:'POST',body:JSON.stringify({meetingId:'saved'})}));assert.equal(response.status,status);assert.equal(calls.some(c=>c.sync),false);}
});
test('Teams sync uses verified actor and saved ID only; caller cannot choose Graph identities or attendees',async()=>{
 const{fn,calls}=await handler({id:'verified-user'},true);const response=await fn(new Request('https://fixture.invalid',{method:'POST',body:JSON.stringify({meetingId:'saved'})}));assert.equal(response.status,200);assert.deepEqual(calls[0],{name:'officehub_teams_sync_authorized',args:{p_actor:'verified-user',p_meeting:'saved'}});assert.deepEqual(calls[1],{sync:'saved'});
 const denied=await handler({id:'verified-user'},true);const malicious=await denied.fn(new Request('https://fixture.invalid',{method:'POST',body:JSON.stringify({meetingId:'saved',organizerEmail:'someone@wipahs.org',attendees:['other']})}));assert.equal(malicious.status,400);assert.equal(denied.calls.length,0);
});
