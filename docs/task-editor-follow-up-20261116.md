# Task editor follow-up — 16 November 2026

Review branch: fix/performance-investigation-20261116
Draft PR: https://github.com/RVcreator/OfficeHub/pull/63

## Findings and changes

The attachment handlers awaited a save and then reset selectedTask using the old render's tasks array. That could replace the just-confirmed drawer state with the previous attachment list. The handlers now rely on the reactive store's confirmed result, use the latest task snapshot when constructing an attachment update, and prevent overlapping actions with a synchronous guard and visible saving state. File inputs are captured/reset before asynchronous parsing; errors appear in the drawer instead of being lost.

The former task editor called updateTask without awaiting it and closed immediately. It now keeps one draft, waits for server confirmation and remains open with its title, files and assignees intact on failure. Double clicks share one pending submission. Closing/cancelling is blocked while files are being prepared or saved. The detail footer is hidden during editing so destructive controls cannot compete with the save.

Edit Task now includes the existing searchable staff-picker design, selected-person chips, individual remove controls and attachment controls. The task creator can add, remove and replace individual assignees. At least one active assignee is required. Existing primary assignees are retained even if omitted from the multi-assignee array. Existing department/organisation targeting is preserved unless the creator explicitly chooses individual assignees. Task participants retain their existing detail/file permissions but cannot alter assignment access. No permissions, migrations or production schema were changed.

Attachment additions/removals inside Edit Task are draft changes, saved together with Save Changes. Cancel discards them. The existing Attach Document and remove controls outside the editor continue saving immediately after one action and publish only confirmed results.

## Verification

- 228/228 unit tests passed.
- TypeScript check, production build and git diff --check passed.
- New built-browser workflow passed at 1440px and 390px: one-click drawer add/remove; editing files and assignees; additions, removal and replacement; cancelled drafts; blocked duplicate saves; failed parent save/upload with complete draft retention; empty-assignee rejection; persistent state after reload; creator-only assignment changes; preserved/explicitly converted department audience; member search Enter does not submit; no horizontal overflow or uncaught browser errors.
- Seven built-browser suites passed: task editing, shared task status, general task updates, existing record attachment access, performance/lazy loading, record attachment creation and member search.
- Extended isolated PGlite attachment/policy test passed: saving new assignees and files together grants expected access; non-creators cannot change assignment; removed assignees lose task/file access; remaining assignees retain only linked files. This ran against local synthetic fixtures.
- Desktop and phone screenshots were inspected for consistency with the existing green/teal task drawer and staff picker.

These are non-production tests and do not guarantee every network failure or simultaneous edit is impossible. No merge, deployment, production data/schema update, live account change or real email was performed. The live website remains on its deployed version while this PR stays unmerged.
