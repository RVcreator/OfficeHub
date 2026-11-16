# OfficeHub performance investigation — 16 November 2026

Draft PR: https://github.com/RVcreator/OfficeHub/pull/63
Branch: fix/performance-investigation-20261116. Review base: main at cadf0a99e6057519649f6324a7064dbe3c24d4e5.
Supabase project: wjxrdpuhcrvzzxnznumm (officehub). Production inspection used read-only logs/catalog/statistics queries. Changes remain for review only.

## Verified defects and fixes

1. **Duplicate resource reads.** createReadQueue treated every overlapping consumer as an invalidation. Twenty concurrent consumers triggered two complete reads, with all waiting for the second. A direct baseline/fixed comparison measured 2 reads before and 1 after. Readers now share a request; realtime hints and affected writes explicitly invalidate pending reads. Resource/account isolation and existing department/notification reconciliation are preserved. Reads inside actions following a write explicitly request freshness.
2. **Serial record attachment uploads.** Each file waited for the preceding upload. At most three workers now upload independent files, retain selection order, validate the whole selection first, and publish metadata only after all uploads succeed. Failures stop queued uploads and drain started requests before rejection/retry. Six files can run in two waves instead of six; this is a concurrency result, not a measured production speedup. Existing file limits, paths, immutable originals and access rules remain.
3. **Background presence request amplification.** A hidden tab previously sent leave plus snapshot every 30 seconds after it had already withdrawn. It now withdraws once and suspends periodic requests while hidden/page-hidden, while visible return refreshes immediately. A built-browser test simulated 120 hidden pulses with zero additional presence requests. A failed withdrawal remains retryable, and server TTL still handles abandoned sessions. In-flight transitions cannot republish outdated presence.
4. **Slow presence cleanup could hold local logout.** logoutUser awaited stop(), which awaited a presence_leave network request. Live logs show this endpoint taking up to 55.15 seconds. Stopping presence now removes local listeners immediately and starts best-effort leave without waiting for the network; late responses remain unable to publish. Neither the request nor any other write is automatically cancelled/retried. The browser test held leave indefinitely and verified sign-out still reached the login screen.
5. **Page-download failure regression coverage missed retries.** The test blocked only URLs ending in .js, while recovery adds a query string. It now blocks original and retry URLs when testing permanent failure. Separate browser tests verify transient failures recover without reloading.

## Production evidence

Inspection began at approximately 11:56 UTC (14:56 East Africa Time), 16 November. Gateway metrics below use the fixed 24-hour window 15 November 12:00 UTC to 16 November 12:00 UTC. Other log summaries use rolling preceding 24-hour windows. Query statistics are cumulative over an unknown reset interval and must not be read as 24-hour totals.

- Project reported ACTIVE_HEALTHY; health advisor returned no notices. This does not invalidate the slow requests observed in logs.
- Gateway origin times: task GET, 351 successful requests, mean 798.4 ms, max 8,811 ms; task PATCH, 14 successful requests, mean 3,464.2 ms, max 32,997 ms; status RPC POST, 14 successful requests, mean 951.9 ms, max 4,370 ms. Presence snapshot POST had 2,671 successes (max 49,703 ms); leave POST had 2,267 successes (max 55,150 ms); heartbeat_v2 POST had 407 successes (max 59,861 ms). OPTIONS requests are excluded. Gateway origin time includes upstream handling and is not pure SQL execution time.
- Database logs contained 21 statement timeouts and 5 user-request cancellations. A task_subtasks request and a save_meeting request returned 500. Permission-denied events also occurred, but these can be expected denials; no access policy was loosened.
- Sampled pg_stat_statements RPC entries: presence_snapshot had 57,598 calls, about 3,929,716 ms cumulative execution time, mean 68.23 ms and max 7,950.9 ms. It was the largest cumulative cost in that RPC sample. Status RPC had 35 calls, mean 256.99 ms and max 2,137.9 ms. Redundant presence traffic is verified in code and its endpoints are heavily used in production; the evidence does not establish it as the sole cause of every spike.
- At one read-only snapshot there were 25 database connections, 2 active and no lock waiters. This cannot rule out historical CPU, I/O, connection-pool or lock pressure.
- Catalog estimates were small (38 live tasks, 56 subtasks, 20 profiles). Advisors reported 35 unindexed foreign keys, 43 per-row auth-policy initialization warnings and 92 overlapping permissive-policy findings. Those are review candidates, not proof of the observed delays at these row counts. No blanket index or policy rewrite was introduced.
- Supabase list_migrations returned no entries. Selected catalog definitions confirm status/version checks, narrowed task membership and the optimized presence verification functions are present. This establishes selected features, not complete migration parity or deployment parity with GitHub.
- SharePoint document-action had 8 successful calls (max 6,305 ms) and 2 calls returning 502. A diagnostic at 08:38:35 UTC showed Office file size promotion rejected by the earlier validator. Deployed function version 5, updated at 08:40:12 UTC, now contains the size-promotion-compatible validation already in main (#62). This historical failure is not evidence that the current validator still has that defect. No duplicate fix or redeployment was performed.
- The email worker had two 500s around 20 seconds and successful calls up to 15.27 seconds. It runs separately from the confirmed task status UI flow. No evidence justified making email delivery part of the UI success path or changing worker behavior here.

## Validation

- Locked Bun 1.4.4 installation; local Node 24.22.1 on Windows.
- Baseline: 216/216 unit tests and TypeScript check passed.
- Final suite: 225/225 unit tests, TypeScript check and Vite production build passed. New regressions cover request sharing, write/realtime invalidation, attachment ordering/failure drain, hidden presence and stalled cleanup.
- Nine isolated built-browser suites passed: performance, independent startup, page-download recovery, shared-task status, record-attachment creation, record-attachment access/opening, stalled-auth recovery, task general updates and presence performance/logout. HTTP and WebSocket traffic was intercepted; unrelated hosts were blocked; no live accounts/backend writes.
- Three isolated PGlite suites passed: shared-task status, record attachments and task general updates, covering relevant permissions, atomic failure, conflicts and idempotency. No SQL fix was applied to production.
- Three mocked publishing unit tests passed; they use a fake hosting connection. git diff --check passed.
- Original draft commit GitHub checks passed: https://github.com/RVcreator/OfficeHub/actions/runs/43861177304 . Both hosting-credential and FTPS deployment steps were skipped. The follow-up commit is also for PR checks only.

## Existing protections retained

Current main already lazy-loads screens, publishes startup sections independently, defers SharePoint listing, bounds account/read deadlines and recovers page downloads. Task status already uses server confirmation, version conflicts and explicit reopening. These behaviors passed the local suites; no optimistic fake success, speculative schema patch or permission expansion was added.

## Remaining risks and follow-up

- Production resource saturation and exact timeout causes are not fully isolated. No production before/after latency measurement is possible while fixes remain undeployed. Gateway timings and cumulative SQL statistics cover different layers/windows. Frontend hosting version parity and every deployed database/function definition were not exhaustively compared.
- Single-file upload bandwidth, local document preview parsing and Microsoft service latency remain. Multi-file parallelism starts up to three requests, including when one later fails. Storage uploads and parent writes remain separate: failures can leave staged objects as before. No production cleanup/deletion was performed.
- Add tests when introducing future writers/realtime consumers so explicit invalidation and current reconciliation stay correct. Preserve background-withdrawal, TTL, logout and account-switch guarantees.
- Database warnings need representative plans/benchmarks before schema changes. See [missing indexes](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys), [RLS initialization](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan), and [overlapping policies](https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies).
- Security advisor review also noted mutable search paths on two legacy helpers, anonymous execution of four SECURITY DEFINER helpers and disabled leaked-password protection. These are findings to assess separately, not confirmed exploitation or proof of this performance issue. Intended authenticated RPCs and service-only RLS tables were not reconfigured. References: [search paths](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable), [anonymous helper execution](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- Full Microsoft/storage/network benchmarks still need a separate development Supabase project. Local fixtures and selected production reads cannot guarantee every future failure is eliminated.

No merge, deployment, production data/schema mutation, migration, account change or real hosting publish was performed. The dependency lockfile, migrations, backend function source and hosting configuration are unchanged.
