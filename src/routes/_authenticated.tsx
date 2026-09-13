import {
  createFileRoute,
  Outlet,
  Navigate,
  useNavigate,
  Link,
  useLocation,
} from "@tanstack/react-router";
import {
  Loader2,
  Home,
  Library,
  FolderOpen,
  User,
  LogOut,
  Shield,
  Box,
  Map,
  ShieldCheck,
  Video,
  Workflow,
  Wand2,
  Type,
  ImageUp,
  Menu,
  Plus,
} from "lucide-react";
import { useEffect, useState } from "react";
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
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

type NavLeaf = { to: string; label: string; icon: typeof Home; exact?: boolean };
type NavSection = { label?: string; items: NavLeaf[] };

/**
 * Seções planas, sem grupo colapsável: a navegação tem a mesma forma em toda
 * tela e só o item ativo muda. O acordeão anterior reorganizava a lista
 * conforme a rota, que é o oposto de previsível.
 */
const navSections: NavSection[] = [
  { items: [{ to: "/app", label: "Dashboard", icon: Home, exact: true }] },
  {
    label: "Gerar",
    items: [
      { to: "/app/gerar", label: "Objetos 3D", icon: Box, exact: true },
      { to: "/app/gerar/redecorar", label: "Redecorar", icon: Wand2 },
      { to: "/app/gerar/briefing", label: "Briefing → Planta 2D", icon: Type },
      { to: "/app/gerar/analise", label: "Análise de planta", icon: ImageUp },
      { to: "/app/gerar/planta", label: "Render de planta", icon: Map },
      { to: "/app/gerar/video", label: "Vídeo POV", icon: Video },
    ],
  },
  {
    items: [
      { to: "/app/studio", label: "Studio", icon: Workflow },
      { to: "/app/biblioteca", label: "Biblioteca", icon: Library },
      { to: "/app/projetos", label: "Projetos", icon: FolderOpen },
      { to: "/app/transparencia", label: "Transparência IA", icon: ShieldCheck },
      { to: "/app/conta", label: "Conta", icon: User },
    ],
  },
];

const adminItems: NavLeaf[] = [
  { to: "/admin/configuracoes", label: "Configurações", icon: Shield },
  { to: "/admin/uso", label: "Uso", icon: Shield },
  { to: "/admin/usuarios", label: "Usuários", icon: Shield },
  { to: "/admin/diagnostico", label: "Diagnóstico", icon: Shield },
];

const isActive = (item: NavLeaf, pathname: string) =>
  item.exact ? pathname === item.to : pathname.startsWith(item.to);

/** Rótulo da tela atual, para o header não ficar sem contexto. */
function currentLabel(pathname: string): string {
  const all = [...navSections.flatMap((s) => s.items), ...adminItems];
  // Do mais específico para o mais genérico, senão "/app" casaria com tudo.
  const match = [...all]
    .sort((a, b) => b.to.length - a.to.length)
    .find((item) => isActive(item, pathname));
  return match?.label ?? "Arq3D Studio";
}

function AuthenticatedLayout() {
  const { user, profile, isLoading, isAdmin, setupCompleted, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  // Fecha o menu mobile sempre que a rota muda (inclui voltar/avançar).
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

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

  const initials = (profile?.full_name ?? user.email ?? "?")
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const userMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold uppercase tracking-wide text-primary-foreground">
          {initials}
        </span>
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-[13px] font-medium text-foreground">
            {profile?.full_name ?? user.email}
          </span>
          {profile?.cau_number && (
            <span className="truncate text-[11px] font-light text-muted-foreground">
              CAU {profile.cau_number}
            </span>
          )}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
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
  );

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar — desktop */}
      <aside className="hidden w-[244px] shrink-0 flex-col border-r border-border/60 bg-card md:flex">
        <div className="flex h-[76px] items-center border-b border-border/60 px-6">
          <Wordmark className="text-primary" />
        </div>
        <SidebarNav pathname={location.pathname} isAdmin={isAdmin} />
        <div className="border-t border-border/60 p-3">{userMenu}</div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[76px] shrink-0 items-center gap-3 border-b border-border/60 px-4 md:px-10">
          {/* Navegação mobile */}
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger
              className="-ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted md:hidden"
              aria-label="Abrir menu de navegação"
            >
              <Menu className="h-5 w-5" strokeWidth={1.75} />
            </SheetTrigger>
            <SheetContent side="left" className="flex w-72 flex-col border-border/60 bg-card p-0">
              <SheetTitle className="sr-only">Navegação</SheetTitle>
              <div className="flex h-[76px] shrink-0 items-center border-b border-border/60 px-6">
                <Wordmark className="text-primary" />
              </div>
              <SidebarNav
                pathname={location.pathname}
                isAdmin={isAdmin}
                onNavigate={() => setMenuOpen(false)}
              />
              <div className="shrink-0 border-t border-border/60 p-3">{userMenu}</div>
            </SheetContent>
          </Sheet>

          <div className="md:hidden">
            <Wordmark className="text-primary" />
          </div>

          <span className="hidden text-sm font-medium text-foreground md:inline">
            {currentLabel(location.pathname)}
          </span>

          <Link
            to="/app/gerar"
            className="ml-auto inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-primary px-5 text-[11px] font-black uppercase tracking-[0.12em] text-primary-foreground transition-colors hover:bg-primary/90 md:px-6"
          >
            <Plus className="h-4 w-4" strokeWidth={2} />
            <span className="hidden sm:inline">Gerar</span>
          </Link>
        </header>
        <main className="flex-1 p-4 md:p-10">
          <Outlet />
        </main>
      </div>
      <GenerationNotifier />
    </div>
  );
}

/* Navegação compartilhada entre a sidebar (desktop) e o Sheet (mobile). */
function SidebarNav({
  pathname,
  isAdmin,
  onNavigate,
}: {
  pathname: string;
  isAdmin: boolean;
  onNavigate?: () => void;
}) {
  const itemClass = (active: boolean) =>
    `flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
      active ? "bg-accent font-medium text-accent-foreground" : "text-foreground hover:bg-muted"
    }`;

  return (
    <nav className="flex-1 overflow-y-auto px-3.5 py-5">
      {navSections.map((section, i) => (
        <div key={section.label ?? i} className={i > 0 ? "mt-4" : undefined}>
          {section.label && (
            <div className="px-3 pb-2 pt-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              {section.label}
            </div>
          )}
          <div className="flex flex-col gap-0.5">
            {section.items.map((item) => {
              const active = isActive(item, pathname);
              return (
                <Link key={item.to} to={item.to} onClick={onNavigate} className={itemClass(active)}>
                  <item.icon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}

      {isAdmin && (
        <div className="mt-4">
          <div className="px-3 pb-2 pt-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
            Admin
          </div>
          <div className="flex flex-col gap-0.5">
            {adminItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={onNavigate}
                className={itemClass(pathname.startsWith(item.to))}
              >
                <item.icon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
}
