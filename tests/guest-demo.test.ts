import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('public demo has no production imports, session access or outbound application capabilities',()=>{
  const root=new URL('../public/demo/',import.meta.url);
  const html=readFileSync(new URL('index.html',root),'utf8');
  assert.match(html,/connect-src 'none'/);
  assert.match(html,/form-action 'none'/);
  assert.match(html,/worker-src 'none'/);
  assert.match(html,/default-src 'none'/);
  assert.doesNotMatch(html,/<form\b|\son\w+\s*=/i);
  const scripts=[...html.matchAll(/<script\b[^>]*src="([^"]+)"[^>]*>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length,1);assert.equal(scripts[0][1],'./demo-v1.js');assert.equal(scripts[0][2],'');
  const source=readFileSync(new URL('demo-v1.js',root),'utf8');
  const executable=source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g,'');
  const blocked=new Set(['fetch','XMLHttpRequest','WebSocket','EventSource','localStorage','sessionStorage','indexedDB','caches','serviceWorker','sendBeacon','cookie','supabase','createClient','eval','Function','importScripts','require']);
  assert.doesNotMatch(executable,/(?:^|\n)\s*(?:import|export)\b|\bimport\s*\(/,'Demo cannot import app code');
  for(const name of blocked)assert.doesNotMatch(executable,new RegExp('\\b'+name+'\\b'),`Disallowed demo capability: ${name}`);
  assert.doesNotMatch(source,/wjxrdpuhcrvzzxnznumm|eyJhbGci|@wipahs\.org|\/rest\/v1|\/functions\/v1/);
});
