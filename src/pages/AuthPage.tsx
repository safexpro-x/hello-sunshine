import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Phone, Loader2, ArrowLeft, MailCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth, isAdmin, isCompanyOwner, isEmployee } from "@/lib/auth";
import { signInWithGoogleFirebase, isFirebaseReady } from "@/lib/firebase";

export default function AuthPage() {
  const nav = useNavigate();
  const { toast } = useToast();
  const { user, roles, loading } = useAuth();
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [signupDone, setSignupDone] = useState(false);

  useEffect(() => {
    if (loading || !user) return;
    if (isAdmin(roles)) nav("/admin", { replace: true });
    else if (isCompanyOwner(roles)) nav("/company", { replace: true });
    else if (isEmployee(roles)) nav("/agent", { replace: true });
    else nav("/onboard", { replace: true });
  }, [user, roles, loading, nav]);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      const msg = /confirm|verified/i.test(error.message)
        ? "Please verify your email first. Check your inbox for the verification link."
        : error.message;
      toast({ title: "Sign-in failed", description: msg, variant: "destructive" });
    }
  };

  const signUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast({ title: "Password too short", description: "Use at least 8 characters.", variant: "destructive" });
      return;
    }
    if (!/^[+0-9 ()-]{6,20}$/.test(phone.trim())) {
      toast({ title: "Invalid phone", description: "Enter a valid phone number.", variant: "destructive" });
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("signup-request", {
      body: { name, email, phone, password, origin: window.location.origin },
    });
    setBusy(false);
    if (error || (data as any)?.error) {
      toast({
        title: "Sign-up failed",
        description: (data as any)?.error || error?.message || "Something went wrong",
        variant: "destructive",
      });
      return;
    }
    setSignupDone(true);
  };

  const sendForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes("@")) {
      toast({ title: "Enter your email", variant: "destructive" });
      return;
    }
    setBusy(true);
    const { error } = await supabase.functions.invoke("password-reset-request", {
      body: { email, origin: window.location.origin },
    });
    setBusy(false);
    if (error) {
      toast({ title: "Couldn't send reset email", description: error.message, variant: "destructive" });
      return;
    }
    setForgotSent(true);
  };

  const google = async () => {
    if (!(await isFirebaseReady())) {
      toast({
        title: "Google sign-in not configured",
        description: "Admin needs to add Firebase keys in Admin → Firebase tab.",
        variant: "destructive",
      });
      return;
    }
    setBusy(true);
    try {
      const { idToken } = await signInWithGoogleFirebase();
      const { data, error } = await supabase.functions.invoke("firebase-bridge", {
        body: { idToken },
      });
      if (error || !data?.email || !data?.email_otp) {
        throw new Error(error?.message || "Bridge failed");
      }
      const { error: vErr } = await supabase.auth.verifyOtp({
        type: "email",
        email: data.email,
        token: data.email_otp,
      });
      if (vErr) throw vErr;
      toast({ title: "Signed in with Google" });
    } catch (e) {
      toast({
        title: "Google sign-in failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center px-4">
      <Card className="glass w-full max-w-md border-border/60 p-8">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-primary shadow-glow">
            <Phone className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="mt-3 text-2xl font-bold">Welcome to Zentord</h1>
          <p className="text-sm text-muted-foreground">
            {forgotMode ? "Reset your password" : signupDone ? "Verify your email to continue" : "Sign in or create your company account"}
          </p>
        </div>

        {signupDone ? (
          <div className="text-center py-4 space-y-4">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-success/10 text-success">
              <MailCheck className="h-7 w-7" />
            </div>
            <p className="font-semibold">Please check your email</p>
            <p className="text-sm text-muted-foreground">
              We sent a verification link to <strong>{email}</strong>. Click the link to verify your account, then sign in.
            </p>
            <p className="text-xs text-muted-foreground">
              Didn't get it? Check your spam folder or wait a minute and try again.
            </p>
            <Button variant="ghost" onClick={() => { setSignupDone(false); setTab("signin"); }}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back to sign in
            </Button>
          </div>
        ) : forgotMode ? (
          <div>
            {forgotSent ? (
              <div className="text-center py-4">
                <p className="font-semibold">Check your inbox</p>
                <p className="text-sm text-muted-foreground mt-2">
                  If an account exists for <strong>{email}</strong>, you'll receive a reset link within a minute.
                </p>
                <Button variant="ghost" className="mt-5" onClick={() => { setForgotMode(false); setForgotSent(false); }}>
                  <ArrowLeft className="h-4 w-4 mr-1" /> Back to sign in
                </Button>
              </div>
            ) : (
              <form onSubmit={sendForgot} className="space-y-3">
                <Input type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
                <Button type="submit" disabled={busy} className="w-full bg-gradient-primary text-primary-foreground">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send reset link"}
                </Button>
                <Button type="button" variant="ghost" className="w-full" onClick={() => setForgotMode(false)}>
                  <ArrowLeft className="h-4 w-4 mr-1" /> Back to sign in
                </Button>
              </form>
            )}
          </div>
        ) : (
          <>
            <Tabs value={tab} onValueChange={(v) => setTab(v as "signin" | "signup")}>
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Sign up</TabsTrigger>
              </TabsList>

              <TabsContent value="signin">
                <form onSubmit={signIn} className="space-y-3 mt-4">
                  <Input type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
                  <Input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
                  <Button type="submit" disabled={busy} className="w-full bg-gradient-primary text-primary-foreground">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
                  </Button>
                  <button
                    type="button"
                    onClick={() => { setForgotMode(true); setForgotSent(false); }}
                    className="block w-full text-center text-xs text-muted-foreground hover:text-primary mt-2"
                  >
                    Forgot password?
                  </button>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                <form onSubmit={signUp} className="space-y-3 mt-4">
                  <Input placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} />
                  <Input type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
                  <Input type="tel" inputMode="tel" placeholder="Phone number (e.g. +91 98xxxxxxxx)" value={phone} onChange={(e) => setPhone(e.target.value)} required pattern="[+0-9 ()\-]{6,20}" />
                  <Input type="password" placeholder="Password (min 8 chars)" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
                  <Button type="submit" disabled={busy} className="w-full bg-gradient-primary text-primary-foreground">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create account"}
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">
                    By signing up you agree to our <a href="/terms" className="underline">Terms</a> and <a href="/privacy" className="underline">Privacy Policy</a>.
                  </p>
                </form>
              </TabsContent>
            </Tabs>

            <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
              <div className="h-px flex-1 bg-border" /> OR <div className="h-px flex-1 bg-border" />
            </div>
            <Button variant="outline" onClick={google} disabled={busy} className="w-full border-border">
              <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.1 5.7l6.2 5.2C41.8 35.5 44 30.2 44 24c0-1.3-.1-2.3-.4-3.5z"/></svg>
              Continue with Google
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}
