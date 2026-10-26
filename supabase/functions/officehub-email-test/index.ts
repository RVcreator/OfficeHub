// Retired endpoint: no Graph imports, credentials, or sending capability.
Deno.serve(() => Response.json({error:'This temporary email test endpoint is retired'},{status:410}));
