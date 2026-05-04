import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Phone, Sparkles, Code2, Zap, ShieldCheck, Globe, Users, Building2, Headset, Check, Infinity as InfinityIcon, Lock, KeyRound, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth, isAdmin, isCompanyOwner, isEmployee } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useSiteSeo } from "@/lib/seo";

type Plan = { id: string; code: string; name: string; price_paise: number; call_quota: number | null; agent_quota: number | null; validity_days: number; sort_order: number };
type SiteContent = { hero_headline: string; hero_subheadline: string; hero_badge: string; pricing_tagline: string; footer_text: string };

export default function Landing() {
  const { user, roles } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [content, setContent] = useState<SiteContent | null>(null);
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");
  useSiteSeo();

  useEffect(() => {
    supabase.from("plans").select("*").eq("is_active", true).order("sort_order").then(({ data }) => {
      setPlans((data ?? []) as Plan[]);
    });
    supabase.from("site_content").select("hero_headline, hero_subheadline, hero_badge, pricing_tagline, footer_text").eq("id", 1).maybeSingle().then(({ data }) => {
      if (data) setContent(data as SiteContent);
    });
  }, []);

  const visiblePlans = plans.filter((p) =>
    billing === "yearly" ? p.validity_days >= 180 : p.validity_days < 180
  );

  let cta = { to: "/auth", label: "Get started — Register company" };
  if (user) {
    if (isAdmin(roles)) cta = { to: "/admin", label: "Open admin panel" };
    else if (isCompanyOwner(roles)) cta = { to: "/company", label: "Open dashboard" };
    else if (isEmployee(roles)) cta = { to: "/agent", label: "Open agent queue" };
    else cta = { to: "/onboard", label: "Register your company" };
  }

  return (
    <div className="min-h-screen">
      <header className="container flex items-center justify-between py-6">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-primary shadow-glow">
            <Phone className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-lg font-bold tracking-tight">Zentord</span>
        </div>
        <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
          <a href="#how" className="hover:text-foreground">How it works</a>
          <a href="#features" className="hover:text-foreground">Features</a>
          <a href="#pricing" className="hover:text-foreground">Pricing</a>
        </nav>
        <div className="flex items-center gap-2">
          {user ? (
            <Button asChild size="sm" className="bg-gradient-primary text-primary-foreground"><Link to={cta.to}>Dashboard</Link></Button>
          ) : (
            <>
              <Button asChild size="sm" variant="ghost"><Link to="/auth">Sign in</Link></Button>
              <Button asChild size="sm" className="bg-gradient-primary text-primary-foreground"><Link to="/auth">Sign up</Link></Button>
            </>
          )}
        </div>
      </header>

      <section className="container pt-10 pb-20 text-center">
        <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-border bg-secondary/50 px-3 py-1 text-xs text-muted-foreground">
          <Sparkles className="h-3 w-3 text-primary"/> {content?.hero_badge || "Multi-tenant · AI hold · Free WebRTC"}
        </div>
        <h1 className="mx-auto mt-6 max-w-3xl text-balance text-4xl font-extrabold tracking-tight sm:text-5xl md:text-7xl">
          {content?.hero_headline || "Voice support, on every product."}
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base sm:text-lg text-muted-foreground">
          {content?.hero_subheadline || "Register your company, embed one button anywhere, and let an AI hold-assistant chat with customers in their own language while your agents pick up."}
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg" className="h-14 rounded-full bg-gradient-primary px-10 text-base font-semibold text-primary-foreground shadow-glow hover:opacity-90">
            <Link to={cta.to}><Zap className="mr-2 h-5 w-5"/>{cta.label}</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="h-14 rounded-full px-8 border-border">
            <a href="#pricing">See pricing</a>
          </Button>
        </div>
      </section>

      <section id="how" className="container py-16">
        <h2 className="mb-12 text-center text-3xl font-bold md:text-4xl">How it works</h2>
        <div className="grid gap-5 md:grid-cols-4">
          {[
            { i: <Building2 className="h-5 w-5"/>, n: "01", t: "Register", d: "Sign up & describe your business. Admin approves your company." },
            { i: <Users className="h-5 w-5"/>, n: "02", t: "Add agents", d: "Invite your support team by email. They sign up & appear in the queue." },
            { i: <Code2 className="h-5 w-5"/>, n: "03", t: "Embed", d: "Drop one iframe or link on any website, app, Flutter, React Native, etc." },
            { i: <Headset className="h-5 w-5"/>, n: "04", t: "Talk", d: "Customer picks language → AI greets in that language → first available agent picks up." },
          ].map((s) => (
            <Card key={s.n} className="glass border-border/60 p-6">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/15 text-primary">{s.i}</div>
              <div className="mt-3 text-xs font-mono text-primary">{s.n}</div>
              <div className="mt-1 text-lg font-semibold">{s.t}</div>
              <p className="mt-1 text-sm text-muted-foreground">{s.d}</p>
            </Card>
          ))}
        </div>
      </section>

      <section id="features" className="container py-16">
        <div className="grid gap-4 md:grid-cols-4">
          {[
            { i: <Zap className="h-5 w-5"/>, t: "Crystal-clear voice", d: "Low-latency calls that work even on weak networks." },
            { i: <ShieldCheck className="h-5 w-5"/>, t: "Zero call cost", d: "No per-minute charges — pay only for your plan." },
            { i: <Globe className="h-5 w-5"/>, t: "10+ languages", d: "Customer picks; AI sticks to it strictly." },
            { i: <Sparkles className="h-5 w-5"/>, t: "Smart hold AI", d: "Knows your business; never goes off-topic." },
          ].map((f) => (
            <Card key={f.t} className="glass border-border/60 p-5">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/15 text-primary">{f.i}</div>
              <div className="mt-3 font-semibold">{f.t}</div>
              <div className="mt-1 text-sm text-muted-foreground">{f.d}</div>
            </Card>
          ))}
        </div>
      </section>

      <section id="pricing" className="container py-20">
        <div className="text-center mb-8">
          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">Simple pricing</Badge>
          <h2 className="mt-4 text-3xl font-bold md:text-4xl">Plans for every team size</h2>
          <p className="mt-3 text-muted-foreground">{content?.pricing_tagline || "Start free, then pay once for the validity period. Cancel any time."}</p>
        </div>

        <div className="flex justify-center mb-10">
          <div className="inline-flex rounded-full border border-border bg-secondary/40 p-1">
            <button
              type="button"
              onClick={() => setBilling("monthly")}
              className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${billing === "monthly" ? "bg-gradient-primary text-primary-foreground shadow-glow" : "text-muted-foreground hover:text-foreground"}`}
            >Monthly</button>
            <button
              type="button"
              onClick={() => setBilling("yearly")}
              className={`px-5 py-2 rounded-full text-sm font-medium transition-all relative ${billing === "yearly" ? "bg-gradient-primary text-primary-foreground shadow-glow" : "text-muted-foreground hover:text-foreground"}`}
            >
              Yearly
              <span className="absolute -top-2 -right-2 text-[9px] bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 font-bold">SAVE</span>
            </button>
          </div>
        </div>

        <div className={`grid gap-5 sm:grid-cols-2 ${visiblePlans.length >= 4 ? "lg:grid-cols-4" : "md:grid-cols-3"} max-w-6xl mx-auto`}>
          {visiblePlans.map((p) => {
            const isFree = p.price_paise === 0;
            const featured = p.code === "growth" || p.code === "yearly_growth" || (!isFree && visiblePlans.length > 2 && p === visiblePlans[Math.floor(visiblePlans.length / 2)]);
            return (
              <Card key={p.id} className={`glass relative p-6 flex flex-col ${featured ? "border-primary/50 shadow-glow" : "border-border/60"}`}>
                {featured && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-primary text-primary-foreground border-0">Most popular</Badge>
                )}
                {isFree && (
                  <Badge variant="outline" className="absolute -top-3 left-1/2 -translate-x-1/2 bg-secondary border-primary/40 text-primary">Free trial</Badge>
                )}
                <h3 className="text-lg font-bold">{p.name}</h3>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold">₹{(p.price_paise/100).toFixed(0)}</span>
                  <span className="text-sm text-muted-foreground">/ {p.validity_days >= 365 ? "year" : p.validity_days >= 28 ? "month" : `${p.validity_days}d`}</span>
                </div>
                <ul className="mt-6 space-y-3 text-sm flex-1">
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-primary mt-0.5 shrink-0"/>
                    {p.call_quota === null
                      ? <span className="inline-flex items-center gap-1 font-medium"><InfinityIcon className="h-4 w-4"/> Unlimited calls</span>
                      : <span><strong>{p.call_quota.toLocaleString()}</strong> customer calls</span>}
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-primary mt-0.5 shrink-0"/>
                    {p.agent_quota === null
                      ? <span className="inline-flex items-center gap-1 font-medium"><InfinityIcon className="h-4 w-4"/> Unlimited agents</span>
                      : <span><strong>{p.agent_quota}</strong> active agent{p.agent_quota === 1 ? "" : "s"}</span>}
                  </li>
                  <li className="flex items-start gap-2"><Check className="h-4 w-4 text-primary mt-0.5 shrink-0"/>AI hold assistant in 10+ languages</li>
                  <li className="flex items-start gap-2"><Check className="h-4 w-4 text-primary mt-0.5 shrink-0"/>Embed on any website or app</li>
                  <li className="flex items-start gap-2"><Check className="h-4 w-4 text-primary mt-0.5 shrink-0"/>Domain & app-key security</li>
                </ul>
                <Button asChild className={`mt-6 w-full ${featured ? "bg-gradient-primary text-primary-foreground shadow-glow" : ""}`} variant={featured ? "default" : "outline"}>
                  <Link to={user ? "/company/billing" : "/auth"}>{isFree ? "Start free" : `Get ${p.name}`}</Link>
                </Button>
              </Card>
            );
          })}
          {visiblePlans.length === 0 && (
            <p className="md:col-span-3 text-center text-sm text-muted-foreground">No {billing} plans available right now.</p>
          )}
        </div>
      </section>

      <section id="security" className="container py-16">
        <div className="text-center mb-10">
          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">Enterprise-grade security</Badge>
          <h2 className="mt-4 text-3xl font-bold md:text-4xl">Built secure by default</h2>
          <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
            Same security primitives the world's biggest AI products rely on — applied to every call, every widget, every dashboard.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { i: <Lock className="h-5 w-5"/>, t: "End-to-end protected", d: "TLS 1.3 in transit, encrypted at rest, strict CSP, HSTS, X-Frame-Options, X-Content-Type-Options & Permissions-Policy on every response." },
            { i: <KeyRound className="h-5 w-5"/>, t: "Zero-trust widget keys", d: "Customer URLs use opaque short slugs — your real API key never reaches the browser. Each call gets a one-time session token that auto-expires." },
            { i: <Eye className="h-5 w-5"/>, t: "Row-level isolation", d: "Per-tenant Row-Level Security on every table. Companies can only ever see their own data." },
            { i: <ShieldCheck className="h-5 w-5"/>, t: "Domain & IP gating", d: "Whitelist the domains that can host your widget. Block abusive IPs from your dashboard in one click." },
            { i: <Sparkles className="h-5 w-5"/>, t: "AI provider switch", d: "Flip between OpenAI and Lovable AI any time — keys are stored encrypted, fallback paths keep calls alive even if a provider is down." },
            { i: <Globe className="h-5 w-5"/>, t: "Privacy-first by design", d: "No third-party trackers. GDPR-friendly retention. Customer PII collected only with consent during the call." },
          ].map((f) => (
            <Card key={f.t} className="glass border-border/60 p-5">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15 text-primary">{f.i}</div>
              <div className="mt-3 font-semibold">{f.t}</div>
              <div className="mt-1 text-sm text-muted-foreground">{f.d}</div>
            </Card>
          ))}
        </div>
      </section>

      <section className="container pb-20">
        <Card className="glass relative overflow-hidden border-border/60 p-10 text-center">
          <div className="absolute inset-0 bg-gradient-primary opacity-10"/>
          <div className="relative">
            <h3 className="text-2xl font-bold md:text-3xl">Ready to get started?</h3>
            <p className="mx-auto mt-2 max-w-lg text-muted-foreground">
              Register your company and you'll get full integration snippets for any website, app or platform — instantly.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button asChild className="bg-gradient-primary text-primary-foreground"><Link to={cta.to}>{cta.label}</Link></Button>
            </div>
          </div>
        </Card>
      </section>

      <footer className="border-t border-border/60 py-8 text-center text-sm text-muted-foreground space-y-2">
        <div className="flex flex-wrap justify-center gap-4">
          <Link to="/privacy" className="hover:text-foreground">Privacy</Link>
          <Link to="/terms" className="hover:text-foreground">Terms</Link>
          <Link to="/contact" className="hover:text-foreground">Contact</Link>
        </div>
        <div>{content?.footer_text || `© ${new Date().getFullYear()} Zentord · Multi-tenant voice support platform`}</div>
      </footer>
    </div>
  );
}
