import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Save, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type GeminiSettings = {
  id: number;
  api_key: string | null;
  reply_model: string;
  extract_model: string;
  use_env_fallback: boolean;
};

export default function GeminiSettingsPanel() {
  const { toast } = useToast();
  const [g, setG] = useState<GeminiSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("gemini_settings").select("*").eq("id", 1).maybeSingle();
      setG(
        (data as GeminiSettings | null) ?? {
          id: 1,
          api_key: "",
          reply_model: "gemini-2.0-flash",
          extract_model: "gemini-2.0-flash-lite",
          use_env_fallback: true,
        }
      );
    })();
  }, []);

  const save = async () => {
    if (!g) return;
    setSaving(true);
    const { error } = await supabase
      .from("gemini_settings")
      .update({
        api_key: g.api_key?.trim() || null,
        reply_model: g.reply_model.trim() || "gemini-2.0-flash",
        extract_model: g.extract_model.trim() || "gemini-2.0-flash-lite",
        use_env_fallback: g.use_env_fallback,
      })
      .eq("id", 1);
    setSaving(false);
    if (error) toast({ title: "Save failed", description: error.message, variant: "destructive" });
    else toast({ title: "Gemini settings saved", description: "AI hold-assistant will use the new key on next call." });
  };

  if (!g) return <Loader2 className="h-5 w-5 animate-spin" />;

  return (
    <Card className="glass border-border/60 p-5 space-y-4 max-w-3xl">
      <div>
        <h3 className="font-semibold flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          Gemini AI configuration
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          The voice hold-assistant uses Google Gemini directly. Paste your <strong>Gemini API key</strong> here — change it any time
          without redeploying. Get a key from{" "}
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-primary underline">
            Google AI Studio
          </a>.
        </p>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Gemini API Key</Label>
        <Input
          type="password"
          value={g.api_key ?? ""}
          onChange={(e) => setG({ ...g, api_key: e.target.value })}
          placeholder="AIzaSy..."
          className="font-mono text-xs"
          autoComplete="new-password"
        />
        <p className="text-[11px] text-muted-foreground">Stored encrypted at rest. Only admins can read or update.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-xs">Reply model (voice chat)</Label>
          <Input
            value={g.reply_model}
            onChange={(e) => setG({ ...g, reply_model: e.target.value })}
            placeholder="gemini-2.0-flash"
            className="font-mono text-xs"
          />
          <p className="text-[11px] text-muted-foreground">Recommended: <code>gemini-2.0-flash</code> (fast + accurate).</p>
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Extraction model (details)</Label>
          <Input
            value={g.extract_model}
            onChange={(e) => setG({ ...g, extract_model: e.target.value })}
            placeholder="gemini-2.0-flash-lite"
            className="font-mono text-xs"
          />
          <p className="text-[11px] text-muted-foreground">Recommended: <code>gemini-2.0-flash-lite</code> (cheap structured output).</p>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
        <div>
          <div className="text-sm font-medium">Fallback to environment key if DB key is empty</div>
          <div className="text-xs text-muted-foreground">
            When ON, if no API Key is saved here we use the <code>GEMINI_API_KEY</code> environment variable. Turn OFF to force only the DB key.
          </div>
        </div>
        <Switch checked={g.use_env_fallback} onCheckedChange={(v) => setG({ ...g, use_env_fallback: v })} />
      </div>

      <Button onClick={save} disabled={saving} className="bg-gradient-primary text-primary-foreground">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-2" />Save Gemini settings</>}
      </Button>
    </Card>
  );
}
