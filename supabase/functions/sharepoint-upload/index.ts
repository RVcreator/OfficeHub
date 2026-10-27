let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function getMsGraphAppToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt - 60000) return cachedToken;
  const tenantId = Deno.env.get('MS_TENANT_ID');
  const clientId = Deno.env.get('MS_CLIENT_ID');
  const clientSecret = Deno.env.get('MS_CLIENT_SECRET');
  if (!tenantId || !clientId || !clientSecret) throw new Error('Missing Microsoft Graph credentials');
  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId, client_secret: clientSecret,
      scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials',
    }).toString(),
  });
  if (!res.ok) throw new Error(`Failed to acquire MS Graph token (${res.status}): ${await res.text()}`);
  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = now + Number(data.expires_in || 3600) * 1000;
  return cachedToken!;
}
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    let supabaseServiceKey = '';
    const secretKeysRaw = Deno.env.get('SUPABASE_SECRET_KEYS');
    if (secretKeysRaw) {
      try {
        const secretKeys = JSON.parse(secretKeysRaw);
        console.log('Parsed secret keys:', Object.keys(secretKeys));
        supabaseServiceKey = secretKeys.default || secretKeys.service_role || (Object.values(secretKeys)[0] as string) || '';
      } catch (e) {
        console.warn('Failed to parse SUPABASE_SECRET_KEYS:', e);
      }
    }
    if (!supabaseServiceKey) {
      supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    }

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid or expired user session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    const userRole = profile?.role || 'Staff Member';
    const userDept = (profile?.department || 'General').trim();
    const r = (userRole || '').toLowerCase();
    const d = (profile?.department || '').toLowerCase();
    const isAdmin = r.includes('admin') || r.includes('manager') || r.includes('director') || d.includes('it') || d.includes('executive');
    const body = await req.json();

    const {
      name,
      folder = 'Uncategorized',
      fileData,
      fileType = 'pdf',
      visibility = 'Everyone',
      targetDepartment = userDept,
      allowedUserIds = [],
      editableUserIds = [],
      contentSummary = '',
      projectId = null,
      project_id = null,
    } = body;
    const resolvedProjectId = projectId || project_id || null;

    if (!name) {
      return new Response(JSON.stringify({ error: 'Document name is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const siteId = Deno.env.get('MS_SITE_ID');
    const driveId = Deno.env.get('MS_DRIVE_ID');

    if (!siteId || !driveId) {
      return new Response(JSON.stringify({ error: 'MS_SITE_ID or MS_DRIVE_ID is not configured in Supabase secrets.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!fileData) {
      return new Response(JSON.stringify({ error: 'fileData is required for Microsoft Graph upload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const docId = `sp-doc-${Date.now()}-${crypto.randomUUID()}`;
    let graphDriveItemId = null;
    let graphWebUrl = null;

    try {
      const graphToken = await getMsGraphAppToken();
      let bytes: Uint8Array;
      if (typeof fileData === 'string' && fileData.includes('base64,')) {
        const base64Part = fileData.split('base64,')[1];
        const binaryString = atob(base64Part);
        bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
      } else if (typeof fileData === 'string') {
        try {
          const binaryString = atob(fileData);
          bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
        } catch {
          bytes = new TextEncoder().encode(fileData);
        }
      } else {
        bytes = new TextEncoder().encode(JSON.stringify(fileData));
      }

      const cleanFolder = encodeURIComponent(folder.trim());
      const cleanName = encodeURIComponent(`${docId}-${name.trim()}`);
      const uploadUrl = `https://graph.microsoft.com/v1.0/sites/${siteId}/drives/${driveId}/root:/${cleanFolder}/${cleanName}:/content`;

      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${graphToken}`,
          'Content-Type': 'application/octet-stream',
        },
        body: bytes,
      });

      if (!uploadRes.ok) {
        const errText = await uploadRes.text();
        return new Response(JSON.stringify({ error: `Microsoft Graph upload failed (${uploadRes.status}): ${errText}` }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const uploadJson = await uploadRes.json();
      graphDriveItemId = uploadJson.id;
      graphWebUrl = uploadJson.webUrl;
    } catch (graphUpErr: any) {
      return new Response(JSON.stringify({ error: `Microsoft Graph upload exception: ${graphUpErr.message || graphUpErr}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!graphWebUrl) {
      return new Response(JSON.stringify({ error: 'Microsoft Graph upload succeeded but did not return a webUrl.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const nowIso = new Date().toISOString();
    const siteUrl = 'https://wipahstz.sharepoint.com/sites/OfficeHub';
    let webUrl = graphWebUrl;
    if (!webUrl || webUrl === siteUrl || webUrl === 'https://wipahstz.sharepoint.com' || webUrl.endsWith('/OfficeHub') || webUrl.endsWith('/OfficeHub/')) {
      webUrl = `${siteUrl}/Shared Documents/${encodeURIComponent(folder.trim())}/${encodeURIComponent(name.trim())}`;
    }

    const row: Record<string, any> = {
      id: docId,
      name: name.trim(),
      folder: folder.trim(),
      file_type: fileType,
      size: '1.2 MB',
      version: 'v1.0',
      web_url: webUrl,
      content_summary: contentSummary || (resolvedProjectId ? `Project document for ${resolvedProjectId}` : 'Uploaded via OfficeHub SharePoint integration.'),
      created_by_id: user.id,
      modified_at: nowIso,
      modified_by: profile?.name || user.email || 'Staff Member',
      visibility,
      target_department: targetDepartment,
      allowed_user_ids: allowedUserIds,
      editable_user_ids: editableUserIds,
      graph_drive_item_id: graphDriveItemId,
    };
    if (resolvedProjectId) {
      row.project_id = resolvedProjectId;
    }

    
    let { error: insertError } = await supabaseAdmin.from('sharepoint_documents').insert(row);
    if (insertError && (insertError.message?.includes('project_id') || insertError.code === '42703')) {
      console.warn('project_id column not present in schema yet; falling back to insert without project_id');
      delete row.project_id;
      const retry = await supabaseAdmin.from('sharepoint_documents').insert(row);
      insertError = retry.error;
    }

    if (insertError) {
      return new Response(JSON.stringify({ error: `Failed to insert document record: ${insertError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const shareResponse = await fetch(`${supabaseUrl}/functions/v1/sharepoint-share`, {
      method: 'POST', headers: { Authorization: authHeader, apikey: supabaseAnonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId: docId }) });
    const sharing = await shareResponse.json();
    if (!shareResponse.ok || !sharing.success) return new Response(JSON.stringify({ error: sharing.error || 'File uploaded but sharing was not confirmed', documentId: docId }), {
      status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const newDoc = { ...sharing.document,
      id: docId, name: name.trim(), folder: folder.trim(), fileType, size: row.size,
      sharePointWebUrl: webUrl, webUrl, createdById: user.id, modifiedAt: nowIso,
      modifiedBy: row.modified_by, version: row.version, visibility, targetDepartment,
      allowedUserIds, editableUserIds, projectId: resolvedProjectId, syncedWithSharePoint: true,
      isLockedForEditing: false, activeCollaborators: [] };

    return new Response(JSON.stringify({ success: true, document: newDoc }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('sharepoint-upload error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

