import "../deno.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Permanently deletes a Continua account. This is the ONLY real deletion
// path in the app — the client can never do this itself, since it needs to
// (a) remove rows across every user-data table under the service role, most
// of which don't have RLS DELETE policies broad enough for a full wipe, and
// (b) call auth.admin.deleteUser, which requires the service-role key and
// is never safe to hold on the client.
//
// There is no soft-delete/undo here on purpose — Cyprian asked for this to
// actually delete the account, not flag it for later cleanup. The person
// confirms intent in the UI (typing their handle/DELETE) before this is
// ever called.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized - missing or invalid authorization header" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized - invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub;
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized - no user ID in token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Child/leaf tables first, then content the person authored, then
    // relationships, then preferences, then the profile itself. Most
    // "child of a post/comment" rows would cascade automatically once the
    // parent post/comment is deleted below, but we delete every table by
    // its own owner column too so rows this person left on OTHER people's
    // posts/comments (a like, a reaction, a report) are also cleaned up —
    // those would never cascade from this person's own posts.
    const deletions: Array<{ table: string; column: string; value: string }> = [
      { table: "comment_likes", column: "user_id", value: userId },
      { table: "comment_reactions", column: "user_id", value: userId },
      { table: "comment_reposts", column: "user_id", value: userId },
      { table: "post_likes", column: "user_id", value: userId },
      { table: "post_reactions", column: "user_id", value: userId },
      { table: "post_reposts", column: "user_id", value: userId },
      { table: "post_bookmarks", column: "user_id", value: userId },
      { table: "hidden_posts", column: "user_id", value: userId },
      { table: "post_reports", column: "reporter_id", value: userId },
      { table: "post_comments", column: "user_id", value: userId },
      { table: "posts", column: "user_id", value: userId },
      { table: "user_follows", column: "follower_id", value: userId },
      { table: "user_follows", column: "following_id", value: userId },
      { table: "notifications", column: "user_id", value: userId },
      { table: "notifications", column: "actor_id", value: userId },
      { table: "price_alerts", column: "user_id", value: userId },
      { table: "payment_methods", column: "user_id", value: userId },
      { table: "watchlists", column: "user_id", value: userId },
      { table: "watchlist_folders", column: "user_id", value: userId },
      { table: "portfolios", column: "user_id", value: userId },
      { table: "muted_keywords", column: "user_id", value: userId },
      { table: "muted_users", column: "muter_id", value: userId },
      { table: "muted_users", column: "muted_id", value: userId },
      { table: "blocked_users", column: "blocker_id", value: userId },
      { table: "blocked_users", column: "blocked_id", value: userId },
      { table: "user_preferences", column: "user_id", value: userId },
    ];

    for (const { table, column, value } of deletions) {
      const { error } = await supabaseAdmin.from(table).delete().eq(column, value);
      if (error) {
        // Keep going -- a missing/renamed table shouldn't block the rest of
        // the wipe, but log it so it's visible in the function's logs.
        console.error(`delete-account: failed to clear ${table}.${column}`, error.message);
      }
    }

    // Avatar files live at `${userId}/...` inside the public avatars bucket.
    const { data: files } = await supabaseAdmin.storage.from("avatars").list(userId);
    if (files && files.length > 0) {
      await supabaseAdmin.storage.from("avatars").remove(files.map(f => `${userId}/${f.name}`));
    }

    const { error: profileError } = await supabaseAdmin.from("profiles").delete().eq("user_id", userId);
    if (profileError) {
      console.error("delete-account: failed to delete profile row", profileError.message);
    }

    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (authDeleteError) {
      console.error("delete-account: auth.admin.deleteUser failed", authDeleteError.message);
      return new Response(JSON.stringify({ error: "Your data was cleared but the account itself couldn't be removed. Contact support@continua.app." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("delete-account error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});