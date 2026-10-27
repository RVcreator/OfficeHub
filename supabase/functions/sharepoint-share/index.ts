import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getMsGraphAppToken } from '../_shared/msGraphToken.ts';
import { documentAudience, grantDocumentAccess, type ShareSettings } from '../_shared/documentSharing.ts';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'POST required' });
  try {
    const auth = req.headers.get('Authorization') || '';
    const url = Deno.env.get('SUPABASE_URL')!;
    const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
    const { data: { user }, error: authError } = await caller.auth.getUser(auth.replace(/^Bearer\s+/i, ''));
    if (authError || !user) return reply(401, { error: 'Sign in to share a document' });
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await req.json();
    if (typeof body.documentId !== 'string') return reply(400, { error: 'Document ID required' });
    const { data: doc, error: docError } = await admin.from('sharepoint_documents').select('*').eq('id', body.documentId).single();
    if (docError || !doc) return reply(404, { error: 'Document not found' });
    const { data: isAdmin, error: roleError } = await caller.rpc('is_admin');
    if (doc.created_by_id !== user.id && (roleError || isAdmin !== true)) return reply(403, { error: 'Only the owner or administrator can manage sharing' });
    if (!doc.graph_drive_item_id) return reply(409, { error: 'This record has no confirmed Microsoft file. Upload the original file again.' });
    const settings: ShareSettings = {
      visibility: body.settings?.visibility ?? doc.visibility,
      targetDepartment: body.settings?.targetDepartment ?? doc.target_department,
      allowedUserIds: body.settings?.allowedUserIds ?? doc.allowed_user_ids ?? [],
      editableUserIds: body.settings?.editableUserIds ?? doc.editable_user_ids ?? [] };
    if (!Array.isArray(settings.allowedUserIds) || !Array.isArray(settings.editableUserIds)) return reply(400, { error: 'Invalid staff selection' });
    const { data: profiles, error: profileError } = await admin.from('profiles').select('*');
    if (profileError) throw new Error('Could not load document recipients');
    if ((profiles || []).some(p => p.id === user.id && p.deactivated === true)) return reply(403, { error: 'Inactive staff account' });
    const audience = documentAudience(settings, (profiles || []).filter(p => !p.deactivated && p.app_metadata?.deactivated !== true), doc.created_by_id);
    if (audience.length > 200) return reply(400, { error: 'Select at most 200 staff members for this sharing operation' });
    const recipients = [];
    for (const member of audience) {
      const { data: { user: account }, error } = await admin.auth.admin.getUserById(member.id);
      const bannedUntil = (account as { banned_until?: string } | null)?.banned_until;
      if (error || !account?.email_confirmed_at || !/^[^\s@]+@wipahs[.]org$/i.test(account.email || '') || (bannedUntil && new Date(bannedUntil) > new Date())) {
        return reply(400, { error: 'Every selected recipient needs a verified active @wipahs.org account' });
      }
      recipients.push({ ...member, email: account.email!.trim().toLowerCase() });
    }
    const { data: existing, error: grantsError } = await admin.from('officehub_document_grants').select('*').eq('document_id', doc.id);
    if (grantsError) throw new Error('Document sharing database update is required');
    // Do not claim revocation: these files may also have inherited or manually granted access.
    if ((existing || []).some(g => !recipients.some(r => r.id === g.recipient_id) || (g.access_role === 'write' && recipients.find(r => r.id === g.recipient_id)?.role === 'read'))) {
      return reply(409, { error: 'Remove or reduce existing access in SharePoint Manage access first. This operation only grants additional access.' });
    }
    if (body.dryRun === true) return reply(200, { success: true, dryRun: true, document: { id: doc.id, name: doc.name }, recipients });
    const token = await getMsGraphAppToken();
    const drive = Deno.env.get('MS_DRIVE_ID');
    if (!drive) throw new Error('SharePoint drive is not configured');
    const confirmed = [];
    for (const recipient of recipients) {
      const permissionId = await grantDocumentAccess(fetch, token, drive, doc.graph_drive_item_id, recipient);
      confirmed.push({ recipient_id: recipient.id, access_role: recipient.role, permission_id: permissionId });
    }
    const { error: commitError } = await admin.rpc('officehub_commit_document_shares', {
      p_document: doc.id, p_settings: settings, p_grants: confirmed, p_actor: user.id });
    if (commitError) throw new Error('Microsoft access was granted but OfficeHub could not confirm the sharing record. Retry to reconcile; do not upload another copy.');
    const { data: saved } = await admin.from('sharepoint_documents').select('*').eq('id', doc.id).single();
    return reply(200, { success: true, document: saved, recipients: confirmed.length });
  } catch (error) {
    return reply(400, { error: error instanceof Error ? error.message : 'Document sharing failed' });
  }
});
