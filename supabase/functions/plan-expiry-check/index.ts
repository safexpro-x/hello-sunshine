// Marks expired subscriptions and queues reminders.
// 1. 3 days before expiry → "expiring soon" email (once)
// 2. On expiry → mark expired + queue "expired" email
// Idempotent: skips emails that already exist in email_outbox for this subscription.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const now = new Date();
    const in3days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();

    let warned = 0;
    let expired = 0;

    // EXPIRING SOON
    const { data: soon } = await sb.from("subscriptions")
      .select("id, company_id, plan_id, expires_at, plans(name), companies(name, contact_email)")
      .eq("status", "active")
      .gt("expires_at", now.toISOString())
      .lt("expires_at", in3days);

    for (const s of soon ?? []) {
      const co = (s as unknown as { companies?: { name: string; contact_email: string } | null }).companies;
      const pl = (s as unknown as { plans?: { name: string } | null }).plans;
      if (!co?.contact_email) continue;
      const subject = `Your ${pl?.name ?? "Zentord"} plan expires soon`;
      // skip if already queued/sent in last 24h for this sub
      const { data: existing } = await sb.from("email_outbox")
        .select("id").eq("to_email", co.contact_email).eq("subject", subject)
        .gte("created_at", new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString())
        .maybeSingle();
      if (existing) continue;
      await sb.from("email_outbox").insert({
        to_email: co.contact_email,
        subject,
        body: `Hi ${co.name},\n\nYour ${pl?.name ?? "current"} plan on Zentord will expire on ${new Date(s.expires_at).toDateString()}.\n\nRenew now to keep customer calls flowing:\nhttps://chat-bridge-aid.lovable.app/company/billing\n\n— Zentord`,
      });
      warned++;
    }

    // EXPIRED
    const { data: expiredSubs } = await sb.from("subscriptions")
      .select("id, company_id, plan_id, expires_at, plans(name), companies(name, contact_email)")
      .eq("status", "active")
      .lt("expires_at", now.toISOString());

    for (const s of expiredSubs ?? []) {
      await sb.from("subscriptions").update({ status: "expired" }).eq("id", s.id);
      const co = (s as unknown as { companies?: { name: string; contact_email: string } | null }).companies;
      const pl = (s as unknown as { plans?: { name: string } | null }).plans;
      if (!co?.contact_email) continue;
      const subject = `Your ${pl?.name ?? "Zentord"} plan has expired`;
      const { data: existing } = await sb.from("email_outbox")
        .select("id").eq("to_email", co.contact_email).eq("subject", subject)
        .gte("created_at", new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .maybeSingle();
      if (existing) { expired++; continue; }
      await sb.from("email_outbox").insert({
        to_email: co.contact_email,
        subject,
        body: `Hi ${co.name},\n\nYour ${pl?.name ?? "current"} plan on Zentord has expired and customer calls are paused.\n\nRenew now: https://chat-bridge-aid.lovable.app/company/billing\n\n— Zentord`,
      });
      expired++;
    }

    return new Response(JSON.stringify({ expiring_soon: warned, expired }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
