# Microsoft meeting sync

OfficeHub saves a permission-checked meeting and its complete attendee list before Microsoft work begins. A private queue keeps one leased job per meeting. New events use a stable Exchange transaction ID; confirmed immutable event/owner IDs are checkpointed before co-organizer setup. Later changes patch that same event. No-op saves do not queue another invitation. Pending work uses the existing protected email-worker schedule without changing normal email jobs.

The original organizer remains the Microsoft organizer. Selecting another Host / Chair makes that attendee a Teams co-organizer and removes the previous OfficeHub chair's co-organizer assignment. Attendee additions/removals and scheduled title/time/description changes update the calendar event. Cancellations/deletions cancel the saved event. Physical meetings retain their existing Outlook invitation path.

The browser supplies only a saved meeting ID to the verified-user sync handler. The service checks the authenticated organizer/chair, uses verified account addresses from Supabase Auth, and resolves Microsoft identities server-side. Staff cannot set Microsoft IDs, claim queue work, or choose arbitrary Graph endpoints. Older records must prove the saved event's organizer and exact join URL before the service binds them. A missing or mismatched real legacy event is left for reconciliation rather than guessed from its title.

## Microsoft configuration

The existing registration is `6a459b19-e4f7-4274-87ce-be470b9e5a70`. Calendar and user-directory application permissions already exist. Teams co-organizer updates additionally require **OnlineMeetings.ReadWrite.All** application permission with administrator consent and an application access policy assigned to each permitted organizer. Do not add a global policy grant. The existing restricted Mail.Send configuration is unrelated and must remain unchanged.

`scripts/configure-teams-meeting-policy.ps1` first produces a read-only plan for explicitly supplied organizer addresses. After review, `-Apply` creates/assigns the dedicated OfficeHub policy. It refuses to replace another existing policy. A Microsoft administrator must complete the sign-in. Policy propagation can take up to 30 minutes; a saved meeting blocked by missing permission can be retried from OfficeHub after configuration.

References: [update onlineMeeting](https://learn.microsoft.com/en-us/graph/api/onlinemeeting-update?view=graph-rest-1.0), [update event](https://learn.microsoft.com/en-us/graph/api/event-update?view=graph-rest-1.0), [application access policy](https://learn.microsoft.com/en-us/graph/cloud-communication-online-meeting-application-access-policy).

## Release and limits

Apply `20261104000002_teams_meeting_sync.sql`, deploy `teams-meeting-sync` with internal verified-user authentication, deploy the matching `officehub-email-worker`, and retire `teams-meeting-create` before releasing the frontend. Deploying this migration creates no jobs for existing meetings and sends no invitations by itself. Existing online records join the queue when an organizer edits them.

The UI reports pending, retry or blocked sync rather than claiming Microsoft succeeded. Microsoft calendar delivery and policy propagation are asynchronous. This is OfficeHub-to-Microsoft sync of scheduled meeting details and roles; it does not import unrelated Microsoft edits, mirror OfficeHub RSVP/proposed-time comments, or copy portal files into meeting chats. Recurring Teams series must currently be scheduled in Outlook; OfficeHub rejects a new recurring-series request rather than silently creating only one occurrence. Past meetings are not sent as new invitations. Supported invitation list size is 150 tenant members.
