// Per-company app integration keys.
// These are SECRETS used by mobile/desktop SDK integrations to bypass the
// domain whitelist (apps don't have an Origin header). Each row can be
// labelled (e.g. "iOS prod"), revoked, or regenerated.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { KeyRound, Plus, Trash2, Loader2, Copy, Check, Power, PowerOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type KeyRow = {
  id: string; label: string; app_key: string; is_active: boolean;
  last_used_at: string | null; created_at: string;
};

export default function AppKeysPanel({ companyId }: { companyId: string }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<KeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [reveal, setReveal] = useState<Record<string, boolean>>({});

  const refresh = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("company_app_keys")
      .select("id, label, app_key, is_active, last_used_at, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });
    setRows((data ?? []) as KeyRow[]);
    setLoading(false);
  };

  useEffect(() => { refresh(); }, [companyId]);

  const create = async () => {
    setCreating(true);
    const { error } = await supabase.from("company_app_keys").insert({
      company_id: companyId,
      label: label.trim() || "Default",
    });
    setCreating(false);
    if (error) toast({ title: "Failed", description: error.message, variant: "destructive" });
    else { setLabel(""); refresh(); toast({ title: "App key created" }); }
  };

  const toggle = async (r: KeyRow) => {
    await supabase.from("company_app_keys").update({ is_active: !r.is_active }).eq("id", r.id);
    refresh();
  };

  const remove = async (r: KeyRow) => {
    if (!confirm(`Permanently delete key "${r.label}"? Apps using it will stop working.`)) return;
    await supabase.from("company_app_keys").delete().eq("id", r.id);
    refresh();
  };

  const copy = async (k: string) => {
    await navigator.clipboard.writeText(k);
    setCopied(k); setTimeout(() => setCopied(null), 1500);
  };

  const mask = (k: string) => `${k.slice(0, 6)}…${k.slice(-4)}`;

  return (
    <Card className="glass border-border/60 p-5">
      <div className="flex items-center gap-2 mb-2">
        <KeyRound className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">App integration keys</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Use these secret keys when integrating Zentord inside <strong>mobile or desktop apps</strong>
        (where there is no website domain to whitelist). Pass the key in the <code className="font-mono text-foreground">x-app-key</code> header
        when starting a call. Treat them like passwords — never put them in client-side web code.
      </p>

      <div className="flex gap-2 mb-4">
        <Input
          placeholder="Label (e.g. iOS production)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="flex-1"
        />
        <Button onClick={create} disabled={creating} className="bg-primary text-primary-foreground">
          {creating ? <Loader2 className="h-4 w-4 animate-spin"/> : <><Plus className="h-4 w-4 mr-1"/>New key</>}
        </Button>
      </div>

      {loading ? (
        <Loader2 className="h-5 w-5 animate-spin"/>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 p-6 text-center">
          <KeyRound className="h-6 w-6 mx-auto text-muted-foreground mb-2"/>
          <p className="text-sm text-muted-foreground">No app keys yet — create one to integrate from a mobile app.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="rounded-lg border border-border/60 bg-background/40 p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Badge variant={r.is_active ? "default" : "outline"} className={r.is_active ? "bg-primary/15 text-primary border-primary/30" : ""}>
                    {r.is_active ? "Active" : "Revoked"}
                  </Badge>
                  <span className="text-sm font-medium truncate">{r.label}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => toggle(r)} title={r.is_active ? "Revoke" : "Re-enable"}>
                    {r.is_active ? <PowerOff className="h-4 w-4 text-warning"/> : <Power className="h-4 w-4 text-primary"/>}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(r)}>
                    <Trash2 className="h-4 w-4 text-destructive"/>
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate font-mono text-xs bg-muted/40 rounded px-2 py-1.5">
                  {reveal[r.id] ? r.app_key : mask(r.app_key)}
                </code>
                <Button size="sm" variant="outline" onClick={() => setReveal((v) => ({ ...v, [r.id]: !v[r.id] }))}>
                  {reveal[r.id] ? "Hide" : "Show"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => copy(r.app_key)}>
                  {copied === r.app_key ? <Check className="h-4 w-4 text-primary"/> : <Copy className="h-4 w-4"/>}
                </Button>
              </div>
              {r.last_used_at && (
                <p className="text-[10px] text-muted-foreground mt-2">Last used {new Date(r.last_used_at).toLocaleString()}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
