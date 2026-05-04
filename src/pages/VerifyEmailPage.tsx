import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Loader2, MailCheck, ShieldAlert, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Phase = "checking" | "needs_password" | "verified" | "error";

export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { toast } = useToast();
  const token = params.get("token") ?? "";
  const [phase, setPhase] = useState<Phase>("checking");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [errMsg, setErrMsg] = useState("");

  useEffect(() => {
    if (!token) {
      setPhase("error");
      setErrMsg("Missing verification token. Please use the link from your email.");
      return;
    }
    (async () => {
      const { data, error } = await supabase.functions.invoke("verify-email", { body: { token } });
      if (error || (data as any)?.error) {
        setPhase("error");
        setErrMsg((data as any)?.error || error?.message || "Invalid verification link.");
        return;
      }
      setEmail((data as any)?.email ?? "");
      setPhase("needs_password");
    })();
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("verify-email", { body: { token, password } });
    if (error || (data as any)?.error) {
      setBusy(false);
      toast({
        title: "Verification failed",
        description: (data as any)?.error || error?.message || "Could not complete verification",
        variant: "destructive",
      });
      return;
    }
    // Sign the user in
    const { error: sErr } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (sErr) {
      toast({ title: "Verified, but sign-in failed", description: sErr.message, variant: "destructive" });
      nav("/auth", { replace: true });
      return;
    }
    setPhase("verified");
    setTimeout(() => nav("/onboard", { replace: true }), 1200);
  };

  return (
    <div className="min-h-screen grid place-items-center px-4">
      <Card className="glass w-full max-w-md border-border/60 p-8">
        {phase === "checking" && (
          <div className="text-center py-8">
            <Loader2 className="h-7 w-7 animate-spin mx-auto text-primary" />
            <p className="mt-4 text-sm text-muted-foreground">Verifying your link…</p>
          </div>
        )}

        {phase === "error" && (
          <div className="text-center space-y-4">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-destructive/10 text-destructive">
              <ShieldAlert className="h-7 w-7" />
            </div>
            <h1 className="text-xl font-bold">Verification failed</h1>
            <p className="text-sm text-muted-foreground">{errMsg}</p>
            <Button asChild className="bg-gradient-primary text-primary-foreground"><Link to="/auth">Back to sign in</Link></Button>
          </div>
        )}

        {phase === "needs_password" && (
          <form onSubmit={submit} className="space-y-4">
            <div className="text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary/10 text-primary">
                <MailCheck className="h-7 w-7" />
              </div>
              <h1 className="mt-3 text-xl font-bold">Confirm your account</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Re-enter the password you set at signup for <strong>{email}</strong> to finish creating your account.
              </p>
            </div>
            <Input type="password" placeholder="Your password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
            <Button type="submit" disabled={busy} className="w-full bg-gradient-primary text-primary-foreground">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify & continue"}
            </Button>
          </form>
        )}

        {phase === "verified" && (
          <div className="text-center space-y-3 py-4">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-success/10 text-success">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <h1 className="text-xl font-bold">Email verified</h1>
            <p className="text-sm text-muted-foreground">Signing you in…</p>
          </div>
        )}
      </Card>
    </div>
  );
}
