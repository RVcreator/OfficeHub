// Supabase Edge Function: admin-create-user
// Invoked by an administrator to create a new staff member account.
// 1. Verifies caller is an admin.
// 2. Generates or accepts a temporary password.
// 3. Calls supabase.auth.admin.createUser with email, password, email_confirm: true, and app_metadata.must_change_password = true.
// 4. Inserts/upserts matching public.profiles row.
// 5. Returns created user details and temporary password.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#$%&*!';
  let pass = 'Wipahs#';
  for (const byte of crypto.getRandomValues(new Uint8Array(12))) pass += chars.charAt(byte % chars.length);
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
      console.error('Service key or Supabase URL missing from environment');
      return new Response(JSON.stringify({ error: 'Missing service role configuration in environment' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    // 1. Validate caller session
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid or expired user session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Verify caller is an administrator (using r.includes / d.includes pattern + metadata fallback)
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

    // 3. Parse request body
    const body = await req.json();
    const email = body.email;
    const tempPassword = body.tempPassword || body.password || generateTempPassword();
    const name = body.name || (email ? email.split('@')[0] : 'New Staff');
    const role = body.role || 'Staff Member';
    const department = body.department || 'General';
    const organisation = body.organisation || 'WIPAHS';
    const phone = body.phone || '';

    if (!email) {
      return new Response(JSON.stringify({ error: 'Email is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 4. Create user in Supabase Auth
    let targetUserId = '';
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        name,
        role,
        department,
        organisation,
      },
      app_metadata: {
        must_change_password: true,
        password_changed_at:null,
        password_reset_at:new Date().toISOString(),
        role,
        department,
      },
    });

    if (authError || !authData?.user) {
      return new Response(JSON.stringify({error:authError?.message || 'Account creation failed. Existing accounts must use Reset Password.'}),{
        status:400,headers:{...corsHeaders,'Content-Type':'application/json'},
      });
    } else {
      targetUserId = authData.user.id;
    }

    const userId = targetUserId;

    // 5. Ensure app_metadata is set correctly
    const {error:requirementError}=await supabaseAdmin.auth.admin.updateUserById(userId, {
      app_metadata: {
        must_change_password: true,
        role,
        department,
      },
    });

    if(requirementError) return new Response(JSON.stringify({error:'Account created, but password requirement confirmation failed.'}),{status:503,headers:{...corsHeaders,'Content-Type':'application/json'}});

    // 6. Insert or upsert profiles row
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: userId,
        email: email.trim().toLowerCase(),
        name,
        role,
        department,
        organisation,
        phone,
        status: 'Offline',
        must_change_password: true,
        temporary_password: null,
      });

    if (profileError) {
      return new Response(
        JSON.stringify({
          error: `Auth user created but profile upsert failed: ${profileError.message}`,
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
        user: authData.user,
        temporaryPassword: tempPassword,
        message: 'Staff user created successfully.',
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

