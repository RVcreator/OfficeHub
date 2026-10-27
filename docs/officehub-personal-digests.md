# Personal planning emails

Weekly: Monday 08:00 Africa/Dar_es_Salaam, covering Monday through Sunday. Monthly: first day at 08:00, covering the calendar month. If both occur on the same day, each distinct digest is sent once. Delivery uses the existing queue and may take several minutes according to queue volume.

Each verified active internal account receives its own email from OfficeHub. Tasks use explicit assignees, extra assignees, department/organisation assignment rules and personal ownership. Completed/cancelled work is excluded. Open tasks due during the period, overdue tasks and undated tasks are included. Meetings include organisers, chairs and non-declined attendees, using stored occurrences only. Projects include leadership, membership or assigned task involvement; future projects outside the period are excluded. Ongoing projects remain included and overdue targets are separated. Calendar recurrence is not invented from a single stored occurrence.

Content is concise, escaped HTML with headings, counts and tables. Full descriptions, financial data, private join URLs and other users' assignments are not included. Large lists are not silently truncated. No broad mailing list is used.

The private database builder is not executable by app users. Only verified Auth addresses are used. Recipient eligibility is checked again by the existing delivery worker. Digests are rebuilt at claim time. A unique period/user key and the existing period/email key prevent duplicate queue entries. Existing retries and uncertain-send safeguards remain in force. Regular email events and document eligibility retain their current implementation.

Deployment order: validate migration in a rollback transaction against the actual schema; apply migration (disabled); deploy updated worker shared module with JWT enabled; validate rendering and restricted queue test; run operations/activate_personal_digests.sql. The schedule uses 05:00 UTC, which is 08:00 Tanzania time. No new credentials or frontend changes are needed.

Pause only digests: update officehub_private.digest_settings set enabled=false where id. Also pause the two cron jobs if desired. Existing notification delivery remains independent.

Validation: tests/digests.test.ts and optional tests/digests-migration.mjs (PGlite runtime required). The rollback SQL does not commit queued messages or profile edits.
