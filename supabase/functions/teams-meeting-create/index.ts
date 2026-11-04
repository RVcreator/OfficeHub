// Retire arbitrary calendar creation and fabricated fallback links.
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'};
Deno.serve(req=>req.method==='OPTIONS'?new Response('ok',{headers:cors}):Response.json({error:'Refresh OfficeHub to create a Microsoft-synced meeting.'},{status:410,headers:cors}));
