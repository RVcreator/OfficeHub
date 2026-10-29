# Permanent staff account deletion

User Management now deletes the selected Supabase Auth UUID through `admin-delete-user`. The user must type the displayed email, and the server independently verifies the caller, administrator permission, self-deletion protection and target email. Auth deletion uses the hard-delete API; the profile follows through its existing cascade. No profile-first deletion or local-only fallback is allowed. Success requires verification that both records are absent. Retries address the original UUID, so they cannot delete a replacement account using the same email.

Deploy migration `20261029000000_staff_account_deletion.sql`, then the JWT-protected function, before publishing the frontend. The migration asserts the live FK names and nullable columns. It changes historical author/assignee references to SET NULL, including rating history, and retains existing membership/grant/queue cascades. A transactional Auth-deletion trigger cleans private notifications targeted by UUID or email. Shared task, meeting, document and audit records remain. Owned Supabase Storage files can block Auth deletion; the function reports failure rather than deleting files automatically. [Supabase user management](https://supabase.com/docs/guides/auth/managing-user-data), [deleteUser API](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser).

Deletion authorization uses server-controlled Auth administrator roles. The existing legacy system administrator has no Auth role, so the migration snapshots only the verified `it@wipahs.org` system-administrator identity into a private ACL. Public profile edits cannot add identities to this ACL. The permission RPC is service-role-only and also requires a current, active profile. No administrator permissions are granted merely by department or client metadata.

The member remains visible after any failed or unverified deletion. Successful database snapshots discard cached accounts that no longer exist. An invalidated session returns to sign-in on the app's next server verification. As with Supabase generally, already issued JWTs can remain valid until their expiry; this change does not alter project token lifetime or unrelated RLS policies.

Deleting a profile manually in Table Editor still does not delete an Auth account. Use User Management's permanent delete action or Supabase Authentication's account deletion. Accounts orphaned before this release are not automatically removed. Creating a user with an already registered email never silently deletes or resets the existing account. Microsoft 365 accounts and external SharePoint permissions are outside this deletion operation.

Validation:

- `node --import tsx --test tests/*.test.ts`: actual handler/client permission, confirmation, failure, cascade verification, safe retry and cache cases.
- `node tests/user-deletion-sql.mjs`: PostgreSQL migration rollback, trusted permissions, cascade/history behavior and same-email registration. Install `@electric-sql/pglite` separately or set `OFFICEHUB_PGLITE_MODULE` to its ESM file URL. The schema fixture contains metadata only, captured from the actual project.
- `node tests/account-deletion-browser.cjs`: actual User Management and store, mock SDK, denied deletion and successful retry at 320/768/1440px. Set `OFFICEHUB_PLAYWRIGHT_MODULE`/`OFFICEHUB_BROWSER_EXECUTABLE` if needed.
- `node tests/auth-browser/check.cjs`: login/reset regressions and sign-out when the server reports a deleted account.

Browser fixtures block external requests. No real staff account is deleted by automated checks. Production smoke tests must use explicitly approved disposable accounts and verify cleanup.
