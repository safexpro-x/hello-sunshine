// Firebase Auth → Lovable Cloud bridge.
// Verifies a Firebase ID token using Google's public JWKS, then creates (or
// finds) a matching Lovable Cloud user and returns a one-time email OTP the
// frontend exchanges via supabase.auth.verifyOtp() for a real session.
//
// Project ID is read from the `firebase_settings` table (admin-managed).
// Falls back to the FIREBASE_PROJECT_ID env var.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { jwtVerify, createRemoteJWKSet } from "https://esm.sh/jose@5.9.6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"),
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: cfg } = await sb.from("firebase_settings").select("project_id, is_enabled").eq("id", 1).maybeSingle();
    const projectId = cfg?.project_id || Deno.env.get("FIREBASE_PROJECT_ID");
    if (!projectId) {
      return json({ error: "Firebase project not configured. Ask the admin to set it in Admin → Firebase." }, 500);
    }
    if (cfg && cfg.is_enabled === false) {
      return json({ error: "Firebase Google sign-in is currently disabled by the admin." }, 503);
    }

    const { idToken } = await req.json().catch(() => ({}));
    if (!idToken || typeof idToken !== "string") {
      return json({ error: "idToken required" }, 400);
    }

    // 1) Verify Firebase ID token signature + iss + aud
    const { payload } = await jwtVerify(idToken, JWKS, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
    });

    const firebaseUid = String(payload.sub || "");
    const email = String(payload.email || "").toLowerCase();
    const emailVerified = payload.email_verified === true;
    const displayName = (payload.name as string) || email.split("@")[0];

    if (!firebaseUid || !email) return json({ error: "Token missing uid or email" }, 401);
    if (!emailVerified) return json({ error: "Email not verified by Google" }, 401);

    // 2) Look up or create the mapping
    const { data: existingMap } = await sb
      .from("firebase_user_map")
      .select("user_id")
      .eq("firebase_uid", firebaseUid)
      .maybeSingle();

    let userId: string | null = existingMap?.user_id ?? null;

    if (!userId) {
      const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
      const found = list?.users?.find((u) => (u.email || "").toLowerCase() === email);
      if (found) {
        userId = found.id;
      } else {
        const randomPw = crypto.randomUUID() + crypto.randomUUID();
        const { data: created, error: cErr } = await sb.auth.admin.createUser({
          email,
          password: randomPw,
          email_confirm: true,
          user_metadata: { display_name: displayName, firebase_uid: firebaseUid },
        });
        if (cErr || !created.user) return json({ error: "Failed to create user", detail: cErr?.message }, 500);
        userId = created.user.id;
      }

      await sb.from("firebase_user_map").insert({
        firebase_uid: firebaseUid,
        user_id: userId,
        email,
      });
    }

    // 3) Issue a one-time email OTP for verifyOtp() on the client
    const origin = req.headers.get("origin") || Deno.env.get("SITE_URL") || "";
    const { data: linkData, error: linkErr } = await sb.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: origin || undefined },
    });
    if (linkErr || !linkData) return json({ error: "Failed to generate session", detail: linkErr?.message }, 500);

    const props = linkData.properties as { hashed_token?: string; email_otp?: string };
    return json({
      ok: true,
      email,
      user_id: userId,
      hashed_token: props.hashed_token,
      email_otp: props.email_otp,
    });
  } catch (e) {
    console.error("firebase-bridge error", e);
    return json({ error: "Invalid Firebase token", detail: String(e) }, 401);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
