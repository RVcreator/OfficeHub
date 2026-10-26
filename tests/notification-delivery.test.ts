import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NotificationChimeTracker, isNotificationForUser, persistNotification,
  reconcileNotificationSnapshot, visibleNotifications } from '../src/services/notificationDelivery';
import type { AppNotification } from '../src/types';

const user = { id: 'alice', email: 'alice@wipahs.org', name: 'Alice' };
const alert = (id: string, extra: Partial<AppNotification> = {}): AppNotification => ({
  id, title: 'Task assigned', message: 'A saved action', type: 'task', targetUserId: user.id,
  createdAt: new Date().toISOString(), read: false, actorId: 'bob', ...extra,
});

test('failed persistence cannot publish a notification or ring', async () => {
  let published = false;
  await assert.rejects(persistNotification(async () => { throw new Error('RLS denied'); }, () => { published = true; }));
  assert.equal(published, false);
});

test('a saved visible alert is published before its one chime', async () => {
  const order: string[] = [];
  const tracker = new NotificationChimeTracker();
  tracker.observe([], user.id);
  await persistNotification(async () => { order.push('saved'); return alert('new'); }, saved => {
    const visible = visibleNotifications([saved], user, new Set());
    order.push('published');
    if (tracker.observe(visible, user.id, true)) order.push('chime');
  });
  assert.deepEqual(order, ['saved', 'published', 'chime']);
  assert.equal(tracker.observe([alert('new')], user.id), false);
});

test('login history, repeats, read updates, and dismissed replays are silent', () => {
  const tracker = new NotificationChimeTracker();
  assert.equal(tracker.observe([alert('old')], user.id), false);
  assert.equal(tracker.observe([alert('old')], user.id), false);
  assert.equal(tracker.observe([alert('old', { read: true })], user.id), false);
  assert.equal(tracker.observe([], user.id), false);
  assert.equal(tracker.observe([alert('old')], user.id), false);
});

test('a new alert arriving through polling rings once and remains visible', () => {
  const tracker = new NotificationChimeTracker();
  tracker.observe([], user.id);
  const rows = visibleNotifications([alert('poll')], user, new Set());
  assert.equal(tracker.observe(rows, user.id), true);
  assert.equal(rows[0].id, 'poll');
  assert.equal(tracker.observe(rows, user.id), false);
});

test('another recipient, dismissed rows, and duplicate IDs never reach the inbox', () => {
  const rows = visibleNotifications([alert('other', { targetUserId: 'bob' }), alert('dismissed'),
    alert('visible'), alert('visible')], user, new Set(['dismissed']));
  assert.deepEqual(rows.map(n => n.id), ['visible']);
  assert.equal(isNotificationForUser(alert('self'), { id: 'usr-default' }), false);
});

test('a stale database snapshot cannot erase a concurrently saved notification', () => {
  const old = alert('old'), saved = alert('saved');
  const rows = reconcileNotificationSnapshot([old], [saved, old], new Set(['old']), user, new Set());
  assert.deepEqual(rows.map(n => n.id), ['saved', 'old']);
  assert.deepEqual(reconcileNotificationSnapshot([old], [saved, old], new Set(['old']), user, new Set(['saved'])).map(n => n.id), ['old']);
});

test('switching account starts a silent history baseline', () => {
  const tracker = new NotificationChimeTracker();
  tracker.observe([], 'alice');
  assert.equal(tracker.observe([alert('bob-history', { targetUserId: 'bob' })], 'bob'), false);
});

test('self broadcast is silent, while an explicit self-targeted saved test can ring', () => {
  const tracker = new NotificationChimeTracker();
  tracker.observe([], user.id);
  assert.equal(tracker.observe([alert('broadcast', { actorId: user.id, targetUserId: 'all' })], user.id, true), false);
  assert.equal(tracker.observe([alert('test', { actorId: user.id })], user.id, true), true);
});
