import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Save, Sparkles, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type AISettings = {
  id: number;
  provider: "openai" | "lovable";
  api_key: string | null;
  reply_model: string;
  extract_model: string;
  use_env_fallback: boolean;
  lovable_reply_model: string;
  lovable_extract_model: string;
};

export default function OpenAISettingsPanel() {
  const { toast } = useToast();
  const [g, setG] = useState<AISettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from("openai_settings")
        .select("id,provider,api_key,reply_model,extract_model,use_env_fallback,lovable_reply_model,lovable_extract_model")
        .eq("id", 1)
        .maybeSingle();
      setG(
        (data as AISettings | null) ?? {
          id: 1,
          provider: "openai",
          api_key: "",
          reply_model: "gpt-4o-mini",
          extract_model: "gpt-4o-mini",
          use_env_fallback: true,
          lovable_reply_model: "google/gemini-2.5-flash",
          lovable_extract_model: "google/gemini-2.5-flash-lite",
        }
      );
    })();
  }, []);

  const save = async () => {
    if (!g) return;
    setSaving(true);
    const { error } = await (supabase as any)
      .from("openai_settings")
      .update({
        provider: g.provider,
        api_key: g.api_key?.trim() || null,
        reply_model: g.reply_model.trim() || "gpt-4o-mini",
        extract_model: g.extract_model.trim() || "gpt-4o-mini",
        lovable_reply_model: g.lovable_reply_model.trim() || "google/gemini-2.5-flash",
        lovable_extract_model: g.lovable_extract_model.trim() || "google/gemini-2.5-flash-lite",
        use_env_fallback: g.use_env_fallback,
      })
      .eq("id", 1);
    setSaving(false);
    if (error) toast({ title: "Save failed", description: error.message, variant: "destructive" });
    else toast({
      title: "AI settings saved",
      description: `Voice assistant will now use ${g.provider === "lovable" ? "Lovable AI" : "OpenAI"} on the next call.`
    });
  };

  if (!g) return <Loader2 className="h-5 w-5 animate-spin" />;

  const isLovable = g.provider === "lovable";

  return (
    <Card className="glass border-border/60 p-5 space-y-5 max-w-3xl">
      <div>
        <h3 className="font-semibold flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          Voice AI provider
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Switch the voice hold-assistant between <strong>OpenAI</strong> (your own key) and <strong>Lovable AI</strong> (built-in, no key needed) anytime — change takes effect on the next call.
        </p>
      </div>

      {/* Provider toggle */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setG({ ...g, provider: "openai" })}
          className={`rounded-lg border p-4 text-left transition-all ${
            !isLovable
              ? "border-primary bg-primary/5 ring-2 ring-primary/40"
              : "border-border/60 hover:border-border"
          }`}
        >
          <div className="flex items-center gap-2 font-semibold">
            <Sparkles className="h-4 w-4 text-primary" />
            OpenAI
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            Use your own OpenAI API key. Premium quality, you pay OpenAI directly.
          </p>
        </button>
        <button
          type="button"
          onClick={() => setG({ ...g, provider: "lovable" })}
          className={`rounded-lg border p-4 text-left transition-all ${
            isLovable
              ? "border-primary bg-primary/5 ring-2 ring-primary/40"
              : "border-border/60 hover:border-border"
          }`}
        >
          <div className="flex items-center gap-2 font-semibold">
            <Zap className="h-4 w-4 text-primary" />
            Lovable AI
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            Zero setup. Uses managed Lovable AI Gateway — billed via your Lovable workspace.
          </p>
        </button>
      </div>

      {/* OpenAI settings */}
      {!isLovable && (
        <div className="space-y-4 rounded-lg border border-border/60 p-4">
          <div className="space-y-2">
            <Label className="text-xs">OpenAI API Key</Label>
            <Input
              type="password"
              value={g.api_key ?? ""}
              onChange={(e) => setG({ ...g, api_key: e.target.value })}
              placeholder="sk-..."
              className="font-mono text-xs"
              autoComplete="new-password"
            />
            <p className="text-[11px] text-muted-foreground">
              Get a key from{" "}
              <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" className="text-primary underline">
                platform.openai.com/api-keys
              </a>. Stored encrypted, only admins can read it.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">Reply model</Label>
              <Input
                value={g.reply_model}
                onChange={(e) => setG({ ...g, reply_model: e.target.value })}
                placeholder="gpt-4o-mini"
                className="font-mono text-xs"
              />
              <p className="text-[11px] text-muted-foreground">Recommended: <code>gpt-4o-mini</code> (fast) or <code>gpt-4o</code> (premium).</p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Extraction model</Label>
              <Input
                value={g.extract_model}
                onChange={(e) => setG({ ...g, extract_model: e.target.value })}
                placeholder="gpt-4o-mini"
                className="font-mono text-xs"
              />
              <p className="text-[11px] text-muted-foreground">Recommended: <code>gpt-4o-mini</code>.</p>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
            <div>
              <div className="text-sm font-medium">Fallback to environment key</div>
              <div className="text-xs text-muted-foreground">
                If no key is saved here, use the <code>OPENAI_API_KEY</code> server environment variable.
              </div>
            </div>
            <Switch checked={g.use_env_fallback} onCheckedChange={(v) => setG({ ...g, use_env_fallback: v })} />
          </div>
        </div>
      )}

      {/* Lovable settings */}
      {isLovable && (
        <div className="space-y-4 rounded-lg border border-border/60 p-4">
          <p className="text-xs text-muted-foreground">
            Lovable AI is auto-authenticated via the managed <code>LOVABLE_API_KEY</code>. No key needed here. Pick the models below.
          </p>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">Reply model</Label>
              <Input
                value={g.lovable_reply_model}
                onChange={(e) => setG({ ...g, lovable_reply_model: e.target.value })}
                placeholder="google/gemini-2.5-flash"
                className="font-mono text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                Recommended: <code>google/gemini-2.5-flash</code> (fast) or <code>google/gemini-2.5-pro</code> (premium).
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Extraction model</Label>
              <Input
                value={g.lovable_extract_model}
                onChange={(e) => setG({ ...g, lovable_extract_model: e.target.value })}
                placeholder="google/gemini-2.5-flash-lite"
                className="font-mono text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                Recommended: <code>google/gemini-2.5-flash-lite</code> (cheapest, fastest).
              </p>
            </div>
          </div>
        </div>
      )}

      <Button onClick={save} disabled={saving} className="bg-gradient-primary text-primary-foreground">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-2" />Save AI settings</>}
      </Button>
    </Card>
  );
}
