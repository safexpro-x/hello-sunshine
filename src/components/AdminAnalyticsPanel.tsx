import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, Phone, Bot, Users, Building2, Clock, TrendingUp,
  Globe, IndianRupee, CheckCircle2, XCircle, AlertCircle,
} from "lucide-react";

type CallRow = {
  id: string; company_id: string; status: string; ai_handled: boolean;
  language: string | null; started_at: string; ended_at: string | null;
  duration_seconds: number | null; customer_email: string | null; customer_phone: string | null;
};
type CompanyRow = { id: string; name: string; status: string; created_at: string };
type EmpRow = { id: string; company_id: string; is_active: boolean };
type SubRow = { id: string; company_id: string; status: string; expires_at: string };
type PaymentRow = { id: string; status: string; amount_paise: number; paid_at: string | null; created_at: string };

const fmtDur = (s: number) => {
  if (!s) return "0s";
  const m = Math.floor(s / 60), r = s % 60;
  return m ? `${m}m ${r}s` : `${r}s`;
};

export default function AdminAnalyticsPanel() {
  const [loading, setLoading] = useState(true);
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [employees, setEmployees] = useState<EmpRow[]>([]);
  const [subs, setSubs] = useState<SubRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [c, co, e, s, p] = await Promise.all([
        supabase.from("calls").select("id,company_id,status,ai_handled,language,started_at,ended_at,duration_seconds,customer_email,customer_phone").order("started_at", { ascending: false }).limit(1000),
        supabase.from("companies").select("id,name,status,created_at"),
        supabase.from("employees").select("id,company_id,is_active"),
        supabase.from("subscriptions").select("id,company_id,status,expires_at"),
        supabase.from("payments").select("id,status,amount_paise,paid_at,created_at").order("created_at", { ascending: false }).limit(1000),
      ]);
      setCalls((c.data ?? []) as CallRow[]);
      setCompanies((co.data ?? []) as CompanyRow[]);
      setEmployees((e.data ?? []) as EmpRow[]);
      setSubs((s.data ?? []) as SubRow[]);
      setPayments((p.data ?? []) as PaymentRow[]);
      setLoading(false);
    })();
  }, []);

  const stats = useMemo(() => {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const last24 = calls.filter((c) => now - new Date(c.started_at).getTime() < dayMs);
    const last7 = calls.filter((c) => now - new Date(c.started_at).getTime() < 7 * dayMs);

    const completed = calls.filter((c) => c.status === "ended");
    const totalDur = completed.reduce((s, c) => s + (c.duration_seconds || 0), 0);
    const avgDur = completed.length ? Math.round(totalDur / completed.length) : 0;

    const aiOnly = calls.filter((c) => c.ai_handled && c.status === "ended" && (!c.duration_seconds || c.duration_seconds < 5));
    const handed = calls.filter((c) => c.status === "ended" && (c.duration_seconds || 0) >= 5);
    const conversion = calls.length ? Math.round((handed.length / calls.length) * 100) : 0;
    const captured = calls.filter((c) => c.customer_email || c.customer_phone).length;
    const captureRate = calls.length ? Math.round((captured / calls.length) * 100) : 0;

    // language breakdown
    const byLang: Record<string, number> = {};
    calls.forEach((c) => {
      const l = (c.language || "unknown").toLowerCase();
      byLang[l] = (byLang[l] || 0) + 1;
    });
    const langs = Object.entries(byLang).sort((a, b) => b[1] - a[1]).slice(0, 8);

    // status breakdown
    const byStatus: Record<string, number> = {};
    calls.forEach((c) => { byStatus[c.status] = (byStatus[c.status] || 0) + 1; });

    // 7-day trend
    const trend: { day: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now - i * dayMs);
      const key = d.toISOString().slice(0, 10);
      const count = calls.filter((c) => c.started_at.slice(0, 10) === key).length;
      trend.push({ day: d.toLocaleDateString(undefined, { weekday: "short" }), count });
    }
    const maxTrend = Math.max(1, ...trend.map((t) => t.count));

    // top companies
    const byCompany: Record<string, number> = {};
    calls.forEach((c) => { byCompany[c.company_id] = (byCompany[c.company_id] || 0) + 1; });
    const topCompanies = Object.entries(byCompany)
      .map(([cid, n]) => ({ name: companies.find((x) => x.id === cid)?.name || "—", n }))
      .sort((a, b) => b.n - a.n).slice(0, 5);

    // revenue
    const paidPayments = payments.filter((p) => p.status === "paid");
    const revenuePaise = paidPayments.reduce((s, p) => s + (p.amount_paise || 0), 0);
    const revenue = Math.round(revenuePaise / 100);
    const last30Revenue = Math.round(
      paidPayments.filter((p) => p.paid_at && now - new Date(p.paid_at).getTime() < 30 * dayMs)
        .reduce((s, p) => s + (p.amount_paise || 0), 0) / 100
    );

    // companies
    const approved = companies.filter((c) => c.status === "approved").length;
    const pending = companies.filter((c) => c.status === "pending").length;
    const rejected = companies.filter((c) => c.status === "rejected").length;
    const activeSubs = subs.filter((s) => s.status === "active" && new Date(s.expires_at).getTime() > now).length;
    const activeAgents = employees.filter((e) => e.is_active).length;

    return {
      last24: last24.length, last7: last7.length, total: calls.length,
      avgDur, totalDur, conversion, captureRate,
      aiOnly: aiOnly.length, handed: handed.length,
      langs, byStatus, trend, maxTrend, topCompanies,
      revenue, last30Revenue,
      approved, pending, rejected, activeSubs, activeAgents,
    };
  }, [calls, companies, employees, subs, payments]);

  if (loading) {
    return <div className="grid place-items-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground"/></div>;
  }

  return (
    <div className="space-y-6">
      {/* Top KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPI icon={Phone} label="Total calls" value={stats.total} sub={`${stats.last24} in 24h`} />
        <KPI icon={Bot} label="AI-only" value={stats.aiOnly} sub="agent never picked" />
        <KPI icon={CheckCircle2} label="Agent answered" value={stats.handed} sub={`${stats.conversion}% conversion`} />
        <KPI icon={Clock} label="Avg duration" value={fmtDur(stats.avgDur)} sub={`total ${fmtDur(stats.totalDur)}`} />
        <KPI icon={Building2} label="Companies" value={stats.approved} sub={`${stats.pending} pending · ${stats.rejected} rejected`} />
        <KPI icon={Users} label="Active agents" value={stats.activeAgents} sub={`${stats.activeSubs} active plans`} />
        <KPI icon={IndianRupee} label="Total revenue" value={`₹${stats.revenue.toLocaleString()}`} sub={`₹${stats.last30Revenue.toLocaleString()} last 30d`} />
        <KPI icon={TrendingUp} label="Lead capture" value={`${stats.captureRate}%`} sub="email or phone collected" />
      </div>

      {/* 7-day trend */}
      <Card className="glass border-border/60 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary"/>Calls — last 7 days</h3>
          <Badge variant="outline">{stats.last7} this week</Badge>
        </div>
        <div className="flex items-end gap-2 h-40">
          {stats.trend.map((t) => (
            <div key={t.day} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full flex items-end h-32">
                <div
                  className="w-full bg-gradient-to-t from-primary to-primary/40 rounded-t-md transition-all"
                  style={{ height: `${(t.count / stats.maxTrend) * 100}%`, minHeight: t.count > 0 ? 4 : 0 }}
                  title={`${t.count} calls`}
                />
              </div>
              <div className="text-[11px] text-muted-foreground">{t.day}</div>
              <div className="text-xs font-mono">{t.count}</div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Status breakdown */}
        <Card className="glass border-border/60 p-5">
          <h3 className="font-semibold flex items-center gap-2 mb-4"><AlertCircle className="h-4 w-4 text-primary"/>Call status</h3>
          <div className="space-y-2">
            {Object.entries(stats.byStatus).length === 0 && (
              <p className="text-xs text-muted-foreground">No calls yet.</p>
            )}
            {Object.entries(stats.byStatus).map(([k, v]) => {
              const pct = Math.round((v / Math.max(1, stats.total)) * 100);
              return (
                <div key={k}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="capitalize">{k}</span>
                    <span className="font-mono">{v} · {pct}%</span>
                  </div>
                  <div className="h-2 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Languages */}
        <Card className="glass border-border/60 p-5">
          <h3 className="font-semibold flex items-center gap-2 mb-4"><Globe className="h-4 w-4 text-primary"/>Top languages</h3>
          <div className="space-y-2">
            {stats.langs.length === 0 && <p className="text-xs text-muted-foreground">No calls yet.</p>}
            {stats.langs.map(([lang, n]) => {
              const pct = Math.round((n / Math.max(1, stats.total)) * 100);
              return (
                <div key={lang}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="uppercase font-mono">{lang}</span>
                    <span className="font-mono">{n} · {pct}%</span>
                  </div>
                  <div className="h-2 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-primary to-accent" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Top companies */}
      <Card className="glass border-border/60 p-5">
        <h3 className="font-semibold flex items-center gap-2 mb-4"><Building2 className="h-4 w-4 text-primary"/>Top companies by calls</h3>
        {stats.topCompanies.length === 0 ? (
          <p className="text-xs text-muted-foreground">No data yet.</p>
        ) : (
          <div className="space-y-2">
            {stats.topCompanies.map((c, i) => (
              <div key={c.name + i} className="flex items-center justify-between gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-5">#{i + 1}</span>
                  <span className="font-medium">{c.name}</span>
                </div>
                <Badge variant="outline" className="font-mono">{c.n} calls</Badge>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function KPI({ icon: Icon, label, value, sub }: { icon: any; label: string; value: number | string; sub?: string }) {
  return (
    <Card className="glass border-border/60 p-4">
      <div className="flex items-center gap-2 text-muted-foreground text-xs">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </Card>
  );
}
