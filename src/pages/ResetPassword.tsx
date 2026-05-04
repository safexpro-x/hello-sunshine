import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Phone, Loader2, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { toast } = useToast();
  const token = params.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      toast({ title: "Invalid link", description: "Reset link is missing token.", variant: "destructive" });
    }
  }, [token, toast]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast({ title: "Password too short", description: "Use at least 6 characters.", variant: "destructive" });
      return;
    }
    if (password !== confirm) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("password-reset-confirm", {
      body: { token, password },
    });
    setBusy(false);
    if (error || data?.error) {
      toast({ title: "Reset failed", description: data?.error || error?.message || "Try again.", variant: "destructive" });
      return;
    }
    setDone(true);
    setTimeout(() => nav("/auth", { replace: true }), 2500);
  };

  return (
    <div className="min-h-screen grid place-items-center px-4">
      <Card className="glass w-full max-w-md border-border/60 p-8">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-primary shadow-glow">
            <Phone className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="mt-3 text-2xl font-bold">Reset password</h1>
          <p className="text-sm text-muted-foreground">Enter a new password for your Zentord account</p>
        </div>

        {done ? (
          <div className="text-center py-6">
            <CheckCircle2 className="h-10 w-10 mx-auto text-primary mb-3" />
            <p className="font-semibold">Password updated</p>
            <p className="text-sm text-muted-foreground mt-1">Redirecting you to sign in…</p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <Input type="password" placeholder="New password (min 6 chars)" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required />
            <Input type="password" placeholder="Confirm new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={6} required />
            <Button type="submit" disabled={busy || !token} className="w-full bg-gradient-primary text-primary-foreground">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update password"}
            </Button>
            <p className="text-center text-xs text-muted-foreground mt-3">
              <Link to="/auth" className="text-primary hover:underline">← Back to sign in</Link>
            </p>
          </form>
        )}
      </Card>
    </div>
  );
}
