import "../deno.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Upgrades a user to Premium. profiles.subscription_plan can only be written
// by the service role (see supabase/migrations/20260813..._security_audit_fixes.sql
// — the client-side self-upgrade path was a real vulnerability and is now
// blocked by a trigger). This function is the one legitimate way to flip
// that column, running as the "billing system" identity the trigger expects.
//
// ⚠️ MOCK CHECKOUT: this does NOT charge anything. It checks the user has at
// least one payment method on file and then marks them Premium — there's no
// M-Pesa STK push or card charge wired in yet. Swap the block marked below
// for a real payment provider call (Daraja for M-Pesa, a card processor for
// cards) before this goes anywhere near production. Left this way
// deliberately rather than faking a "charged" state that never actually
// moved money.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PLANS = new Set(["premium", "premium_plus"]);

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

    const body = await req.json().catch(() => ({}));
    const plan = typeof body.plan === "string" ? body.plan : "premium";
    const billingCycle = body.billingCycle === "yearly" ? "yearly" : "monthly";

    if (!PLANS.has(plan)) {
      return new Response(JSON.stringify({ error: "Invalid plan" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Require a payment method on file — mirrors the existing compose-side UX
    // (Account.tsx sent people to add one first) but now actually enforced
    // server-side rather than just in the button's onClick handler.
    const { data: methods, error: methodsError } = await supabaseAdmin
      .from("payment_methods")
      .select("id")
      .eq("user_id", userId)
      .limit(1);

    if (methodsError) {
      console.error("payment_methods lookup failed:", methodsError);
      return new Response(JSON.stringify({ error: "Could not verify payment method" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!methods || methods.length === 0) {
      return new Response(JSON.stringify({ error: "Add a payment method before upgrading" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── MOCK CHECKOUT — replace with a real charge before going live ───────
    // e.g. `await chargeViaDaraja(...)` or `await chargeCard(...)`, and only
    // proceed to the profile update below once that call confirms success.
    // ──────────────────────────────────────────────────────────────────────

    const { error: updateError } = await supabaseAdmin
      .from("profiles")
      .update({ subscription_plan: plan })
      .eq("user_id", userId);

    if (updateError) {
      console.error("subscription_plan update failed:", updateError);
      return new Response(JSON.stringify({ error: "Upgrade failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, plan, billingCycle }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("upgrade-subscription error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});