import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Building2, Loader2, Clock } from "lucide-react";

export default function CompanyOnboard() {
  const { user, roles } = useAuth();
  const nav = useNavigate();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ name: string; status: string } | null>(null);
  const [isInvitedEmployee, setIsInvitedEmployee] = useState(false);

  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [contactEmail, setContactEmail] = useState(user?.email ?? "");
  const [desc, setDesc] = useState("");

  useEffect(() => {
    if (!user) return;
    setContactEmail(user.email ?? "");
    // If this user is a linked employee of some company, redirect to agent queue —
    // they cannot register their own company.
    supabase.from("employees").select("id, company_id").eq("user_id", user.id).eq("is_active", true).maybeSingle().then(({ data: emp }) => {
      if (emp) { setIsInvitedEmployee(true); nav("/agent", { replace: true }); return; }
      supabase.from("companies").select("name,status").eq("owner_id", user.id).maybeSingle().then(({ data }) => {
        if (data) setPending({ name: data.name, status: data.status as string });
        if (data?.status === "approved" && roles.includes("company_owner")) nav("/company", { replace: true });
      });
    });
  }, [user, roles, nav]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    const { error } = await supabase.from("companies").insert({
      owner_id: user.id,
      name: name.trim(),
      website: website.trim() || null,
      contact_email: contactEmail.trim(),
      business_description: desc.trim(),
    });
    if (!error) {
      // Self-assign company_owner role so they can manage once approved
      await supabase.from("user_roles").insert({ user_id: user.id, role: "company_owner" });
    }
    setBusy(false);
    if (error) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Submitted", description: "Your registration is pending admin approval." });
      setPending({ name, status: "pending" });
    }
  };

  if (pending) {
    return (
      <AppShell>
        <Card className="glass max-w-lg mx-auto p-8 border-border/60 text-center">
          <Clock className="h-10 w-10 text-warning mx-auto mb-3" />
          <h2 className="text-xl font-bold">{pending.name}</h2>
          <p className="mt-2 text-muted-foreground">
            Status: <span className="font-semibold capitalize">{pending.status}</span>
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            {pending.status === "pending" && "Your company is awaiting admin approval. You'll get access to the dashboard once approved."}
            {pending.status === "rejected" && "Your registration was rejected. Contact the admin for details."}
            {pending.status === "approved" && "Approved! Redirecting…"}
          </p>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Card className="glass max-w-2xl mx-auto p-8 border-border/60">
        <div className="flex items-center gap-3 mb-6">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-primary shadow-glow">
            <Building2 className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Register your company</h2>
            <p className="text-sm text-muted-foreground">Admin will review and approve your account.</p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label>Company name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} placeholder="Acme Inc." />
          </div>
          <div>
            <Label>Website</Label>
            <Input type="url" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://acme.com" />
            <p className="text-xs text-muted-foreground mt-1">We'll share this with our AI so it understands your business when speaking to customers on hold.</p>
          </div>
          <div>
            <Label>Contact email *</Label>
            <Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} required />
          </div>
          <div>
            <Label>What does your company do? *</Label>
            <Textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              required
              rows={5}
              maxLength={2000}
              placeholder="We sell custom merchandise online. Customers usually contact us about order status, sizing, returns, and bulk pricing…"
            />
            <p className="text-xs text-muted-foreground mt-1">The hold-AI uses this to chat with customers in their language until your agent picks up.</p>
          </div>
          <Button type="submit" disabled={busy} className="w-full bg-gradient-primary text-primary-foreground">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit for approval"}
          </Button>
        </form>
      </Card>
    </AppShell>
  );
}
