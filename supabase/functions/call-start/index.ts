// Starts a call. Two paths:
//   A) Website widget — requires the page Origin to match the company's domain whitelist.
//   B) Mobile/desktop app — sends `x-app-key` header (per-company secret created in dashboard).
//      When a valid app key is provided, the domain check is bypassed (apps have no Origin).
// Returns room_id + customer_token. Real api_key is NEVER exposed to the customer.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-app-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "0.0.0.0";
}

function callerOrigin(req: Request, bodyOrigin?: string): string {
  const origin = req.headers.get("origin") || "";
  if (origin) return origin;
  const referer = req.headers.get("referer") || "";
  if (referer) {
    try { return new URL(referer).origin; } catch { /* */ }
  }
  return bodyOrigin || "";
}

function randomToken(len = 32): string {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(url, key);

    const body = await req.json().catch(() => ({}));
    const { slug, customer_name, customer_email, customer_phone, customer_issue, language, origin: bodyOrigin } = body;
    const appKey = req.headers.get("x-app-key") || body.app_key || "";

    if (!slug) {
      return new Response(JSON.stringify({ error: "slug required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: slugRow } = await sb.from("widget_slugs")
      .select("company_id, is_active").eq("slug", slug).maybeSingle();
    if (!slugRow?.is_active) {
      return new Response(JSON.stringify({ error: "Invalid link" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const companyId = slugRow.company_id;
    const ip = clientIp(req);
    const origin = callerOrigin(req, bodyOrigin);

    // ------- App key path (mobile/desktop SDK) -------
    let appAuthOk = false;
    if (appKey) {
      const { data: keyCompanyId } = await sb.rpc("verify_app_key", { _key: appKey });
      if (keyCompanyId && keyCompanyId === companyId) {
        appAuthOk = true;
        // best-effort last_used update
        sb.from("company_app_keys").update({ last_used_at: new Date().toISOString() })
          .eq("app_key", appKey).then(() => {});
      } else {
        return new Response(JSON.stringify({ error: "blocked", reason: "Invalid app integration key for this company." }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // IP block (abuse list)
    const { data: blocked } = await sb.from("blocked_ips")
      .select("id").eq("company_id", companyId).eq("ip_address", ip).maybeSingle();
    if (blocked) {
      return new Response(JSON.stringify({ error: "blocked", reason: "Your IP is blocked by this company." }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ------- Web path: enforce domain whitelist -------
    if (!appAuthOk) {
      const { data: originAllowed } = await sb.rpc("is_origin_allowed_for_company", {
        _company_id: companyId, _origin: origin,
      });
      if (originAllowed === false) {
        return new Response(JSON.stringify({
          error: "blocked",
          reason: `Calls from ${origin || "this site"} are not allowed by this company.`,
        }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Plan gating + atomic quota consume
    const { data: consumed } = await sb.rpc("consume_call_quota", { _company_id: companyId });
    if (!consumed) {
      return new Response(JSON.stringify({ error: "plan_inactive", reason: "This company has no active plan or has exhausted its calls." }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const roomId = randomToken(8);
    const { data: callRow, error: insErr } = await sb.from("calls").insert({
      company_id: companyId,
      room_id: roomId,
      customer_name: customer_name || null,
      customer_email: customer_email || null,
      customer_phone: customer_phone || null,
      customer_issue: customer_issue || null,
      customer_ip: ip,
      language: language || null,
      ai_handled: true,
      status: "waiting",
    }).select("id").single();
    if (insErr || !callRow) {
      return new Response(JSON.stringify({ error: "Failed to create call" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const customer_token = randomToken(24);
    const agent_token = randomToken(24);
    const { error: sessErr } = await sb.from("call_sessions").insert({
      call_id: callRow.id,
      customer_token,
      agent_token,
      expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    });
    if (sessErr) {
      console.error(sessErr);
    }

    // Fire-and-forget push to all employees of this company
    sb.functions.invoke("notify-employees-on-call", {
      body: {
        company_id: companyId,
        call_id: callRow.id,
        room_id: roomId,
        customer_name: customer_name || null,
        language: language || null,
      },
    }).catch((e) => console.error("notify failed:", e));

    return new Response(JSON.stringify({
      call_id: callRow.id,
      room_id: roomId,
      customer_token,
      ip,
      origin,
      via: appAuthOk ? "app" : "web",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
