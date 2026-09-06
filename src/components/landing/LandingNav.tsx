import { Link } from "@tanstack/react-router";
import { Wordmark } from "@/components/brand/Wordmark";

const ctaPill =
  "inline-flex items-center justify-center rounded-full px-5 h-10 text-[11px] font-black uppercase tracking-[0.12em] transition-colors";

export function LandingNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-6">
        <Wordmark className="text-primary" />
        <nav className="hidden items-center gap-9 md:flex">
          <a
            href="#recursos"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Recursos
          </a>
          <a
            href="#faq"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            FAQ
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <Link
            to="/entrar"
            className={`${ctaPill} border border-border bg-background text-foreground hover:bg-secondary`}
          >
            Entrar
          </Link>
          <Link
            to="/cadastrar"
            className={`${ctaPill} bg-primary text-primary-foreground hover:bg-primary/90`}
          >
            Começar agora
          </Link>
        </div>
      </div>
    </header>
  );
}
