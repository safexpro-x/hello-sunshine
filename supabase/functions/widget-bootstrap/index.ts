// Resolves a public widget slug -> safe company info (NEVER returns api_key).
// Also reports plan/origin-block state so the widget can decide what to do.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "0.0.0.0";
}

function callerOrigin(req: Request, bodyOrigin?: string): string {
  // Prefer browser-supplied Origin / Referer (cannot be forged from real browser
  // tabs because of the same-origin policy). bodyOrigin is a hint only.
  const origin = req.headers.get("origin") || "";
  if (origin) return origin;
  const referer = req.headers.get("referer") || "";
  if (referer) {
    try { return new URL(referer).origin; } catch { /* */ }
  }
  return bodyOrigin || "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(url, key);

    const body = await req.json().catch(() => ({}));
    const { slug, origin: bodyOrigin } = body || {};
    if (!slug || typeof slug !== "string") {
      return new Response(JSON.stringify({ error: "slug required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: slugRow } = await sb.from("widget_slugs")
      .select("company_id, is_active").eq("slug", slug).maybeSingle();

    if (!slugRow || !slugRow.is_active) {
      return new Response(JSON.stringify({ error: "Invalid widget link" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: company } = await sb.from("companies")
      .select("id,name,website,business_description,status")
      .eq("id", slugRow.company_id).maybeSingle();

    if (!company || company.status !== "approved") {
      return new Response(JSON.stringify({ error: "Company not available" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ip = clientIp(req);
    const origin = callerOrigin(req, bodyOrigin);

    // IP block check (still supported for abuse blocking)
    const { data: blocked } = await sb.from("blocked_ips")
      .select("id").eq("company_id", company.id).eq("ip_address", ip).maybeSingle();

    // Domain/origin whitelist check
    const { data: originAllowed } = await sb.rpc("is_origin_allowed_for_company", {
      _company_id: company.id, _origin: origin,
    });

    // Plan check
    const { data: canCall } = await sb.rpc("can_company_make_call", { _company_id: company.id });

    return new Response(JSON.stringify({
      company: {
        id: company.id,
        name: company.name,
        website: company.website,
        business_description: company.business_description,
      },
      ip,
      origin,
      blocked: !!blocked,
      originAllowed: originAllowed !== false,
      canCall: !!canCall,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
