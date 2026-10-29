# Member presence

Online means a visible OfficeHub tab has recent activity. Away means a visible tab has been idle for five minutes. Hiding every OfficeHub tab withdraws the sessions and makes the member Offline. Another active OfficeHub tab keeps the member Online. Busy and Out of Office retain their existing server rules.

Returning to a tab immediately renews activity. Other members see changes at the next refresh, normally within 30 seconds. Lost connections expire within the existing 120-second lease.

Refresh all open OfficeHub tabs once after deployment; older tabs still run the previous logic.

Verification includes presence unit tests for visibility, inactivity, lifecycle races and cleanup, plus PostgreSQL tests for session withdrawal, multiple-tab aggregation and existing access controls.

The v2 heartbeat endpoint is reserved for clients that distinguish hidden tabs from visible idle tabs. Legacy false heartbeats withdraw their own session rather than extending Away. Legacy true heartbeats still report activity. Deploy the v2 SQL migration before releasing the client. Frozen legacy leases expire within 120 seconds; no staff account or saved availability is changed.
