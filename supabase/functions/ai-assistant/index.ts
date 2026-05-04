// Zentord AI Hold Assistant — provider-switchable: OpenAI direct OR Lovable AI Gateway.
// Strict company-topic lock with conversational warmth, language-lock, and structured extraction.
// IMPORTANT: never leak provider/internal errors to the customer — always respond with a safe fallback reply.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Msg { role: "user" | "assistant"; content: string }

const OPENAI_BASE = "https://api.openai.com/v1";
const LOVABLE_BASE = "https://ai.gateway.lovable.dev/v1";

const DEFAULT_OPENAI_REPLY = "gpt-4o-mini";
const DEFAULT_OPENAI_EXTRACT = "gpt-4o-mini";
const DEFAULT_LOVABLE_REPLY = "google/gemini-2.5-flash";
const DEFAULT_LOVABLE_EXTRACT = "google/gemini-2.5-flash-lite";

type Provider = "openai" | "lovable";

interface AIConfig {
  provider: Provider;
  apiKey: string;
  base: string;
  replyModel: string;
  extractModel: string;
}

async function loadAIConfig(): Promise<AIConfig> {
  const envOpenAI = Deno.env.get("OPENAI_API_KEY") || "";
  const envLovable = Deno.env.get("LOVABLE_API_KEY") || "";

  let provider: Provider = "openai";
  let dbApiKey = "";
  let openaiReply = DEFAULT_OPENAI_REPLY;
  let openaiExtract = DEFAULT_OPENAI_EXTRACT;
  let lovableReply = DEFAULT_LOVABLE_REPLY;
  let lovableExtract = DEFAULT_LOVABLE_EXTRACT;
  let useEnvFallback = true;

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (SUPABASE_URL && SERVICE_KEY) {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/openai_settings?id=eq.1&select=api_key,reply_model,extract_model,use_env_fallback,provider,lovable_reply_model,lovable_extract_model`,
        { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
      );
      if (r.ok) {
        const rows = await r.json();
        const row = Array.isArray(rows) ? rows[0] : null;
        if (row) {
          provider = (row.provider === "lovable" ? "lovable" : "openai");
          dbApiKey = (row.api_key || "").trim();
          openaiReply = row.reply_model || DEFAULT_OPENAI_REPLY;
          openaiExtract = row.extract_model || DEFAULT_OPENAI_EXTRACT;
          lovableReply = row.lovable_reply_model || DEFAULT_LOVABLE_REPLY;
          lovableExtract = row.lovable_extract_model || DEFAULT_LOVABLE_EXTRACT;
          useEnvFallback = row.use_env_fallback !== false;
        }
      }
    }
  } catch (e) {
    console.warn("loadAIConfig db lookup failed:", e);
  }

  if (provider === "lovable") {
    // Lovable Gateway always uses LOVABLE_API_KEY env (managed). DB key is irrelevant here.
    return {
      provider,
      apiKey: envLovable,
      base: LOVABLE_BASE,
      replyModel: lovableReply,
      extractModel: lovableExtract,
    };
  }

  // OpenAI provider
  let apiKey = dbApiKey;
  if (!apiKey && useEnvFallback) apiKey = envOpenAI;
  return {
    provider,
    apiKey,
    base: OPENAI_BASE,
    replyModel: openaiReply,
    extractModel: openaiExtract,
  };
}

function buildSystemPrompt(opts: {
  companyName?: string;
  business?: string;
  languageName?: string;
  collected?: { name?: string; email?: string; phone?: string; issue?: string };
}) {
  const lang = opts.languageName || "the user's language";
  const c = opts.collected ?? {};
  const missing: string[] = [];
  if (!c.name) missing.push("name");
  if (!c.issue) missing.push("the reason / issue");
  if (!c.email && !c.phone) missing.push("email or phone");

  return `You are "Zentord" — an exceptionally warm, intelligent, human-sounding voice hold-assistant working for ${opts.companyName || "this company"}.
You are LIVE on a VOICE call with a real customer who is waiting for a human support agent to pick up.

YOUR IDENTITY:
- Always introduce yourself as "Zentord" (the assistant) — never reveal you are AI, never mention "OpenAI", "GPT", "Gemini", "Lovable", "language model", "bot", or "chatbot".
- You are the friendly bridge keeping the customer comfortable until the human agent joins.
- You ALWAYS work on behalf of ${opts.companyName || "this company"}.

ABOUT ${opts.companyName || "THE COMPANY"} (your ONLY allowed topic — your entire knowledge):
${opts.business || "(no description provided — keep responses generic and reassuring)"}

CORE BEHAVIOUR (apply on EVERY turn):
1. LISTEN deeply. Detect intent + emotion (frustrated, confused, neutral, happy).
2. ACKNOWLEDGE in one short clause ("Got it.", "I'm sorry to hear that.", "Totally understandable.").
3. STAY STRICTLY on ${opts.companyName || "company"} topics. If asked anything off-topic (weather, jokes, politics, other brands, coding, math), gently redirect: "I'm only able to help with ${opts.companyName || "our service"} here — would you like me to note your concern for the agent?"
4. NEVER invent prices, policies, dates, order numbers, or facts not present in the company description above. If unknown, say: "Our agent will confirm that exactly when they join."
5. Never mention competitors, never compare, never recommend other companies.
6. Empathy first when the user is upset. Then guide.

CONVERSATION GOALS (in order, one at a time):
A. Reassure: agent is coming very soon.
B. Naturally collect — ONE per turn: (1) name → (2) reason / issue → (3) contact (email OR phone).
C. Keep them engaged with relevant follow-ups based on the company description until the agent arrives.

Currently missing: ${missing.length ? missing.join(", ") : "nothing — keep the customer engaged with relevant company-related comfort until the agent arrives"}.
Already collected: ${JSON.stringify(c)}.

VOICE STYLE (this WILL be spoken aloud by TTS):
- Reply ONLY in ${lang}. Never switch language even if the customer mixes languages — stay locked in ${lang}.
- 1–2 short, natural sentences. ≤28 words total. Sound like a calm human, not a script.
- Exactly ONE question per reply (or zero if you're just reassuring).
- Use natural fillers sparingly ("Sure.", "Of course.", "No problem.").
- Plain text ONLY. No markdown, no emojis, no JSON, no stage directions, no asterisks.
- Never say "as an AI" or "I am a model". You are Zentord.`;
}

async function chatCompletion(opts: {
  cfg: AIConfig;
  model: string;
  system: string;
  messages: Msg[];
  temperature?: number;
  tools?: unknown[];
  tool_choice?: unknown;
}): Promise<{ text: string; toolArgs?: Record<string, unknown> }> {
  const body: Record<string, unknown> = {
    model: opts.model,
    temperature: opts.temperature ?? 0.6,
    messages: [
      { role: "system", content: opts.system },
      ...opts.messages.map((m) => ({ role: m.role, content: String(m.content ?? "").slice(0, 4000) })),
    ],
  };
  if (opts.tools) body.tools = opts.tools;
  if (opts.tool_choice) body.tool_choice = opts.tool_choice;

  const resp = await fetch(`${opts.cfg.base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.cfg.apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`AI ${resp.status}: ${t.slice(0, 400)}`);
  }
  const data = await resp.json();
  const message = data?.choices?.[0]?.message ?? {};
  const text = (message?.content ?? "").toString().trim();
  let toolArgs: Record<string, unknown> | undefined;
  const tc = message?.tool_calls?.[0];
  if (tc?.function?.arguments) {
    try { toolArgs = JSON.parse(tc.function.arguments); } catch { /* noop */ }
  }
  return { text, toolArgs };
}

async function extractDetails(cfg: AIConfig, transcript: string, prev: Record<string, string | undefined>) {
  try {
    const { toolArgs } = await chatCompletion({
      cfg,
      model: cfg.extractModel,
      system: `Extract customer support details. Preserve previous values when no new info is given. "issue" = concise 1-line English summary. Previous: ${JSON.stringify(prev)}.`,
      messages: [{ role: "user", content: transcript.slice(-3000) }],
      temperature: 0,
      tools: [{
        type: "function",
        function: {
          name: "extract_details",
          description: "Extract customer name, email, phone, and issue summary.",
          parameters: {
            type: "object",
            properties: {
              name:  { type: "string" },
              email: { type: "string" },
              phone: { type: "string" },
              issue: { type: "string" },
            },
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "extract_details" } },
    });
    const parsed = toolArgs ?? {};
    return {
      name:  (parsed.name  as string | undefined) ?? prev.name  ?? null,
      email: (parsed.email as string | undefined) ?? prev.email ?? null,
      phone: (parsed.phone as string | undefined) ?? prev.phone ?? null,
      issue: (parsed.issue as string | undefined) ?? prev.issue ?? null,
    };
  } catch (e) {
    console.warn("extractDetails failed:", e);
    return prev;
  }
}

function safeFallback(languageName: string): string {
  const l = (languageName || "").toLowerCase();
  if (l.includes("hindi")) return "एक पल रुकिए, हमारा एजेंट जल्द ही जुड़ेगा।";
  if (l.includes("bengal")) return "একটু অপেক্ষা করুন, আমাদের এজেন্ট শীঘ্রই যোগ দেবেন।";
  if (l.includes("tamil")) return "ஒரு நிமிடம், எங்கள் முகவர் விரைவில் இணைவார்.";
  if (l.includes("telugu")) return "ఒక్క క్షణం, మా ఏజెంట్ త్వరలో చేరతారు.";
  if (l.includes("marathi")) return "एक क्षण थांबा, आमचा एजंट लवकरच सामील होईल.";
  if (l.includes("spanish") || l.includes("español")) return "Un momento, nuestro agente se unirá enseguida.";
  if (l.includes("french") || l.includes("français")) return "Un instant, notre agent va vous rejoindre.";
  if (l.includes("arabic")) return "لحظة من فضلك، سينضم وكيلنا قريباً.";
  return "One moment please — our agent will join you very shortly.";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Parse body up-front so we can use languageName even on failure.
  let body: any = {};
  try { body = await req.json(); } catch { /* keep {} */ }

  const messages: Msg[] = Array.isArray(body?.messages) ? body.messages : [];
  const company = body?.company || {};
  const languageName = String(body?.languageName || "English");
  const collected = body?.collected || {};

  if (!messages.length) {
    // Even an empty request should never fail noisily.
    return new Response(JSON.stringify({ reply: safeFallback(languageName), extracted: collected }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const cfg = await loadAIConfig();

    if (!cfg.apiKey) {
      console.warn(`AI provider ${cfg.provider} has no API key configured.`);
      return new Response(JSON.stringify({ reply: safeFallback(languageName), extracted: collected }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const trimmed = messages.slice(-16);
    const systemPrompt = buildSystemPrompt({
      companyName: company?.name,
      business: company?.business_description,
      languageName,
      collected,
    });

    let reply = "";
    try {
      const { text } = await chatCompletion({
        cfg,
        model: cfg.replyModel,
        system: systemPrompt,
        messages: trimmed,
        temperature: 0.6,
      });
      reply = text;
    } catch (e) {
      console.error(`AI reply error (provider=${cfg.provider}):`, e);
    }

    if (!reply) reply = safeFallback(languageName);

    // Extraction is best-effort and never blocks the reply.
    let extracted = collected;
    try {
      const userText = trimmed.filter((m) => m.role === "user").map((m) => m.content).join("\n");
      if (userText) extracted = await extractDetails(cfg, userText, collected);
    } catch (e) {
      console.warn("extraction failed:", e);
    }

    return new Response(JSON.stringify({ reply, extracted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-assistant fatal:", e);
    // Always return 200 with a safe fallback so the customer never sees backend errors.
    return new Response(JSON.stringify({ reply: safeFallback(languageName), extracted: collected }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
