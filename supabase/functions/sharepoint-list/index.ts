// Supabase Edge Function: sharepoint-list
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getMsGraphAppToken } from '../_shared/msGraphToken.ts';

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
    const userDept = (profile?.department || 'General').trim().toLowerCase();
    const r = (userRole || '').toLowerCase();
    const d = (profile?.department || '').toLowerCase();
    const isAdmin = r.includes('admin') || r.includes('manager') || r.includes('director') || d.includes('it') || d.includes('executive');

    const { data: dbDocs, error: dbError } = await supabaseAdmin
      .from('sharepoint_documents')
      .select('*')
      .order('modified_at', { ascending: false });

    if (dbError) {
      throw new Error(`Failed to query sharepoint_documents: ${dbError.message}`);
    }

    const allowedDocs = (dbDocs || []).filter((doc) => {
      if (isAdmin) return true;
      if (doc.created_by_id === user.id) return true;
      const vis = doc.visibility || 'Everyone';
      if (vis === 'Everyone' || vis === 'Organization') return true;
      if (vis === 'Department' && doc.target_department) {
        if (doc.target_department.trim().toLowerCase() === userDept) return true;
      }
      if (vis === 'Specific People' && Array.isArray(doc.allowed_user_ids)) {
        if (doc.allowed_user_ids.includes(user.id) || doc.allowed_user_ids.includes(user.email)) return true;
      }
      return false;
    });

    let graphItems: any[] = [];
    try {
      const siteId = Deno.env.get('MS_SITE_ID');
      const driveId = Deno.env.get('MS_DRIVE_ID');
      if (siteId && driveId) {
        const graphToken = await getMsGraphAppToken();
        const graphRes = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drives/${driveId}/root/children`, {
          headers: { Authorization: `Bearer ${graphToken}` },
        });
        if (graphRes.ok) {
          const graphData = await graphRes.json();
          graphItems = graphData.value || [];
        }
      }
    } catch (graphErr) {
      console.warn('MS Graph live fetch warning (falling back to DB metadata):', graphErr);
    }

    let filterProjectId: string | null = null;
    try {
      const url = new URL(req.url);
      filterProjectId = url.searchParams.get('project_id') || url.searchParams.get('projectId') || req.headers.get('x-project-id');
      if (!filterProjectId && req.method === 'POST') {
        const bodyText = await req.clone().text();
        if (bodyText) {
          const bodyJson = JSON.parse(bodyText);
          filterProjectId = bodyJson.projectId || bodyJson.project_id || null;
        }
      }
    } catch {}

    const enrichedDocs = allowedDocs.map((doc) => {
      const match = graphItems.find((item) => item.name.toLowerCase() === (doc.name || '').toLowerCase());
      const siteUrl = 'https://wipahstz.sharepoint.com/sites/OfficeHub';
      const rawWebUrl = match?.webUrl || doc.web_url || doc.sharepoint_web_url || doc.sharePointWebUrl;
      const validWebUrl = (!rawWebUrl || rawWebUrl === siteUrl || rawWebUrl === 'https://wipahstz.sharepoint.com' || rawWebUrl.endsWith('/OfficeHub') || rawWebUrl.endsWith('/OfficeHub/'))
        ? `${siteUrl}/Shared Documents/${encodeURIComponent(doc.folder || 'General')}/${encodeURIComponent(doc.name || 'Document')}`
        : rawWebUrl;

      return {
        id: doc.id,
        name: doc.name,
        folder: doc.folder || 'Uncategorized',
        fileType: doc.file_type || doc.fileType || 'pdf',
        size: match ? `${(match.size / 1024).toFixed(0)} KB` : (doc.size || '1.0 MB'),
        version: doc.version || 'v1.0',
        sharePointWebUrl: validWebUrl,
        contentSummary: doc.content_summary || doc.contentSummary || '',
        createdById: doc.created_by_id || doc.createdById,
        modifiedAt: doc.modified_at || doc.modifiedAt,
        modifiedBy: doc.modified_by || doc.modifiedBy,
        visibility: doc.visibility || 'Everyone',
        targetDepartment: doc.target_department || doc.targetDepartment,
        allowedUserIds: doc.allowed_user_ids || doc.allowedUserIds || [],
        editableUserIds: doc.editable_user_ids || doc.editableUserIds || [],
        projectId: doc.project_id || doc.projectId || null,
        syncedWithSharePoint: true,
      };
    });

    const finalDocs = filterProjectId
      ? enrichedDocs.filter((d) => d.projectId === filterProjectId || (d.folder && d.folder.toLowerCase().includes(filterProjectId.toLowerCase())))
      : enrichedDocs;

    return new Response(JSON.stringify({ documents: finalDocs }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('sharepoint-list error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
