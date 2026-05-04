import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Save, Building2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Props = { companyId: string };

type CompanyEditable = {
  name: string;
  business_description: string;
  contact_email: string;
  mobile: string | null;
  website: string | null;
};

export default function CompanyProfilePanel({ companyId }: Props) {
  const { toast } = useToast();
  const [c, setC] = useState<CompanyEditable | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("companies")
        .select("name, business_description, contact_email, mobile, website")
        .eq("id", companyId)
        .maybeSingle();
      if (data) setC(data as CompanyEditable);
    })();
  }, [companyId]);

  const save = async () => {
    if (!c) return;
    if (!c.business_description.trim() || c.business_description.trim().length < 10) {
      toast({ title: "Description too short", description: "Please write at least 10 characters so the AI can talk about your company.", variant: "destructive" });
      return;
    }
    if (!c.contact_email.trim()) {
      toast({ title: "Contact email required", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("companies")
      .update({
        name: c.name.trim().slice(0, 200),
        business_description: c.business_description.trim().slice(0, 4000),
        contact_email: c.contact_email.trim().slice(0, 255),
        mobile: c.mobile?.trim().slice(0, 30) || null,
        website: c.website?.trim().slice(0, 255) || null,
      })
      .eq("id", companyId);
    setSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Profile updated", description: "Your AI hold-assistant will use the new description on the next call." });
    }
  };

  if (!c) return <Loader2 className="h-5 w-5 animate-spin" />;

  return (
    <Card className="glass border-border/60 p-5 space-y-4 max-w-3xl">
      <div>
        <h3 className="font-semibold flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          Company profile
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Edit your company information any time. The <strong>business description</strong> is what the AI hold-assistant uses to talk to your customers — keep it clear, complete, and up-to-date.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-xs">Company name</Label>
          <Input value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} maxLength={200} />
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Website (optional)</Label>
          <Input value={c.website ?? ""} onChange={(e) => setC({ ...c, website: e.target.value })} placeholder="https://example.com" maxLength={255} />
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Contact email</Label>
          <Input type="email" value={c.contact_email} onChange={(e) => setC({ ...c, contact_email: e.target.value })} maxLength={255} />
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Mobile / phone (optional)</Label>
          <Input value={c.mobile ?? ""} onChange={(e) => setC({ ...c, mobile: e.target.value })} placeholder="+91 ..." maxLength={30} />
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Business description (used by the AI assistant)</Label>
        <Textarea
          value={c.business_description}
          onChange={(e) => setC({ ...c, business_description: e.target.value })}
          rows={8}
          maxLength={4000}
          placeholder="What does your company do? What products / services? Hours, refund policy, common customer questions, anything you want the AI to know..."
        />
        <p className="text-[11px] text-muted-foreground">{c.business_description.length} / 4000 characters</p>
      </div>

      <Button onClick={save} disabled={saving} className="bg-gradient-primary text-primary-foreground">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-2" />Save profile</>}
      </Button>
    </Card>
  );
}
