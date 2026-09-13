import {
  createFileRoute,
  Outlet,
  Navigate,
  useNavigate,
  Link,
  useLocation,
  useMatches,
} from "@tanstack/react-router";
import { Loader2, LogOut, Menu, Plus, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import "@/lib/route-static-data";
import {
  navSections,
  adminItems,
  ACCOUNT_ITEMS,
  isActive,
  currentLabel,
  type NavLeaf,
} from "@/lib/nav-items";
import { GlobalSearch } from "@/components/search/GlobalSearch";
import { BrandLockup } from "@/components/brand/Mark";
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

function AuthenticatedLayout() {
  const { user, profile, isLoading, isAdmin, setupCompleted, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const matches = useMatches();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // Telas com trilho lateral pedem o `main` sem padding; elas mesmas dizem.
  const fullBleed = matches.some((m) => m.staticData?.fullBleed);

  // Fecha o menu mobile sempre que a rota muda (inclui voltar/avançar).
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // ⌘K / Ctrl+K de qualquer lugar, inclusive de dentro de um campo de texto:
  // a combinação com modificador não colide com digitação.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "k" || !(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      setSearchOpen((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
        {/* Conta e Transparência saíram da barra lateral: são destinos raros,
            e Transparência não tem outro link no app — sem isto sobraria só
            o ⌘K. */}
        {ACCOUNT_ITEMS.map((item) => (
          <DropdownMenuItem key={item.to} onClick={() => navigate({ to: item.to })}>
            <item.icon className="mr-2 h-4 w-4" /> {item.label}
          </DropdownMenuItem>
        ))}
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
          <BrandLockup />
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
                <BrandLockup />
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
            <BrandLockup />
          </div>

          <span className="hidden text-sm font-medium text-foreground md:inline">
            {currentLabel(location.pathname)}
          </span>

          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="ml-auto flex h-10 items-center gap-2.5 rounded-full border border-border/60 bg-card px-3.5 text-muted-foreground transition-colors hover:text-foreground md:w-64 md:px-4"
            aria-label="Buscar"
          >
            <Search className="h-4 w-4 shrink-0" strokeWidth={1.75} />
            <span className="hidden flex-1 text-left text-[13px] font-light md:inline">Buscar</span>
            <kbd className="hidden shrink-0 rounded border border-border/60 px-1.5 py-0.5 font-sans text-[10px] font-medium md:inline">
              ⌘K
            </kbd>
          </button>

          <Link
            to="/app/gerar"
            className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-primary px-5 text-[11px] font-black uppercase tracking-[0.12em] text-primary-foreground transition-colors hover:bg-primary/90 md:px-6"
          >
            <Plus className="h-4 w-4" strokeWidth={2} />
            <span className="hidden sm:inline">Gerar</span>
          </Link>
        </header>
        <main className={fullBleed ? "flex min-w-0 flex-1 flex-col" : "flex-1 p-4 md:p-10"}>
          <Outlet />
        </main>
      </div>
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} isAdmin={isAdmin} />
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
