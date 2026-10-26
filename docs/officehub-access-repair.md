# OfficeHub access repair — 26 October 2026

The supplied AI Studio ZIP matches the previously inspected repository source
apart from trailing blank lines. It does not include the email PR changes.

## Findings and changes

The environment example also pointed to a different Supabase project with a demo
key. Copying it to an active environment would break authentication and data
access. It now targets the actual OfficeHub project and defaults to the existing
public anon key. Existing AI Studio environment values still need checking by
the owner; editing this template does not overwrite saved runtime settings.

`App.tsx` registered an async `onAuthStateChange` listener which awaited
`actions.getStaff()` and could invoke profile writes and task refreshes. These
Supabase requests can wait on the same auth lock held by the callback, freezing
sign-in and subsequent requests. The callback now returns synchronously and
queues session restoration after the lock releases. Tests cover that ordering,
a sign-out overtaking an in-flight profile lookup, unmount cleanup, and failures.

Session restoration now uses INITIAL_SESSION and avoids duplicate boot queries,
stale captured staff/auth state, and automatically creating a database profile.
External sign-out clears local auth state without recursively signing out again.

There were no React error boundaries. A failing screen could unmount the whole
portal. View errors now leave navigation available and provide a return to the
dashboard. A root boundary provides a deliberate reload option if the shell fails.
This contains failures; it does not establish the cause of every screen error.

The existing email PR frontend and backend source are included in the repaired
package. No scheduler or credential has been configured. Capture and delivery
remain paused in Supabase. Teams and SharePoint integration behavior is preserved.

## Verified

- Fresh dependency installation: uploaded source passes TypeScript checking and
  production build before edits. The earlier 52 diagnostics came from local
  transitive-package resolution, not 52 confirmed application defects.
- Final repaired source: TypeScript check passes with zero errors.
- Twenty focused tests pass (four auth lifecycle tests and sixteen email tests).
- Final production build passes, including all lazy-loaded feature chunks.
- Initial development server starts successfully.

## Limits and rollout

The local browser connection cannot reach this computer's preview server. The
AI Studio project is still viewer-only in the connected account. Consequently,
the repaired source has not been installed in AI Studio and authenticated browser
verification of these changes remains pending. Do not claim the live app is fixed.

Back up the current project, replace its source using the owning Google account,
rebuild, and verify login, refresh, Notifications, Tasks, Meetings, Projects,
Approvals, Teams, and SharePoint. Do not reset the database or replay migrations.
Email migrations are already applied; the scheduler must stay unconfigured per
the user's choice. Any new error should be captured with its screen and browser
message before further repair.

Reference: Supabase's auth-lock issue discussion:
https://github.com/orgs/supabase/discussions/19058
