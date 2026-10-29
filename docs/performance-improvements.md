# OfficeHub performance changes

Compared with main 533abb3de390475610129b8f10311b12ce1e071c using the same local production toolchain.

| Measurement | Before | After |
|---|---:|---:|
| Initial JavaScript, uncompressed | 1,844,028 bytes | 681,299 bytes |
| Initial JavaScript, gzip estimate | 489,353 bytes | 190,033 bytes |
| Header logo source | 434,606 bytes | 4,412 bytes WebP (embedded in hashed JS) |
| Scheduled visible-tab reconciliation | 3–15 second resource polling | 60 seconds healthy / 15 seconds degraded |

## Changes

Defer noninitial screens and global modals; isolate permission/financial helpers from views; import Mammoth/SheetJS only when parsing that file type. Lazy chunk failures have a recovery boundary and explicit reload, preserving the application shell.

Subscribe views only to their consumed tables. Do not publish semantically identical snapshots. Presence expiry, saved notification reconciliation and chime ordering remain unchanged. Coalesce concurrent reads by resource, identity and page, and run one trailing read after an in-flight invalidation. Routine account checks no longer repeat task/notification startup.

Show the authenticated shell before broad data completes. Fetch dashboard essentials before background document hydration; publish database documents before waiting for SharePoint. Fetch subtasks, acknowledgements and attendees only for loaded parents. Microsoft permissions and server security checks remain in place.

Use a single cancellable reconnect timer with capped backoff and ignore stale/intentional channel-close callbacks. Preserve immediate realtime updates and slower fallback reconciliation for tables missing realtime publication. Hidden/offline tabs do not run fallback polling; returning to the app reconciles missed changes. Presence has its separate existing heartbeat policy.

Keep original artwork and colours. Use the small logo copy and lazy/async decoding for avatars. Apply immutable one-year caching only to hashed JS/CSS/font assets; keep index.html uncached. Enable conditional Apache text compression. Font stylesheet no longer blocks first paint.

## Verification and limits

95 unit tests cover persisted notifications, password policy, account deletion, presence, refresh races, selected snapshots, reconnect deduplication and parent-scoped queries. TypeScript and production build pass. Browser checks cover the actual production bundle with mocked responses: dashboard appears before a deliberately held Graph response, no initial document parsers/modals, a spreadsheet really parses on demand, and a failed modal chunk does not blank the app. Authentication browser checks pass. Responsive checks cover 320–1440px with no page overflow or browser errors.

Bundle sizes are measured build outputs; gzip sizes are estimates before host compression. Mock browser timings are not production response-time measurements or Lighthouse scores. The supplied Lighthouse run timed out, so 42 is incomplete. Re-run Lighthouse against https://officehub.wipahs.org/ after deployment, in the foreground with consistent settings. Check authenticated and signed-out pages separately. Verify Cache-Control/Content-Encoding on hosted assets because Apache module support is host controlled. No database migration or credential change is required.
