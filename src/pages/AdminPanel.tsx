import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Building2, Users, Phone, CheckCircle2, XCircle, Loader2, Trash2, KeyRound, Save, FlaskConical, IndianRupee, ChevronDown, ChevronRight, Mail, UserCog, Flame, Palette, Eraser, FileText, Sparkles, ShieldCheck, BarChart3 } from "lucide-react";
import BrandSettingsPanel from "@/components/BrandSettingsPanel";
import CleanDataPanel from "@/components/CleanDataPanel";
import PlanEditorPanel from "@/components/PlanEditorPanel";
import SiteContentPanel from "@/components/SiteContentPanel";
import OpenAISettingsPanel from "@/components/OpenAISettingsPanel";
import CompanyDetailsPanel from "@/components/CompanyDetailsPanel";
import AdminAnalyticsPanel from "@/components/AdminAnalyticsPanel";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

type Company = {
  id: string; name: string; website: string | null; business_description: string;
  contact_email: string; mobile: string | null; status: "pending" | "approved" | "rejected"; api_key: string;
  created_at: string;
};
type CallRow = {
  id: string; company_id: string; room_id: string; customer_name: string | null;
  language: string | null; status: string; started_at: string; ended_at: string | null;
  duration_seconds: number | null; ai_handled: boolean;
  companies?: { name: string } | null;
};
type RazorpaySettings = {
  id: number;
  key_id: string | null; key_secret: string | null;
  test_key_id: string | null; test_key_secret: string | null;
  webhook_secret: string | null;
  test_mode: boolean;
};
// Plans removed (PlanEditorPanel manages them)
type EmployeeRow = { id: string; company_id: string; display_name: string; email: string; is_active: boolean; user_id: string | null; created_at: string };
type SmtpSettings = {
  id: number;
  host: string | null; port: number | null;
  username: string | null; password: string | null;
  from_email: string | null; from_name: string | null;
  use_tls: boolean;
  use_ssl: boolean;
};
type FirebaseSettings = {
  id: number;
  project_id: string | null;
  web_api_key: string | null;
  auth_domain: string | null;
  app_id: string | null;
  is_enabled: boolean;
};

export default function AdminPanel() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState("pending");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [counts, setCounts] = useState({ companies: 0, employees: 0, calls: 0 });
  const [loading, setLoading] = useState(true);

  // Step-up re-auth gate (admin must confirm password to access this panel)
  const [unlocked, setUnlocked] = useState<boolean>(() => {
    try { return sessionStorage.getItem("admin_unlocked") === "1"; } catch { return false; }
  });
  const [unlockPwd, setUnlockPwd] = useState("");
  const [unlocking, setUnlocking] = useState(false);

  // Razorpay settings
  const [rp, setRp] = useState<RazorpaySettings | null>(null);
  const [savingRp, setSavingRp] = useState(false);

  // Plans editing happens in PlanEditorPanel

  // Employees (across all companies, grouped)
  const [allEmployees, setAllEmployees] = useState<EmployeeRow[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // SMTP
  const [smtp, setSmtp] = useState<SmtpSettings | null>(null);
  const [savingSmtp, setSavingSmtp] = useState(false);
  const [testingSmtp, setTestingSmtp] = useState(false);

  // Firebase
  const [fb, setFb] = useState<FirebaseSettings | null>(null);
  const [savingFb, setSavingFb] = useState(false);

  // Account settings
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingAcct, setSavingAcct] = useState(false);

  const tryUnlock = async () => {
    if (!user?.email || !unlockPwd) return;
    setUnlocking(true);
    const { error } = await supabase.auth.signInWithPassword({ email: user.email, password: unlockPwd });
    setUnlocking(false);
    if (error) {
      toast({ title: "Invalid password", description: error.message, variant: "destructive" });
      setUnlockPwd("");
      return;
    }
    try { sessionStorage.setItem("admin_unlocked", "1"); } catch { /* ignore */ }
    setUnlocked(true);
    setUnlockPwd("");
  };

  const refresh = async () => {
    setLoading(true);
    const [c, callRes, empCount, rpRes, allEmpRes, smtpRes, fbRes] = await Promise.all([
      supabase.from("companies").select("*").order("created_at", { ascending: false }),
      supabase.from("calls").select("*, companies(name)").order("started_at", { ascending: false }).limit(100),
      supabase.from("employees").select("id", { count: "exact", head: true }),
      supabase.from("razorpay_settings").select("*").eq("id", 1).maybeSingle(),
      supabase.from("employees").select("id, company_id, display_name, email, is_active, user_id, created_at").order("created_at", { ascending: false }),
      supabase.from("smtp_settings").select("*").eq("id", 1).maybeSingle(),
      supabase.from("firebase_settings").select("*").eq("id", 1).maybeSingle(),
    ]);
    setCompanies((c.data ?? []) as Company[]);
    setCalls((callRes.data ?? []) as CallRow[]);
    setCounts({
      companies: c.data?.length ?? 0,
      employees: empCount.count ?? 0,
      calls: callRes.data?.length ?? 0,
    });
    setRp((rpRes.data as RazorpaySettings | null) ?? {
      id: 1, key_id: "", key_secret: "", test_key_id: "", test_key_secret: "",
      webhook_secret: "", test_mode: true,
    });
    setAllEmployees((allEmpRes.data ?? []) as EmployeeRow[]);
    setSmtp((smtpRes.data as SmtpSettings | null) ?? {
      id: 1, host: "", port: 587, username: "", password: "",
      from_email: "", from_name: "Zentord", use_tls: true, use_ssl: false,
    });
    setFb((fbRes.data as FirebaseSettings | null) ?? {
      id: 1, project_id: "", web_api_key: "", auth_domain: "", app_id: "", is_enabled: false,
    });
    setLoading(false);
  };
  useEffect(() => { refresh(); }, []);

  const saveSmtp = async () => {
    if (!smtp) return;
    setSavingSmtp(true);
    const { error } = await supabase.from("smtp_settings").update({
      host: smtp.host || null,
      port: smtp.port ?? 587,
      username: smtp.username || null,
      password: smtp.password || null,
      from_email: smtp.from_email || null,
      from_name: smtp.from_name || "Zentord",
      use_tls: smtp.use_tls,
      use_ssl: smtp.use_ssl,
    }).eq("id", 1);
    setSavingSmtp(false);
    if (error) toast({ title: "SMTP save failed", description: error.message, variant: "destructive" });
    else toast({ title: "SMTP settings saved" });
  };

  const saveFb = async () => {
    if (!fb) return;
    setSavingFb(true);
    const { error } = await supabase.from("firebase_settings").update({
      project_id: fb.project_id?.trim() || null,
      web_api_key: fb.web_api_key?.trim() || null,
      auth_domain: fb.auth_domain?.trim() || null,
      app_id: fb.app_id?.trim() || null,
      is_enabled: fb.is_enabled,
    }).eq("id", 1);
    setSavingFb(false);
    if (error) toast({ title: "Firebase save failed", description: error.message, variant: "destructive" });
    else toast({ title: "Firebase settings saved", description: fb.is_enabled ? "Google sign-in is now LIVE." : "Saved (disabled)." });
  };

  const updateAccount = async () => {
    if (!newEmail && !newPassword) {
      toast({ title: "Nothing to update", description: "Enter a new email or password.", variant: "destructive" });
      return;
    }
    setSavingAcct(true);
    const { data, error } = await supabase.functions.invoke("admin-update-self", {
      body: { newEmail: newEmail || undefined, newPassword: newPassword || undefined },
    });
    setSavingAcct(false);
    if (error || (data as any)?.error) {
      toast({ title: "Update failed", description: error?.message || (data as any)?.error, variant: "destructive" });
    } else {
      toast({ title: "Account updated", description: newEmail ? "Email updated. You may need to sign in again." : "Password updated." });
      setNewEmail(""); setNewPassword("");
    }
  };

  const setStatus = async (id: string, status: "approved" | "rejected") => {
    const { error } = await supabase.from("companies").update({ status }).eq("id", id);
    if (error) toast({ title: "Failed", description: error.message, variant: "destructive" });
    else { toast({ title: `Company ${status}` }); refresh(); }
  };
  const remove = async (id: string) => {
    if (!confirm("Delete this company and all its data?")) return;
    const { error } = await supabase.from("companies").delete().eq("id", id);
    if (error) toast({ title: "Failed", description: error.message, variant: "destructive" });
    else refresh();
  };

  const saveRp = async () => {
    if (!rp) return;
    setSavingRp(true);
    const { error } = await supabase.from("razorpay_settings").update({
      key_id: rp.key_id || null,
      key_secret: rp.key_secret || null,
      test_key_id: rp.test_key_id || null,
      test_key_secret: rp.test_key_secret || null,
      webhook_secret: rp.webhook_secret || null,
      test_mode: rp.test_mode,
    }).eq("id", 1);
    setSavingRp(false);
    if (error) toast({ title: "Save failed", description: error.message, variant: "destructive" });
    else toast({ title: "Razorpay settings saved", description: rp.test_mode ? "TEST mode active" : "LIVE mode active" });
  };

  // togglePlan moved into PlanEditorPanel

  const pending = companies.filter((c) => c.status === "pending");

  if (!unlocked) {
    return (
      <AppShell title="Admin Control">
        <div className="max-w-md mx-auto">
          <Card className="glass border-border/60 p-6 space-y-4">
            <div>
              <h3 className="font-semibold flex items-center gap-2"><KeyRound className="h-5 w-5 text-primary"/>Confirm your password</h3>
              <p className="text-xs text-muted-foreground mt-1">
                For security, please re-enter your admin password to access the control panel. Signed in as <code className="font-mono">{user?.email}</code>.
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Password</Label>
              <Input
                type="password"
                value={unlockPwd}
                onChange={(e) => setUnlockPwd(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") tryUnlock(); }}
                placeholder="••••••••"
                autoFocus
              />
            </div>
            <Button onClick={tryUnlock} disabled={unlocking || !unlockPwd} className="w-full bg-gradient-primary text-primary-foreground">
              {unlocking ? <Loader2 className="h-4 w-4 animate-spin"/> : "Unlock admin panel"}
            </Button>
          </Card>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Admin Control">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Stat icon={Building2} label="Companies" value={counts.companies} />
        <Stat icon={Users} label="Employees" value={counts.employees} />
        <Stat icon={Phone} label="Calls (recent)" value={counts.calls} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="pending">Pending ({pending.length})</TabsTrigger>
          <TabsTrigger value="analytics"><BarChart3 className="h-4 w-4 mr-1"/>Analytics</TabsTrigger>
          <TabsTrigger value="all">All companies</TabsTrigger>
          <TabsTrigger value="details"><ShieldCheck className="h-4 w-4 mr-1"/>Company details</TabsTrigger>
          <TabsTrigger value="employees"><Users className="h-4 w-4 mr-1"/>Employees</TabsTrigger>
          <TabsTrigger value="calls">All calls</TabsTrigger>
          <TabsTrigger value="razorpay"><KeyRound className="h-4 w-4 mr-1"/>Razorpay</TabsTrigger>
          <TabsTrigger value="plans"><IndianRupee className="h-4 w-4 mr-1"/>Plans</TabsTrigger>
          <TabsTrigger value="content"><FileText className="h-4 w-4 mr-1"/>Site content</TabsTrigger>
          <TabsTrigger value="smtp"><Mail className="h-4 w-4 mr-1"/>SMTP</TabsTrigger>
          <TabsTrigger value="gemini"><Sparkles className="h-4 w-4 mr-1"/>Voice AI</TabsTrigger>
          <TabsTrigger value="firebase"><Flame className="h-4 w-4 mr-1"/>Firebase</TabsTrigger>
          <TabsTrigger value="brand"><Palette className="h-4 w-4 mr-1"/>Brand</TabsTrigger>
          <TabsTrigger value="account"><UserCog className="h-4 w-4 mr-1"/>Account</TabsTrigger>
          <TabsTrigger value="clean"><Eraser className="h-4 w-4 mr-1"/>Clean data</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4 space-y-3">
          {loading && <Loader2 className="h-5 w-5 animate-spin" />}
          {!loading && pending.length === 0 && <p className="text-sm text-muted-foreground">Nothing pending.</p>}
          {pending.map((c) => (
            <Card key={c.id} className="glass border-border/60 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{c.name}</h3>
                  <p className="text-xs text-muted-foreground">{c.contact_email}{c.website && ` · ${c.website}`}</p>
                </div>
                <Badge variant="outline" className="bg-warning/10 text-warning border-warning/40">Pending</Badge>
              </div>
              <p className="mt-3 text-sm text-muted-foreground whitespace-pre-wrap">{c.business_description}</p>
              <div className="mt-4 flex gap-2">
                <Button size="sm" onClick={() => setStatus(c.id, "approved")} className="bg-primary text-primary-foreground">
                  <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                </Button>
                <Button size="sm" variant="outline" onClick={() => setStatus(c.id, "rejected")}>
                  <XCircle className="h-4 w-4 mr-1" /> Reject
                </Button>
              </div>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="analytics" className="mt-4">
          <AdminAnalyticsPanel />
        </TabsContent>

        <TabsContent value="all" className="mt-4 space-y-3">
          {companies.map((c) => {
            const empCount = allEmployees.filter((e) => e.company_id === c.id).length;
            return (
              <Card key={c.id} className="glass border-border/60 p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{c.name}</h3>
                    <StatusBadge status={c.status} />
                    <Badge variant="outline" className="bg-secondary"><Users className="h-3 w-3 mr-1"/>{empCount}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{c.contact_email}</p>
                  <code className="text-[10px] text-muted-foreground">API: {c.api_key.slice(0, 22)}…</code>
                </div>
                <div className="flex gap-2">
                  {c.status !== "approved" && (
                    <Button size="sm" onClick={() => setStatus(c.id, "approved")}>Approve</Button>
                  )}
                  {c.status !== "rejected" && (
                    <Button size="sm" variant="outline" onClick={() => setStatus(c.id, "rejected")}>Reject</Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => remove(c.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="employees" className="mt-4 space-y-3">
          {loading && <Loader2 className="h-5 w-5 animate-spin"/>}
          {!loading && companies.length === 0 && <p className="text-sm text-muted-foreground">No companies yet.</p>}
          {companies.map((c) => {
            const emps = allEmployees.filter((e) => e.company_id === c.id);
            const isOpen = expanded[c.id] ?? false;
            return (
              <Card key={c.id} className="glass border-border/60 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpanded((s) => ({ ...s, [c.id]: !isOpen }))}
                  className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-secondary/40 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground"/> : <ChevronRight className="h-4 w-4 text-muted-foreground"/>}
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{c.name}</h3>
                        <StatusBadge status={c.status} />
                      </div>
                      <p className="text-xs text-muted-foreground">{c.contact_email}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                    <Users className="h-3 w-3 mr-1"/>{emps.length} {emps.length === 1 ? "employee" : "employees"}
                  </Badge>
                </button>
                {isOpen && (
                  <div className="border-t border-border/60 p-4 bg-background/40">
                    {emps.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No employees added yet.</p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="text-xs text-muted-foreground">
                          <tr>
                            <th className="text-left py-2">Name</th>
                            <th className="text-left">Email</th>
                            <th className="text-left">Status</th>
                            <th className="text-left">Signed up</th>
                            <th className="text-left">Added</th>
                          </tr>
                        </thead>
                        <tbody>
                          {emps.map((e) => (
                            <tr key={e.id} className="border-t border-border/60">
                              <td className="py-2">{e.display_name}</td>
                              <td>{e.email}</td>
                              <td>
                                <Badge variant="outline" className={e.is_active ? "bg-primary/10 text-primary border-primary/30" : "bg-muted text-muted-foreground"}>
                                  {e.is_active ? "Active" : "Disabled"}
                                </Badge>
                              </td>
                              <td>
                                {e.user_id ? (
                                  <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">Yes</Badge>
                                ) : (
                                  <Badge variant="outline">Pending</Badge>
                                )}
                              </td>
                              <td className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleDateString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="calls" className="mt-4">
          <Card className="glass border-border/60 p-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr><th className="text-left py-2">Company</th><th className="text-left">Customer</th><th className="text-left">Lang</th><th className="text-left">Status</th><th className="text-left">Duration</th><th className="text-left">Started</th></tr>
              </thead>
              <tbody>
                {calls.map((c) => (
                  <tr key={c.id} className="border-t border-border/60">
                    <td className="py-2">{c.companies?.name ?? "—"}</td>
                    <td>{c.customer_name ?? "Anonymous"}</td>
                    <td>{c.language ?? "—"}</td>
                    <td><Badge variant="outline">{c.status}</Badge></td>
                    <td>{c.duration_seconds ? `${c.duration_seconds}s` : "—"}</td>
                    <td className="text-muted-foreground text-xs">{new Date(c.started_at).toLocaleString()}</td>
                  </tr>
                ))}
                {calls.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">No calls yet.</td></tr>}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="razorpay" className="mt-4">
          <Card className="glass border-border/60 p-5 space-y-5">
            <div>
              <h3 className="font-semibold">Razorpay configuration</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Keys are stored in the database and used by payment edge functions. Toggle <strong>Test mode</strong> any time
                to switch all checkout flows between sandbox and live without redeploying.
              </p>
            </div>

            {rp && (
              <>
                <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                  <div className="flex items-center gap-3">
                    <FlaskConical className={`h-5 w-5 ${rp.test_mode ? "text-warning" : "text-muted-foreground"}`} />
                    <div>
                      <div className="font-medium text-sm">Test mode</div>
                      <div className="text-xs text-muted-foreground">
                        {rp.test_mode ? "Sandbox keys are used. No real money charged." : "LIVE keys active. Real money will be charged."}
                      </div>
                    </div>
                  </div>
                  <Switch checked={rp.test_mode} onCheckedChange={(v) => setRp({ ...rp, test_mode: v })} />
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className={`rounded-lg border p-4 space-y-3 ${rp.test_mode ? "border-warning/40 bg-warning/5" : "border-border/60"}`}>
                    <div className="text-sm font-semibold flex items-center gap-2"><FlaskConical className="h-4 w-4 text-warning"/>Test keys (rzp_test_*)</div>
                    <div className="space-y-2">
                      <Label className="text-xs">Test Key ID</Label>
                      <Input value={rp.test_key_id ?? ""} onChange={(e) => setRp({ ...rp, test_key_id: e.target.value })} placeholder="rzp_test_XXXXXXXXXXXXXXXX" className="font-mono text-xs"/>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Test Key Secret</Label>
                      <Input type="password" value={rp.test_key_secret ?? ""} onChange={(e) => setRp({ ...rp, test_key_secret: e.target.value })} placeholder="••••••••" className="font-mono text-xs"/>
                    </div>
                  </div>

                  <div className={`rounded-lg border p-4 space-y-3 ${!rp.test_mode ? "border-primary/40 bg-primary/5" : "border-border/60"}`}>
                    <div className="text-sm font-semibold flex items-center gap-2"><KeyRound className="h-4 w-4 text-primary"/>Live keys (rzp_live_*)</div>
                    <div className="space-y-2">
                      <Label className="text-xs">Live Key ID</Label>
                      <Input value={rp.key_id ?? ""} onChange={(e) => setRp({ ...rp, key_id: e.target.value })} placeholder="rzp_live_XXXXXXXXXXXXXXXX" className="font-mono text-xs"/>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Live Key Secret</Label>
                      <Input type="password" value={rp.key_secret ?? ""} onChange={(e) => setRp({ ...rp, key_secret: e.target.value })} placeholder="••••••••" className="font-mono text-xs"/>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Webhook secret (optional)</Label>
                  <Input type="password" value={rp.webhook_secret ?? ""} onChange={(e) => setRp({ ...rp, webhook_secret: e.target.value })} placeholder="••••••••" className="font-mono text-xs max-w-md"/>
                </div>

                <Button onClick={saveRp} disabled={savingRp} className="bg-gradient-primary text-primary-foreground">
                  {savingRp ? <Loader2 className="h-4 w-4 animate-spin"/> : <><Save className="h-4 w-4 mr-2"/>Save settings</>}
                </Button>
              </>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="plans" className="mt-4">
          <PlanEditorPanel />
        </TabsContent>

        <TabsContent value="content" className="mt-4">
          <SiteContentPanel />
        </TabsContent>

        <TabsContent value="details" className="mt-4">
          <CompanyDetailsPanel />
        </TabsContent>

        <TabsContent value="gemini" className="mt-4">
          <OpenAISettingsPanel />
        </TabsContent>



        <TabsContent value="smtp" className="mt-4">
          <Card className="glass border-border/60 p-5 space-y-4">
            <div>
              <h3 className="font-semibold flex items-center gap-2"><Mail className="h-5 w-5 text-primary"/>SMTP Email Settings</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Used for sending password-reset emails to companies & employees. Credentials are stored securely in the database.
              </p>
            </div>
            {smtp && (
              <>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs">SMTP Host</Label>
                    <Input value={smtp.host ?? ""} onChange={(e) => setSmtp({ ...smtp, host: e.target.value })} placeholder="smtp.gmail.com" className="font-mono text-xs"/>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Port</Label>
                    <Input type="number" value={smtp.port ?? 587} onChange={(e) => setSmtp({ ...smtp, port: parseInt(e.target.value) || 587 })} className="font-mono text-xs"/>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Username</Label>
                    <Input value={smtp.username ?? ""} onChange={(e) => setSmtp({ ...smtp, username: e.target.value })} placeholder="you@yourdomain.com" className="font-mono text-xs"/>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Password / App password</Label>
                    <Input type="password" value={smtp.password ?? ""} onChange={(e) => setSmtp({ ...smtp, password: e.target.value })} placeholder="••••••••" className="font-mono text-xs"/>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">From email</Label>
                    <Input value={smtp.from_email ?? ""} onChange={(e) => setSmtp({ ...smtp, from_email: e.target.value })} placeholder="noreply@yourdomain.com" className="font-mono text-xs"/>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">From name</Label>
                    <Input value={smtp.from_name ?? "Zentord"} onChange={(e) => setSmtp({ ...smtp, from_name: e.target.value })} className="text-xs"/>
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                  <div>
                    <div className="text-sm font-medium">Use STARTTLS</div>
                    <div className="text-xs text-muted-foreground">For ports 587 / 2525 (most providers like Gmail SMTP, SendGrid, Mailgun)</div>
                  </div>
                  <Switch checked={smtp.use_tls} onCheckedChange={(v) => setSmtp({ ...smtp, use_tls: v })}/>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                  <div>
                    <div className="text-sm font-medium">Use implicit SSL/TLS</div>
                    <div className="text-xs text-muted-foreground">For port 465 (SMTPS). Turn this ON only if your provider needs SSL on connect.</div>
                  </div>
                  <Switch checked={smtp.use_ssl} onCheckedChange={(v) => setSmtp({ ...smtp, use_ssl: v })}/>
                </div>
                <Button onClick={saveSmtp} disabled={savingSmtp} className="bg-gradient-primary text-primary-foreground">
                  {savingSmtp ? <Loader2 className="h-4 w-4 animate-spin"/> : <><Save className="h-4 w-4 mr-2"/>Save SMTP settings</>}
                </Button>
              </>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="firebase" className="mt-4">
          <Card className="glass border-border/60 p-5 space-y-4 max-w-3xl">
            <div>
              <h3 className="font-semibold flex items-center gap-2"><Flame className="h-5 w-5 text-warning"/>Firebase Google Sign-in</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Configure Google login via your own Firebase project. These keys are <strong>public by design</strong> (Firebase Web SDK keys are not secrets — security comes from <em>Authorized Domains</em> in your Firebase Console + server-side ID-token verification).
                <br/>Get them from <a href="https://console.firebase.google.com" target="_blank" rel="noreferrer" className="text-primary underline">Firebase Console</a> → Project settings → Your apps → Web app config.
              </p>
            </div>
            {fb && (
              <>
                <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                  <div>
                    <div className="text-sm font-medium">Enable Google sign-in</div>
                    <div className="text-xs text-muted-foreground">When OFF, the Google button on the auth page is disabled.</div>
                  </div>
                  <Switch checked={fb.is_enabled} onCheckedChange={(v) => setFb({ ...fb, is_enabled: v })}/>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs">Project ID</Label>
                    <Input value={fb.project_id ?? ""} onChange={(e) => setFb({ ...fb, project_id: e.target.value })} placeholder="my-project-id" className="font-mono text-xs"/>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Web API Key</Label>
                    <Input value={fb.web_api_key ?? ""} onChange={(e) => setFb({ ...fb, web_api_key: e.target.value })} placeholder="AIzaSy..." className="font-mono text-xs"/>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Auth Domain</Label>
                    <Input value={fb.auth_domain ?? ""} onChange={(e) => setFb({ ...fb, auth_domain: e.target.value })} placeholder="my-project.firebaseapp.com" className="font-mono text-xs"/>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">App ID</Label>
                    <Input value={fb.app_id ?? ""} onChange={(e) => setFb({ ...fb, app_id: e.target.value })} placeholder="1:1234567890:web:abcdef" className="font-mono text-xs"/>
                  </div>
                </div>
                <div className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-xs space-y-1">
                  <div className="font-semibold text-warning">⚠️ Don't forget</div>
                  <div className="text-muted-foreground">In Firebase Console → Authentication → Settings → <strong>Authorized domains</strong>, add every domain that hosts the Zentord app (e.g. <code>app.yourdomain.com</code>, <code>localhost</code>).</div>
                </div>
                <Button onClick={saveFb} disabled={savingFb} className="bg-gradient-primary text-primary-foreground">
                  {savingFb ? <Loader2 className="h-4 w-4 animate-spin"/> : <><Save className="h-4 w-4 mr-2"/>Save Firebase settings</>}
                </Button>
              </>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="account" className="mt-4">
          <Card className="glass border-border/60 p-5 space-y-4 max-w-2xl">
            <div>
              <h3 className="font-semibold flex items-center gap-2"><UserCog className="h-5 w-5 text-primary"/>Admin Account Settings</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Update your sign-in email or password. Currently signed in as <code className="font-mono text-foreground">{user?.email}</code>.
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">New email (leave blank to keep current)</Label>
              <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="newadmin@yourdomain.com"/>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">New password (leave blank to keep current)</Label>
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 6 characters"/>
            </div>
            <Button onClick={updateAccount} disabled={savingAcct} className="bg-gradient-primary text-primary-foreground">
              {savingAcct ? <Loader2 className="h-4 w-4 animate-spin"/> : <><Save className="h-4 w-4 mr-2"/>Update account</>}
            </Button>
            <p className="text-xs text-muted-foreground">
              ⚠️ If you change the email, you'll need to sign in again with the new email.
            </p>
          </Card>
        </TabsContent>

        <TabsContent value="brand" className="mt-4">
          <BrandSettingsPanel />
        </TabsContent>

        <TabsContent value="clean" className="mt-4">
          <CleanDataPanel />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Phone; label: string; value: number }) {
  return (
    <Card className="glass border-border/60 p-5 flex items-center gap-4">
      <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/15 text-primary"><Icon className="h-5 w-5" /></div>
      <div>
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </Card>
  );
}
function StatusBadge({ status }: { status: string }) {
  if (status === "approved") return <Badge className="bg-primary/15 text-primary border-primary/30" variant="outline">Approved</Badge>;
  if (status === "rejected") return <Badge className="bg-destructive/15 text-destructive border-destructive/30" variant="outline">Rejected</Badge>;
  return <Badge className="bg-warning/15 text-warning border-warning/30" variant="outline">Pending</Badge>;
}
