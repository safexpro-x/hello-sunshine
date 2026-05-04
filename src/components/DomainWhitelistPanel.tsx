import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Shield, Plus, Trash2, Loader2, Globe } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type DomainRow = { id: string; domain: string; label: string | null; created_at: string };

const DOMAIN_RE = /^(?!:\/\/)([a-zA-Z0-9-_]+\.)+[a-zA-Z]{2,}$/;

function normalize(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "");
}

export default function DomainWhitelistPanel({ companyId }: { companyId: string }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<DomainRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [domain, setDomain] = useState("");
  const [label, setLabel] = useState("");
  const [adding, setAdding] = useState(false);

  const refresh = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("company_domain_whitelist")
      .select("id, domain, label, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });
    setRows((data ?? []) as DomainRow[]);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, [companyId]);

  const addDomain = async () => {
    const norm = normalize(domain);
    if (!norm) {
      toast({ title: "Enter a domain", variant: "destructive" });
      return;
    }
    if (!DOMAIN_RE.test(norm)) {
      toast({
        title: "Invalid domain",
        description: "Use format like mysite.com or shop.example.co",
        variant: "destructive",
      });
      return;
    }
    setAdding(true);
    const { error } = await supabase.from("company_domain_whitelist").insert({
      company_id: companyId,
      domain: norm,
      label: label.trim() || null,
    });
    setAdding(false);
    if (error) {
      toast({ title: "Failed to add", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Domain whitelisted", description: `${norm} and its subdomains are now allowed.` });
      setDomain("");
      setLabel("");
      refresh();
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Remove this domain from whitelist?")) return;
    const { error } = await supabase.from("company_domain_whitelist").delete().eq("id", id);
    if (error) toast({ title: "Failed", description: error.message, variant: "destructive" });
    else refresh();
  };

  return (
    <Card className="glass border-border/60 p-5">
      <div className="flex items-center gap-2 mb-2">
        <Shield className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">Allowed website domains</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        If empty, the widget can be embedded on <strong>any</strong> website. Add one or more domains
        (e.g. <code className="font-mono text-foreground">mysite.com</code>) to restrict launches to
        only those sites and their subdomains. The customer's browser sends the page origin and we
        verify it server-side before starting the call.
      </p>

      <div className="flex flex-wrap gap-2 mb-4">
        <Input
          placeholder="e.g. mysite.com"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          className="font-mono text-sm flex-1 min-w-[220px]"
        />
        <Input
          placeholder="Label (optional)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="text-sm flex-1 min-w-[160px]"
        />
        <Button onClick={addDomain} disabled={adding} className="bg-primary text-primary-foreground">
          {adding ? <Loader2 className="h-4 w-4 animate-spin"/> : <><Plus className="h-4 w-4 mr-1"/>Add</>}
        </Button>
      </div>

      {loading ? (
        <Loader2 className="h-5 w-5 animate-spin"/>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 p-6 text-center">
          <Globe className="h-6 w-6 mx-auto text-muted-foreground mb-2"/>
          <p className="text-sm text-muted-foreground">No restrictions — calls allowed from any website.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-background/40 p-3">
              <div className="flex items-center gap-3 min-w-0">
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 font-mono text-xs">{r.domain}</Badge>
                {r.label && <span className="text-sm truncate">{r.label}</span>}
              </div>
              <Button size="sm" variant="ghost" onClick={() => remove(r.id)}>
                <Trash2 className="h-4 w-4 text-destructive"/>
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
