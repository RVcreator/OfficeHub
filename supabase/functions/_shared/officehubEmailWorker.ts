export interface EmailJob {
  id: string; lease_token: string; attempts: number;
  recipient_email: string; recipient_name: string; subject: string; body_text: string;
  digest_payload?: PlanningDigest | null;
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

export interface PlanningDigest {
  version: number; kind: 'week' | 'month'; start: string; end: string; timezone: string;
  tasks: {id: string; title: string; date: string | null; status: string; priority: string; overdue: boolean}[];
  meetings: {id: string; title: string; date: string; time: string; endTime: string; type: string}[];
  projects: {id: string; title: string; date: string | null; status: string; progress: number; overdue: boolean}[];
}
const text = (value: unknown) => escapeHtml(String(value ?? ''));
const dateLabel = (value: string | null) => value && /^\d{4}-\d{2}-\d{2}$/.test(value)
  ? new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(value+'T00:00:00Z')) : 'Not scheduled';
export function renderDigest(d: PlanningDigest, name: string): string {
  if(d.version!==1 || !['week','month'].includes(d.kind) || !Array.isArray(d.tasks) || !Array.isArray(d.meetings) || !Array.isArray(d.projects)) throw new Error('Invalid planning digest');
  const cell = (v: string) => '<td style="padding:10px 8px;border-bottom:1px solid #e2e8f0;vertical-align:top">'+v+'</td>';
  const section = (title: string, headers: string[], rows: string[][], empty: string) => '<h2 style="font-size:18px;color:#0f172a;margin:26px 0 10px">'+title+' <span style="font-size:13px;color:#64748b">('+rows.length+')</span></h2>'
    +(rows.length ? '<table role="table" style="border-collapse:collapse;width:100%;font-size:13px;text-align:left"><thead><tr>'+headers.map(h=>'<th style="padding:9px 8px;background:#f1f5f9">'+h+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(cell).join('')+'</tr>').join('')+'</tbody></table>' : '<p style="font-size:13px;color:#64748b">'+empty+'</p>');
  const taskRows = (rows: PlanningDigest['tasks']) => rows.map(t=>[text(t.title),text(dateLabel(t.date)),text(t.priority)+'<br><span style="color:#64748b">'+text(t.status)+'</span>']);
  return '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#334155"><div style="max-width:720px;margin:24px auto;background:white;padding:28px;border-top:5px solid #0f766e">'
    +'<p style="color:#0f766e;font-size:12px;letter-spacing:1px;font-weight:bold">WIPAHS OFFICEHUB</p><h1 style="font-size:26px;color:#0f172a;margin-bottom:8px">Your '+(d.kind==='week'?'week':'month')+' ahead</h1>'
    +'<p style="font-size:14px;color:#64748b">'+text(dateLabel(d.start))+' – '+text(dateLabel(d.end))+' · Tanzania time (EAT)</p><p>Dear '+text(name)+',</p><p style="font-size:14px">Here is your personal plan for the '+(d.kind==='week'?'week':'month')+'.</p>'
    +section('Tasks', ['Task','Due','Priority / status'], taskRows(d.tasks.filter(t=>!t.overdue)), 'No tasks scheduled. Undated open tasks are shown here when present.')
    +section('Meetings', ['Meeting','When (EAT)','Format'], d.meetings.map(m=>[text(m.title),text(dateLabel(m.date))+'<br>'+text(m.time)+(m.endTime?' – '+text(m.endTime):''),text(m.type)]), 'No meetings scheduled.')
    +section('Projects', ['Project','Target','Progress / status'], d.projects.filter(p=>!p.overdue).map(p=>[text(p.title),text(dateLabel(p.date)),text(Math.max(0,Math.min(100,Number(p.progress)||0)))+'%<br>'+text(p.status)]), 'No active projects for this period.')
    +section('Overdue work', ['Item','Due / target','Status'], [...taskRows(d.tasks.filter(t=>t.overdue)).map(r=>['Task: '+r[0],r[1],r[2]]),...d.projects.filter(p=>p.overdue).map(p=>['Project: '+text(p.title),text(dateLabel(p.date)),text(p.status)])], 'No overdue tasks or projects.')
    +'<p style="border-top:1px solid #e2e8f0;padding-top:18px;font-size:12px;color:#64748b">This is a planning snapshot. Open OfficeHub for current assignments, meeting links and updates. Undated tasks and ongoing projects remain visible until completed. Only stored meeting occurrences are included.</p></div></body></html>';
}

export function graphMessage(job: EmailJob) {
  if (!/^[^\s@]+@wipahs\.org$/i.test(job.recipient_email)) throw new Error('Invalid internal recipient');
  return {
    message: {
      subject: job.subject.replace(/[\r\n]/g, ' ').slice(0,240),
      body: { contentType: 'HTML', content: job.digest_payload ? renderDigest(job.digest_payload,job.recipient_name) : '<div style="font-family:Arial,sans-serif;max-width:600px">'
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
