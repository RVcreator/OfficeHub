# OfficeHub

OfficeHub is an internal work portal built for **WIPAHS**, an organisation with teams working across multiple departments and organisations. It brings everyday work into one place: who is doing what, what needs a decision, and what is coming up next.

The portal was revamped around staff feedback, with a clearer layout, more connected workflows and Microsoft 365 integration.

## Try the guest demo

**[Explore OfficeHub →](https://officehub.wipahs.org/demo/)**

| Demo sign-in | Details |
| --- | --- |
| Email | `guest@officehub.example.invalid` |
| Password | `ExploreOfficeHub!` |

These are public, **demo-only** details. They open a standalone feature walkthrough with fictional people and records, not a staff account. Sample task, rating, RSVP, approval and acknowledgement actions reset on refresh. Microsoft actions and emails are simulated; the demo does not connect to organisation records or live services.

The **[staff portal](https://officehub.wipahs.org/)** requires an authorised account. The guest details work only at the demo link above.

## What it does

- **Tasks and subtasks:** assign or delegate work, set priorities and deadlines, add comments and attachments, and follow progress. Any assignee can complete a shared task; its creator can rate the completed work.
- **Projects:** bring linked tasks, milestones, budgets, expenses, impact and activity together.
- **Meetings and calendars:** schedule sessions, manage invitations, accept or decline, propose another time, and keep agendas and minutes. Ended meetings close to responses, stay dormant for 48 hours, then move to the personal archive.
- **Microsoft 365:** connect Teams conferencing with SharePoint document storage and sharing, including recipient file permissions. Microsoft Graph delivers notification emails from the configured organisation mailbox.
- **Private collaboration:** direct and group chats, targeted notices, acknowledgements, approvals and recorded decisions. Access follows conversation membership, participants and assigned permissions.
- **Notifications and summaries:** relevant in-app alerts and emails, plus weekly Monday and monthly first-day summaries of tasks, meetings and projects.
- **People and administration:** staff and department directories, organisation grouping, presence, account management, roles, permissions and audit history.
- **Personal archives:** find completed work and older meetings while keeping active views focused. Responsive layouts support desktop, tablet and mobile screens.

## How it was built

The application uses **React, TypeScript and Vite**, with **Tailwind CSS** for styling and **Lucide** icons. Screens load on demand, and scoped store subscriptions and coordinated refreshes help limit unnecessary rendering and data requests.

**Supabase** provides authentication, PostgreSQL, realtime updates and server-side Edge Functions. Database policies and protected server operations enforce access; notification emails run through an outbox with deduplication and retries. Microsoft integrations run through server-side services, keeping service credentials out of the browser.

## Local development

```sh
bun install --frozen-lockfile
npm run dev
```

Use a separate development Supabase project. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in an uncommitted `.env.local` file to override the staff portal defaults. Only the public client key belongs in the frontend; keep server credentials in the backend secret store. The demo can be viewed at `/demo/` without a backend.

```sh
npm run lint
node --import tsx --test tests/*.test.ts
npm run build
```

