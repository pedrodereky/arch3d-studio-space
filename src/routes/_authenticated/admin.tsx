import { createFileRoute, Outlet, Navigate, useLocation } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminLayout,
});

function AdminLayout() {
  const { isAdmin, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading)
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  if (!isAdmin) return <Navigate to="/app" replace />;
  return (
    <div>
      <div className="mb-6 inline-flex rounded-full bg-accent px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-accent-foreground">
        Admin · {location.pathname.split("/").pop()}
      </div>
      <Outlet />
    </div>
  );
}
