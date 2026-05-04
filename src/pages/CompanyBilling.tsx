import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2, IndianRupee, Calendar, Phone } from "lucide-react";

type Plan = { id: string; code: string; name: string; price_paise: number; call_quota: number | null; validity_days: number };
type Subscription = { id: string; plan_id: string; status: string; expires_at: string; used_calls: number };

declare global {
  interface Window { Razorpay: new (options: Record<string, unknown>) => { open: () => void } }
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

interface Props { fullScreen?: boolean }

export default function CompanyBilling({ fullScreen = false }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [sub, setSub] = useState<Subscription | null>(null);
  const [planMap, setPlanMap] = useState<Record<string, Plan>>({});
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    const [pl, c] = await Promise.all([
      supabase.from("plans").select("*").eq("is_active", true).order("sort_order"),
      supabase.from("companies").select("id").eq("owner_id", user.id).maybeSingle(),
    ]);
    const planList = (pl.data ?? []) as Plan[];
    setPlans(planList);
    setPlanMap(Object.fromEntries(planList.map((p) => [p.id, p])));
    if (c.data?.id) {
      setCompanyId(c.data.id);
      const { data: s } = await supabase.from("subscriptions").select("*")
        .eq("company_id", c.data.id).eq("status", "active").gt("expires_at", new Date().toISOString())
        .order("expires_at", { ascending: false }).limit(1).maybeSingle();
      setSub((s as Subscription | null) ?? null);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  const buy = async (planId: string) => {
    const plan = plans.find((p) => p.id === planId);
    // Free trial cannot be purchased — it is granted automatically when admin approves the company
    if (!plan || plan.price_paise <= 0 || plan.code === "free_trial") {
      toast({
        title: "Free trial is automatic",
        description: "Free trial is granted on company approval. To extend, pick a paid plan.",
        variant: "destructive",
      });
      return;
    }
    setPaying(planId);
    try {
      const ok = await loadRazorpayScript();
      if (!ok) { toast({ title: "Razorpay failed to load", variant: "destructive" }); return; }
      const { data, error } = await supabase.functions.invoke("razorpay-create-order", { body: { plan_id: planId } });
      if (error || !data?.order_id) {
        toast({ title: "Order failed", description: data?.error || error?.message || "", variant: "destructive" });
        return;
      }
      const rzp = new window.Razorpay({
        key: data.key_id,
        amount: data.amount,
        currency: data.currency,
        name: "VoxLink",
        description: data.plan_name,
        order_id: data.order_id,
        prefill: { email: data.contact_email, name: data.company_name },
        theme: { color: "#10b981" },
        handler: async (resp: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          const { data: v, error: vErr } = await supabase.functions.invoke("razorpay-verify-payment", { body: resp });
          if (vErr || !v?.success) {
            toast({ title: "Verification failed", description: v?.error || vErr?.message || "", variant: "destructive" });
          } else {
            toast({ title: "Payment success", description: "Plan activated!" });
            refresh();
          }
        },
        modal: { ondismiss: () => setPaying(null) },
      });
      rzp.open();
    } finally {
      setTimeout(() => setPaying(null), 500);
    }
  };

  const Inner = (
    <>
      {sub && planMap[sub.plan_id] && (
        <Card className="glass border-primary/40 shadow-glow p-5 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <Badge className="bg-primary/15 text-primary border-primary/30 mb-2" variant="outline">Active plan</Badge>
              <h3 className="text-xl font-bold">{planMap[sub.plan_id].name}</h3>
              <div className="text-sm text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
                <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3"/> Expires {new Date(sub.expires_at).toLocaleDateString()}</span>
                <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3"/> {sub.used_calls}/{planMap[sub.plan_id].call_quota ?? "∞"} calls used</span>
              </div>
            </div>
          </div>
        </Card>
      )}

      {!sub && (
        <Card className="glass border-warning/40 p-5 mb-6 text-center">
          <h3 className="text-lg font-bold">No active plan</h3>
          <p className="text-sm text-muted-foreground mt-1">Pick a plan to start receiving customer calls.</p>
        </Card>
      )}

      <BillingToggleAndPlans
        plans={plans}
        sub={sub}
        paying={paying}
        companyId={companyId}
        onBuy={buy}
      />
    </>
  );

  if (loading) return <AppShell title="Billing"><Loader2 className="h-6 w-6 animate-spin"/></AppShell>;

  if (fullScreen) {
    return (
      <div className="min-h-screen flex flex-col">
        <main className="container py-12 flex-1 max-w-5xl">
          <h1 className="text-2xl md:text-3xl font-bold mb-2">Renew your plan to continue</h1>
          <p className="text-muted-foreground mb-8">Your plan has expired or no calls remaining. Pick a plan to resume customer support.</p>
          {Inner}
        </main>
      </div>
    );
  }

  return <AppShell title="Billing">{Inner}</AppShell>;
}

function BillingToggleAndPlans({
  plans, sub, paying, companyId, onBuy,
}: {
  plans: Plan[]; sub: Subscription | null; paying: string | null;
  companyId: string | null; onBuy: (planId: string) => void;
}) {
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");
  const visible = plans.filter((p) =>
    billing === "yearly" ? p.validity_days >= 180 : p.validity_days < 180
  );

  return (
    <>
      <div className="flex justify-center mb-6">
        <div className="inline-flex rounded-full border border-border bg-secondary/40 p-1">
          <button type="button" onClick={() => setBilling("monthly")}
            className={`px-5 py-2 rounded-full text-sm font-medium ${billing === "monthly" ? "bg-gradient-primary text-primary-foreground shadow-glow" : "text-muted-foreground"}`}>Monthly</button>
          <button type="button" onClick={() => setBilling("yearly")}
            className={`px-5 py-2 rounded-full text-sm font-medium ${billing === "yearly" ? "bg-gradient-primary text-primary-foreground shadow-glow" : "text-muted-foreground"}`}>Yearly</button>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {visible.map((p) => {
          const isCurrent = sub?.plan_id === p.id;
          const isFree = p.price_paise <= 0 || p.code === "free_trial";
          return (
            <Card key={p.id} className={`glass border-border/60 p-5 ${isCurrent ? "border-primary/60" : ""}`}>
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">{p.name}</div>
                {isFree && <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30 text-[10px]">Trial</Badge>}
              </div>
              <div className="mt-2 flex items-baseline gap-1">
                {isFree ? (
                  <span className="text-3xl font-bold">Free</span>
                ) : (
                  <>
                    <IndianRupee className="h-5 w-5"/>
                    <span className="text-3xl font-bold">{(p.price_paise / 100).toFixed(0)}</span>
                  </>
                )}
                <span className="text-xs text-muted-foreground">/ {p.validity_days >= 365 ? "yr" : p.validity_days >= 28 ? "mo" : `${p.validity_days}d`}</span>
              </div>
              <ul className="mt-4 space-y-2 text-sm">
                <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-primary"/> {p.call_quota === null ? "Unlimited calls" : `${p.call_quota.toLocaleString()} calls`}</li>
                <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-primary"/> AI hold assistant</li>
                <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-primary"/> Multi-agent queue</li>
                <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-primary"/> Call analytics</li>
              </ul>
              {isFree ? (
                <Button disabled className="w-full mt-5" variant="outline">
                  {isCurrent ? "Active trial" : "Auto-granted on approval"}
                </Button>
              ) : (
                <Button onClick={() => onBuy(p.id)} disabled={!!paying || !companyId}
                  className="w-full mt-5 bg-gradient-primary text-primary-foreground">
                  {paying === p.id ? <Loader2 className="h-4 w-4 animate-spin"/> : isCurrent ? "Renew" : "Buy plan"}
                </Button>
              )}
            </Card>
          );
        })}
        {visible.length === 0 && (
          <p className="sm:col-span-2 lg:col-span-3 xl:col-span-4 text-center text-sm text-muted-foreground py-8">
            No {billing} plans available. Toggle to {billing === "monthly" ? "yearly" : "monthly"}.
          </p>
        )}
      </div>
    </>
  );
}
