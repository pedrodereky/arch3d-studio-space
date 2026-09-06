import { createFileRoute, Outlet, Navigate, useNavigate, Link, useLocation } from "@tanstack/react-router";
import { Loader2, Home, Sparkles, Library, FolderOpen, User, LogOut, Shield, Box, Map, ChevronDown, ShieldCheck, Video, Workflow, Wand2, Type, ImageUp } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Wordmark } from "@/components/brand/Wordmark";
import { GenerationNotifier } from "@/components/notifications/GenerationNotifier";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

type NavLeaf = { to: string; label: string; icon: typeof Home; exact?: boolean };
type NavGroup = { label: string; icon: typeof Home; matchPrefix: string; children: NavLeaf[] };
type NavEntry = NavLeaf | NavGroup;

const isGroup = (e: NavEntry): e is NavGroup => "children" in e;

const navItems: NavEntry[] = [
  { to: "/app", label: "Dashboard", icon: Home, exact: true },
  {
    label: "Gerar",
    icon: Sparkles,
    matchPrefix: "/app/gerar",
    children: [
      { to: "/app/gerar", label: "Objetos 3D", icon: Box, exact: true },
      { to: "/app/gerar/redecorar", label: "Redecorar", icon: Wand2 },
      { to: "/app/gerar/briefing", label: "Briefing → Planta 2D", icon: Type },
      { to: "/app/gerar/analise", label: "Análise de planta", icon: ImageUp },
      { to: "/app/gerar/planta", label: "Render de planta", icon: Map },
      { to: "/app/gerar/video", label: "Vídeo POV", icon: Video },
    ],
  },
  { to: "/app/studio", label: "Studio", icon: Workflow },
  { to: "/app/biblioteca", label: "Biblioteca", icon: Library },
  { to: "/app/projetos", label: "Projetos", icon: FolderOpen },
  { to: "/app/transparencia", label: "Transparência IA", icon: ShieldCheck },
  { to: "/app/conta", label: "Conta", icon: User },
];

function AuthenticatedLayout() {
  const { user, profile, isLoading, isAdmin, setupCompleted, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/entrar" search={{ redirect: location.pathname }} replace />;
  }

  // Admin sem setup → redireciona para wizard
  if (isAdmin && setupCompleted === false && !location.pathname.startsWith("/configurar")) {
    return <Navigate to="/configurar" replace />;
  }

  const initials =
    (profile?.full_name ?? user.email ?? "?")
      .split(" ")
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-white/5 bg-primary text-primary-foreground md:flex">
        <div className="flex h-16 items-center border-b border-white/5 px-6">
          <Wordmark className="text-primary-foreground" />
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          {navItems.map((item) => {
            if (isGroup(item)) {
              return (
                <NavGroupItem
                  key={item.label}
                  group={item}
                  pathname={location.pathname}
                />
              );
            }
            const active = item.exact
              ? location.pathname === item.to
              : location.pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-white/10 text-primary-foreground"
                    : "text-primary-foreground/70 hover:bg-white/5 hover:text-primary-foreground"
                }`}
              >
                <item.icon className="h-4 w-4" strokeWidth={1.75} />
                {item.label}
              </Link>
            );
          })}
          {isAdmin && (
            <>
              <div className="px-3 pt-6 pb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-primary-foreground/40">
                Admin
              </div>
              <Link
                to="/admin/configuracoes"
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-primary-foreground/70 transition-colors hover:bg-white/5 hover:text-primary-foreground"
              >
                <Shield className="h-4 w-4" strokeWidth={1.75} /> Configurações
              </Link>
              <Link
                to="/admin/uso"
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-primary-foreground/70 transition-colors hover:bg-white/5 hover:text-primary-foreground"
              >
                <Shield className="h-4 w-4" strokeWidth={1.75} /> Uso
              </Link>
              <Link
                to="/admin/usuarios"
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-primary-foreground/70 transition-colors hover:bg-white/5 hover:text-primary-foreground"
              >
                <Shield className="h-4 w-4" strokeWidth={1.75} /> Usuários
              </Link>
              <Link
                to="/admin/diagnostico"
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-primary-foreground/70 transition-colors hover:bg-white/5 hover:text-primary-foreground"
              >
                <Shield className="h-4 w-4" strokeWidth={1.75} /> Diagnóstico
              </Link>
            </>
          )}
        </nav>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col">
        <header className="flex h-16 items-center justify-end border-b border-border bg-background px-6">
          <DropdownMenu>
            <DropdownMenuTrigger className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-[11px] font-bold uppercase tracking-wide text-primary-foreground">
              {initials}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col">
                  <span className="font-medium">{profile?.full_name ?? "—"}</span>
                  <span className="text-xs font-normal text-muted-foreground">{user.email}</span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate({ to: "/app/conta" })}>
                <User className="mr-2 h-4 w-4" /> Conta
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={async () => {
                  await signOut();
                  navigate({ to: "/" });
                }}
              >
                <LogOut className="mr-2 h-4 w-4" /> Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <main className="flex-1 p-8">
          <Outlet />
        </main>
      </div>
      <GenerationNotifier />
    </div>
  );
}

function NavGroupItem({ group, pathname }: { group: NavGroup; pathname: string }) {
  const matches = pathname.startsWith(group.matchPrefix);
  const [open, setOpen] = useState(matches);
  const expanded = open || matches;
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
          matches
            ? "bg-white/10 text-primary-foreground"
            : "text-primary-foreground/70 hover:bg-white/5 hover:text-primary-foreground"
        }`}
      >
        <group.icon className="h-4 w-4" strokeWidth={1.75} />
        <span className="flex-1 text-left">{group.label}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
          strokeWidth={2}
        />
      </button>
      {expanded && (
        <div className="ml-4 mt-1 space-y-0.5 border-l border-white/10 pl-3">
          {group.children.map((child) => {
            const active = child.exact
              ? pathname === child.to
              : pathname.startsWith(child.to);
            return (
              <Link
                key={child.to}
                to={child.to}
                className={`flex items-center gap-3 rounded-md px-3 py-1.5 text-sm transition-colors ${
                  active
                    ? "bg-white/10 text-primary-foreground"
                    : "text-primary-foreground/60 hover:bg-white/5 hover:text-primary-foreground"
                }`}
              >
                <child.icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                {child.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
