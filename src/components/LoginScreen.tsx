import React, { useState } from 'react';
import {
  Lock,
  Mail,
  Eye,
  EyeOff,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  Building2
} from 'lucide-react';
import { signInWithSupabase, resetPasswordWithSupabase } from '../services/supabaseClient';
import { portalStore } from '../services/store';
import { StaffUser } from '../types';

interface LoginScreenProps {
  onLoginSuccess: (user: StaffUser, mustChangePassword: boolean, sessionToken?: string) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Forgot password flow state
  const [isForgotPasswordMode, setIsForgotPasswordMode] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState('');
  const [resetSuccessMessage, setResetSuccessMessage] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) {
      setErrorMessage('Please enter both your email address and password.');
      return;
    }

    setIsLoading(true);

    try {
      const supabaseResult = await signInWithSupabase(cleanEmail, password);

      if (supabaseResult.error) {
        setErrorMessage(supabaseResult.error.message);
        setIsLoading(false);
        return;
      }

      if (supabaseResult.data && supabaseResult.data.user) {
        const sbUser = supabaseResult.data.user;
        const matchedStaff = await portalStore.syncAuthenticatedUserProfile(sbUser);
        const mustChange = portalStore.shouldForcePasswordChange(sbUser, matchedStaff, {
          enteredPassword: password,
        });

        portalStore.logAudit('auth_sign_in_supabase', `${matchedStaff.name} signed in successfully via Supabase Auth`, 'emerald');
        setIsLoading(false);
        onLoginSuccess(matchedStaff, mustChange, supabaseResult.data.session?.access_token);
        return;
      }

      setErrorMessage('Invalid email or password. Please verify your credentials and try again.');
    } catch (err: any) {
      setErrorMessage(err.message || 'An unexpected error occurred during sign in.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setResetSuccessMessage(null);

    const cleanEmail = (forgotPasswordEmail || email).trim().toLowerCase();
    if (!cleanEmail) {
      setErrorMessage('Please enter your email address to receive password reset instructions.');
      return;
    }

    setIsResetting(true);

    try {
      const result = await resetPasswordWithSupabase(cleanEmail);
      if (result.error) throw new Error(result.error.message);
      setResetSuccessMessage(`A password reset link has been sent to ${cleanEmail}. Please check your inbox.`);
      portalStore.logAudit('auth_password_reset_requested', `Password reset link requested for ${cleanEmail}`, 'purple');
    } catch (err: any) {
      setErrorMessage('The reset request could not be sent. Please check your connection and try again.');
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-slate-50 flex flex-col justify-center items-center px-4 font-sans">
      <div className="w-full max-w-sm">
        {/* Minimalist Logo & Header */}
        <div className="flex justify-center">
          <div className="w-12 h-12 rounded-xl bg-[#00ad1d] flex items-center justify-center text-white shadow-sm">
            <Building2 className="w-6 h-6 stroke-[2]" />
          </div>
        </div>
        <h2 className="mt-4 text-center text-xl font-bold tracking-tight text-slate-900">
          WIPAHS Portal
        </h2>
      </div>

      <div className="mt-8 w-full max-w-sm">
        <div className="bg-white py-8 px-6 shadow-sm border border-slate-200/80 rounded-xl sm:px-8">
          {!isForgotPasswordMode ? (
            /* Sign In Form */
            <div>
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-slate-900">Sign in to your account</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Enter your organization email and password
                </p>
              </div>

              {/* Inline Error Message */}
              {errorMessage && (
                <div className="mb-5 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{errorMessage}</span>
                </div>
              )}

              <form onSubmit={handleSignIn} className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-xs font-medium text-slate-700 mb-1">
                    Email address
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <Mail className="w-4 h-4" />
                    </div>
                    <input
                      id="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@wipahs.org"
                      className="block w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#00ad1d] focus:border-[#00ad1d] transition"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor="password" className="block text-xs font-medium text-slate-700">
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setIsForgotPasswordMode(true);
                        setForgotPasswordEmail(email);
                        setErrorMessage(null);
                        setResetSuccessMessage(null);
                      }}
                      className="text-xs font-medium text-[#008f18] hover:text-[#007013] hover:underline cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="block w-full pl-9 pr-10 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#00ad1d] focus:border-[#00ad1d] transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-2.5 px-4 bg-[#00ad1d] hover:bg-[#008f18] text-white text-xs font-semibold rounded-lg shadow-sm transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {isLoading ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Signing in...</span>
                      </>
                    ) : (
                      <>
                        <span>Sign In</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </div>
              </form>

              <div className="mt-6 pt-5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
                  <span>Encrypted Connection</span>
                </span>
                <span>WIPAHS IT Services</span>
              </div>
            </div>
          ) : (
            /* Forgot Password Form */
            <div>
              <div className="mb-5">
                <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center mb-3">
                  <KeyRound className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-semibold text-slate-900">Reset password</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Enter your email address to receive reset instructions
                </p>
              </div>

              {resetSuccessMessage ? (
                <div className="space-y-4">
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span className="leading-relaxed">{resetSuccessMessage}</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setIsForgotPasswordMode(false);
                      setResetSuccessMessage(null);
                    }}
                    className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-lg transition cursor-pointer"
                  >
                    Back to Sign In
                  </button>
                </div>
              ) : (
                <form onSubmit={handleForgotPasswordSubmit} className="space-y-4">
                  {errorMessage && (
                    <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>{errorMessage}</span>
                    </div>
                  )}

                  <div>
                    <label htmlFor="forgot-email" className="block text-xs font-medium text-slate-700 mb-1">
                      Email address
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <Mail className="w-4 h-4" />
                      </div>
                      <input
                        id="forgot-email"
                        type="email"
                        required
                        value={forgotPasswordEmail}
                        onChange={(e) => setForgotPasswordEmail(e.target.value)}
                        placeholder="name@wipahs.org"
                        className="block w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#00ad1d] focus:border-[#00ad1d] transition"
                      />
                    </div>
                  </div>

                  <div className="pt-2 flex items-center gap-2">
                    <button
                      type="submit"
                      disabled={isResetting}
                      className="flex-1 py-2.5 px-4 bg-[#00ad1d] hover:bg-[#008f18] text-white text-xs font-semibold rounded-lg transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                    >
                      {isResetting ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>Sending link...</span>
                        </>
                      ) : (
                        <span>Send reset link</span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsForgotPasswordMode(false);
                        setErrorMessage(null);
                      }}
                      className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg transition cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
