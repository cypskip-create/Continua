// Retired identity routes never contact any former provider.
export async function session(request){if(!new URL(request.url).pathname.startsWith('/api/session/'))return null;return Response.json({error:'This sign-in route has been retired. Reload Continua.',code:'IDENTITY_MIGRATED'},{status:410,headers:{'Cache-Control':'private, no-store'}});}
