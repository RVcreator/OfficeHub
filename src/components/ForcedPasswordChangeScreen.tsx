import { UserAvatar } from './UserAvatar';
import React, { useState, useRef } from 'react';
import {
  KeyRound,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  ShieldAlert,
  ArrowRight,
  LogOut,
  Building2,
  Check,
  X
} from 'lucide-react';
import { updatePasswordWithSupabase } from '../services/supabaseClient';
import { portalStore } from '../services/store';
import { StaffUser } from '../types';

interface ForcedPasswordChangeScreenProps {
  user: StaffUser;
  sessionToken?: string;
  onPasswordChanged: (updatedUser: StaffUser) => void | Promise<void>;
  onSignOut: () => void;
}

export const ForcedPasswordChangeScreen: React.FC<ForcedPasswordChangeScreenProps> = ({
  user,
  sessionToken,
  onPasswordChanged,
  onSignOut
}) => {
  const submittingRef=useRef(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusStep, setStatusStep] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  // Validation criteria
  const isMinLength = newPassword.length >= 8;
  const isMatching = newPassword.length > 0 && newPassword === confirmPassword;
  const isFormValid = isMinLength && isMatching;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if(submittingRef.current)return;
    setErrorMessage(null);

    // Basic Validation: minimum 8 characters, confirm matches
    if (!isMinLength) {
      setErrorMessage('New password must be at least 8 characters long.');
      return;
    }

    if (!isMatching) {
      setErrorMessage('New password and confirmation do not match.');
      return;
    }

    submittingRef.current=true;
    setIsSubmitting(true);
    setStatusStep('Saving your new password...');

    try {
      // STEP 1: Update password and security metadata in Supabase Auth
      const updateResult = await updatePasswordWithSupabase(newPassword);

      if (updateResult.error) {
        setErrorMessage(`Failed to update password: ${updateResult.error.message}`);
        setIsSubmitting(false);
        setStatusStep(null);
        return;
      }

      if (!updateResult.data) throw new Error('Password change was not confirmed.');
      const updatedUser: StaffUser = {
        ...user,mustChangePassword:false,temporaryPassword:undefined,
        app_metadata:updateResult.data.app_metadata,
      };

      portalStore.logAudit(
        'forced_password_changed',
        `${user.name} updated permanent account password`,
        'emerald'
      );

      await onPasswordChanged(updatedUser);
      setIsSuccess(true);
    } catch (err: any) {
      setIsSuccess(false);
      setErrorMessage(err?.message || 'An error occurred while updating your password. Please try again.');
      setIsSubmitting(false);
      setStatusStep(null);
    }finally{submittingRef.current=false;}
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden font-sans">
      {/* Background accents */}
      <div className="absolute top-0 right-1/3 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-1/3 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Brand Header */}
      <div className="sm:mx-auto sm:w-full sm:max-w-lg text-center z-10 px-4">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-300 flex items-center justify-center text-amber-700 shadow-sm mb-3">
          <KeyRound className="w-7 h-7 stroke-[2.2]" />
        </div>
        <h1 className="text-2xl font-black text-[#19232d] tracking-tight">
          Set a New Password
        </h1>
        <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
          Security Requirement • First Login / Temporary Password Issued
        </p>
      </div>

      {/* Main Form Container */}
      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-lg z-10 px-4">
        <div className="bg-white py-8 px-6 sm:px-10 shadow-xl shadow-slate-200/50 rounded-2xl border border-slate-200/80">
          {/* Explanation Alert */}
          <div className="mb-6 p-4 bg-amber-50/90 border border-amber-200 rounded-xl text-amber-950 text-xs flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold text-amber-900">Mandatory Password Update</p>
              <p className="text-amber-800 leading-relaxed">
                An administrator issued a temporary password for your account. You must set a permanent password before accessing the WIPAHS portal and institutional resources.
              </p>
            </div>
          </div>

          {/* User Account Info Bar */}
          <div className="mb-6 p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2.5">
              <UserAvatar name={user.name} avatar={user.avatar} className="w-8 h-8" />
              <div>
                <p className="font-bold text-slate-900">{user.name}</p>
                <p className="text-[11px] text-slate-500">{user.email}</p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[10px] px-2 py-0.5 rounded bg-slate-200/80 text-slate-700 font-semibold">
                {user.role}
              </span>
              <p className="text-[10px] text-slate-400 mt-0.5">{user.department}</p>
            </div>
          </div>

          {/* Inline Error Message */}
          {errorMessage && (
            <div className="mb-5 p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-start gap-2.5 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{errorMessage}</div>
            </div>
          )}

          {isSuccess ? (
            /* Success confirmation transition */
            <div className="py-8 text-center space-y-3 animate-in fade-in zoom-in-95">
              <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-slate-900">Password Successfully Changed!</h3>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                Your permanent password is saved and your account requirement has been cleared. Redirecting to portal...
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4.5">
              {/* New Password Field */}
              <div>
                <label htmlFor="new-password" className="block text-xs font-semibold text-slate-700 mb-1">
                  New Password
                </label>
                <div className="relative rounded-lg shadow-2xs">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    id="new-password"
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter at least 8 characters"
                    className="block w-full pl-9 pr-10 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#00ad1d] focus:bg-white transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none cursor-pointer"
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm Password Field */}
              <div>
                <label htmlFor="confirm-password" className="block text-xs font-semibold text-slate-700 mb-1">
                  Confirm New Password
                </label>
                <div className="relative rounded-lg shadow-2xs">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    id="confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your new password"
                    className="block w-full pl-9 pr-10 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#00ad1d] focus:bg-white transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none cursor-pointer"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Password Validation Checklist */}
              <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200/80 space-y-1.5 text-[11px]">
                <p className="font-semibold text-slate-700 mb-1">Validation Requirements:</p>
                <div className="flex items-center gap-2">
                  {isMinLength ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  ) : (
                    <X className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  )}
                  <span className={isMinLength ? 'text-emerald-800 font-medium' : 'text-slate-500'}>
                    At least 8 characters in length
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {isMatching ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  ) : (
                    <X className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  )}
                  <span className={isMatching ? 'text-emerald-800 font-medium' : 'text-slate-500'}>
                    Passwords match exactly
                  </span>
                </div>
              </div>

              {/* Status progress tracker if submitting */}
              {statusStep && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-xs flex items-center gap-2 animate-in fade-in">
                  <div className="w-3.5 h-3.5 border-2 border-blue-500/30 border-t-blue-600 rounded-full animate-spin" />
                  <span className="font-medium">{statusStep}</span>
                </div>
              )}

              {/* Submit Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting || !isFormValid}
                  className="w-full py-2.5 px-4 bg-[#00ad1d] hover:bg-[#008f18] text-white text-xs font-bold rounded-lg shadow-sm shadow-emerald-700/20 hover:shadow transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <span>Executing Supabase Security Update...</span>
                  ) : (
                    <>
                      <span>Set New Password & Enter Portal</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* Sign Out Option */}
          <div className="mt-6 pt-5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Logged in as <b>{user.name}</b></span>
            <button
              type="button"
              onClick={onSignOut}
              className="inline-flex items-center gap-1.5 text-rose-600 hover:text-rose-800 font-semibold cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

