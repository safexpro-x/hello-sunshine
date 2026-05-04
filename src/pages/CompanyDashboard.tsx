import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Copy, Check, Code2, Phone, Users, Activity, Loader2, KeyRound, ExternalLink, Calendar, IndianRupee, Shield, Building2 } from "lucide-react";
import DomainWhitelistPanel from "@/components/DomainWhitelistPanel";
import AppKeysPanel from "@/components/AppKeysPanel";
import CompanyProfilePanel from "@/components/CompanyProfilePanel";
import CompanyBlockedIpsPanel from "@/components/CompanyBlockedIpsPanel";

type Company = { id: string; name: string; api_key: string; status: string; business_description: string };
type Employee = { id: string; display_name: string | null; email: string };
type CallRow = { id: string; room_id: string; customer_name: string | null; customer_ip: string | null; language: string | null; status: string; ai_handled: boolean; started_at: string; ended_at: string | null; duration_seconds: number | null; employee_id: string | null; picked_at: string | null };
type Subscription = { id: string; plan_id: string; expires_at: string; used_calls: number; status: string };
type Plan = { id: string; name: string; call_quota: number | null };

export default function CompanyDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [company, setCompany] = useState<Company | null>(null);
  const [slug, setSlug] = useState<string | null>(null);
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [empCount, setEmpCount] = useState(0);
  const [employeeMap, setEmployeeMap] = useState<Record<string, Employee>>({});
  const [sub, setSub] = useState<Subscription | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: c } = await supabase.from("companies").select("*").eq("owner_id", user.id).maybeSingle();
      setCompany(c as Company | null);
      if (c) {
        const [callRes, empRes, empListRes, slugRes, subRes] = await Promise.all([
          supabase.from("calls").select("*").eq("company_id", c.id).order("started_at", { ascending: false }).limit(100),
          supabase.from("employees").select("id", { count: "exact", head: true }).eq("company_id", c.id),
          supabase.from("employees").select("id, display_name, email").eq("company_id", c.id),
          supabase.from("widget_slugs").select("slug").eq("company_id", c.id).eq("is_active", true).order("created_at", { ascending: false }).limit(1).maybeSingle(),
          supabase.from("subscriptions").select("*").eq("company_id", c.id).eq("status", "active").gt("expires_at", new Date().toISOString()).order("expires_at", { ascending: false }).limit(1).maybeSingle(),
        ]);
        setCalls((callRes.data ?? []) as CallRow[]);
        setEmpCount(empRes.count ?? 0);
        const map: Record<string, Employee> = {};
        ((empListRes.data ?? []) as Employee[]).forEach((e) => { map[e.id] = e; });
        setEmployeeMap(map);
        setSlug((slugRes.data as { slug: string } | null)?.slug ?? null);
        const subData = subRes.data as Subscription | null;
        setSub(subData);
        if (subData) {
          const { data: p } = await supabase.from("plans").select("id,name,call_quota").eq("id", subData.plan_id).maybeSingle();
          setPlan(p as Plan | null);
        }
      }
      setLoading(false);
    })();
  }, [user]);

  const copy = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  if (loading) return <AppShell><Loader2 className="h-6 w-6 animate-spin" /></AppShell>;

  if (!company) {
    return (
      <AppShell title="Company Dashboard">
        <Card className="glass border-border/60 p-6">
          <p>No company found. <a href="/onboard" className="text-primary underline">Register your company →</a></p>
        </Card>
      </AppShell>
    );
  }

  if (company.status !== "approved") {
    return (
      <AppShell title="Pending approval">
        <Card className="glass border-border/60 p-6">
          <p className="text-muted-foreground">Your company <strong>{company.name}</strong> is awaiting admin approval. You'll get full access once approved.</p>
        </Card>
      </AppShell>
    );
  }

  const origin = window.location.origin;
  // Use opaque slug — real api_key NEVER appears in customer URLs
  const widgetUrl = slug ? `${origin}/c/${slug}` : "";
  const embedSnippet = widgetUrl ? `<iframe src="${widgetUrl}" allow="microphone; autoplay" style="width:100%;max-width:420px;height:600px;border:0;border-radius:16px"></iframe>` : "";
  const buttonSnippet = widgetUrl ? `<a href="${widgetUrl}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:8px;padding:12px 20px;border-radius:9999px;background:hsl(160 84% 39%);color:#fff;font-family:system-ui;font-weight:600;text-decoration:none">📞 Talk to support</a>` : "";

  const totalDuration = calls.reduce((a, c) => a + (c.duration_seconds ?? 0), 0);
  const avg = calls.length ? Math.round(totalDuration / calls.length) : 0;
  const daysLeft = sub ? Math.max(0, Math.ceil((new Date(sub.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : 0;
  const quotaLeft = sub && plan ? (plan.call_quota === null ? "∞" : Math.max(0, plan.call_quota - sub.used_calls)) : 0;

  // Richer analytics
  const aiOnly = calls.filter((c) => c.ai_handled && !c.employee_id).length;
  const agentHandled = calls.filter((c) => !!c.employee_id).length;
  const last24h = calls.filter((c) => Date.now() - new Date(c.started_at).getTime() < 86400000).length;
  const conversion = calls.length ? Math.round((agentHandled / calls.length) * 100) : 0;
  const langCounts = calls.reduce<Record<string, number>>((acc, c) => {
    const k = c.language || "—"; acc[k] = (acc[k] || 0) + 1; return acc;
  }, {});
  const topLang = Object.entries(langCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

  return (
    <AppShell title={company.name}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <Stat icon={Phone} label="Total calls" value={calls.length} />
        <Stat icon={Activity} label="Avg duration" value={`${avg}s`} />
        <Stat icon={Users} label="Employees" value={empCount} />
        <Stat icon={KeyRound} label="Status" value="Approved" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Stat icon={Activity} label="Last 24h calls" value={last24h} />
        <Stat icon={Phone} label="Agent-picked" value={agentHandled} />
        <Stat icon={KeyRound} label="AI-only" value={aiOnly} />
        <Stat icon={Activity} label="Pickup rate" value={`${conversion}%`} />
      </div>

      {sub && plan ? (
        <Card className="glass border-primary/30 p-5 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <Badge className="bg-primary/15 text-primary border-primary/30 mb-2" variant="outline">Active plan</Badge>
              <h3 className="text-lg font-bold">{plan.name}</h3>
              <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-1">
                <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3"/>{daysLeft} days left · expires {new Date(sub.expires_at).toLocaleDateString()}</span>
                <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3"/>{quotaLeft} calls remaining ({sub.used_calls} used)</span>
              </div>
            </div>
            <Button asChild variant="outline" size="sm"><Link to="/company/billing"><IndianRupee className="h-4 w-4 mr-1"/>Manage / Renew</Link></Button>
          </div>
        </Card>
      ) : (
        <Card className="glass border-warning/40 p-5 mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="font-bold">No active plan</h3>
            <p className="text-xs text-muted-foreground mt-1">Pick a plan to start receiving customer calls.</p>
          </div>
          <Button asChild className="bg-gradient-primary text-primary-foreground"><Link to="/company/billing"><IndianRupee className="h-4 w-4 mr-1"/>Choose plan</Link></Button>
        </Card>
      )}

      <Tabs defaultValue="integrate">
        <TabsList>
          <TabsTrigger value="integrate">Integrate</TabsTrigger>
          <TabsTrigger value="profile"><Building2 className="h-4 w-4 mr-1"/>Profile</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="calls">Recent calls</TabsTrigger>
        </TabsList>

        <TabsContent value="integrate" className="mt-4 space-y-4">
          <Card className="glass border-border/60 p-5">
            <div className="flex items-center gap-2 mb-2 text-sm font-semibold"><Shield className="h-4 w-4 text-primary"/> Secure widget link</div>
            <div className="flex gap-2">
              <Input readOnly value={widgetUrl} className="font-mono text-xs" onClick={(e) => (e.target as HTMLInputElement).select()} />
              <Button variant="outline" size="sm" onClick={() => copy(widgetUrl, "url")}>
                {copied === "url" ? <Check className="h-4 w-4 text-success"/> : <Copy className="h-4 w-4"/>}
              </Button>
              {widgetUrl && (
                <Button asChild size="sm" variant="outline"><a href={widgetUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4"/></a></Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              This is a public, opaque short link. Your real API key is <strong>never exposed</strong> to customers.
              Each call also gets a one-time session token that expires the moment the call ends.
            </p>
          </Card>

          {embedSnippet && (
            <Card className="glass border-border/60 p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-sm font-semibold"><Code2 className="h-4 w-4 text-primary"/> Iframe embed (any website)</div>
                <Button size="sm" variant="ghost" onClick={() => copy(embedSnippet, "iframe")}>
                  {copied === "iframe" ? <Check className="h-4 w-4 text-success"/> : <Copy className="h-4 w-4"/>}<span className="ml-1">Copy</span>
                </Button>
              </div>
              <pre className="overflow-x-auto rounded-lg bg-background/60 p-3 font-mono text-xs text-muted-foreground">{embedSnippet}</pre>
            </Card>
          )}

          {buttonSnippet && (
            <Card className="glass border-border/60 p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-sm font-semibold">📞 Floating button (HTML / React / Vue / anywhere)</div>
                <Button size="sm" variant="ghost" onClick={() => copy(buttonSnippet, "btn")}>
                  {copied === "btn" ? <Check className="h-4 w-4 text-success"/> : <Copy className="h-4 w-4"/>}<span className="ml-1">Copy</span>
                </Button>
              </div>
              <pre className="overflow-x-auto rounded-lg bg-background/60 p-3 font-mono text-xs text-muted-foreground">{buttonSnippet}</pre>
            </Card>
          )}

          <Card className="glass border-border/60 p-5 text-sm text-muted-foreground">
            Need React Native, Flutter, Android, iOS or webhook integration? See <a href="/integration.txt" target="_blank" className="text-primary underline">/integration.txt</a>.
          </Card>
        </TabsContent>

        <TabsContent value="profile" className="mt-4">
          <CompanyProfilePanel companyId={company.id} />
        </TabsContent>

        <TabsContent value="security" className="mt-4 space-y-4">
          <DomainWhitelistPanel companyId={company.id} />
          <CompanyBlockedIpsPanel companyId={company.id} />
          <AppKeysPanel companyId={company.id} />
        </TabsContent>

        <TabsContent value="calls" className="mt-4">
          <Card className="glass border-border/60 p-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="text-left py-2">Customer</th>
                  <th className="text-left">IP</th>
                  <th className="text-left">Language</th>
                  <th className="text-left">Handled by</th>
                  <th className="text-left">Status</th>
                  <th className="text-left">Duration</th>
                  <th className="text-left">Started</th>
                </tr>
              </thead>
              <tbody>
                {calls.map((c) => {
                  const emp = c.employee_id ? employeeMap[c.employee_id] : null;
                  return (
                    <tr key={c.id} className="border-t border-border/60">
                      <td className="py-2">{c.customer_name ?? "Anonymous"}</td>
                      <td className="font-mono text-xs">{c.customer_ip ?? "—"}</td>
                      <td>{c.language ?? "—"}</td>
                      <td>
                        {emp ? (
                          <div className="flex flex-col">
                            <span className="font-medium">{emp.display_name || emp.email.split("@")[0]}</span>
                            <span className="text-xs text-muted-foreground">{emp.email}</span>
                          </div>
                        ) : c.ai_handled ? (
                          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">AI only</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td><Badge variant="outline">{c.status}</Badge></td>
                      <td>{c.duration_seconds ? `${c.duration_seconds}s` : "—"}</td>
                      <td className="text-muted-foreground text-xs">{new Date(c.started_at).toLocaleString()}</td>
                    </tr>
                  );
                })}
                {calls.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-muted-foreground">No calls yet. Embed the widget on your site to start receiving calls.</td></tr>}
              </tbody>
            </table>
          </Card>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Phone; label: string; value: string | number }) {
  return (
    <Card className="glass border-border/60 p-4 flex items-center gap-3">
      <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15 text-primary"><Icon className="h-5 w-5"/></div>
      <div>
        <div className="text-xl font-bold">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </Card>
  );
}
