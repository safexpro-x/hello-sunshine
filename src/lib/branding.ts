// Loads white-label brand settings from the public `brand_settings` table at boot
// and applies them as CSS variables, favicon, and document title.
// Falls back to defaults silently so the app still renders if the row is missing.

import { supabase } from "@/integrations/supabase/client";

export interface BrandSettings {
  brand_name: string;
  logo_url: string | null;
  favicon_url: string | null;
  primary_hsl: string;
  accent_hsl: string;
  footer_text: string | null;
  support_email: string | null;
}

const DEFAULTS: BrandSettings = {
  brand_name: "Zentord",
  logo_url: null,
  favicon_url: null,
  primary_hsl: "160 84% 55%",
  accent_hsl: "270 80% 65%",
  footer_text: "© Zentord. All rights reserved.",
  support_email: "support@example.com",
};

let cache: BrandSettings | null = null;
const listeners = new Set<(b: BrandSettings) => void>();

export function getBrand(): BrandSettings {
  return cache ?? DEFAULTS;
}

export function onBrandChange(fn: (b: BrandSettings) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function apply(b: BrandSettings) {
  cache = b;
  const root = document.documentElement;
  root.style.setProperty("--primary", b.primary_hsl);
  root.style.setProperty("--ring", b.primary_hsl);
  root.style.setProperty("--accent", b.accent_hsl);

  if (b.favicon_url) {
    let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = b.favicon_url;
  }
  if (b.brand_name) {
    document.title = `${b.brand_name} — Voice Support Platform`;
  }
  listeners.forEach((fn) => fn(b));
}

export async function loadBrand(): Promise<BrandSettings> {
  try {
    const { data } = await supabase
      .from("brand_settings")
      .select("brand_name, logo_url, favicon_url, primary_hsl, accent_hsl, footer_text, support_email")
      .eq("id", 1)
      .maybeSingle();
    const merged = { ...DEFAULTS, ...(data || {}) } as BrandSettings;
    apply(merged);
    return merged;
  } catch {
    apply(DEFAULTS);
    return DEFAULTS;
  }
}
