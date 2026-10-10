import "../deno.d.ts";

// Retired mock checkout. A stale opt-in flag must never grant unpaid membership.
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};
Deno.serve((req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers });
  return new Response(JSON.stringify({ error: "This checkout endpoint has been retired. Update the app to use secure payment checkout. Your membership has not changed." }), { status: 410, headers });
});
