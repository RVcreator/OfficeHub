# Task creation and document sharing

Creating a saved task produces a self-targeted confirmation. Document sharing is confirmed by Microsoft Graph before OfficeHub publishes a recipient notification or queues its email. Repeating the same confirmed document/recipient/role does not duplicate the alert or email.

The upload returns the server's canonical document ID, uses a unique Microsoft file path, and fails visibly rather than creating a fabricated local upload. Existing records without a Microsoft drive item ID need the original file uploaded again; they are not silently linked or deleted.

Sharing requires the document owner or an administrator, resolves verified internal staff addresses on the server, and grants signed-in read/write access. It sends no Microsoft invitation email; the existing outbox handles OfficeHub email. No anonymous links or extra mail permissions are added. Public client credentials cannot forge confirmed grants.

Current scope grants additional access. Reductions/removals are refused and must be managed in SharePoint, because inherited and manually assigned access may also exist. Existing confirmed permissions are rechecked by granting the requested role again before recording success. No batch repair or historical notification backfill occurs.

Deploy the document migration before sharepoint-share and the updated sharepoint-upload. Test a harmless file and one approved internal recipient, then pull/rebuild the frontend. Existing restrictive Microsoft tenant policies or insufficient app file permissions may reject grants; such failures are surfaced and must be resolved by the tenant owner. Do not broaden app permissions without approval.

Validation: TypeScript, production build, focused tests, and PostgreSQL targeting/deduplication/RLS checks. Microsoft-side access requires a live test and recipient confirmation. Review the rollback validation SQL against the actual schema before applying the migration.
