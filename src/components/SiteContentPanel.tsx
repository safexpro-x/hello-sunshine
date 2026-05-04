// Admin edits public landing headline, taglines, and legal pages from one panel.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save } from "lucide-react";

type SiteContent = {
  hero_headline: string;
  hero_subheadline: string;
  hero_badge: string;
  pricing_tagline: string;
  privacy_policy: string;
  terms_of_service: string;
  contact_us: string;
  site_title: string;
  meta_description: string;
  footer_text: string;
};

const DEFAULTS: SiteContent = {
  hero_headline: "Voice support, on every product.",
  hero_subheadline: "",
  hero_badge: "Multi-tenant · AI hold · Free WebRTC",
  pricing_tagline: "",
  privacy_policy: "",
  terms_of_service: "",
  contact_us: "",
  site_title: "Zentord — Multi-tenant Voice Support Platform",
  meta_description: "Zentord lets any company embed a voice support button on their site or app.",
  footer_text: "© Zentord. All rights reserved.",
};

export default function SiteContentPanel() {
  const { toast } = useToast();
  const [c, setC] = useState<SiteContent | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from("site_content").select("*").eq("id", 1).maybeSingle().then(({ data }) => {
      setC({ ...DEFAULTS, ...(data || {}) } as SiteContent);
    });
  }, []);

  const save = async () => {
    if (!c) return;
    setBusy(true);
    const { error } = await supabase.from("site_content").update({
      hero_headline: c.hero_headline,
      hero_subheadline: c.hero_subheadline,
      hero_badge: c.hero_badge,
      pricing_tagline: c.pricing_tagline,
      privacy_policy: c.privacy_policy,
      terms_of_service: c.terms_of_service,
      contact_us: c.contact_us,
      site_title: c.site_title,
      meta_description: c.meta_description,
      footer_text: c.footer_text,
    }).eq("id", 1);
    setBusy(false);
    if (error) toast({ title: "Save failed", description: error.message, variant: "destructive" });
    else toast({ title: "Site content updated", description: "Public pages now reflect your changes." });
  };

  if (!c) return <Loader2 className="h-5 w-5 animate-spin"/>;

  return (
    <Card className="glass border-border/60 p-4 sm:p-5 space-y-5">
      <div>
        <h3 className="font-semibold">Public site content</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Edit the landing-page headline, badges, pricing tagline and the legal pages (Privacy, Terms, Contact).
        </p>
      </div>

      <Tabs defaultValue="seo">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="seo">SEO &amp; branding</TabsTrigger>
          <TabsTrigger value="landing">Landing</TabsTrigger>
          <TabsTrigger value="privacy">Privacy</TabsTrigger>
          <TabsTrigger value="terms">Terms</TabsTrigger>
          <TabsTrigger value="contact">Contact</TabsTrigger>
        </TabsList>

        <TabsContent value="seo" className="mt-4 space-y-4">
          <div>
            <Label className="text-xs">Browser tab title (also OG title) — keep under 60 chars</Label>
            <Input value={c.site_title} onChange={(e) => setC({ ...c, site_title: e.target.value })} maxLength={70}/>
          </div>
          <div>
            <Label className="text-xs">Meta description (search snippet) — keep under 160 chars</Label>
            <Textarea rows={3} value={c.meta_description} onChange={(e) => setC({ ...c, meta_description: e.target.value })} maxLength={200}/>
          </div>
          <div>
            <Label className="text-xs">Footer text</Label>
            <Input value={c.footer_text} onChange={(e) => setC({ ...c, footer_text: e.target.value })} maxLength={200}/>
          </div>
        </TabsContent>

        <TabsContent value="landing" className="mt-4 space-y-4">
          <div>
            <Label className="text-xs">Hero badge</Label>
            <Input value={c.hero_badge} onChange={(e) => setC({ ...c, hero_badge: e.target.value })} maxLength={120}/>
          </div>
          <div>
            <Label className="text-xs">Hero headline</Label>
            <Input value={c.hero_headline} onChange={(e) => setC({ ...c, hero_headline: e.target.value })} maxLength={200}/>
          </div>
          <div>
            <Label className="text-xs">Hero subheadline</Label>
            <Textarea rows={3} value={c.hero_subheadline} onChange={(e) => setC({ ...c, hero_subheadline: e.target.value })} maxLength={500}/>
          </div>
          <div>
            <Label className="text-xs">Pricing tagline</Label>
            <Textarea rows={2} value={c.pricing_tagline} onChange={(e) => setC({ ...c, pricing_tagline: e.target.value })} maxLength={300}/>
          </div>
        </TabsContent>

        <TabsContent value="privacy" className="mt-4">
          <Label className="text-xs">Privacy policy (Markdown / plain text)</Label>
          <Textarea rows={16} value={c.privacy_policy} onChange={(e) => setC({ ...c, privacy_policy: e.target.value })}/>
        </TabsContent>
        <TabsContent value="terms" className="mt-4">
          <Label className="text-xs">Terms of service (Markdown / plain text)</Label>
          <Textarea rows={16} value={c.terms_of_service} onChange={(e) => setC({ ...c, terms_of_service: e.target.value })}/>
        </TabsContent>
        <TabsContent value="contact" className="mt-4">
          <Label className="text-xs">Contact us (Markdown / plain text)</Label>
          <Textarea rows={12} value={c.contact_us} onChange={(e) => setC({ ...c, contact_us: e.target.value })}/>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end">
        <Button onClick={save} disabled={busy} className="bg-gradient-primary text-primary-foreground">
          {busy ? <Loader2 className="h-4 w-4 animate-spin"/> : <><Save className="h-4 w-4 mr-1"/>Save site content</>}
        </Button>
      </div>
    </Card>
  );
}
