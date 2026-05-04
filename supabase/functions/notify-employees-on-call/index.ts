// Sends a Firebase Cloud Messaging push to every active device token of the
// company's employees when a new call is created.
//
// Auth model: This function is invoked by call-start (server-to-server) using
// the service role from the same project. We trust the calling environment.
//
// Required secret: FIREBASE_SERVICE_ACCOUNT_JSON  (entire JSON contents of a
// Firebase service account key file from Firebase console → Project Settings →
// Service accounts → Generate new private key). Without this secret, the
// function silently no-ops so call-start doesn't fail.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

// ---- Minimal JWT signer for Google OAuth (RS256) ----
function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const bin = atob(b64);
  const buf = new ArrayBuffer(bin.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i);
  return buf;
}
function b64url(input: ArrayBuffer | string): string {
  let s: string;
  if (typeof input === "string") s = btoa(input);
  else {
    let str = "";
    const bytes = new Uint8Array(input);
    for (let i = 0; i < bytes.byteLength; i++) str += String.fromCharCode(bytes[i]);
    s = btoa(str);
  }
  return s.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now, exp: now + 3600,
  }));
  const data = new TextEncoder().encode(`${header}.${payload}`);
  const key = await crypto.subtle.importKey(
    "pkcs8", pemToArrayBuffer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, data);
  const jwt = `${header}.${payload}.${b64url(sig)}`;

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const body = await resp.json();
  if (!resp.ok) throw new Error(`OAuth token failed: ${JSON.stringify(body)}`);
  return body.access_token as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { company_id, call_id, room_id, customer_name, language } = await req.json();
    if (!company_id || !call_id) {
      return new Response(JSON.stringify({ error: "company_id and call_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const saJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON");
    if (!saJson) {
      console.warn("FIREBASE_SERVICE_ACCOUNT_JSON not configured — skipping push");
      return new Response(JSON.stringify({ ok: true, skipped: "no_service_account" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: tokens } = await sb.from("device_tokens")
      .select("fcm_token, platform")
      .eq("company_id", company_id)
      .eq("is_active", true);

    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sa = JSON.parse(saJson) as ServiceAccount;
    const accessToken = await getAccessToken(sa);
    const fcmUrl = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;

    const title = "Incoming support call";
    const bodyText = `${customer_name || "A customer"} is on hold${language ? ` (${language})` : ""}`;

    let sent = 0;
    const results: Array<{ token: string; ok: boolean; err?: string }> = [];
    for (const t of tokens) {
      try {
        const r = await fetch(fcmUrl, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: {
              token: t.fcm_token,
              notification: { title, body: bodyText },
              data: {
                type: "incoming_call",
                call_id: String(call_id),
                room_id: String(room_id ?? ""),
                customer_name: String(customer_name ?? ""),
                language: String(language ?? ""),
              },
              android: {
                priority: "HIGH",
                notification: { sound: "default", channel_id: "incoming_calls" },
              },
              apns: {
                headers: { "apns-priority": "10" },
                payload: { aps: { sound: "default", "content-available": 1 } },
              },
            },
          }),
        });
        if (r.ok) { sent++; results.push({ token: t.fcm_token.slice(0, 12), ok: true }); }
        else {
          const err = await r.text();
          results.push({ token: t.fcm_token.slice(0, 12), ok: false, err: err.slice(0, 120) });
          // Auto-disable invalid tokens
          if (r.status === 404 || r.status === 400) {
            await sb.from("device_tokens").update({ is_active: false }).eq("fcm_token", t.fcm_token);
          }
        }
      } catch (e) {
        results.push({ token: t.fcm_token.slice(0, 12), ok: false, err: String(e).slice(0, 120) });
      }
    }

    return new Response(JSON.stringify({ ok: true, sent, total: tokens.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
