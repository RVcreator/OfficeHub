OfficeHub recurring meetings and duplicate delivery
=================================================

This change is staged on a separate branch from main. Nothing was merged, deployed, emailed or changed in the production database during this investigation.

Verified findings
-----------------

- Read-only production aggregates found two active physical recurring series (Daily and Weekly). Recurrence was stored, but the calendar compared exact first dates and lifecycle checks expired records after their first allocation.
- Both emailed and downloaded calendar files omitted RRULE. Changing recurrence alone did not trigger a physical calendar update. The queue also rejected invitations once their original end time passed.
- Two groups of accepted `meeting` emails contained identical bodies for the same recipient/entity within the same minute (two extra rows). Teams invitations were sent by Microsoft Calendar as well as separate OfficeHub invitation/update triggers; saving the Microsoft join URL triggered another generic email. This establishes duplicate meeting delivery paths. It does not establish the cause of every duplicate message in a user's inbox.
- One same-minute RSVP group had identical bodies. Those messages omitted the responding person's name, so different attendees' responses looked identical. RSVP messages now identify the respondent, preserve distinct responses and deduplicate the same response within a transaction.
- Weekly/monthly digests selected only first meeting dates.

Changes
-------

- Keep one meeting/attendee series record; expand only the calendar's visible dates and bounded digest period. Daily, weekly and monthly dates use the original EAT date. Monthly dates absent from a month are skipped (for example January 31 goes to March 31).
- Active series remain responsive/editable after their first occurrence. Existing single-meeting expiration, access checks, organizer/host restrictions and RSVP data remain intact. Responses and edits apply to the entire series; per-occurrence exceptions are not introduced.
- Show recurrence in meeting details, cards, editing and email details. Downloads and physical calendar mail carry a stable UID, RRULE and explicit EAT timezone. Changes/cancellations retain the UID and advance sequence numbers, including after the first occurrence.
- Implement Microsoft Graph recurrence patterns/ranges on the existing Teams event. Verify the returned repeat rule before success. Repeated syncs preserve the same event and do not issue unchanged updates.
- Microsoft Calendar owns Teams invitations/updates; OfficeHub physical calendar mail owns physical invitations. Remove parallel generic meeting/invitation mail. Keep organizer RSVP mail, including meaningful repeat responses.
- The staged migration cancels only unsent redundant generic Teams jobs and queues one corrected invitation per current physical-series recipient. Accepted/sending/review history is retained; no meeting, attendee or user record is deleted. Existing active Teams series, if any, are queued for normal sync.

Validation
----------

- Full unit suite, TypeScript check and fixture production build.
- Isolated PostgreSQL/PGlite fixtures: recurring migration and legacy-series correction; monthly boundary and private digest membership; post-anchor edit/RSVP; rule changes and supersession; series cancellation; Teams invitation/link duplicate suppression; responder identity; no-op response; unrelated-user denial and service-only claim access.
- Existing physical meeting, Teams sync and meeting lifecycle PostgreSQL fixtures.
- Browser fixture on desktop 1440px and mobile 390px: create Daily, edit Weekly, later calendar occurrences, recurrence details, retained attendees/venue and no browser errors. External requests and WebSockets intercepted; no live email sent.
- Existing single-meeting lifecycle browser regression and worker timeout/ambiguous-send tests.

Remaining limits and release considerations
-------------------------------------------

Microsoft delivery and Outlook acceptance were tested with simulated responses, not real mailboxes. Calendar client behavior and co-organizer support for series need a controlled nonproduction tenant check before release. No system using Graph sendMail can promise end-to-end exactly-once delivery; existing uncertain-send review behavior remains unchanged and does not automatically resend ambiguous messages.

Series continue without an end date until cancelled/completed; all RSVP state is for the series. Imported .ics files still use the existing one-event importer and do not import arbitrary external recurrence rules or exceptions. This change addresses OfficeHub-created series.

Release requires coordinated deployment of both `officehub-email-worker` and `teams-meeting-sync` shared code, the new SQL migration and frontend. Pause the scheduler while updating the worker and applying the migration; resume only after both versions are present. Review migration-generated corrected invitation counts before resuming. Applying SQL before the worker supports RRULE could produce a single-occurrence invitation. No release step was executed here. Draft PRs #63 and #64 remain separate.

Implementation reference: [Microsoft Graph recurring events](https://learn.microsoft.com/en-us/graph/outlook-schedule-recurring-events), [recurrencePattern](https://learn.microsoft.com/en-us/graph/api/resources/recurrencepattern?view=graph-rest-1.0), [recurrenceRange](https://learn.microsoft.com/en-us/graph/api/resources/recurrencerange?view=graph-rest-1.0).
