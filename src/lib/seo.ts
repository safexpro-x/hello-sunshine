// Updates <title>, meta description, and OG tags from admin-managed site_content.
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

function setMeta(name: string, content: string, attr: "name" | "property" = "name") {
  if (!content) return;
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

export function useSiteSeo(pageTitle?: string) {
  useEffect(() => {
    let cancelled = false;
    supabase.from("site_content")
      .select("site_title, meta_description")
      .eq("id", 1).maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        const title = pageTitle ? `${pageTitle} · ${data.site_title.split("—")[0].trim()}` : data.site_title;
        document.title = title;
        setMeta("description", data.meta_description);
        setMeta("og:title", title, "property");
        setMeta("og:description", data.meta_description, "property");
        setMeta("twitter:title", title);
        setMeta("twitter:description", data.meta_description);
      });
    return () => { cancelled = true; };
  }, [pageTitle]);
}
