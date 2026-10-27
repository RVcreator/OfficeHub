// Compatibility route: all permission checks and Microsoft confirmation happen in sharepoint-share.
Deno.serve(async req => {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Content-Type': 'application/json' };
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'POST required' }), { status: 405, headers });
  try {
    const body = await req.json();
    const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/sharepoint-share`, {
      method: 'POST', headers: { Authorization: req.headers.get('Authorization') || '', apikey: Deno.env.get('SUPABASE_ANON_KEY') || '', 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId: body.docId || body.documentId, settings: {
        visibility: body.visibility, targetDepartment: body.targetDepartment,
        allowedUserIds: body.allowedUserIds, editableUserIds: body.editableUserIds } }) });
    return new Response(await response.text(), { status: response.status, headers });
  } catch {
    return new Response(JSON.stringify({ error: 'Sharing could not be confirmed' }), { status: 400, headers });
  }
});
