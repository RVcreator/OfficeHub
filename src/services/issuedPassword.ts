/** Use the password actually issued by the server, never a locally assumed default. */
export function issuedPassword(data: any, userId: string, operation: 'create' | 'reset'): string {
  const confirmedId = operation === 'create' ? data?.user?.id : data?.userId;
  const password = operation === 'create' ? data?.temporaryPassword : (data?.temporaryPassword ?? data?.message);
  if (data?.success !== true || confirmedId !== userId || typeof password !== 'string' || password.length < 8 || password.length > 128) {
    throw new Error('The server did not confirm the temporary password for this account. Use Reset Password to issue a new one.');
  }
  return password;
}
