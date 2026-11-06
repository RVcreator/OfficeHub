import type { AppNotification } from '../types';

type Recipient = { id: string; email?: string; name?: string };
const lower = (value: unknown) => typeof value === 'string' ? value.toLowerCase() : '';
export function noticeDeliveryKey(n: Pick<AppNotification,'type'|'metadata'>): string | null {
  const id=n.metadata?.noticeId;
  if(n.type!=='notice'||typeof id!=='string'||!id)return null;
  const actor=n.metadata?.acknowledgedByUserId;
  return actor ? `notice-ack:${id}:${actor}` : `notice-published:${id}`;
}
const deliveryIdentity=(n:AppNotification)=>noticeDeliveryKey(n)?`${n.targetUserId}:${noticeDeliveryKey(n)}`:n.id;

/** Shared by the inbox, badge, and sound delivery. Database RLS still controls access. */
export function isNotificationForUser(n: AppNotification, user: Recipient): boolean {
  if (!user.id || user.id === 'usr-default') return false;
  const target = lower(n.targetUserId);
  return !target || target === 'all' || target === lower(user.id)
    || Boolean(user.email && target === lower(user.email))
    || Boolean(user.name && target === lower(user.name));
}

export function visibleNotifications(rows: AppNotification[], user: Recipient, dismissed: Set<string>): AppNotification[] {
  const seen = new Set<string>();
  const dismissedEvents=new Set(rows.filter(n=>dismissed.has(n.id)).map(deliveryIdentity));
  return rows.filter(n => {
    const key=deliveryIdentity(n);
    if (!n.id || n.metadata?.duplicateOf || seen.has(key) || dismissedEvents.has(key) || !isNotificationForUser(n, user)) return false;
    seen.add(key);
    return true;
  });
}

/** Tracks notification IDs, never raw task/message events. History loads silently. */
export class NotificationChimeTracker {
  private userId = '';
  private baseline = false;
  private seen = new Set<string>();

  reset(userId: string) {
    this.userId = userId;
    this.baseline = false;
    this.seen.clear();
  }

  observe(rows: AppNotification[], userId: string, created = false): boolean {
    if (this.userId !== userId) this.reset(userId);
    if (created && rows.length === 0) return false;
    const ring = rows.some(n => !this.seen.has(deliveryIdentity(n)) && !n.read
      && (this.baseline || created)
      && (n.actorId !== userId || (created && n.targetUserId === userId)));
    rows.forEach(n => this.seen.add(deliveryIdentity(n)));
    this.baseline = true;
    return ring;
  }
}

/** Retain inserts which were confirmed while an older database read was in flight. */
export function reconcileNotificationSnapshot(
  fetched: AppNotification[], current: AppNotification[], before: Set<string>,
  user: Recipient, dismissed: Set<string>,
): AppNotification[] {
  return visibleNotifications([...current.filter(n => !before.has(n.id)), ...fetched], user, dismissed);
}

/** A failed write can never publish an alert or produce its sound. */
export async function persistNotification(
  save: () => Promise<AppNotification>,
  publish: (saved: AppNotification) => void,
): Promise<AppNotification> {
  const saved = await save();
  if (!saved?.id) throw new Error('Notification was not saved');
  publish(saved);
  return saved;
}
