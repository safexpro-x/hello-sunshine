// Returns the PUBLIC Firebase Web SDK config so the browser can initialise
// Firebase. Firebase Web API keys are public by design — real security comes
// from Firebase "Authorized Domains" + the firebase-bridge edge function
// which verifies the ID token.
//
// Reads first from the `firebase_settings` table (admin-managed). Falls back
// to FIREBASE_* environment variables for first-boot.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data } = await sb.from("firebase_settings").select("*").eq("id", 1).maybeSingle();

    const project_id = data?.project_id || Deno.env.get("FIREBASE_PROJECT_ID") || "";
    const api_key = data?.web_api_key || Deno.env.get("FIREBASE_WEB_API_KEY") || "";
    const auth_domain =
      data?.auth_domain ||
      Deno.env.get("FIREBASE_AUTH_DOMAIN") ||
      (project_id ? `${project_id}.firebaseapp.com` : "");
    const app_id = data?.app_id || Deno.env.get("FIREBASE_APP_ID") || "";
    const enabled = !!(data?.is_enabled && project_id && api_key && app_id);

    return new Response(
      JSON.stringify({
        enabled,
        project_id,
        api_key,
        auth_domain,
        app_id,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ enabled: false, error: String(e) }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
