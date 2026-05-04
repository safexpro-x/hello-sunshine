// Renders Privacy / Terms / Contact from site_content.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Phone } from "lucide-react";

interface Props { kind: "privacy" | "terms" | "contact" }

const FIELD_MAP = {
  privacy: { col: "privacy_policy", title: "Privacy Policy" },
  terms: { col: "terms_of_service", title: "Terms of Service" },
  contact: { col: "contact_us", title: "Contact Us" },
} as const;

export default function LegalPage({ kind }: Props) {
  const meta = FIELD_MAP[kind];
  const [body, setBody] = useState<string | null>(null);

  useEffect(() => {
    document.title = `${meta.title} — Zentord`;
    supabase.from("site_content").select(meta.col).eq("id", 1).maybeSingle().then(({ data }) => {
      setBody((data as Record<string, string> | null)?.[meta.col] ?? "");
    });
  }, [kind, meta.col, meta.title]);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border/60 bg-background/70 backdrop-blur sticky top-0 z-30">
        <div className="container flex items-center justify-between py-3">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-primary shadow-glow">
              <Phone className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-bold tracking-tight">Zentord</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm text-muted-foreground">
            <Link to="/privacy" className="hover:text-foreground">Privacy</Link>
            <Link to="/terms" className="hover:text-foreground">Terms</Link>
            <Link to="/contact" className="hover:text-foreground">Contact</Link>
          </nav>
        </div>
      </header>

      <main className="container py-10 flex-1 max-w-3xl">
        <h1 className="text-3xl md:text-4xl font-bold mb-6">{meta.title}</h1>
        {body === null ? (
          <Loader2 className="h-5 w-5 animate-spin"/>
        ) : (
          <article className="prose prose-invert max-w-none whitespace-pre-wrap text-sm sm:text-base text-foreground/90 leading-relaxed">
            {body || "No content yet."}
          </article>
        )}
      </main>

      <footer className="border-t border-border/60 py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Zentord · <Link to="/privacy" className="hover:text-foreground">Privacy</Link> · <Link to="/terms" className="hover:text-foreground">Terms</Link> · <Link to="/contact" className="hover:text-foreground">Contact</Link>
      </footer>
    </div>
  );
}
