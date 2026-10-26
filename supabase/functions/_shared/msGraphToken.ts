// Shared helper: MS Graph Token Cache & Fetcher
let cachedToken: string | null = null;
let tokenExpiresAt = 0;

export async function getMsGraphAppToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt - 60000) {
    return cachedToken;
  }

  const tenantId = Deno.env.get('MS_TENANT_ID');
  const clientId = Deno.env.get('MS_CLIENT_ID');
  const clientSecret = Deno.env.get('MS_CLIENT_SECRET');

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('Missing Microsoft Graph credentials in environment variables (MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET)');
  }

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to acquire MS Graph token (${res.status}): ${errText}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  const expiresIn = Number(data.expires_in || 3600);
  tokenExpiresAt = now + expiresIn * 1000;

  return cachedToken!;
}
