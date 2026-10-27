import { passwordChangeRequired } from './passwordPolicy';
import { createClient, Session, User } from '@supabase/supabase-js';

// Configuration from environment (Vite import.meta.env or Node process.env) or verified WIPAHS portal project default
const SUPABASE_URL =
  (import.meta as any).env?.VITE_SUPABASE_URL ||
  (typeof globalThis !== 'undefined' ? (globalThis as any).process?.env?.VITE_SUPABASE_URL : undefined) ||
  'https://wjxrdpuhcrvzzxnznumm.supabase.co';

const SUPABASE_ANON_KEY =
  (import.meta as any).env?.VITE_SUPABASE_ANON_KEY ||
  (typeof globalThis !== 'undefined' ? (globalThis as any).process?.env?.VITE_SUPABASE_ANON_KEY : undefined) ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqeHJkcHVoY3J2enp4bnpudW1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEyODQ0NjcsImV4cCI6MjEwNjg2MDQ2N30.Drpw_zzREmIJmapUE_m3rGVTk4kzofetgp_jepGY0ZU';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'wipahs_supabase_auth_session'
  }
});

export interface AuthResponse<T = any> {
  data: T | null;
  error: { message: string; status?: number } | null;
}

export interface AppMetadata {
  must_change_password?: boolean;
  role?: string;
  department?: string;
  [key: string]: any;
}

export interface AuthenticatedPortalUser {
  id: string;
  email: string;
  name: string;
  role: string;
  department: string;
  organisation: string;
  app_metadata: AppMetadata;
  user_metadata?: Record<string, any>;
  session?: Session | null;
}

/**
 * Sign in using Supabase Auth: supabase.auth.signInWithPassword({ email, password })
 */
export async function signInWithSupabase(email: string, password: string): Promise<AuthResponse<{ user: User; session: Session | null; mustChangePassword: boolean }>> {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: password
    });

    if (error) {
      return { data: null, error: { message: error.message, status: error.status } };
    }

    if (data && data.user) {
      const mustChangePassword = passwordChangeRequired(data.user);
      return {
        data: {
          user: data.user,
          session: data.session,
          mustChangePassword
        },
        error: null
      };
    }

    return { data: null, error: { message: 'Authentication failed' } };
  } catch (err: any) {
    return { data: null, error: { message: err?.message || 'Authentication failed' } };
  }
}

/**
 * Trigger password reset email: supabase.auth.resetPasswordForEmail(email)
 */
export async function resetPasswordWithSupabase(email: string): Promise<AuthResponse<boolean>> {
  try {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/reset-password` : undefined
    });

    if (error) {
      return { data: null, error: { message: error.message } };
    }

    return { data: true, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err?.message || 'Failed to send reset link' } };
  }
}

/** Change the password and clear its requirement through one verified server flow. */
export async function updatePasswordWithSupabase(newPassword: string): Promise<AuthResponse<User>> {
  try {
    const {data:sessionData,error:sessionError} = await supabase.auth.getSession();
    const session=sessionData.session;
    if (sessionError || !session?.access_token) return {data:null,error:{message:'Your session expired. Please sign in again or request a new reset link.'}};
    const {data,error}=await supabase.functions.invoke('officehub-complete-password',{
      headers:{Authorization:`Bearer ${session.access_token}`},body:{newPassword},
    });
    if(error || data?.error || data?.success!==true || data?.userId!==session.user.id
      || data?.app_metadata?.must_change_password!==false || !data?.app_metadata?.password_changed_at) {
      return {data:null,error:{message:data?.error || 'Password change could not be confirmed. Please try again.'}};
    }
    // Refresh the server-issued claims. Failure cannot fabricate a successful write.
    await supabase.auth.refreshSession();
    return {data:{...session.user,app_metadata:data.app_metadata},error:null};
  } catch {
    return {data:null,error:{message:'Password change could not be confirmed. Please check your connection and try again.'}};
  }
}

/**
 * Admin Side: Call Supabase Edge Function 'create-staff-user'
 * Creates a new user using service role key with temporary password and app_metadata: { must_change_password: true }
 */
export async function invokeCreateStaffUserEdgeFunction(userData: {
  email: string;
  tempPassword: string;
  name: string;
  role: string;
  department: string;
  organisation: string;
  phone?: string;
}): Promise<AuthResponse<{ user: any; temporaryPassword?: string }>> {
  try {
    const sessionRes = await supabase.auth.getSession();
    const session = sessionRes.data.session;

    if (!session?.access_token) return {data:null,error:{message:'Please sign in again before creating an account.'}};

    const payload = {
      email: userData.email,
      tempPassword: userData.tempPassword,
      password: userData.tempPassword,
      name: userData.name,
      role: userData.role,
      department: userData.department,
      organisation: userData.organisation,
      phone: userData.phone,
    };

    // Primary: invoke 'admin-create-user'
    let invokeData: any = null;
    let invokeError: any = null;

    try {
      const res = await supabase.functions.invoke('admin-create-user', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: payload,
      });
      invokeData = res.data;
      invokeError = res.error;
    } catch (e: any) {
      invokeError = e;
    }

    if (invokeError) {
      let detailedMsg = invokeError.message || 'Edge function invocation error';
      try {
        if ('context' in invokeError && invokeError.context) {
          const errBody = await (invokeError.context as Response).json();
          if (errBody?.error) detailedMsg = errBody.error;
          else if (errBody?.message) detailedMsg = errBody.message;
        }
      } catch {
        // ignore JSON parse error
      }

      console.warn('Admin create user Edge Function note:', detailedMsg);
      return { data: null, error: { message: detailedMsg } };
    }

    if (invokeData?.error) {
      return { data: null, error: { message: invokeData.error } };
    }

    if (invokeData?.success !== true || !invokeData?.user?.id) return {data:null,error:{message:'Account creation was not confirmed.'}};
    return { data: invokeData, error: null };
  } catch (err: any) {
    console.warn('Admin create user Edge Function note:', err?.message);
    return { data: null, error: { message: err?.message || 'Failed to invoke create-staff-user function' } };
  }
}

/**
 * Sign out of Supabase Auth
 */
export async function signOutSupabase(): Promise<void> {
  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch (err) {
    console.warn('Sign out warning:', err);
  }
}

/**
 * Fetch staff profiles for general directory / staff listing.
 * Reads from public.profiles_public view, which excludes temporary_password entirely.
 */
export async function fetchPublicProfiles(): Promise<AuthResponse<any[]>> {
  try {
    const { data, error } = await supabase
      .from('profiles_public')
      .select('*')
      .order('name');

    if (!error && Array.isArray(data) && data.length > 0) {
      const activeData = data.filter((p: any) => !p.deactivated && !p.app_metadata?.deactivated);
      return { data: activeData, error: null };
    }

    // Fallback: Query public.profiles directly if profiles_public view has error or is empty
    const { data: fallbackData, error: fallbackError } = await supabase
      .from('profiles')
      .select('*')
      .order('name');

    if (fallbackError) {
      // If data was returned from profiles_public despite warning, return it
      if (Array.isArray(data)) {
        const activeData = data.filter((p: any) => !p.deactivated && !p.app_metadata?.deactivated);
        return { data: activeData, error: null };
      }
      return { data: null, error: { message: fallbackError.message || error?.message || 'Failed to fetch profiles' } };
    }

    const activeFallback = (fallbackData || []).filter((p: any) => !p.deactivated && !p.app_metadata?.deactivated);
    return { data: activeFallback, error: null };
  } catch (err: any) {
    try {
      const { data: fallbackData } = await supabase.from('profiles').select('*').order('name');
      if (fallbackData) {
        const activeFallback = fallbackData.filter((p: any) => !p.deactivated);
        return { data: activeFallback, error: null };
      }
    } catch {
      // ignore
    }
    return { data: null, error: { message: err?.message || 'Failed to fetch public profiles' } };
  }
}

/**
 * Fetch a user's full profile from public.profiles.
 * Protected by RLS: regular users can only read their own profile row; admins can read any.
 */
export async function fetchProfileById(userId: string): Promise<AuthResponse<any>> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      return { data: null, error: { message: error.message } };
    }
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err?.message || 'Failed to fetch profile' } };
  }
}
