import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getMsGraphAppToken } from '../_shared/msGraphToken.ts';
import { DocumentActionError, inspectMicrosoftFile, recycleMicrosoftFile, deleteConfirmedDocument, createMicrosoftFolder } from '../_shared/documentActions.ts';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'POST required' });
  try {
    const authorization = req.headers.get('Authorization') || '';
    const url = Deno.env.get('SUPABASE_URL')!;
    const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
    const { data: { user }, error } = await caller.auth.getUser(authorization.replace(/^Bearer\s+/i, ''));
    if (error || !user) return reply(401, { error: 'Sign in to manage documents' });
    const { data: profile } = await caller.from('profiles').select('id,app_metadata').eq('id',user.id).single();
    if (!profile || profile.app_metadata?.deactivated === true || user.app_metadata?.deactivated === true) return reply(403, { error: 'An active staff account is required' });
    const body = await req.json();
    if (!['delete','sync','create_folder'].includes(body.action) || Object.keys(body).some(k => !['action','documentId','folderName'].includes(k))) return reply(400, { error: 'Invalid document action' });
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const drive = Deno.env.get('MS_DRIVE_ID');
    if (!drive) throw new DocumentActionError(503, 'SharePoint drive is not configured');
    if (body.action === 'create_folder') {
      const token = await getMsGraphAppToken();
      const folder = await createMicrosoftFolder(fetch, token, drive, body.folderName);
      const { error: saveError } = await admin.from('officehub_document_folders').upsert({ graph_item_id: folder.id, name: folder.name, created_by_id: user.id }, { onConflict: 'graph_item_id', ignoreDuplicates: true });
      if (saveError) throw new DocumentActionError(503, 'Microsoft created the folder but OfficeHub could not save it. Retry the same name.');
      return reply(200, { success: true, folder: folder.name });
    }
    if (typeof body.documentId !== 'string' || !body.documentId || body.documentId.length > 250) return reply(400, { error: 'Document ID required' });
    // Canonical server identity only; caller may never supply a drive, item or Graph URL.
    const { data: doc } = await admin.from('sharepoint_documents').select('*').eq('id', body.documentId).single();
    if (!doc) return reply(404, { error: 'Document not found' });
    const { data: isAdmin } = await caller.rpc('is_admin');
    const owner = doc.created_by_id === user.id || isAdmin === true;
    if (body.action === 'delete' && !owner) return reply(403, { error: 'Only the document owner or administrator can delete this file' });
    if (body.action === 'sync') {
      const { data: visible } = await caller.from('sharepoint_documents').select('id').eq('id', doc.id).maybeSingle();
      if (!visible || doc.deletion_pending_at) return reply(403, { error: 'Document is unavailable or deletion is pending' });
    }
    if (doc.deleted_at) return reply(200, { success: true, deleted: true });
    if (!doc.graph_drive_item_id) throw new DocumentActionError(409, 'This older record has no confirmed Microsoft file ID. An administrator must reconcile it in SharePoint.');
    const token = await getMsGraphAppToken();
    if (body.action === 'delete') {
      await deleteConfirmedDocument({
        prepare: async () => { const { error } = await admin.rpc('officehub_prepare_document_delete', { p_document: doc.id, p_item: doc.graph_drive_item_id, p_actor: user.id }); if (error) throw new DocumentActionError(409, 'OfficeHub could not prepare this deletion. Refresh and retry.'); },
        recycle: () => recycleMicrosoftFile(fetch, token, drive, doc.graph_drive_item_id),
        finish: async () => { const { error } = await admin.rpc('officehub_finish_document_delete', { p_document: doc.id, p_item: doc.graph_drive_item_id, p_actor: user.id }); if (error) throw new DocumentActionError(503, 'Microsoft deleted the file but OfficeHub could not confirm it. Retry Delete to reconcile.'); }
      });
      return reply(200, { success: true, deleted: true });
    }
    const file = await inspectMicrosoftFile(fetch, token, drive, doc.graph_drive_item_id);
    if (!file) {
      await admin.from('sharepoint_documents').update({ synced_with_sharepoint: false }).eq('id',doc.id).is('deleted_at',null);
      throw new DocumentActionError(409, 'This file is no longer available in SharePoint. The OfficeHub record has been kept for reconciliation.');
    }
    const prefix = `${doc.id}-`;
    const name = file.name.startsWith(prefix) ? file.name.slice(prefix.length) : file.name;
    const parentPath = file.parentReference?.path?.split('root:')[1];
    const folder = parentPath ? decodeURIComponent(parentPath.replace(/^\//,'')) : doc.folder;
    const { data: saved, error: syncError } = await admin.from('sharepoint_documents').update({ name, folder, web_url: file.webUrl, modified_at: file.lastModifiedDateTime, size: `${Math.ceil(file.size / 1024)} KB`, synced_with_sharepoint: true })
      .eq('id',doc.id).eq('graph_drive_item_id',doc.graph_drive_item_id).is('deleted_at',null).is('deletion_pending_at',null).select('*').single();
    if (syncError || !saved) throw new DocumentActionError(409, 'The document changed while syncing. Refresh and retry.');
    return reply(200, { success: true, document: saved });
  } catch (error) {
    return reply(error instanceof DocumentActionError ? error.status : 503, { error: error instanceof DocumentActionError ? error.message : 'Microsoft document action could not be confirmed. No success was recorded; retry later.' });
  }
});
