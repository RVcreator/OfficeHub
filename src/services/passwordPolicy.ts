/** Only server-controlled requirements determine first-login/reset gating. */
export function passwordChangeRequired(authUser: any, profile?: any, recovery = false): boolean {
  if (recovery) return true;
  const flag = authUser?.app_metadata?.must_change_password;
  // A new reset takes precedence over every previous completion timestamp.
  if (flag === true) return true;
  if (flag === false) return false;
  return profile?.mustChangePassword === true || profile?.app_metadata?.must_change_password === true;
}
