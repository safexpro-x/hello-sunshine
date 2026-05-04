import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trash2, UserPlus, Users, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";

type Employee = { id: string; email: string; display_name: string; role: string; is_active: boolean; user_id: string | null; created_at: string };
type Limits = { used: number; quota: number | null };

export default function CompanyEmployees() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [limits, setLimits] = useState<Limits | null>(null);

  const refresh = useCallback(async (cid: string) => {
    const [{ data: emps }, { data: lim }] = await Promise.all([
      supabase.from("employees").select("*").eq("company_id", cid).order("created_at", { ascending: false }),
      supabase.rpc("get_company_agent_limits", { _company_id: cid }),
    ]);
    setEmployees((emps ?? []) as Employee[]);
    const row = (lim as { used: number; quota: number | null }[] | null)?.[0];
    setLimits(row ? { used: row.used ?? 0, quota: row.quota } : { used: 0, quota: 0 });
  }, []);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: c } = await supabase.from("companies").select("id").eq("owner_id", user.id).maybeSingle();
      if (c) { setCompanyId(c.id); await refresh(c.id); }
      setLoading(false);
    })();
  }, [user, refresh]);

  const activeCount = employees.filter((e) => e.is_active).length;
  const atLimit = limits?.quota !== null && limits?.quota !== undefined && activeCount >= limits.quota;
  const noPlan = limits?.quota === 0;

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId) return;
    setBusy(true);
    const { error } = await supabase.from("employees").insert({
      company_id: companyId, email: email.trim().toLowerCase(), display_name: name.trim(),
    });
    setBusy(false);
    if (error) {
      toast({ title: "Couldn't add agent", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Employee added", description: `${email} can now sign up at /auth and join the agent queue.` });
      setName(""); setEmail(""); refresh(companyId);
    }
  };

  const toggleActive = async (emp: Employee) => {
    const { error } = await supabase.from("employees").update({ is_active: !emp.is_active }).eq("id", emp.id);
    if (error) toast({ title: "Couldn't update", description: error.message, variant: "destructive" });
    if (companyId) refresh(companyId);
  };
  const remove = async (id: string) => {
    if (!confirm("Remove this employee?")) return;
    await supabase.from("employees").delete().eq("id", id);
    if (companyId) refresh(companyId);
  };

  return (
    <AppShell title="Employees">
      {limits && (
        <Card className="glass border-border/60 p-4 mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15 text-primary"><Users className="h-5 w-5"/></div>
            <div>
              <div className="text-sm font-semibold">
                {activeCount} / {limits.quota === null ? "Unlimited" : limits.quota} active agent{limits.quota === 1 ? "" : "s"}
              </div>
              <div className="text-xs text-muted-foreground">
                {noPlan
                  ? "No active plan — buy a plan to add agents."
                  : limits.quota === null
                    ? "Your plan allows unlimited agents."
                    : `Your plan allows up to ${limits.quota} active agent${limits.quota === 1 ? "" : "s"}.`}
              </div>
            </div>
          </div>
          {(atLimit || noPlan) && (
            <Button asChild variant="outline" size="sm">
              <Link to="/company/billing">Upgrade plan</Link>
            </Button>
          )}
        </Card>
      )}

      <Card className="glass border-border/60 p-5 mb-6">
        <h3 className="font-semibold mb-3 flex items-center gap-2"><UserPlus className="h-4 w-4 text-primary"/> Add agent</h3>
        {(atLimit || noPlan) && (
          <div className="mb-3 rounded-lg border border-warning/40 bg-warning/5 p-3 text-xs flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-warning mt-0.5"/>
            <div>
              {noPlan
                ? <>You have no active plan. <Link to="/company/billing" className="underline text-primary">Buy a plan</Link> to add agents.</>
                : <>You've reached the agent limit for your plan. <Link to="/company/billing" className="underline text-primary">Upgrade</Link> to add more agents.</>}
            </div>
          </div>
        )}
        <form onSubmit={add} className="grid sm:grid-cols-3 gap-3">
          <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required disabled={atLimit || noPlan}/>
          <Input type="email" placeholder="agent@yourcompany.com" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={atLimit || noPlan}/>
          <Button type="submit" disabled={busy || atLimit || noPlan} className="bg-gradient-primary text-primary-foreground">
            {busy ? <Loader2 className="h-4 w-4 animate-spin"/> : "Add agent"}
          </Button>
        </form>
        <p className="text-xs text-muted-foreground mt-2">After adding, ask the agent to sign up at <code className="text-primary">/auth</code> with the same email. They'll automatically appear in the agent queue.</p>
      </Card>

      {loading ? <Loader2 className="h-5 w-5 animate-spin"/> : (
        <Card className="glass border-border/60 p-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr><th className="text-left py-2">Name</th><th className="text-left">Email</th><th className="text-left">Status</th><th className="text-left">Signed up</th><th></th></tr>
            </thead>
            <tbody>
              {employees.map((emp) => (
                <tr key={emp.id} className="border-t border-border/60">
                  <td className="py-2">{emp.display_name}</td>
                  <td>{emp.email}</td>
                  <td>
                    <Badge variant="outline" className={emp.is_active ? "bg-primary/15 text-primary border-primary/30" : "bg-muted text-muted-foreground"}>
                      {emp.is_active ? "Active" : "Disabled"}
                    </Badge>
                  </td>
                  <td>{emp.user_id ? <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">Yes</Badge> : <Badge variant="outline">Pending</Badge>}</td>
                  <td className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => toggleActive(emp)}>{emp.is_active ? "Disable" : "Enable"}</Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(emp.id)}><Trash2 className="h-4 w-4 text-destructive"/></Button>
                  </td>
                </tr>
              ))}
              {employees.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">No employees yet.</td></tr>}
            </tbody>
          </table>
        </Card>
      )}
    </AppShell>
  );
}
