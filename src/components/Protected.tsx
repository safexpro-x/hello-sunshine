import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth, type AppRole } from "@/lib/auth";
import { Loader2 } from "lucide-react";

interface ProtectedProps {
  children: ReactNode;
  require?: AppRole | AppRole[];
}

export default function Protected({ children, require }: ProtectedProps) {
  const { user, roles, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;

  if (require) {
    const need = Array.isArray(require) ? require : [require];
    const ok = need.some((r) => roles.includes(r));
    if (!ok) return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
