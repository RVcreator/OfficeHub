/** Only server-controlled requirements determine first-login/reset gating. */
export function passwordChangeRequired(authUser: any, profile?: any, recovery = false): boolean {
  if (recovery) return true;
  const flag = authUser?.app_metadata?.must_change_password;
  // A new reset takes precedence over every previous completion timestamp.
  if (flag === true) return true;
  if (flag === false) return false;
  return profile?.mustChangePassword === true || profile?.app_metadata?.must_change_password === true;
}

/** Only confirmed password completion clears a requirement already shown this session. */
export function retainPasswordRequirement(userId: string, required: boolean, previous: {isAuthenticated: boolean; userId: string | null; mustChangePassword: boolean}): boolean {
  return required || (previous.isAuthenticated && previous.userId === userId && previous.mustChangePassword);
}
