import { useState } from "react";
import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Save, KeyRound } from "lucide-react";

export default function AccountSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast({ title: "Password too short", description: "At least 6 characters.", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSaving(false);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Password updated", description: "Use your new password next time you sign in." });
      setNewPassword("");
      setConfirmPassword("");
    }
  };

  return (
    <AppShell title="Account Settings">
      <Card className="glass border-border/60 p-5 max-w-xl space-y-4">
        <div>
          <h3 className="font-semibold flex items-center gap-2"><KeyRound className="h-5 w-5 text-primary"/>Change password</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Signed in as <code className="font-mono text-foreground">{user?.email}</code>
          </p>
        </div>
        <form onSubmit={changePassword} className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs">New password</Label>
            <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 6 characters" required minLength={6}/>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Confirm new password</Label>
            <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={6}/>
          </div>
          <Button type="submit" disabled={saving} className="bg-gradient-primary text-primary-foreground">
            {saving ? <Loader2 className="h-4 w-4 animate-spin"/> : <><Save className="h-4 w-4 mr-2"/>Update password</>}
          </Button>
        </form>
      </Card>
    </AppShell>
  );
}
