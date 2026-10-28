# Responsive layout checks

These checks render the actual OfficeHub header, sidebar and views using synthetic staff and work records. They do not sign into Supabase, change accounts, create records or send messages. External browser requests are blocked. This fixture is separate from the production entry point and is not included in the normal Vite build.

Run from the repository root with Node and Playwright available:

```
node tests/responsive/check.cjs
```

Install Playwright in the development environment first if needed (`npm install --no-save playwright` and `npx playwright install chromium`). Alternatively set `OFFICEHUB_PLAYWRIGHT_MODULE` to an existing Playwright module and `OFFICEHUB_BROWSER_EXECUTABLE` to a local Chromium browser executable. These are test environment settings, not application secrets.

The runner builds an isolated fixture and saves screenshots plus results under `.responsive-qa/` (ignored by Git). It checks:

- Dashboard, populated tasks, calendar, documents, projects and messages at widths 320, 390, 640, 768, 1024, 1280 and 1440.
- Staff, notices, approvals, departments, roles, My Day, analytics and users at 320, 768 and 1440.
- New-record and settings dialogs at every width, plus 320×568 and 844×390.
- Page overflow, dialog bounds, non-overlapping settings tabs, contained calendar scrolling, notification menu bounds, and navigation Escape/focus restoration.

Screenshots still need human review: page overflow alone cannot detect cramped text or clipped content. Tests use synthetic records and Chromium, so they do not replace a check in the released app with real data or a device-specific Safari/Firefox check.
