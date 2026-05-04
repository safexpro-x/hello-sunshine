// Public signup endpoint — collects name/email/phone/password,
// stores a pending verification token, and sends a verification email
// via the admin-configured SMTP. The Supabase user is NOT created until
// the link is clicked (see verify-email).
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

async function hashPassword(pw: string): Promise<string> {
  // PBKDF2-SHA256, 200k iterations, 16-byte salt
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 200_000, hash: "SHA-256" },
    key, 256,
  );
  const buf = new Uint8Array(bits);
  const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
  return `pbkdf2$200000$${b64(salt)}$${b64(buf)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const name = String(body.name ?? "").trim();
    const phone = String(body.phone ?? "").trim();
    const origin = String(body.origin ?? "");

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ error: "Invalid email" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (password.length < 8) {
      return new Response(JSON.stringify({ error: "Password must be at least 8 characters" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!name || name.length > 100) {
      return new Response(JSON.stringify({ error: "Name required (max 100 chars)" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!phone || phone.length < 6 || phone.length > 20 || !/^[+0-9 ()-]+$/.test(phone)) {
      return new Response(JSON.stringify({ error: "Valid phone required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Check if a Supabase user already exists for this email
    const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existing = list?.users?.find((u) => (u.email || "").toLowerCase() === email);
    if (existing) {
      return new Response(JSON.stringify({ error: "An account with this email already exists. Please sign in." }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Bypass email verification for the platform admin account
    if (email === "admin@gmail.com") {
      const { data: created, error: cErr } = await sb.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: name, phone, email_verified: "true" },
      });
      if (cErr || !created?.user) {
        return new Response(JSON.stringify({ error: cErr?.message || "Failed to create admin" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      await sb.from("user_roles").insert({ user_id: created.user.id, role: "admin" });
      return new Response(JSON.stringify({ ok: true, message: "Admin account created. You can sign in now.", auto_verified: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = randomToken(32);
    const password_hash = await hashPassword(password);
    await sb.from("email_verifications").insert({
      token, email, display_name: name, phone, password_hash,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });

    const baseUrl = (typeof origin === "string" && origin.startsWith("http")) ? origin : "";
    const verifyLink = `${baseUrl}/verify-email?token=${encodeURIComponent(token)}`;

    // Get site name (fallback Zentord)
    const { data: site } = await sb.from("site_content").select("site_title").eq("id", 1).maybeSingle();
    const siteName = (site?.site_title || "Zentord").split("—")[0].trim();

    // Queue email (sent by process-email-outbox via admin SMTP)
    await sb.from("email_outbox").insert({
      to_email: email,
      subject: `Verify your ${siteName} account`,
      body:
`Hi ${name},

Welcome to ${siteName}! Please verify your email address by clicking the link below (valid for 24 hours):

${verifyLink}

If you didn't sign up, you can safely ignore this email.

— The ${siteName} Team`,
    });

    return new Response(JSON.stringify({ ok: true, message: "Verification email sent." }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("signup-request error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
