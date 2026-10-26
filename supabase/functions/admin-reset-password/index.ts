// Supabase Edge Function: admin-reset-password
// Invoked by an administrator to reset a staff member's password.
// 1. Verifies caller is an admin.
// 2. Generates a secure random temporary password.
// 3. Calls supabase.auth.admin.updateUserById to update auth password and set app_metadata.must_change_password = true.
// 4. Updates public.profiles table (must_change_password = true, temporary_password = tempPassword).
// 5. Returns the generated temporary password.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#$%&*!';
  let pass = 'Wipahs#';
  for (let i = 0; i < 8; i++) {
    pass += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pass + '9!';
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
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

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({ error: 'Missing service role configuration' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    // 1. Validate caller session & identity
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid or expired user session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Verify caller is an administrator
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    const userRole = profile?.role || 'Staff Member';
    const r = (userRole || '').toLowerCase();
    const d = (profile?.department || '').toLowerCase();
    const isAdmin = r.includes('admin') || r.includes('manager') || r.includes('director') || d.includes('it') || d.includes('executive');
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Admin privileges required to reset passwords' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Parse target userId and optional custom password from request body
    const body = await req.json();
    const targetUserId = body.userId;
    const customPassword = body.customPassword;

    if (!targetUserId) {
      return new Response(JSON.stringify({ error: 'Target userId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const tempPassword = customPassword || generateTempPassword();

    // 4. Update Auth password and set app_metadata.must_change_password = true
    const { data: targetAuthUser, error: getAuthError } = await supabaseAdmin.auth.admin.getUserById(targetUserId);
    const existingAppMeta = targetAuthUser?.user?.app_metadata || {};

    const { error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(
      targetUserId,
      {
        password: tempPassword,
        app_metadata: {
          ...existingAppMeta,
          must_change_password: true,
          password_reset_at: new Date().toISOString(),
        },
      }
    );

    if (updateAuthError) {
      return new Response(JSON.stringify({ error: `Failed to update auth password: ${updateAuthError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 5. Update profiles table (must_change_password = true, temporary_password = tempPassword)
    const { error: updateProfileError } = await supabaseAdmin
      .from('profiles')
      .update({
        must_change_password: true,
        temporary_password: tempPassword,
      })
      .eq('id', targetUserId);

    if (updateProfileError) {
      return new Response(JSON.stringify({ error: `Failed to update profile record: ${updateProfileError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: tempPassword,
        userId: targetUserId,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
