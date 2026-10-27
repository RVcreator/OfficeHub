// Retired: a timestamp must never clear the password-change requirement.
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'};
Deno.serve((req:Request)=>req.method==='OPTIONS'?new Response('ok',{headers}):Response.json({error:'Please reload OfficeHub to finish changing your password.'},{status:410,headers}));
