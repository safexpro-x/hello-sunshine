import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, ShieldX, Trash2, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Row = { id: string; ip_address: string; reason: string | null; created_at: string };

export default function CompanyBlockedIpsPanel({ companyId }: { companyId: string }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [ip, setIp] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("blocked_ips")
      .select("id, ip_address, reason, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });
    setRows((data ?? []) as Row[]);
    setLoading(false);
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [companyId]);

  const add = async () => {
    const v = ip.trim();
    if (!v) return;
    setBusy(true);
    const { error } = await supabase.from("blocked_ips").insert({
      company_id: companyId, ip_address: v, reason: reason.trim() || null,
    });
    setBusy(false);
    if (error) return toast({ title: "Block failed", description: error.message, variant: "destructive" });
    setIp(""); setReason("");
    toast({ title: "IP blocked" });
    refresh();
  };

  const unban = async (id: string) => {
    const { error } = await supabase.from("blocked_ips").delete().eq("id", id);
    if (error) return toast({ title: "Unblock failed", description: error.message, variant: "destructive" });
    toast({ title: "IP unblocked" });
    refresh();
  };

  return (
    <Card className="glass border-border/60 p-5">
      <div className="flex items-center gap-2 mb-3 text-sm font-semibold">
        <ShieldX className="h-4 w-4 text-destructive"/> Blocked IPs ({rows.length})
      </div>

      <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-2 mb-4">
        <Input placeholder="IP address (e.g. 203.0.113.5)" value={ip} onChange={(e) => setIp(e.target.value)} />
        <Input placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <Button onClick={add} disabled={busy || !ip.trim()} className="bg-gradient-primary text-primary-foreground">
          {busy ? <Loader2 className="h-4 w-4 animate-spin"/> : <><Plus className="h-4 w-4 mr-1"/>Block</>}
        </Button>
      </div>

      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground"/>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No IPs blocked. Add an IP above to deny it from starting calls.</p>
      ) : (
        <div className="space-y-1">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 rounded-md border border-border/50 px-3 py-2 text-xs">
              <code className="font-mono">{r.ip_address}</code>
              <span className="flex-1 text-muted-foreground truncate px-2">{r.reason || ""}</span>
              <span className="text-[10px] text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</span>
              <Button size="sm" variant="ghost" onClick={() => unban(r.id)} aria-label="Remove block">
                <Trash2 className="h-3 w-3 text-destructive"/>
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
