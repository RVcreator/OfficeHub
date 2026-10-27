import type { StaffUser, UserPresenceStatus } from '../types';
export const presenceNow = () => typeof performance !== 'undefined' ? performance.now() : Date.now();
export const PRESENCE_PULSE_MS = 30_000;
export const PRESENCE_IDLE_MS = 5 * 60_000;
export const PRESENCE_TTL_MS = 120_000;
export type PresenceRow = { user_id: string; status: string; fresh_seconds: number; out_of_office: boolean };
export type PresenceRecord = { status: UserPresenceStatus; expiresAt: number; outOfOffice: boolean; officeUntil: number };
export function cachePresence(rows: PresenceRow[], now: number): Map<string, PresenceRecord> {
  return new Map(rows.map(row => [row.user_id, {
    status: (['Online','Away','Busy','Offline','Out of Office'].includes(row.status) ? row.status : 'Offline') as UserPresenceStatus,
    outOfOffice: row.out_of_office === true, officeUntil: now + PRESENCE_TTL_MS,
    expiresAt: now + Math.max(0, Math.min(120, Number(row.fresh_seconds) || 0)) * 1000,
  }]));
}
export function effectivePresence(user: Pick<StaffUser,'id'|'outOfOffice'|'deactivated'>, cache: Map<string,PresenceRecord>, now: number): UserPresenceStatus {
  if (user.deactivated) return 'Offline';
  const row=cache.get(user.id);
  if (row && row.officeUntil > now ? row.outOfOffice : user.outOfOffice) return 'Out of Office';
  // A cached office flag must also expire when the connection cannot refresh it.
  return row && row.expiresAt > now && row.status !== 'Out of Office' ? row.status : 'Offline';
}
export function isPresenceActive(lastInput: number, now: number, visible: boolean, online: boolean): boolean {
  return online && visible && now-lastInput < PRESENCE_IDLE_MS && now >= lastInput;
}
export type PresenceTransport = {
  heartbeat(session: string, active: boolean): Promise<void>;
  leave(session: string): Promise<void>;
  snapshot(): Promise<PresenceRow[]>;
};
export function startPresence(
  transport: PresenceTransport,
  publish: (rows: PresenceRow[] | null) => void,
  env: { window: Window; document: Document; online(): boolean; now(): number; sessionId: string },
) {
  let lastInput=env.now(), stopped=false, running=false, requested=false;
  const flush=async () => {
    if (stopped) return;
    if (running) { requested=true; return; }
    running=true;
    try {
      if (env.online()) {
        await transport.heartbeat(env.sessionId,isPresenceActive(lastInput,env.now(),env.document.visibilityState==='visible',true));
        if (stopped) return;
        const rows=await transport.snapshot();
        if (!stopped) publish(rows);
      } else publish(null);
    } catch { if (!stopped) publish(null); }
    finally {
      running=false;
      if (stopped) { void transport.leave(env.sessionId).catch(()=>{}); }
      else if (requested) { requested=false; void flush(); }
    }
  };
  const input=() => {
    const wasActive=isPresenceActive(lastInput,env.now(),env.document.visibilityState==='visible',env.online());
    lastInput=env.now();
    if (!wasActive) void flush();
  };
  const visibility=() => { void flush(); };
  const pageHide=() => { void transport.leave(env.sessionId).catch(()=>{}); };
  const events=['pointerdown','pointermove','keydown','touchstart','scroll'];
  events.forEach(event=>env.window.addEventListener(event,input,{passive:true}));
  env.window.addEventListener('online',visibility);
  env.window.addEventListener('offline',visibility);
  env.window.addEventListener('pagehide',pageHide);
  env.window.addEventListener('pageshow',visibility);
  env.document.addEventListener('visibilitychange',visibility);
  const timer=env.window.setInterval(()=>{ void flush(); },PRESENCE_PULSE_MS);
  void flush();
  return {
    sync: flush,
    async stop() {
      stopped=true;
      env.window.clearInterval(timer);
      events.forEach(event=>env.window.removeEventListener(event,input));
      env.window.removeEventListener('online',visibility);
      env.window.removeEventListener('offline',visibility);
      env.window.removeEventListener('pagehide',pageHide);
      env.window.removeEventListener('pageshow',visibility);
      env.document.removeEventListener('visibilitychange',visibility);
      await transport.leave(env.sessionId).catch(()=>{});
    },
  };
}
