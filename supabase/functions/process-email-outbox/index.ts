// Drains pending rows from email_outbox using SMTP creds in smtp_settings.
// Supports both implicit SSL (port 465) and STARTTLS (port 587) via use_ssl flag.
// Runs from a database cron every minute.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

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
    const { data: smtp } = await sb.from("smtp_settings").select("*").eq("id", 1).maybeSingle();
    if (!smtp?.host || !smtp?.from_email) {
      // Graceful fallback: don't error out the cron; just leave rows pending so
      // they send the moment admin fills SMTP. Log once for observability.
      console.warn("[email-outbox] SMTP not configured — skipping cycle. Set Admin → SMTP to enable sending.");
      return new Response(JSON.stringify({ skipped: true, reason: "smtp_not_configured" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: jobs } = await sb.from("email_outbox")
      .select("*").eq("status", "pending").lt("attempts", 5).limit(20);

    if (!jobs || jobs.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const useSSL = !!smtp.use_ssl;
    const useSTARTTLS = !!smtp.use_tls;

    const client = new SMTPClient({
      connection: {
        hostname: smtp.host,
        port: smtp.port ?? 587,
        // Implicit TLS (SSL) when use_ssl=true (typical port 465).
        // Otherwise plain socket which upgrades via STARTTLS when use_tls=true.
        tls: useSSL,
        auth: smtp.username ? { username: smtp.username, password: smtp.password ?? "" } : undefined,
      },
      // denomailer auto-negotiates STARTTLS unless explicitly disabled
      pool: false,
    });

    let sent = 0;
    for (const j of jobs) {
      try {
        await client.send({
          from: `${smtp.from_name ?? "Zentord"} <${smtp.from_email}>`,
          to: j.to_email,
          subject: j.subject,
          content: j.body,
          html: `<div style="font-family:system-ui,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;white-space:pre-line;line-height:1.6">${
            j.body.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" style="color:#10b981">$1</a>')
          }</div>`,
        });
        await sb.from("email_outbox").update({
          status: "sent", sent_at: new Date().toISOString(), attempts: (j.attempts ?? 0) + 1,
        }).eq("id", j.id);
        sent++;
      } catch (e) {
        const attempts = (j.attempts ?? 0) + 1;
        await sb.from("email_outbox").update({
          attempts,
          last_error: String(e).slice(0, 1000),
          status: attempts >= 5 ? "failed" : "pending",
        }).eq("id", j.id);
      }
    }
    try { await client.close(); } catch { /* ignore */ }

    return new Response(JSON.stringify({ sent, total: jobs.length, useSSL, useSTARTTLS }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
