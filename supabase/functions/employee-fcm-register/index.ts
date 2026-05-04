// Register / refresh the device's FCM push token for the logged-in employee.
// Body: { fcm_token: string, platform: "android" | "ios" | "web" }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (!token) {
      return new Response(JSON.stringify({ error: "Missing token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { fcm_token, platform = "android" } = await req.json();
    if (!fcm_token || typeof fcm_token !== "string" || fcm_token.length < 16) {
      return new Response(JSON.stringify({ error: "fcm_token required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userSb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );
    const { data: u } = await userSb.auth.getUser();
    if (!u?.user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminSb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: emp } = await adminSb.from("employees")
      .select("id, company_id").eq("user_id", u.user.id).eq("is_active", true).maybeSingle();
    if (!emp) {
      return new Response(JSON.stringify({ error: "Not an employee" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Upsert by (user_id, fcm_token); reactivate if previously revoked.
    const { error } = await adminSb.from("device_tokens").upsert({
      user_id: u.user.id,
      company_id: emp.company_id,
      fcm_token,
      platform,
      is_active: true,
      last_seen_at: new Date().toISOString(),
    }, { onConflict: "user_id,fcm_token" });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
