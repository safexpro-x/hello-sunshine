// Employee mobile app — login with email + password (Supabase auth) and
// return the access_token, refresh_token, profile, and company info needed
// to drive the employee dashboard inside a native app.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return new Response(JSON.stringify({ error: "email and password required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use anon client to perform password sign-in
    const anonSb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
    );
    const { data: signIn, error: signErr } = await anonSb.auth.signInWithPassword({ email, password });
    if (signErr || !signIn?.session || !signIn?.user) {
      return new Response(JSON.stringify({ error: signErr?.message || "Invalid credentials" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Look up employee row + company info using service role (bypass RLS)
    const adminSb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: emp } = await adminSb.from("employees")
      .select("id, company_id, display_name, role, is_active")
      .eq("user_id", signIn.user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (!emp) {
      return new Response(JSON.stringify({ error: "Not an active employee" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: company } = await adminSb.from("companies")
      .select("id, name").eq("id", emp.company_id).maybeSingle();

    return new Response(JSON.stringify({
      access_token: signIn.session.access_token,
      refresh_token: signIn.session.refresh_token,
      expires_at: signIn.session.expires_at,
      user: { id: signIn.user.id, email: signIn.user.email },
      employee: emp,
      company,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
