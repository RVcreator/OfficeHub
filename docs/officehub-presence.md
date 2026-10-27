# OfficeHub activity and office availability

Online requires a fresh signed-in OfficeHub session with recent input in a visible tab. The client sends an activity pulse every 30 seconds; five minutes without input or hiding the tab reports Away. A missing pulse expires at 120 seconds, even if a profile still says Online. Local cached presence also expires during refresh failures.

Any active tab/device keeps the account Online. Signing out removes only that tab's session. Browser shutdown delivery is best-effort, so abrupt closure may take up to two minutes to become Offline. Hidden tabs may eventually become Offline if browsers suspend their timers. No heartbeat is sent before sign-in or after logout.

Office availability is a separate user selection. Out of Office overrides connectivity; returning In Office does not manufacture activity. Saves must be confirmed before the UI changes, and the current-user header is updated too. Scheduled calendar events never imply a joined Microsoft Teams call; this change does not read Teams presence or physical location.

Only effective account status is shared with signed-in active staff. Raw tab/session records are private. Heartbeats and leave operations derive their owner from auth.uid(), never a supplied user ID, and use server timestamps. Old records are pruned after one day during activity. No activity-history interface or external tracking service is added.

Deploy 20261027000001_live_presence.sql after checking validate_presence_rollback.sql against the actual schema. Pull/rebuild the frontend to start publishing real activity; the old frontend does not send these pulses. No staff profiles are globally rewritten to Offline.

Tests: client idle/visibility/expiry/logout scenarios, actual-store office availability save success/failure, and PostgreSQL tests for fresh/stale sessions, multiple tabs, office overrides, identity isolation and permissions. The optional tests/presence-migration.mjs integration test needs @electric-sql/pglite available in the Node environment.
