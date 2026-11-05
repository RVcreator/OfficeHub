import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getAyahDay, getDailyAyahNumber, getAyahOfTheDaySnapshot, fetchAyahOfTheDay } from '../src/services/quranService';

test('daily ayah changes at Tanzania midnight, not UTC midnight', () => {
  assert.equal(getAyahDay(new Date('2026-11-04T20:59:59Z')), '2026-11-04');
  assert.equal(getAyahDay(new Date('2026-11-04T21:00:00Z')), '2026-11-05');
  assert.equal(getAyahDay(new Date('2026-11-05T00:00:00Z')), '2026-11-05');
});

test('date selection is repeatable and scattered across the entire Quran', () => {
  const picks = Array.from({length:365}, (_, i) => getDailyAyahNumber(new Date(Date.UTC(2026,0,i+1)).toISOString().slice(0,10)));
  assert.ok(picks.every(n => n >= 1 && n <= 6236));
  assert.ok(new Set(picks).size > 330);
  assert.ok(Math.min(...picks) < 100 && Math.max(...picks) > 6100);
  assert.ok(picks.slice(1).filter((n,i) => Math.abs(n-picks[i]) === 1).length < 5);
  assert.equal(getDailyAyahNumber('2026-11-05'), getDailyAyahNumber('2026-11-05'));
});

function response(day: string, wrong = false) {
  const number = getDailyAyahNumber(day) + (wrong ? 1 : 0);
  return new Response(JSON.stringify({code:200,data:[
    {number,text:'آية',numberInSurah:1,surah:{number:1,englishName:'Fixture',name:'Fixture'},edition:{identifier:'quran-uthmani'}},
    {number,text:'Translation fixture',numberInSurah:1,surah:{number:1},edition:{identifier:'en.qarai'}},
  ]}), {status:200});
}

test('same-day requests deduplicate, cache the selected verse, and never swap to a fallback', async () => {
  const originalFetch=globalThis.fetch, descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  const storage=new Map<string,string>();let calls=0;let release!:()=>void;
  const blocked=new Promise<void>(resolve=>{release=resolve;});const day='2031-01-01';
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>storage.get(key)||null,setItem:(key:string,value:string)=>storage.set(key,value)}});
  globalThis.fetch=async(input)=>{calls++;assert.match(String(input),new RegExp(`/ayah/${getDailyAyahNumber(day)}/`));await blocked;return response(day);};
  try {
    assert.equal(getAyahOfTheDaySnapshot(day),null);
    const first=fetchAyahOfTheDay(day), second=fetchAyahOfTheDay(day);release();
    const [a,b]=await Promise.all([first,second]);assert.deepEqual(a,b);assert.equal(calls,1);
    assert.deepEqual(getAyahOfTheDaySnapshot(day),a);assert.deepEqual(await fetchAyahOfTheDay(day),a);assert.equal(calls,1);
    assert.equal(JSON.parse(storage.get(`wipahs_ayah_v3_${day}`)!).number,getDailyAyahNumber(day));
  } finally {globalThis.fetch=originalFetch;if(descriptor)Object.defineProperty(globalThis,'localStorage',descriptor);else delete (globalThis as any).localStorage;}
});

test('failure and mismatched verses do not poison the day; retry works even without storage', async () => {
  const originalFetch=globalThis.fetch, descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage');const day='2031-02-01';
  Object.defineProperty(globalThis,'localStorage',{configurable:true,get:()=>{throw Error('Blocked');}});
  try {
    globalThis.fetch=async()=>{throw Error('Offline');};await assert.rejects(fetchAyahOfTheDay(day),/Offline/);
    assert.equal(getAyahOfTheDaySnapshot(day),null);
    globalThis.fetch=async()=>response(day,true);await assert.rejects(fetchAyahOfTheDay(day),/did not match/);
    globalThis.fetch=async()=>response(day);const ayah=await fetchAyahOfTheDay(day);
    assert.deepEqual(getAyahOfTheDaySnapshot(day),ayah);
    globalThis.fetch=async()=>{throw Error('Must use memory');};assert.deepEqual(await fetchAyahOfTheDay(day),ayah);
  } finally {globalThis.fetch=originalFetch;if(descriptor)Object.defineProperty(globalThis,'localStorage',descriptor);else delete (globalThis as any).localStorage;}
});

test('a persisted selected verse survives reload while a different selection is rejected', () => {
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage');const day='2031-03-01';
  const ayah={arabicText:'آية',translation:'Persisted fixture',surahNameEnglish:'Fixture',surahNumber:54,ayahNumber:5,edition:"Ali Quli Qarai's Translation",citation:'Surah Fixture 54:5'};
  let saved=JSON.stringify({number:getDailyAyahNumber(day)+1,ayah});
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>saved}});
  try {
    assert.equal(getAyahOfTheDaySnapshot(day),null);
    saved=JSON.stringify({number:getDailyAyahNumber(day),ayah});
    assert.deepEqual(getAyahOfTheDaySnapshot(day),ayah);
  } finally {if(descriptor)Object.defineProperty(globalThis,'localStorage',descriptor);else delete (globalThis as any).localStorage;}
});
