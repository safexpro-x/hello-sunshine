// Validates a signup verification token, creates the Supabase auth user
// with the originally-provided password & metadata, and returns a
// short-lived email OTP the client uses to sign the user in immediately.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  // format: pbkdf2$<iters>$<saltB64>$<hashB64>
  try {
    const [scheme, itersStr, saltB64, hashB64] = stored.split("$");
    if (scheme !== "pbkdf2") return false;
    const iters = parseInt(itersStr);
    const salt = b64decode(saltB64);
    const expected = b64decode(hashB64);
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations: iters, hash: "SHA-256" }, key, expected.length * 8,
    );
    const got = new Uint8Array(bits);
    if (got.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < got.length; i++) diff |= got[i] ^ expected[i];
    return diff === 0;
  } catch { return false; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    const token = String(body.token ?? "");
    if (!token || token.length < 16) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: row } = await sb.from("email_verifications").select("*").eq("token", token).maybeSingle();
    if (!row) {
      return new Response(JSON.stringify({ error: "Token not found or already used" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (row.consumed_at) {
      return new Response(JSON.stringify({ error: "This verification link has already been used. Please sign in." }), {
        status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return new Response(JSON.stringify({ error: "Verification link has expired. Please sign up again." }), {
        status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const password = String(body.password ?? "");
    if (!password) {
      // First call from verify page — just confirm token is valid
      return new Response(JSON.stringify({ ok: true, email: row.email, needsPassword: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ok = await verifyPassword(password, row.password_hash);
    if (!ok) {
      return new Response(JSON.stringify({ error: "Password does not match the one used at signup." }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create the auth user (email auto-confirmed because we own verification)
    const { data: created, error: cErr } = await sb.auth.admin.createUser({
      email: row.email,
      password,
      email_confirm: true,
      user_metadata: {
        display_name: row.display_name,
        phone: row.phone,
        email_verified: "true",
      },
    });
    if (cErr || !created?.user) {
      return new Response(JSON.stringify({ error: cErr?.message ?? "Could not create account" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await sb.from("email_verifications").update({ consumed_at: new Date().toISOString() }).eq("id", row.id);

    return new Response(JSON.stringify({ ok: true, email: row.email }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("verify-email error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
