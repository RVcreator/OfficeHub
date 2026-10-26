# Notification display and sound repair

## Confirmed causes

- Real-time task, notice, message, acknowledgement, and broadcast callbacks played
  sound independently of persisted notification delivery. Polling old messages or
  notices could therefore ring without adding an inbox item.
- addNotification swallowed insert failures and published a fabricated local row.
  A later database refresh replaced it, making it disappear.
- A refresh begun before a notification insert could overwrite the newer inbox.
- Notification synchronization compared IDs after getNotifications had already
  replaced the store, so its new-notification detection missed incoming rows.
- Visibility/storage listeners accumulated after sign-out/sign-in.

## Behavior after the change

Only the shared notification store requests a chime, after a confirmed notification
has been published to the same recipient-filtered list used by the header badge
and inbox. Initial history loads, read updates, dismissed replays, and duplicate
IDs stay silent. Broadcasts and raw database events only request refreshes; they
never fabricate notification rows. Explicit self-targeted saved tests may chime.

Failed saves show an error and never publish or ring. Failed reads retain the
last confirmed inbox. Stale reads are discarded after a newer request or account
change, and confirmed inserts arriving during a read are retained. Message alerts
are not generated for failed message inserts. Existing Teams and SharePoint paths
are preserved. No database schema or notification permissions were changed.

## Verification and rollout

- TypeScript and production build pass.
- 31 focused tests pass: 11 notification delivery/store regressions, 4 auth tests,
  and 16 email tests. Tests include the actual store's save and refresh behavior.
- Live Supabase columns and notification RLS policies were inspected. An insert
  and read as the verified IT account passed in a transaction ending in rollback.
  The test row was not retained.
- Email capture/delivery remain paused. The scheduler remains unconfigured at the
  user's request. This repair neither sends nor enables email.
- Pull the updated GitHub source into AI Studio and rebuild. The connected account
  still lacks source-edit access, so the running AI Studio build is not verified
  as using this repair. Browser verification must cover a new targeted notification,
  refresh, duplicate delivery, dismissal, sign-out/sign-in, and a failed request.
