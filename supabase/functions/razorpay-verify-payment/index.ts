// Verifies Razorpay signature and activates the company's subscription.
// Picks the correct secret (test vs live) based on the original payment record.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function hmacSha256Hex(key: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(data));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";

    const userSb = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userSb.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(url, serviceKey);
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = await req.json();
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return new Response(JSON.stringify({ error: "Missing fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: payment } = await sb.from("payments")
      .select("*").eq("razorpay_order_id", razorpay_order_id).maybeSingle();
    if (!payment) {
      return new Response(JSON.stringify({ error: "Order not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: rp } = await sb.from("razorpay_settings").select("*").eq("id", 1).maybeSingle();
    const secret = payment.is_test ? rp?.test_key_secret : rp?.key_secret;
    if (!secret) {
      return new Response(JSON.stringify({ error: "Razorpay not configured" }), {
        status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const expected = await hmacSha256Hex(secret, `${razorpay_order_id}|${razorpay_payment_id}`);
    if (expected !== razorpay_signature) {
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify caller owns the company on the payment
    const { data: company } = await sb.from("companies").select("id").eq("owner_id", user.id).maybeSingle();
    if (!company || company.id !== payment.company_id) {
      return new Response(JSON.stringify({ error: "Not your payment" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await sb.from("payments").update({
      razorpay_payment_id, razorpay_signature, status: "paid", paid_at: new Date().toISOString(),
    }).eq("id", payment.id);

    const { data: subId, error: subErr } = await sb.rpc("activate_subscription_for_payment", { _payment_id: payment.id });
    if (subErr) {
      console.error(subErr);
      return new Response(JSON.stringify({ error: "Activation failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Queue payment success email
    try {
      const { data: co } = await sb.from("companies").select("name, contact_email").eq("id", payment.company_id).maybeSingle();
      const { data: pl } = await sb.from("plans").select("name, validity_days").eq("id", payment.plan_id).maybeSingle();
      if (co?.contact_email) {
        const amount = (payment.amount_paise / 100).toFixed(0);
        await sb.from("email_outbox").insert({
          to_email: co.contact_email,
          subject: `Payment received — ${pl?.name ?? "Plan"} activated`,
          body: `Hi ${co.name},\n\nWe've received your payment of ₹${amount}${payment.is_test ? " (TEST)" : ""} for the ${pl?.name ?? "plan"}.\n\nYour plan is now active for ${pl?.validity_days ?? 30} days. You can manage it any time from your billing dashboard:\nhttps://chat-bridge-aid.lovable.app/company/billing\n\n— Zentord`,
        });
      }
    } catch (e) { console.error("email enqueue failed", e); }

    return new Response(JSON.stringify({ success: true, subscription_id: subId, test_mode: payment.is_test }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
