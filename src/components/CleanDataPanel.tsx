// Admin "Clean Data" — selectively wipe data from production tables.
// Each option is a hard DELETE with a typed confirmation; counts are shown
// before the destructive action runs.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Loader2, Trash2, AlertTriangle, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Op = {
  key: string;
  label: string;
  description: string;
  table: string;
  filter?: { column: string; op: "eq" | "lt" | "in"; value: unknown };
  countQuery?: () => Promise<number>;
  destructive: "low" | "medium" | "high";
};

const ALL_OPS: Op[] = [
  {
    key: "calls_ended",
    label: "Old call records (status = ended)",
    description: "Deletes finished call rows. Active/waiting calls are kept.",
    table: "calls",
    filter: { column: "status", op: "eq", value: "ended" },
    destructive: "low",
  },
  {
    key: "calls_all",
    label: "ALL call records (waiting + active + ended)",
    description: "Wipes the entire calls history. Active calls will drop.",
    table: "calls",
    destructive: "high",
  },
  {
    key: "call_sessions",
    label: "All call sessions (tokens)",
    description: "Customer/agent join tokens. Only ended-call sessions matter to keep.",
    table: "call_sessions",
    destructive: "medium",
  },
  {
    key: "blocked_ips",
    label: "Blocked IPs",
    description: "Removes every IP block companies have set up.",
    table: "blocked_ips",
    destructive: "medium",
  },
  {
    key: "payments",
    label: "Payment records",
    description: "Razorpay order/payment audit log. Subscriptions are NOT touched.",
    table: "payments",
    destructive: "high",
  },
  {
    key: "subscriptions",
    label: "Subscriptions",
    description: "Wipes all active and expired plans. Companies will need to re-buy.",
    table: "subscriptions",
    destructive: "high",
  },
  {
    key: "device_tokens",
    label: "Device tokens (push notifications)",
    description: "Employees will need to reopen the mobile app to receive calls.",
    table: "device_tokens",
    destructive: "low",
  },
  {
    key: "email_outbox",
    label: "Email outbox (sent + queued)",
    description: "Removes the audit log of password reset / notification emails.",
    table: "email_outbox",
    destructive: "low",
  },
  {
    key: "employees",
    label: "ALL employees (agents)",
    description: "Removes every agent across every company. Owners stay intact.",
    table: "employees",
    destructive: "high",
  },
  {
    key: "companies_rejected",
    label: "Rejected companies",
    description: "Hard-deletes companies whose application was rejected.",
    table: "companies",
    filter: { column: "status", op: "eq", value: "rejected" },
    destructive: "medium",
  },
  {
    key: "firebase_user_map",
    label: "Firebase ↔ user mappings",
    description: "Resets the Google sign-in linkage. Users will be re-mapped on next sign-in.",
    table: "firebase_user_map",
    destructive: "medium",
  },
];

export default function CleanDataPanel() {
  const { toast } = useToast();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setLoading(true);
    const next: Record<string, number> = {};
    for (const op of ALL_OPS) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = supabase.from(op.table as never).select("*", { count: "exact", head: true });
      if (op.filter) q = q[op.filter.op](op.filter.column, op.filter.value);
      const { count } = await q;
      next[op.key] = count ?? 0;
    }
    setCounts(next);
    setLoading(false);
  };
  useEffect(() => { refresh(); }, []);

  const toggle = (key: string) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key); else n.add(key);
      return n;
    });
  };

  const run = async () => {
    if (selected.size === 0) {
      toast({ title: "Select at least one item to clean", variant: "destructive" });
      return;
    }
    if (confirmText.trim().toUpperCase() !== "DELETE") {
      toast({ title: "Type DELETE to confirm", variant: "destructive" });
      return;
    }
    setBusy(true);
    let totalDeleted = 0;
    const errors: string[] = [];
    for (const key of selected) {
      const op = ALL_OPS.find((o) => o.key === key);
      if (!op) continue;
      const base = supabase.from(op.table as never).delete();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builder: any = op.filter
        ? (base as any)[op.filter.op](op.filter.column, op.filter.value)
        : (base as any).not("id", "is", null);
      const { error } = await builder;
      if (error) errors.push(`${op.label}: ${error.message}`);
      else totalDeleted += counts[op.key] ?? 0;
    }
    setBusy(false);
    setSelected(new Set());
    setConfirmText("");
    refresh();
    if (errors.length) {
      toast({ title: "Some operations failed", description: errors.join("; "), variant: "destructive" });
    } else {
      toast({ title: "Clean complete", description: `Removed ${totalDeleted} rows.` });
    }
  };

  const tone = (level: Op["destructive"]) =>
    level === "high" ? "border-destructive/40 bg-destructive/5"
    : level === "medium" ? "border-warning/40 bg-warning/5"
    : "border-border/60";

  return (
    <Card className="glass border-border/60 p-5 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="font-semibold flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-warning"/>Clean data</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
            Tick the items you want to permanently delete from the database. This is irreversible.
            Use this to reset the project before going live, clear test data, or trim old call history.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`}/>Refresh counts
        </Button>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {ALL_OPS.map((op) => {
          const count = counts[op.key] ?? 0;
          const checked = selected.has(op.key);
          return (
            <label key={op.key} className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition ${tone(op.destructive)} ${checked ? "ring-2 ring-primary" : ""}`}>
              <Checkbox checked={checked} onCheckedChange={() => toggle(op.key)} className="mt-0.5"/>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{op.label}</span>
                  <span className="text-xs font-mono text-muted-foreground">{count.toLocaleString()}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{op.description}</p>
              </div>
            </label>
          );
        })}
      </div>

      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 space-y-3">
        <div className="text-sm">
          <strong>{selected.size}</strong> item{selected.size === 1 ? "" : "s"} selected.
          Type <code className="font-mono px-1 bg-background/60 rounded">DELETE</code> to confirm and run.
        </div>
        <div className="flex flex-wrap gap-2">
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="Type DELETE"
            className="max-w-xs font-mono"
          />
          <Button
            onClick={run}
            disabled={busy || selected.size === 0 || confirmText.trim().toUpperCase() !== "DELETE"}
            variant="destructive"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin"/> : <><Trash2 className="h-4 w-4 mr-1"/>Permanently delete</>}
          </Button>
        </div>
      </div>
    </Card>
  );
}
