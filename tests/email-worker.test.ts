import assert from 'node:assert/strict';
import { test } from 'node:test';
import { graphMessage, processOne, retryDelay } from '../supabase/functions/_shared/officehubEmailWorker.ts';
import { mapTaskToRow, mapNoticeToRow, mapApprovalToRow, mapDispatchedEmailRow } from '../src/services/supabaseMappers.ts';

const job = {id:'job-1',lease_token:'lease-1',attempts:1,recipient_email:'it@wipahs.org',recipient_name:'<Staff>',subject:'Hello\r\nWorld',body_text:'<script>alert(1)</script>'};
function harness(status=202) {
  const calls: {name:string,args?:Record<string,unknown>}[]=[];
  let sends=0;
  const deps = {
    rpc:async(name:string,args?:Record<string,unknown>)=>{
      calls.push({name,args}); return name==='officehub_email_claim' ? [job] : true;
    },
    token:async()=>'test-token',
    send:async()=>{sends++;return new Response(null,{status,headers:{'retry-after':'300'}});},
  };
  return {deps,calls,get sends(){return sends;}};
}
test('Graph acceptance is recorded only after persistent send transition',async()=>{
  const h=harness(); assert.equal(await processOne(h.deps),'accepted');assert.equal(h.sends,1);
  assert.deepEqual(h.calls.map(c=>c.name),['officehub_email_claim','officehub_email_mark_sending','officehub_email_finish']);
  assert.equal(h.calls[2].args?.p_status,'accepted');
});
test('an empty queue performs no external operation',async()=>{
  const h=harness();h.deps.rpc=async()=>[];assert.equal(await processOne(h.deps),'idle');assert.equal(h.sends,0);
});
test('authentication failure retries without sending',async()=>{
  const h=harness();h.deps.token=async()=>{throw Error('secret must never escape');};
  assert.equal(await processOne(h.deps),'retry');assert.equal(h.sends,0);
  assert.ok(!JSON.stringify(h.calls).includes('secret must never escape'));
});
test('throttling honors Retry-After',async()=>{
  const h=harness(429);assert.equal(await processOne(h.deps),'retry');assert.equal(h.calls[2].args?.p_delay,300);
});
test('HTTP 401 is a safely rejected retry',async()=>assert.equal(await processOne(harness(401).deps),'retry'));
test('HTTP 403 fails without retrying',async()=>assert.equal(await processOne(harness(403).deps),'failed'));
test('ambiguous Microsoft server errors need review',async()=>assert.equal(await processOne(harness(503).deps),'review'));
test('network timeout after send starts never retries automatically',async()=>{
  const h=harness();h.deps.send=async()=>{throw Error('timeout');};assert.equal(await processOne(h.deps),'review');
});
test('a stale or paused lease cannot send',async()=>{
  const h=harness();h.deps.rpc=async(name)=>name==='officehub_email_claim'?[job]:false;
  await assert.rejects(processOne(h.deps),/no longer sendable/);assert.equal(h.sends,0);
});
test('a lost acceptance write is reported, never re-sent in this invocation',async()=>{
  const h=harness();h.deps.rpc=async(name)=>name==='officehub_email_claim'?[job]:name==='officehub_email_finish'?false:true;
  await assert.rejects(processOne(h.deps),/not finalized/);assert.equal(h.sends,1);
});
test('templates escape user text and target exactly one recipient',()=>{
  const message=graphMessage(job);assert.equal(message.message.toRecipients.length,1);
  assert.equal(message.message.subject,'Hello  World');assert.ok(!message.message.body.content.includes('<script>'));
  assert.ok(message.message.body.content.includes('&lt;Staff&gt;'));
  assert.equal(message.message.internetMessageHeaders[0].value,job.id);
  assert.throws(()=>graphMessage({...job,recipient_email:'someone@example.com'}));
});
test('backoff is bounded and accepts HTTP dates',()=>{
  const now=Date.parse('2026-10-26T00:00:00Z');
  assert.equal(retryDelay(1,'Mon, 26 Oct 2026 00:10:00 GMT',now),600);
  assert.equal(retryDelay(100,'999999999'),86400);assert.ok(retryDelay(1,'invalid')>=30);
});
test('task audience selections persist without inventing an assignee',()=>{
  const row=mapTaskToRow({assignmentType:'department',assignedDepartments:['IT'],assignedToId:'dept-IT'});
  assert.equal(row.assigned_to_id,null);assert.deepEqual(row.assigned_departments,['IT']);
});
test('selected notice recipients and approval reviewers persist',()=>{
  assert.deepEqual(mapNoticeToRow({targetAudienceType:'selected_people',targetUserIds:['user-1']}).target_user_ids,['user-1']);
  assert.deepEqual(mapApprovalToRow({approverIds:['user-1']}).approver_ids,['user-1']);
});
test('legacy delivery claims and HTML are not trusted',()=>{
  const legacy=mapDispatchedEmailRow({status:'Delivered',body_html:'<script>bad</script>'});
  assert.equal(legacy.status,'unverified');assert.equal(legacy.bodyHtml,undefined);
  assert.equal(mapDispatchedEmailRow({status:'accepted'}).status,'accepted');
});

test('HTTP worker rejects browser credentials and defaults to a read-only dry run',async()=>{
  const values: Record<string,string> = {
    SUPABASE_SERVICE_ROLE_KEY:'server-test-key',SUPABASE_URL:'https://example.supabase.co',
    MS_TENANT_ID:'tenant',MS_CLIENT_ID:'client',MS_CLIENT_SECRET:'test-secret',
    OFFICEHUB_EMAIL_WORKER_SECRET:'scheduler-test-secret',
  };
  (globalThis as any).Deno={env:{get:(k:string)=>values[k]},serve:()=>{}};
  const {handler}=await import('../supabase/functions/officehub-email-worker/index.ts');
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async(_url,options)=>{
    const bearer=new Headers(options?.headers).get('authorization');
    return bearer==='Bearer server-test-key' ? Response.json(true) : Response.json({error:'permission denied'},{status:403});
  };
  try {
  assert.equal((await handler(new Request('https://example/worker',{method:'POST'}))).status,401);
  assert.equal((await handler(new Request('https://example/worker',{method:'POST',headers:{authorization:'Bearer user-jwt'}}))).status,401);
  const headers={authorization:'Bearer server-test-key','content-type':'application/json'};
  const dry=await handler(new Request('https://example/worker',{method:'POST',headers,body:'{}'}));
  assert.deepEqual(await dry.json(),{configured:true,dryRun:true,sender:'officehub@wipahs.org'});
  assert.equal((await handler(new Request('https://example/worker',{method:'POST',headers,body:'{"recipient":"someone@example.com"}'}))).status,400);
  assert.equal((await handler(new Request('https://example/worker',{headers}))).status,405);
  const schedulerHeaders={authorization:'Bearer public-anon-test-jwt','x-officehub-worker-key':'scheduler-test-secret'};
  assert.equal((await handler(new Request('https://example/worker',{method:'POST',headers:schedulerHeaders,body:'{}'}))).status,200);
  assert.equal((await handler(new Request('https://example/worker',{method:'POST',headers:{...schedulerHeaders,'x-officehub-worker-key':'wrong-secret'},body:'{}'}))).status,401);
  } finally {globalThis.fetch=originalFetch;}
});
