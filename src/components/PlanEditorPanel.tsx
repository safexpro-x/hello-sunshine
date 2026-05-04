// Admin can edit name/price/quotas/validity for any plan and toggle visibility.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, IndianRupee } from "lucide-react";

type Plan = {
  id: string; code: string; name: string; price_paise: number;
  call_quota: number | null; agent_quota: number | null;
  validity_days: number; is_active: boolean; sort_order: number;
};

export default function PlanEditorPanel() {
  const { toast } = useToast();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    const { data } = await supabase.from("plans").select("*").order("sort_order");
    setPlans((data ?? []) as Plan[]);
    setLoading(false);
  };
  useEffect(() => { refresh(); }, []);

  const update = (id: string, patch: Partial<Plan>) =>
    setPlans((cur) => cur.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const save = async (p: Plan) => {
    setSavingId(p.id);
    const { error } = await supabase.from("plans").update({
      name: p.name.trim(),
      price_paise: Math.max(0, Math.round(p.price_paise)),
      call_quota: p.call_quota === null ? null : Math.max(0, Math.round(p.call_quota)),
      agent_quota: p.agent_quota === null ? null : Math.max(0, Math.round(p.agent_quota)),
      validity_days: Math.max(1, Math.round(p.validity_days)),
      is_active: p.is_active,
      sort_order: p.sort_order,
    }).eq("id", p.id);
    setSavingId(null);
    if (error) toast({ title: "Save failed", description: error.message, variant: "destructive" });
    else toast({ title: "Plan updated", description: `${p.name} saved.` });
  };

  if (loading) return <Loader2 className="h-5 w-5 animate-spin"/>;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Edit plan price, quotas, validity, and visibility. Changes go live instantly for new checkouts.
        Set quota to <code className="text-foreground">0</code> for unlimited.
      </p>
      {plans.map((p) => (
        <Card key={p.id} className="glass border-border/60 p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-semibold">{p.name} <span className="text-xs text-muted-foreground">({p.code})</span></h3>
              <p className="text-xs text-muted-foreground">Sort order: {p.sort_order}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{p.is_active ? "Visible" : "Hidden"}</span>
              <Switch checked={p.is_active} onCheckedChange={(v) => update(p.id, { is_active: v })}/>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <Label className="text-xs">Display name</Label>
              <Input value={p.name} onChange={(e) => update(p.id, { name: e.target.value })}/>
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1"><IndianRupee className="h-3 w-3"/> Price (rupees)</Label>
              <Input type="number" min={0} value={Math.round(p.price_paise / 100)}
                onChange={(e) => update(p.id, { price_paise: Math.max(0, parseInt(e.target.value || "0")) * 100 })}/>
            </div>
            <div>
              <Label className="text-xs">Call quota (0 = ∞)</Label>
              <Input type="number" min={0} value={p.call_quota ?? 0}
                onChange={(e) => {
                  const n = parseInt(e.target.value || "0");
                  update(p.id, { call_quota: n === 0 ? null : n });
                }}/>
            </div>
            <div>
              <Label className="text-xs">Agent quota (0 = ∞)</Label>
              <Input type="number" min={0} value={p.agent_quota ?? 0}
                onChange={(e) => {
                  const n = parseInt(e.target.value || "0");
                  update(p.id, { agent_quota: n === 0 ? null : n });
                }}/>
            </div>
            <div>
              <Label className="text-xs">Validity (days)</Label>
              <Input type="number" min={1} value={p.validity_days}
                onChange={(e) => update(p.id, { validity_days: Math.max(1, parseInt(e.target.value || "1")) })}/>
            </div>
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={() => save(p)} disabled={savingId === p.id}
              className="bg-gradient-primary text-primary-foreground">
              {savingId === p.id ? <Loader2 className="h-4 w-4 animate-spin"/> : <><Save className="h-4 w-4 mr-1"/>Save</>}
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
