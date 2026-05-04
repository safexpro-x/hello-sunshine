// Creates a Razorpay order for a plan. Authenticated company owner only.
// Razorpay key id/secret read from `razorpay_settings` table (admin-managed).
// Supports test_mode toggle: uses test_key_id/secret when admin enables test mode.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";

    const userSb = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userErr } = await userSb.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(url, serviceKey);
    const { plan_id } = await req.json();
    if (!plan_id) {
      return new Response(JSON.stringify({ error: "plan_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: company } = await sb.from("companies").select("id,name,contact_email,status").eq("owner_id", user.id).maybeSingle();
    if (!company || company.status !== "approved") {
      return new Response(JSON.stringify({ error: "Company not approved" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: plan } = await sb.from("plans").select("*").eq("id", plan_id).maybeSingle();
    if (!plan || !plan.is_active) {
      return new Response(JSON.stringify({ error: "Plan unavailable" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Free / trial plans cannot be purchased via Razorpay — auto-granted on approval
    if (plan.price_paise <= 0 || plan.code === "free_trial") {
      return new Response(JSON.stringify({ error: "Free trial cannot be purchased. It is granted automatically on approval." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: rp } = await sb.from("razorpay_settings").select("*").eq("id", 1).maybeSingle();
    const isTest = !!rp?.test_mode;
    const keyId = isTest ? rp?.test_key_id : rp?.key_id;
    const keySecret = isTest ? rp?.test_key_secret : rp?.key_secret;

    if (!keyId || !keySecret) {
      return new Response(JSON.stringify({
        error: isTest
          ? "Razorpay TEST keys not configured by admin yet."
          : "Razorpay LIVE keys not configured by admin yet."
      }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const orderResp = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(`${keyId}:${keySecret}`),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: plan.price_paise,
        currency: "INR",
        receipt: `vox_${company.id.slice(0, 8)}_${Date.now()}`,
        notes: { company_id: company.id, plan_id: plan.id, plan_code: plan.code, mode: isTest ? "test" : "live" },
      }),
    });
    const orderData = await orderResp.json();
    if (!orderResp.ok) {
      console.error("razorpay order error", orderData);
      return new Response(JSON.stringify({ error: "Razorpay order failed", details: orderData }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await sb.from("payments").insert({
      company_id: company.id,
      plan_id: plan.id,
      razorpay_order_id: orderData.id,
      amount_paise: plan.price_paise,
      currency: "INR",
      status: "created",
      is_test: isTest,
    });

    return new Response(JSON.stringify({
      order_id: orderData.id,
      amount: plan.price_paise,
      currency: "INR",
      key_id: keyId,
      plan_name: plan.name,
      company_name: company.name,
      contact_email: company.contact_email,
      test_mode: isTest,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
