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
  for (const byte of crypto.getRandomValues(new Uint8Array(12))) pass += chars.charAt(byte % chars.length);
  return pass + '9!';
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if(req.method!=='POST') return new Response(JSON.stringify({error:'Method not allowed'}),{status:405,headers:{...corsHeaders,'Content-Type':'application/json'}});
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

    if(customPassword!==undefined && (typeof customPassword!=='string' || customPassword.length<8 || customPassword.length>128)) return new Response(JSON.stringify({error:'Temporary password must be 8 to 128 characters'}),{status:400,headers:{...corsHeaders,'Content-Type':'application/json'}});
    const tempPassword = customPassword || generateTempPassword();

    // 4. Update Auth password and set app_metadata.must_change_password = true
    const { data: targetAuthUser, error: getAuthError } = await supabaseAdmin.auth.admin.getUserById(targetUserId);
    if (getAuthError || !targetAuthUser?.user) return new Response(JSON.stringify({error:'Target account was not found'}),{status:404,headers:{...corsHeaders,'Content-Type':'application/json'}});
    // Validate the same UUID/email before touching Auth. A profile label is not a sign-in identity.
    const {data:targetProfile,error:profileReadError}=await supabaseAdmin.from('profiles').select('id,email,app_metadata').eq('id',targetUserId).single();
    if(profileReadError||!targetProfile)return new Response(JSON.stringify({error:'This sign-in account has no matching staff profile. Repair the account before resetting its password.'}),{status:409,headers:{...corsHeaders,'Content-Type':'application/json'}});
    const canonicalEmail=(targetAuthUser.user.email||'').trim().toLowerCase();
    if(!canonicalEmail||canonicalEmail!==(targetProfile.email||'').trim().toLowerCase()
      ||(body.expectedEmail!==undefined&&(typeof body.expectedEmail!=='string'||body.expectedEmail.trim().toLowerCase()!==canonicalEmail)))
      return new Response(JSON.stringify({error:'The staff email and Supabase sign-in email do not match. No password was changed. Repair the account identity first.'}),{status:409,headers:{...corsHeaders,'Content-Type':'application/json'}});
    const existingAppMeta = targetAuthUser.user.app_metadata || {};
    const resetAt = new Date().toISOString();
    const resetId = crypto.randomUUID();

    const { error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(
      targetUserId,
      {
        password: tempPassword,
        app_metadata: {
          ...existingAppMeta,
          must_change_password: true,
          password_reset_at: resetAt,
          password_reset_id: resetId,
          password_changed_at: null,
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
    const { data: updatedProfile, error: updateProfileError } = await supabaseAdmin
      .from('profiles')
      .update({
        must_change_password: true,
        temporary_password: null,
        app_metadata:{...targetProfile.app_metadata,must_change_password:true,password_changed_at:null,password_reset_at:resetAt,password_reset_id:resetId},
      })
      .eq('id', targetUserId).select('id').single();

    if (updateProfileError || !updatedProfile) {
      return new Response(JSON.stringify({ error: `Failed to update profile record: ${updateProfileError?.message || 'Profile not confirmed'}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: tempPassword,
        userId: targetUserId,
        email:canonicalEmail,
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

