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

test('completion notifies the assigner and explicitly requests their rating', async () => {
  initialize();
  const creator = '0a9edd24-62bd-40ff-a486-fd1c95724b8e';
  setTableData('tasks', [{ id: 'completed-task', title: 'Delegated work', status: 'To Do',
    assignedToId: actor, assignedToIds: [actor], createdById: creator, subtasks: [] } as any]);
  const inserted: any[] = [];
  (supabase as any).from = (table: string) => {
    if (table === 'tasks') {
      const q: any = query({ data: [{ id: 'completed-task', title: 'Delegated work', status: 'Done',
        assigned_to_id: actor, assigned_to_ids: [actor], created_by_id: creator, pending_rating: true }], error: null });
      q.update = () => q;
      return q;
    }
    const q: any = query({ data: null, error: null });
    q.insert = (payload: any) => { inserted.push(payload); q.single = async () => ({ data: payload, error: null }); return q; };
    return q;
  };
  try {
    await portalStore.updateTaskStatus('completed-task', 'Done');
    assert.equal(inserted.length, 1);
    assert.equal(inserted[0].target_user_id, creator);
    assert.equal(inserted[0].title, 'Task completed: Delegated work');
    assert.match(inserted[0].message, /performance rating is required/);
    assert.equal(inserted[0].metadata.requiresRating, true);
    // Saving Done again does not create another completion alert.
    await portalStore.updateTaskStatus('completed-task', 'Done');
    assert.equal(inserted.length, 1);
  } finally { supabase.from = originalFrom; }
});

test('rating preserves the completion alert while clearing its required action', async () => {
  initialize();
  const assignee = '0a9edd24-62bd-40ff-a486-fd1c95724b8e';
  const completion = { ...row, id: 'completion-alert', type: 'task_rating_required',
    metadata: { taskId: 'rated-task', requiresRating: true, completedAt: '2026-10-27T07:00:00Z' } };
  setTableData('tasks', [{ id: 'rated-task', title: 'Rated work', status: 'Done',
    assignedToId: assignee, createdById: actor, subtasks: [] } as any]);
  const updates: any[] = [];
  let deletes = 0;
  (supabase as any).from = (table: string) => {
    if (table === 'tasks') {
      const q: any = query({ data: null, error: null });
      q.update = () => q;
      q.single = async () => ({ data: { id: 'rated-task', title: 'Rated work', status: 'Done',
        assigned_to_id: assignee, created_by_id: actor, pending_rating: false }, error: null });
      return q;
    }
    const q: any = query({ data: [completion], error: null });
    q.contains = () => q;
    q.delete = () => { deletes++; return q; };
    q.update = (payload: any) => { updates.push(payload); q.single = async () => ({ data: { ...completion, ...payload }, error: null }); return q; };
    q.insert = (payload: any) => { q.single = async () => ({ data: payload, error: null }); return q; };
    return q;
  };
  try {
    await portalStore.rateTask('rated-task', 5);
    assert.equal(deletes, 0);
    assert.equal(updates.length, 1);
    assert.equal(updates[0].type, 'task');
    assert.equal(updates[0].metadata.requiresRating, false);
    assert.equal(updates[0].metadata.completedAt, completion.metadata.completedAt);
    assert.equal(updates[0].title, 'Task completed: Rated work');
  } finally { supabase.from = originalFrom; }
});
