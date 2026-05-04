import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Hello — Welcome" },
      { name: "description", content: "A warm hello and a simple, friendly landing page." },
    ],
  }),
});

function Index() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-background to-muted">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary" />
          <span className="font-semibold text-foreground">Hello.</span>
        </div>
        <nav className="hidden gap-6 text-sm text-muted-foreground sm:flex">
          <a href="#about" className="hover:text-foreground">About</a>
          <a href="#features" className="hover:text-foreground">Features</a>
          <a href="#contact" className="hover:text-foreground">Contact</a>
        </nav>
      </header>

      <section className="mx-auto max-w-3xl px-6 pt-16 pb-24 text-center">
        <span className="inline-block rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
          Welcome 👋
        </span>
        <h1 className="mt-6 text-5xl font-bold tracking-tight text-foreground sm:text-6xl">
          Hello, world.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-muted-foreground">
          A simple, clean website to say hi. Start here, then make it your own.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <a
            href="#about"
            className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            Get started
          </a>
          <a
            href="#features"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-5 py-2.5 text-sm font-medium text-foreground transition hover:bg-accent"
          >
            Learn more
          </a>
        </div>
      </section>

      <section id="features" className="mx-auto grid max-w-5xl gap-6 px-6 pb-24 sm:grid-cols-3">
        {[
          { title: "Fast", desc: "Loads instantly with a clean, minimal layout." },
          { title: "Simple", desc: "Just the essentials — no clutter, no noise." },
          { title: "Yours", desc: "Easy to customize colors, copy, and content." },
        ].map((f) => (
          <div key={f.title} className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-card-foreground">{f.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
          </div>
        ))}
      </section>

      <section id="about" className="mx-auto max-w-3xl px-6 pb-24 text-center">
        <h2 className="text-3xl font-bold text-foreground">About</h2>
        <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
          This is a starter page. Tell me what you'd like to add — hero image, sections,
          contact form, or a full multi-page site — and I'll build it.
        </p>
      </section>

      <footer id="contact" className="border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 px-6 py-8 text-sm text-muted-foreground sm:flex-row">
          <p>© {new Date().getFullYear()} Hello.</p>
          <a href="mailto:hello@example.com" className="hover:text-foreground">hello@example.com</a>
        </div>
      </footer>
    </main>
  );
}
