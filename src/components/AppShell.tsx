import { ReactNode, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Phone, LogOut, LayoutDashboard, Users, Headset, ShieldCheck, BookOpen, IndianRupee, Server, UserCog, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuth, signOut, isAdmin, isCompanyOwner, isEmployee } from "@/lib/auth";
import { cn } from "@/lib/utils";

interface AppShellProps { children: ReactNode; title?: string }

export default function AppShell({ children, title }: AppShellProps) {
  const { user, roles } = useAuth();
  const loc = useLocation();
  const nav = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const links: { to: string; label: string; icon: typeof Phone }[] = [];
  if (isAdmin(roles)) links.push(
    { to: "/admin", label: "Admin", icon: ShieldCheck },
  );
  if (isCompanyOwner(roles)) links.push(
    { to: "/company", label: "Dashboard", icon: LayoutDashboard },
    { to: "/company/employees", label: "Employees", icon: Users },
    { to: "/company/billing", label: "Billing", icon: IndianRupee },
    { to: "/agent", label: "Agent Queue", icon: Headset },
  );
  // Employees ONLY see the agent queue — no integration, billing, or employee management
  if (isEmployee(roles) && !isCompanyOwner(roles)) links.push(
    { to: "/agent", label: "Agent Queue", icon: Headset },
  );

  const externalLinks: { href: string; label: string; icon: typeof Phone; show: boolean }[] = [
    { href: "/integration.txt", label: "Integration", icon: BookOpen, show: isCompanyOwner(roles) || isAdmin(roles) },
    { href: "/server.txt", label: "Self-host", icon: Server, show: isAdmin(roles) },
  ];

  const renderNavLinks = (onClick?: () => void) => (
    <>
      {links.map((l) => {
        const active = loc.pathname === l.to || loc.pathname.startsWith(l.to + "/");
        return (
          <Link
            key={l.to}
            to={l.to}
            onClick={onClick}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
              active ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
            )}
          >
            <l.icon className="h-4 w-4" />
            {l.label}
          </Link>
        );
      })}
      {externalLinks.filter((e) => e.show).map((e) => (
        <a
          key={e.href}
          href={e.href}
          target="_blank"
          rel="noreferrer"
          onClick={onClick}
          className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/60"
        >
          <e.icon className="h-4 w-4" />
          {e.label}
        </a>
      ))}
    </>
  );

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border/60 bg-background/70 backdrop-blur sticky top-0 z-30">
        <div className="container flex items-center justify-between py-3 gap-4">
          <Link to="/" className="flex items-center gap-2 min-w-0">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-primary shadow-glow shrink-0">
              <Phone className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-bold tracking-tight truncate">Zentord</span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {renderNavLinks()}
          </nav>

          <div className="flex items-center gap-2">
            {user ? (
              <>
                <span className="hidden lg:inline text-xs text-muted-foreground truncate max-w-[160px]">{user.email}</span>
                <Button asChild size="sm" variant="ghost" title="Account settings">
                  <Link to="/account"><UserCog className="h-4 w-4" /></Link>
                </Button>
                <Button size="sm" variant="ghost" onClick={signOut} title="Sign out" className="hidden sm:inline-flex">
                  <LogOut className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <Button size="sm" onClick={() => nav("/auth")} className="bg-gradient-primary text-primary-foreground">
                Sign in
              </Button>
            )}
            {/* Mobile menu trigger — only when there are nav links */}
            {(links.length > 0 || externalLinks.some((e) => e.show)) && (
              <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                <SheetTrigger asChild>
                  <Button size="sm" variant="ghost" className="md:hidden" aria-label="Open menu">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-[280px] sm:w-[320px] flex flex-col">
                  <SheetHeader className="text-left">
                    <SheetTitle className="flex items-center gap-2">
                      <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-primary shadow-glow">
                        <Phone className="h-4 w-4 text-primary-foreground" />
                      </div>
                      Zentord
                    </SheetTitle>
                  </SheetHeader>
                  {user && (
                    <div className="text-xs text-muted-foreground truncate border-b border-border/60 pb-3">
                      {user.email}
                    </div>
                  )}
                  <nav className="flex flex-col gap-1 mt-2">
                    {renderNavLinks(() => setMobileOpen(false))}
                  </nav>
                  {user && (
                    <div className="mt-auto pt-4 border-t border-border/60 flex flex-col gap-2">
                      <Button asChild variant="outline" size="sm" onClick={() => setMobileOpen(false)}>
                        <Link to="/account"><UserCog className="h-4 w-4 mr-2" />Account settings</Link>
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => { setMobileOpen(false); signOut(); }}>
                        <LogOut className="h-4 w-4 mr-2" />Sign out
                      </Button>
                    </div>
                  )}
                </SheetContent>
              </Sheet>
            )}
          </div>
        </div>
      </header>

      <main className="container py-8 flex-1">
        {title && <h1 className="text-2xl md:text-3xl font-bold mb-6">{title}</h1>}
        {children}
      </main>

      <footer className="border-t border-border/60 py-6 text-center text-xs text-muted-foreground">
        Zentord · Multi-tenant voice support platform
      </footer>
    </div>
  );
}
