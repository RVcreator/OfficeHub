# Verified administrator password resets

Administrator password reset now verifies that the exact issued credential authenticates the selected account before reporting success or returning the credential.

The existing administrator permission decision, UUID/canonical-email checks, Auth password update, required first-login password change and matching profile update remain. Verification uses an isolated client with persistence and refresh disabled; it cannot replace the caller's session. Both the returned user and session must belong to the target UUID. Its short-lived verification session is closed using local scope, preserving other devices.

If authentication, identity confirmation or cleanup fails, the function reports that the reset was applied but not verified. It does not return a password, access token or success flag. There is no automatic reset retry and no weaker profile-only fallback.

Tests cover the matching account and credential, invalid credential, wrong account, missing token, network failure, cleanup failure, administrator denial, identity mismatch, profile failure and required password-change flags. The branch's full 218-test suite, type check and build pass.

Operational limits: verification adds an Auth sign-in and local sign-out to an administrator reset, updates Auth sign-in/audit timestamps, and adds API latency. An outage or rate limit can therefore prevent verified success even after the password update has committed. The error explicitly distinguishes this partial outcome. Concurrent later resets still invalidate earlier passwords. Verification cannot prevent users mistyping a password after it is issued.

This is a review-only code change. No function deployment or schema change is included. Use the existing isolated password tests before a targeted function release. Never include real passwords, password hashes, tokens or live account records in fixtures, PRs or documentation.
