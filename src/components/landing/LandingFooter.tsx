import { Link } from "@tanstack/react-router";

const cols = [
  {
    title: "Produto",
    links: [
      { label: "Recursos", href: "/#recursos" },
      
      { label: "FAQ", href: "/#faq" },
    ],
  },
  {
    title: "Recursos",
    links: [
      { label: "Biblioteca pública", href: "/" },
      { label: "Documentação", href: "/" },
      { label: "Tutoriais", href: "/" },
    ],
  },
  {
    title: "Empresa",
    links: [
      { label: "Sobre", href: "/" },
      { label: "Contato", href: "/" },
      { label: "Blog", href: "/" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Termos de uso", href: "/" },
      { label: "Privacidade", href: "/" },
      { label: "Cookies", href: "/" },
    ],
  },
];

export function LandingFooter() {
  return (
    <footer className="bg-primary text-primary-foreground">
      <div className="mx-auto max-w-[1200px] px-6 py-16">
        <div className="grid gap-10 md:grid-cols-[1.2fr_repeat(4,1fr)]">
          <div>
            <Link
              to="/"
              className="inline-block font-black uppercase tracking-[0.22em] text-base text-primary-foreground"
            >
              Arq3D Studio
            </Link>
            <p className="mt-4 max-w-xs text-sm font-light text-primary-foreground/70">
              Plataforma brasileira de IA 3D para arquitetos e escritórios.
            </p>
          </div>
          {cols.map((col) => (
            <div key={col.title}>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary-foreground/50">
                {col.title}
              </p>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <a
                      href={l.href}
                      className="text-sm text-primary-foreground/85 transition-colors hover:text-primary-foreground"
                    >
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-14 flex flex-col items-start justify-between gap-3 border-t border-white/10 pt-6 md:flex-row md:items-center">
          <p className="text-xs text-primary-foreground/50">
            © 2026 Arq3D Studio. Feito com Viver de IA.
          </p>
          <p className="text-xs text-primary-foreground/40">v0.1 · Fundação</p>
        </div>
      </div>
    </footer>
  );
}
