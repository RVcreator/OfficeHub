# OfficeHub performance investigation — 16 November 2026

Review base: RVcreator/OfficeHub main at cadf0a99e6057519649f6324a7064dbe3c24d4e5.
Branch: fix/performance-investigation-20261116. Changes are for review only.

## Verified findings and changes

1. **Duplicate reads added avoidable latency and backend work.** createReadQueue marked every overlapping consumer as an invalidation. Even 20 consumers requesting the same unchanged resource triggered a second complete read, and all waited for it. A direct comparison of the base and fixed implementations measured 2 backend reads before and 1 after. Readers now share a request; realtime hints and affected writes explicitly invalidate pending reads. Invalidations remain scoped to resource and account, and all page variants are covered. Existing department mutation reconciliation and confirmed notification-insert merging are retained without an extra trailing read. Internal reads following a write explicitly request freshness.
2. **Multiple record attachments uploaded serially.** Each upload waited for the previous one. Uploads now use at most 3 workers, retain selection order, validate the whole selection first, and return metadata only after all uploads succeed. On failure, queued uploads stop and started uploads finish before rejection/retry. Six independent files can run in two waves instead of six. This is a concurrency result, not a measured production speedup. File-count/size limits, storage paths, immutable uploads and access rules are unchanged.
3. **The persistent page-download failure test missed retries.** The test intercepted only URLs ending in .js, while existing page recovery adds a retry query string. It therefore allowed recovery while expecting an error screen. The test now blocks both original and retry requests. Separate browser coverage verifies that transient failures still recover without reloading.

## Loading, task status and errors already addressed in the base

The current main branch already loads screens on demand, publishes startup sections independently, defers SharePoint listing, bounds read/account-verification deadlines, and recovers failed page downloads. Browser fixtures verified these behaviors. This work did not replace those mechanisms.

Task status already uses officehub_set_task_status, server confirmation and versioned conflict checks. Browser and isolated database tests verified two-assignee completion, idempotency, conflicts, explicit reopening and denied outsider/anonymous writes. No new status RPC or production schema change was justified by the evidence available. Local validation cannot prove that the deployed website contains the same code or database migrations.

## Validation

- Locked installation with Bun 1.4.4; Node 24.22.1 on Windows.
- Baseline: 216/216 unit tests; TypeScript check passed.
- Final unit suite: 222/222 passed, including new read sharing, invalidation, actual realtime integration, attachment snapshot ordering, upload concurrency and failure-drain tests.
- TypeScript check and Vite production build passed.
- 8 isolated built-browser suites passed: performance, independent startup, page-download recovery, shared-task status, record-attachment creation, record-attachment access/opening, stalled-authentication recovery, task general updates. Tested using installed Chrome and intercepted HTTP/WebSocket traffic; no live accounts or backend writes.
- 3 isolated PGlite database suites passed: shared-task status, record attachments and task general updates. These verify relevant permissions, atomic failure, idempotency and concurrency against local fixtures. They do not verify production deployment state.
- 3 publishing unit tests passed against a mocked hosting connection. No publishing command was run against a real host.
- git diff --check passed. Existing deployment workflow was inspected: its publishing steps exclude pull_request events and require main. The branch/draft PR must remain unmerged.

The dependency lockfile, database migrations, backend functions and hosting configuration are unchanged. Tests used a fixture Supabase URL and key; browser requests were intercepted and unrelated hosts blocked.

## Remaining limits and risks

- Supabase project wjxrdpuhcrvzzxnznumm was not connected. Production logs, query plans, index/policy deployment, function execution time, database load and current migration state were not inspected. Install/connect Supabase with read access to that project to complete this part of the diagnosis. No live data or schema was modified.
- There is no verified production before/after latency measurement. Network conditions, server load, Microsoft/SharePoint latency and differences between deployed code and main remain possible causes of the reported symptoms. No promise that every live issue is fixed is warranted.
- Upload parallelism helps multiple independent files. Single-file latency, local document preview parsing and upload bandwidth remain. Preview parsing behavior is preserved.
- Storage uploads and the parent database write are separate operations. As before, a failed later upload or parent write can leave unreferenced staged objects. No automatic deletion or production cleanup was introduced. More uploads may have started when one fails; the worker limit caps this at three.
- Future write methods must declare affected read resources (or retain their own reconciliation), and realtime refreshes must explicitly invalidate pending reads. Regression tests cover the current task/realtime paths.
- Tests cover local simulations and representative database policies, not every integration or real production browser/device. A separate development Supabase project is still needed for a complete end-to-end Microsoft/storage/network benchmark.

No merge, deployment, live database mutation, schema migration, account change or real hosting publish was performed.
