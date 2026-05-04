import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, Building2, ShieldCheck, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Company = {
  id: string;
  name: string;
  contact_email: string;
  business_description: string;
  mobile: string | null;
  website: string | null;
  status: "pending" | "approved" | "rejected";
  owner_id: string;
  created_at: string;
};
type Profile = { user_id: string; display_name: string | null; email: string | null; phone: string | null };
type Sub = { company_id: string; status: string; expires_at: string; used_calls: number; plans?: { name: string; call_quota: number | null; agent_quota: number | null } | null };
type BlockedIp = { id: string; company_id: string; ip_address: string; reason: string | null; created_at: string };

export default function CompanyDetailsPanel() {
  const { toast } = useToast();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [blocked, setBlocked] = useState<BlockedIp[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const refresh = async () => {
    setLoading(true);
    const [c, s, b] = await Promise.all([
      supabase.from("companies").select("*").order("created_at", { ascending: false }),
      supabase.from("subscriptions").select("company_id, status, expires_at, used_calls, plans(name, call_quota, agent_quota)").eq("status", "active"),
      supabase.from("blocked_ips").select("*").order("created_at", { ascending: false }),
    ]);
    const cs = (c.data ?? []) as Company[];
    setCompanies(cs);
    setSubs((s.data ?? []) as Sub[]);
    setBlocked((b.data ?? []) as BlockedIp[]);
    const ownerIds = Array.from(new Set(cs.map((x) => x.owner_id)));
    if (ownerIds.length) {
      const { data: pr } = await supabase
        .from("profiles")
        .select("user_id, display_name, email, phone")
        .in("user_id", ownerIds);
      setProfiles((pr ?? []) as Profile[]);
    }
    setLoading(false);
  };
  useEffect(() => { refresh(); }, []);

  const profileFor = (ownerId: string) => profiles.find((p) => p.user_id === ownerId);
  const subFor = (cid: string) => subs.find((x) => x.company_id === cid);
  const ipsFor = (cid: string) => blocked.filter((x) => x.company_id === cid);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((c) =>
      [c.name, c.contact_email, c.mobile, c.website, profileFor(c.owner_id)?.email, profileFor(c.owner_id)?.display_name]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [companies, profiles, search]);

  const updateField = (id: string, field: keyof Company, value: string) => {
    setCompanies((arr) => arr.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
  };

  const saveCompany = async (c: Company) => {
    setSavingId(c.id);
    const { error } = await supabase
      .from("companies")
      .update({
        name: c.name.trim(),
        contact_email: c.contact_email.trim(),
        business_description: c.business_description.trim(),
        mobile: c.mobile?.trim() || null,
        website: c.website?.trim() || null,
      })
      .eq("id", c.id);
    setSavingId(null);
    if (error) toast({ title: "Save failed", description: error.message, variant: "destructive" });
    else toast({ title: "Company updated" });
  };

  const unbanIp = async (ipId: string) => {
    const { error } = await supabase.from("blocked_ips").delete().eq("id", ipId);
    if (error) toast({ title: "Unban failed", description: error.message, variant: "destructive" });
    else { toast({ title: "IP unbanned" }); refresh(); }
  };

  if (loading) return <Loader2 className="h-5 w-5 animate-spin" />;

  return (
    <div className="space-y-4">
      <Card className="glass border-border/60 p-4">
        <div className="flex items-center gap-3">
          <Building2 className="h-5 w-5 text-primary" />
          <Input placeholder="Search by company, owner, email, mobile…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </Card>

      {filtered.map((c) => {
        const p = profileFor(c.owner_id);
        const s = subFor(c.id);
        const ips = ipsFor(c.id);
        const expiresIn = s ? Math.max(0, Math.ceil((new Date(s.expires_at).getTime() - Date.now()) / 86400000)) : null;
        return (
          <Card key={c.id} className="glass border-border/60 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">{c.name}</h3>
                <Badge variant="outline" className={
                  c.status === "approved" ? "bg-primary/10 text-primary border-primary/30"
                  : c.status === "rejected" ? "bg-destructive/10 text-destructive border-destructive/30"
                  : "bg-warning/10 text-warning border-warning/30"
                }>{c.status}</Badge>
                {s && (
                  <Badge variant="outline" className="bg-secondary">
                    {s.plans?.name ?? "Plan"} · {s.used_calls}/{s.plans?.call_quota ?? "∞"} calls · {expiresIn}d left
                  </Badge>
                )}
              </div>
              <Button size="sm" onClick={() => saveCompany(c)} disabled={savingId === c.id} className="bg-gradient-primary text-primary-foreground">
                {savingId === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-1" /> Save</>}
              </Button>
            </div>

            {p && (
              <div className="rounded-lg border border-border/60 p-3 text-xs grid sm:grid-cols-3 gap-2 bg-background/40">
                <div><span className="text-muted-foreground">Owner name:</span> <span className="font-medium">{p.display_name ?? "—"}</span></div>
                <div><span className="text-muted-foreground">Owner email:</span> <span className="font-medium">{p.email ?? "—"}</span></div>
                <div><span className="text-muted-foreground">Owner phone:</span> <span className="font-medium">{p.phone ?? "—"}</span></div>
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs">Company name</Label>
                <Input value={c.name} onChange={(e) => updateField(c.id, "name", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Contact email</Label>
                <Input value={c.contact_email} onChange={(e) => updateField(c.id, "contact_email", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Company mobile</Label>
                <Input value={c.mobile ?? ""} onChange={(e) => updateField(c.id, "mobile", e.target.value)} placeholder="+91…" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Website</Label>
                <Input value={c.website ?? ""} onChange={(e) => updateField(c.id, "website", e.target.value)} placeholder="https://…" />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Business description (used by AI)</Label>
              <Textarea
                rows={4}
                value={c.business_description}
                onChange={(e) => updateField(c.id, "business_description", e.target.value)}
              />
            </div>

            {ips.length > 0 && (
              <div className="rounded-lg border border-border/60 p-3 space-y-2">
                <div className="text-xs font-semibold flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-warning" /> Blocked IPs ({ips.length})</div>
                <div className="space-y-1">
                  {ips.map((ip) => (
                    <div key={ip.id} className="flex items-center justify-between text-xs">
                      <code className="font-mono">{ip.ip_address}</code>
                      <span className="text-muted-foreground flex-1 px-3 truncate">{ip.reason ?? ""}</span>
                      <Button size="sm" variant="ghost" onClick={() => unbanIp(ip.id)}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        );
      })}

      {filtered.length === 0 && <p className="text-sm text-muted-foreground">No companies match.</p>}
    </div>
  );
}
