// Supabase Edge Function: clear-must-change-password
// Invoked when a user has successfully updated their temporary password.
// Clears BOTH:
// 1. app_metadata.must_change_password via updateUserById
// 2. profiles.must_change_password (and temporary_password) via a direct update on public.profiles

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  // Handle CORS preflight
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

    // 1. Validate caller's JWT to identify the authenticated user
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid or expired user session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Set user's app_metadata.must_change_password to false via admin updateUserById
    const existingAppMetadata = user.app_metadata || {};
    const updatedAppMetadata = {
      ...existingAppMetadata,
      must_change_password: false,
      password_changed_at: new Date().toISOString(),
    };

    const { error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(
      user.id,
      { app_metadata: updatedAppMetadata }
    );

    if (updateAuthError) {
      return new Response(
        JSON.stringify({
          error: `Failed to clear forced password change flag from user auth metadata: ${updateAuthError.message}`
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 3. Direct update on profiles table: clear must_change_password and temporary_password
    const { error: updateProfileError } = await supabaseAdmin
      .from('profiles')
      .update({
        must_change_password: false,
        temporary_password: null,
      })
      .eq('id', user.id);

    if (updateProfileError) {
      return new Response(
        JSON.stringify({
          error: `Failed to clear forced password change flag from profiles table: ${updateProfileError.message}`
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'must_change_password flag successfully cleared in both auth metadata and profiles table.',
        userId: user.id,
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
