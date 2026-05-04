// Sends a password reset email via the admin-configured SMTP (queued through email_outbox).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function randomToken(len = 32): string {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { email, origin } = await req.json().catch(() => ({}));
    if (!email || typeof email !== "string") {
      return new Response(JSON.stringify({ error: "email required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const cleanEmail = email.trim().toLowerCase();
    const token = randomToken(32);
    await sb.from("password_reset_tokens").insert({
      email: cleanEmail,
      token,
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });

    const baseUrl = (typeof origin === "string" && origin.startsWith("http")) ? origin : "";
    const resetLink = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;

    const { data: site } = await sb.from("site_content").select("site_title").eq("id", 1).maybeSingle();
    const siteName = (site?.site_title || "Zentord").split("—")[0].trim();

    await sb.from("email_outbox").insert({
      to_email: cleanEmail,
      subject: `Reset your ${siteName} password`,
      body:
`Hi,

We received a request to reset your ${siteName} password.

Click this link (valid for 1 hour):
${resetLink}

If you didn't request this, you can safely ignore this email.

— The ${siteName} Team`,
    });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("password-reset-request error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
