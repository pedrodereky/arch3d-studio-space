import { Link, useLocation } from "@tanstack/react-router";
import { PLANTA_ROUTES } from "@/lib/nav-items";

/**
 * Alternador entre as três telas de planta.
 *
 * A barra lateral mostra uma entrada só ("Plantas"), então este é o único
 * caminho entre elas — sem ele, consolidar a navegação deixaria duas telas
 * sem link nenhum.
 */
export function PlantasTabs({ className = "" }: { className?: string }) {
  const { pathname } = useLocation();
  return (
    <nav
      aria-label="Telas de planta"
      className={`inline-flex flex-wrap gap-1 rounded-full bg-muted p-1 ${className}`}
    >
      {PLANTA_ROUTES.map((r) => {
        const active = pathname.startsWith(r.to);
        return (
          <Link
            key={r.to}
            to={r.to}
            aria-current={active ? "page" : undefined}
            className={
              "inline-flex h-8 items-center rounded-full px-3.5 text-[12px] transition-colors " +
              (active
                ? "bg-card font-semibold text-foreground shadow-sm"
                : "font-light text-muted-foreground hover:text-foreground")
            }
          >
            {r.label}
          </Link>
        );
      })}
    </nav>
  );
}
