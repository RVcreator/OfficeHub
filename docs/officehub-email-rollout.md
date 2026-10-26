# OfficeHub email rollout

Sender: `officehub@wipahs.org`. Existing `MS_TENANT_ID`, `MS_CLIENT_ID`, and
`MS_CLIENT_SECRET` stay in Supabase secrets. No new Graph permissions are needed.
Keep the existing scoped Exchange Application Mail.Send authorization.

## Architecture and coverage

Database triggers create durable jobs in the same transaction as the domain write.
The browser never supplies an email destination to the worker or calls Graph.
The worker accepts only the project's server service-role credential. Each request
processes one job, addressed to exactly one verified Supabase Auth account.

Supported events:

| Event | Recipients |
|---|---|
| Task assignment/delegation | Newly assigned people; persisted department/organisation selections |
| Task status | Creator, excluding the actor |
| Subtask creation/completion/title change | Parent task participants and creator, excluding actor |
| Meeting creation/change | Organiser and existing attendees |
| Meeting invitation | Newly inserted attendee |
| Meeting response/proposed time | Organiser |
| Notice publication/content/audience update | Persisted selected audience, excluding actor |
| Notice acknowledgement | Notice author |
| Approval request | Persisted selected reviewers, excluding actor |
| Approval status | Requester, excluding actor |

Only verified `@wipahs.org` Supabase Auth addresses are eligible initially. An address
in `profiles.email`, `notifications.email_recipients`, or `meeting_attendees.email`
is never sufficient. Banned/deactivated accounts and changed Auth addresses are
not claimed. Legacy notice audiences and approval reviewers were not persisted;
the migration does not guess them or backfill historical email. Subtasks currently
have no independent assignee column. Physical deletion of meetings does not send
cancellation mail; cancellation should use the existing status update flow.

Queued jobs are rechecked against current entity membership before sending;
removed recipients and already-resolved approval requests are cancelled.
Each committed event has a key and a unique recipient address. Repeated no-op
updates and React rerenders cannot send another email. Reassignments and new
status transitions are new events. Notice acknowledgements and meeting invitations
also deduplicate delete/reinsert attempts for the same entity and recipient.

Microsoft returns `202 Accepted`, which confirms submission, not mailbox delivery.
The outbox therefore says **Accepted by Microsoft**, never **Delivered**. Old
client-generated `dispatched_emails` records remain stored but are not presented
as proof of delivery. Browser writes to that old audit table are revoked.

## Safe deployment sequence

1. Review the current live schema and apply the migration plus the SQL assertions
   in a transaction ending in **ROLLBACK**. The supplied validation script does
   this; do not run an incomplete selection. Lock timeout is 2 seconds and
   statement timeout is 20 seconds. Existing profiles are only read and all test
   tasks, meetings, notices and approvals are rolled back. At least two verified
   internal accounts are needed for the assertions.
2. Apply only `20261026000000_officehub_email_outbox.sql`. Both capture and delivery
   default to false. Do not replay old migrations against production.
3. Deploy `officehub-email-worker` with JWT verification enabled, together with
   `_shared/officehubEmailWorker.ts`. Do not alter Teams or SharePoint functions.
4. Deploy the updated React build. The new mapper columns require the migration
   first. Ensure old clients are reloaded before enabling capture; old clients do
   not persist notice audiences or approval reviewers.
5. Confirm the temporary `officehub-email-test` function is absent. If present,
   replace it with the included 410 response and keep JWT verification enabled.
   The replacement has no Graph imports and cannot send mail. Do not create an
   unnecessary retired function if the endpoint is already absent.
6. Invoke the worker with server credentials and `{ "dryRun": true }`. This checks
   configuration without claiming jobs, acquiring a Graph token or sending mail.
7. In SQL, restrict delivery before enabling capture:

   ```sql
   update officehub_private.email_settings
   set capture_enabled=true, delivery_enabled=false,
       allowed_recipient_emails=array['it@wipahs.org']
   where id;
   ```

8. Create one real test task assigned to the verified IT account through OfficeHub.
   Check a single queued row, re-render/reload and repeat a no-op save to confirm
   no second job appears. Discard any unrelated jobs from this test period before
   general rollout; they will otherwise become eligible when the allowlist clears.
9. Set `delivery_enabled=true` with the same allowlist. Invoke the worker once
   using server credentials and `{ "dryRun": false }` after the job's 30-second
   delay. Confirm its `accepted` state and verify receipt in the actual IT mailbox.
   Do not infer delivery from the API response alone.
10. Test each additional event type in the same allowlist phase. Inspect actual
    recipient targeting and absence of duplicates before general rollout.
11. Configure a scheduled server invocation every minute using Supabase Cron and
    Vault. Keep the service-role key in Vault; never paste it into a migration,
    repository, browser app or cron command in plaintext. The request is POST to
    `/functions/v1/officehub-email-worker` with the service credential in the
    Authorization header and `{ "dryRun": false }` as JSON. Validate pg_cron,
    pg_net and Vault availability on the actual project before creating the job.
    One invocation processes one recipient: schedule/scale deliberately for volume.
12. After acceptance and mailbox delivery tests pass, enable normal targeting by
    clearing the test allowlist. Empty means all eligible internal accounts.

No scheduler, credentials or delivery enablement is installed automatically by
this migration. This prevents unexpected mail during review/deployment.

## Operations and rollback

Pause immediately without removing domain notifications:

```sql
update officehub_private.email_settings set delivery_enabled=false where id;
```

Disable capture as well if desired. Existing queue rows remain available for review.
Do not undo the migration while the new frontend is using its mapper columns.
Do not restore legacy browser-generated "Sent" records as a sending mechanism.

`retry` uses exponential delay, honours Retry-After and stops after six attempts.
Authentication failure before send, HTTP 401 and explicit HTTP 429 can retry.
HTTP 403/other permanent rejections fail. Timeouts, HTTP 408/5xx and expired
`sending` leases become `review`. Graph sendMail has no guaranteed idempotency key;
an automatic retry of an uncertain outcome could send twice. Inspect Exchange
Sent Items/message trace using `x-officehub-outbox-id` before manually resolving
a review job. Do not blindly reset it to queued. The outbox is the audit record;
the worker checks every write and never logs secrets, bodies or addresses.

## Validation

Focused tests: `node --import tsx --test tests/email-worker.test.ts` (16 tests).
Build: `npm run build`. Full type-check: `npm run lint`.
SQL assertions: `supabase/tests/officehub_email_outbox.sql`, executed after the
migration within the rollback transaction described above.

References: [Microsoft sendMail](https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0),
[Supabase function authentication](https://supabase.com/docs/guides/functions/auth).
