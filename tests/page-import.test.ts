import {test} from 'node:test';import assert from 'node:assert/strict';
import {retryPageImport,pageRetryUrl} from '../src/services/pageImport';
test('module retry URLs are restricted to the expected page on this origin',()=>{
 const origin='https://officehub.example';
 assert.equal(pageRetryUrl(new Error('Failed to fetch dynamically imported module: '+origin+'/assets/SharePointView-abc123.js'),'SharePointView',1,origin),origin+'/assets/SharePointView-abc123.js?officehub_retry=1');
 for(const url of ['https://other.example/assets/SharePointView-abc.js',origin+'/assets/icon-abc.js',origin+'/api/SharePointView-abc.js'])assert.equal(pageRetryUrl(new Error(url),'SharePointView',1,origin),null);
});
test('temporary page downloads recover without reloading the app',async()=>{
 let calls=0;const delays:number[]=[];
 const value=await retryPageImport(async()=>{if(++calls<3)throw new TypeError('Failed to fetch dynamically imported module: /assets/page.js');return 'page';},async ms=>{delays.push(ms);});
 assert.equal(value,'page');assert.equal(calls,3);assert.deepEqual(delays,[300,900]);
});
test('page retries are bounded; application errors are not treated as network errors',async()=>{
 for(const [error,expected] of [[new Error('Failed to fetch dynamically imported module'),3],[new TypeError('Cannot read properties of undefined'),1]] as const){
  let calls=0;await assert.rejects(retryPageImport(async()=>{calls++;throw error;},async()=>{}));assert.equal(calls,expected);
 }
});
