// Supabase Edge Function: create-staff-user
// Invoked by an administrator to provision a new staff account.
// Step 1: Call supabase.auth.admin.createUser({ email, password, email_confirm: true }) with minimal metadata.
// Step 2: Set must_change_password: true in app_metadata via supabase.auth.admin.updateUserById().
// Step 3: Explicit follow-up update on public.profiles with { must_change_password: true, temporary_password: password, ...fields }.

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

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
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

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    const userRole = profile?.role || (user.app_metadata?.role as string) || (user.user_metadata?.role as string) || 'Staff Member';
    const userDept = profile?.department || (user.app_metadata?.department as string) || (user.user_metadata?.department as string) || '';
    const userEmail = (user.email || '').toLowerCase();
    const r = (userRole || '').toLowerCase();
    const d = (userDept || '').toLowerCase();
    const isAdmin = 
      r.includes('admin') || 
      r.includes('manager') || 
      r.includes('director') || 
      r.includes('system') || 
      d.includes('it') || 
      d.includes('executive') || 
      userEmail.includes('admin') || 
      userEmail.includes('rijavirani');
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Admin privileges required to create staff accounts' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const email = body.email;
    const password = body.password || body.tempPassword;
    const name = body.name;
    const role = body.role;
    const department = body.department;
    const organisation = body.organisation;
    const phone = body.phone;

    if (!email || !password) {
      return new Response(JSON.stringify({ error: 'Email and password are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 1: Call createUser with minimal metadata (just enough for trigger's fallback)
    const { data: newUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: {
        name: name || email.split('@')[0],
        role: role || 'Staff Member',
        department: department || 'General',
        organisation: organisation || 'WIPAHS',
      },
    });

    if (authError || !newUser?.user) {
      return new Response(JSON.stringify({ error: authError?.message || 'Failed to create auth user' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = newUser.user.id;

    // Step 2: Explicitly set must_change_password: true in app_metadata via updateUserById()
    const { error: appMetaError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      app_metadata: {
        ...(newUser.user.app_metadata || {}),
        must_change_password: true,
        role: role || 'Staff Member',
        department: department || 'General',
      },
    });

    if (appMetaError) {
      return new Response(
        JSON.stringify({
          error: `Account was created in Auth, but the forced-password-change flag (app_metadata) could not be set: ${appMetaError.message}`,
          userId,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Step 3: Explicit follow-up update on the profiles table (runs after trigger inserted base row)
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        name: name || email.split('@')[0],
        role: role || 'Staff Member',
        department: department || 'General',
        organisation: organisation || 'WIPAHS',
        phone: phone || '',
        status: 'Offline',
        must_change_password: true,
        temporary_password: password,
      })
      .eq('id', userId);

    if (profileError) {
      return new Response(
        JSON.stringify({
          error: `Account was created in Auth, but profile details and forced-password-change flag could not be set in profiles table: ${profileError.message}`,
          userId,
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
        user: newUser.user,
        message: 'Staff account created and forced-password-change flag set successfully in both auth metadata and profiles.',
      }),
      {
        status: 201,
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
