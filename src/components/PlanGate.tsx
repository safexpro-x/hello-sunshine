import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import CompanyBilling from "@/pages/CompanyBilling";

interface Props { children: React.ReactNode }

// For company_owner only — gates all /company/* pages behind an active plan.
// If plan is missing or expired, the billing page is shown full-screen.
export default function PlanGate({ children }: Props) {
  const { user, roles } = useAuth();
  const [state, setState] = useState<"loading" | "ok" | "no-plan">("loading");

  useEffect(() => {
    if (!user) return;
    if (!roles.includes("company_owner")) { setState("ok"); return; }
    (async () => {
      const { data: c } = await supabase.from("companies").select("id, status").eq("owner_id", user.id).maybeSingle();
      if (!c || c.status !== "approved") { setState("ok"); return; } // pending companies see normal flow
      const { data: s } = await supabase.from("subscriptions").select("id, expires_at, used_calls, plans(call_quota)")
        .eq("company_id", c.id).eq("status", "active").gt("expires_at", new Date().toISOString())
        .order("expires_at", { ascending: false }).limit(1).maybeSingle();
      if (!s) { setState("no-plan"); return; }
      const quota = (s as { plans?: { call_quota: number | null } | null }).plans?.call_quota;
      const used = (s as { used_calls: number }).used_calls;
      if (quota !== null && quota !== undefined && used >= quota) { setState("no-plan"); return; }
      setState("ok");
    })();
  }, [user, roles]);

  if (state === "loading") return <div className="min-h-screen grid place-items-center"><Loader2 className="h-6 w-6 animate-spin"/></div>;
  if (state === "no-plan") return <CompanyBilling fullScreen />;
  return <>{children}</>;
}
