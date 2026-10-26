import { test } from 'node:test';
import assert from 'node:assert/strict';
import { portalStore, setTableData, subscribeTable } from '../src/services/store';
import { supabase } from '../src/services/supabaseClient';
import type { StaffUser } from '../src/types';

const actor = '82f2bd3b-2f09-4e4a-9438-5c26e203cf30';
const user = { id: actor, email: 'it@wipahs.org', name: 'IT' } as StaffUser;
const row = { id: 'saved-alert', title: 'Saved alert', message: 'Persisted action', type: 'task',
  target_user_id: actor, actor_id: actor, created_at: new Date().toISOString(), read: false };
const originalFrom = supabase.from;

function query(result: unknown, insertResult = result) {
  let inserting = false;
  const q: any = {};
  for (const name of ['select', 'in', 'order', 'eq']) q[name] = () => q;
  q.insert = () => { inserting = true; return q; };
  q.single = () => Promise.resolve(insertResult);
  q.then = (resolve: any, reject: any) => Promise.resolve(inserting ? insertResult : result).then(resolve, reject);
  return q;
}

function initialize() {
  setTableData('currentUser', user);
  setTableData('authSession', { isAuthenticated: true, userId: actor, mustChangePassword: false });
  setTableData('notifications', []);
}

test('the actual store never publishes a failed notification save', async () => {
  initialize();
  let publishes = 0;
  const unsubscribe = subscribeTable('notifications', () => { publishes++; });
  (supabase as any).from = () => query({ data: null, error: { message: 'denied' } });
  try {
    assert.equal(await portalStore.addNotification({ title: 'Failed', message: 'No save', type: 'task', targetUserId: actor }), null);
    assert.equal(publishes, 0);
    assert.deepEqual(await portalStore.getNotifications(actor), []);
  } finally { unsubscribe(); supabase.from = originalFrom; }
});

test('a refresh begun before an insert cannot erase the confirmed alert', async () => {
  initialize();
  let release!: (value: unknown) => void;
  const oldSnapshot = new Promise(resolve => { release = resolve; });
  (supabase as any).from = (table: string) => table === 'notifications'
    ? query(oldSnapshot, { data: row, error: null }) : query({ data: [], error: null });
  try {
    const refresh = portalStore.getNotifications(actor);
    const saved = await portalStore.addNotification({ id: row.id, title: row.title, message: row.message, type: 'task', targetUserId: actor });
    assert.equal(saved?.id, row.id);
    release({ data: [], error: null });
    assert.deepEqual((await refresh).map(n => n.id), [row.id]);
  } finally { supabase.from = originalFrom; }
});

test('notification read failure retains the previous confirmed inbox', async () => {
  initialize();
  (supabase as any).from = () => query({ data: null, error: { message: 'offline' } }, { data: row, error: null });
  try {
    await portalStore.addNotification({ id: row.id, title: row.title, message: row.message, type: 'task', targetUserId: actor });
    assert.deepEqual((await portalStore.getNotifications(actor)).map(n => n.id), [row.id]);
  } finally { supabase.from = originalFrom; }
});
