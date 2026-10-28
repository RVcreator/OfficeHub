# Isolated authentication browser checks

Run `node tests/auth-browser/check.cjs` with Playwright available. Set `OFFICEHUB_PLAYWRIGHT_MODULE` to a module path and `OFFICEHUB_BROWSER_EXECUTABLE` to Chrome if the default Playwright installation is unavailable.

The fixture compiles the actual App, LoginScreen, ForcedPasswordChangeScreen and Supabase client helpers. Only the SDK, store adapter and unrelated views are replaced. External network requests are blocked; it cannot change real accounts. The normal node tests separately exercise the actual store and password handlers.

Checks: stale login claims still require first-login change; confirmed completion enters the portal; an untrusted realtime payload cannot change the requirement; a reset during an active session reopens the gate; failed completion cannot enter the portal. Output and screenshots are written under ignored `.auth-qa/`.
