// Returns the current waiting+active call queue for the authenticated employee's company.
// Auth: pass Authorization: Bearer <access_token> obtained from /employee-login.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

    const { data: calls } = await adminSb.from("calls")
      .select("id, room_id, customer_name, customer_issue, language, status, started_at, picked_at, employee_id")
      .eq("company_id", emp.company_id)
      .in("status", ["waiting", "active"])
      .order("started_at", { ascending: true })
      .limit(50);

    return new Response(JSON.stringify({ employee_id: emp.id, calls: calls ?? [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
