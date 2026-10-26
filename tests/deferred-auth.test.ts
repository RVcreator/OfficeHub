import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDeferredAuthHandler } from '../src/services/deferredAuth';

const tick = () => new Promise(resolve => setTimeout(resolve, 10));

test('profile requests start after the synchronous auth lock is released', async () => {
  let locked = true;
  let applied = false;
  const handler = createDeferredAuthHandler(async () => {
    assert.equal(locked, false, 'a database query inside the callback would deadlock');
    applied = true;
  }, () => assert.fail('unexpected handler failure'));
  assert.equal(handler.handle('SIGNED_IN', {}), undefined);
  assert.equal(applied, false);
  locked = false;
  await tick();
  assert.equal(applied, true);
  handler.dispose();
});

test('sign-out invalidates an in-flight profile request', async () => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const applied: string[] = [];
  const handler = createDeferredAuthHandler(async (event: string, _session, isCurrent) => {
    if (event === 'SIGNED_IN') await pending;
    if (isCurrent()) applied.push(event);
  }, () => assert.fail('unexpected handler failure'));
  handler.handle('SIGNED_IN', {});
  await tick();
  handler.handle('SIGNED_OUT', null);
  release();
  await tick();
  assert.deepEqual(applied, ['SIGNED_OUT']);
  handler.dispose();
});

test('unmount cancels queued authentication work', async () => {
  let called = false;
  const handler = createDeferredAuthHandler(async () => { called = true; }, () => {});
  handler.handle('INITIAL_SESSION', {});
  handler.dispose();
  await tick();
  assert.equal(called, false);
});

test('failed session restoration is handled without an unhandled rejection', async () => {
  let errors = 0;
  const handler = createDeferredAuthHandler(async () => { throw new Error('offline'); }, () => { errors++; });
  handler.handle('INITIAL_SESSION', {});
  await tick();
  assert.equal(errors, 1);
  handler.dispose();
});
