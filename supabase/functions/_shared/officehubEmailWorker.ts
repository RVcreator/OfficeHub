export interface EmailJob {
  id: string; lease_token: string; attempts: number;
  recipient_email: string; recipient_name: string; subject: string; body_text: string;
}
type Outcome = 'accepted' | 'retry' | 'failed' | 'review';
export interface WorkerDependencies {
  rpc: (name: string, args?: Record<string, unknown>) => Promise<unknown>;
  token: () => Promise<string>;
  send: (job: EmailJob, token: string) => Promise<Response>;
  now?: () => number;
}

export function retryDelay(attempt: number, header: string | null, now = Date.now()): number {
  const numeric = header && /^\d+$/.test(header) ? Number(header) : NaN;
  const date = header ? Date.parse(header) : NaN;
  const requested = Number.isFinite(numeric) ? numeric : Number.isFinite(date) ? Math.ceil((date-now)/1000) : 0;
  return Math.min(86400, Math.max(30, requested, 30 * 2 ** Math.min(attempt, 10)));
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
}

export function graphMessage(job: EmailJob) {
  if (!/^[^\s@]+@wipahs\.org$/i.test(job.recipient_email)) throw new Error('Invalid internal recipient');
  return {
    message: {
      subject: job.subject.replace(/[\r\n]/g, ' ').slice(0,240),
      body: { contentType: 'HTML', content: '<div style="font-family:Arial,sans-serif;max-width:600px">'
        + '<h2>WIPAHS OfficeHub</h2><p>Dear '+escapeHtml(job.recipient_name)+',</p>'
        + '<p style="white-space:pre-wrap">'+escapeHtml(job.body_text)+'</p>'
        + '<p>This is an automatic OfficeHub notification.</p></div>' },
      toRecipients: [{emailAddress: {address: job.recipient_email}}],
      internetMessageHeaders: [{name:'x-officehub-outbox-id', value:job.id}],
    },
    saveToSentItems: true,
  };
}

// Every durable transition is checked. A stale worker cannot finish another lease.
export async function processOne(deps: WorkerDependencies): Promise<Outcome | 'idle'> {
  const jobs = await deps.rpc('officehub_email_claim') as EmailJob[];
  const job = jobs?.[0];
  if (!job) return 'idle';
  const finish = async (status: Outcome, error: string | null, delay=60) => {
    const ok = await deps.rpc('officehub_email_finish', {
      p_id:job.id,p_lease:job.lease_token,p_status:status,p_error:error,p_delay:delay,
    });
    if (ok !== true) throw new Error('Email lease was not finalized');
    return status;
  };
  let token: string;
  try { token = await deps.token(); }
  catch { return finish('retry','Microsoft authentication unavailable',retryDelay(job.attempts,null)); }
  if (!/^[^\s@]+@wipahs\.org$/i.test(job.recipient_email)) {
    return finish('failed','Invalid internal recipient');
  }
  const marked = await deps.rpc('officehub_email_mark_sending',{p_id:job.id,p_lease:job.lease_token});
  if (marked !== true) throw new Error('Email lease is no longer sendable');
  let response: Response;
  try { response = await deps.send(job,token); }
  catch { return finish('review','Microsoft send outcome unknown; check Exchange before retrying'); }
  if (response.status === 202) return finish('accepted',null);
  if (response.status === 429 || response.status === 401) {
    return finish('retry','Microsoft rejected request: HTTP '+response.status,
      retryDelay(job.attempts,response.headers.get('retry-after'),deps.now?.()));
  }
  if (response.status >= 500 || response.status === 408) {
    return finish('review','Microsoft send outcome uncertain: HTTP '+response.status);
  }
  return finish('failed','Microsoft rejected request: HTTP '+response.status);
}
