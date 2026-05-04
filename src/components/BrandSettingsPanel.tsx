// Admin-only white-label panel: upload logo + favicon, set brand name,
// primary/accent HSL colors, footer text, and support email.
// Saves to brand_settings (singleton id=1) and re-applies live.
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save, Upload, Palette, Image as ImageIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { loadBrand } from "@/lib/branding";

type Brand = {
  brand_name: string;
  logo_url: string | null;
  favicon_url: string | null;
  primary_hsl: string;
  accent_hsl: string;
  footer_text: string | null;
  support_email: string | null;
};

export default function BrandSettingsPanel() {
  const { toast } = useToast();
  const [b, setB] = useState<Brand | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingFav, setUploadingFav] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);
  const favRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("brand_settings").select("*").eq("id", 1).maybeSingle();
      setB((data || {
        brand_name: "Zentord", logo_url: null, favicon_url: null,
        primary_hsl: "160 84% 55%", accent_hsl: "270 80% 65%",
        footer_text: "", support_email: "",
      }) as Brand);
    })();
  }, []);

  const upload = async (file: File, kind: "logo" | "favicon") => {
    const setBusy = kind === "logo" ? setUploadingLogo : setUploadingFav;
    setBusy(true);
    const ext = file.name.split(".").pop() || "png";
    const path = `${kind}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("branding").upload(path, file, { upsert: true });
    setBusy(false);
    if (error) {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
      return;
    }
    const { data } = supabase.storage.from("branding").getPublicUrl(path);
    setB((prev) => prev ? { ...prev, [kind === "logo" ? "logo_url" : "favicon_url"]: data.publicUrl } : prev);
    toast({ title: `${kind === "logo" ? "Logo" : "Favicon"} uploaded — click Save to apply` });
  };

  const save = async () => {
    if (!b) return;
    setSaving(true);
    const { error } = await supabase.from("brand_settings").update({
      brand_name: b.brand_name,
      logo_url: b.logo_url,
      favicon_url: b.favicon_url,
      primary_hsl: b.primary_hsl,
      accent_hsl: b.accent_hsl,
      footer_text: b.footer_text,
      support_email: b.support_email,
    }).eq("id", 1);
    setSaving(false);
    if (error) toast({ title: "Save failed", description: error.message, variant: "destructive" });
    else { toast({ title: "Branding saved" }); await loadBrand(); }
  };

  if (!b) return <Loader2 className="h-5 w-5 animate-spin"/>;

  return (
    <Card className="glass border-border/60 p-5 space-y-5">
      <div className="flex items-center gap-2">
        <Palette className="h-5 w-5 text-primary"/>
        <h3 className="font-semibold">Brand & theming</h3>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Brand name</Label>
          <Input value={b.brand_name} onChange={(e) => setB({ ...b, brand_name: e.target.value })}/>
        </div>
        <div className="space-y-2">
          <Label>Support email</Label>
          <Input value={b.support_email ?? ""} onChange={(e) => setB({ ...b, support_email: e.target.value })}/>
        </div>
        <div className="space-y-2">
          <Label>Primary color (HSL — e.g. <code className="font-mono">160 84% 55%</code>)</Label>
          <div className="flex gap-2 items-center">
            <Input value={b.primary_hsl} onChange={(e) => setB({ ...b, primary_hsl: e.target.value })}/>
            <div className="h-10 w-10 rounded-md border border-border/60" style={{ background: `hsl(${b.primary_hsl})` }}/>
          </div>
        </div>
        <div className="space-y-2">
          <Label>Accent color (HSL)</Label>
          <div className="flex gap-2 items-center">
            <Input value={b.accent_hsl} onChange={(e) => setB({ ...b, accent_hsl: e.target.value })}/>
            <div className="h-10 w-10 rounded-md border border-border/60" style={{ background: `hsl(${b.accent_hsl})` }}/>
          </div>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label>Footer text</Label>
          <Input value={b.footer_text ?? ""} onChange={(e) => setB({ ...b, footer_text: e.target.value })}/>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="rounded-lg border border-border/60 p-4">
          <Label className="flex items-center gap-2 mb-2"><ImageIcon className="h-4 w-4"/>Logo</Label>
          <div className="flex items-center gap-3">
            <div className="h-16 w-16 rounded-lg bg-muted/40 grid place-items-center overflow-hidden">
              {b.logo_url ? <img src={b.logo_url} alt="logo" className="h-full w-full object-contain"/> : <ImageIcon className="h-6 w-6 text-muted-foreground"/>}
            </div>
            <Button variant="outline" size="sm" onClick={() => logoRef.current?.click()} disabled={uploadingLogo}>
              {uploadingLogo ? <Loader2 className="h-4 w-4 animate-spin"/> : <><Upload className="h-4 w-4 mr-1"/>Upload</>}
            </Button>
            <input ref={logoRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], "logo")}/>
          </div>
        </div>
        <div className="rounded-lg border border-border/60 p-4">
          <Label className="flex items-center gap-2 mb-2"><ImageIcon className="h-4 w-4"/>Favicon</Label>
          <div className="flex items-center gap-3">
            <div className="h-16 w-16 rounded-lg bg-muted/40 grid place-items-center overflow-hidden">
              {b.favicon_url ? <img src={b.favicon_url} alt="favicon" className="h-full w-full object-contain"/> : <ImageIcon className="h-6 w-6 text-muted-foreground"/>}
            </div>
            <Button variant="outline" size="sm" onClick={() => favRef.current?.click()} disabled={uploadingFav}>
              {uploadingFav ? <Loader2 className="h-4 w-4 animate-spin"/> : <><Upload className="h-4 w-4 mr-1"/>Upload</>}
            </Button>
            <input ref={favRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], "favicon")}/>
          </div>
        </div>
      </div>

      <Button onClick={save} disabled={saving} className="bg-primary text-primary-foreground">
        {saving ? <Loader2 className="h-4 w-4 animate-spin"/> : <><Save className="h-4 w-4 mr-1"/>Save branding</>}
      </Button>
    </Card>
  );
}
