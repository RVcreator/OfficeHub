import {test} from 'node:test';import assert from 'node:assert/strict';
import {getAyahOfTheDaySnapshot} from '../src/services/quranService';
import {avatarImage} from '../src/utils/avatarImage';
test('daily verse first paint is synchronous, date-scoped and resilient to unavailable or corrupt storage',()=>{
 const original=Object.getOwnPropertyDescriptor(globalThis,'localStorage');let cached:string|null=null;let key='';
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(value:string)=>{key=value;return cached;}}});
 try{
  assert.equal(getAyahOfTheDaySnapshot('2026-11-04'),null);assert.equal(key,'wipahs_ayah_v3_2026-11-04');
  cached=JSON.stringify({arabicText:'Old fallback',translation:'Unrelated verse',citation:'Old citation'});
  assert.equal(getAyahOfTheDaySnapshot('2026-11-04'),null,'legacy or incomplete caches cannot substitute another verse');
  cached='broken json';assert.equal(getAyahOfTheDaySnapshot('2026-11-04'),null);
  Object.defineProperty(globalThis,'localStorage',{configurable:true,get:()=>{throw Error('Unavailable');}});assert.equal(getAyahOfTheDaySnapshot('2026-11-04'),null);
 }finally{if(original)Object.defineProperty(globalThis,'localStorage',original);else delete (globalThis as any).localStorage;}
});
test('public avatar variants respect display size, retina density and the original image limit',()=>{
 const image=avatarImage('https://images.unsplash.com/photo-fixture?w=150&fit=crop&auto=format','w-8 h-8 md:w-10 md:h-10');
 assert.equal(new URL(image.src).searchParams.get('w'),'40');assert.equal(image.sizes,'40px');assert.match(image.srcSet!,/w=80/);assert.match(image.srcSet!,/w=120/);assert.equal(new URL(image.src).searchParams.get('fit'),'crop');
 const large=avatarImage('https://images.unsplash.com/photo-fixture?w=150','w-20 h-20');assert.doesNotMatch(large.srcSet!,/w=160|w=240/);
});
test('private, signed, embedded and unknown-size avatar URLs are never rewritten',()=>{
 for(const url of ['https://project.supabase.co/storage/v1/object/sign/avatars/a?token=private','data:image/png;base64,fixture','https://example.invalid/image?w=150','https://images.unsplash.com/a?w=150&h=150'])assert.deepEqual(avatarImage(url,'w-8 h-8'),{src:url});
 const url='https://images.unsplash.com/a?w=150';assert.deepEqual(avatarImage(url,'w-full h-full'),{src:url});
});
