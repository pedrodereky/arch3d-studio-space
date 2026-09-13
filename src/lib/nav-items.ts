import {
  Home,
  Library,
  FolderOpen,
  User,
  Shield,
  Box,
  Map,
  ShieldCheck,
  Video,
  Workflow,
  Wand2,
  Type,
  ImageUp,
} from "lucide-react";

export type NavLeaf = { to: string; label: string; icon: typeof Home; exact?: boolean };
export type NavSection = { label?: string; items: NavLeaf[] };

/**
 * Uma lista só de destinos, lida pela barra lateral e pela busca global.
 *
 * Duplicar isso nos dois lugares garantiria que um dia divergissem, e o jeito
 * de descobrir seria a busca não achar uma tela que existe.
 *
 * Seções planas, sem grupo colapsável: a navegação tem a mesma forma em toda
 * tela e só o item ativo muda. O acordeão anterior reorganizava a lista
 * conforme a rota, que é o oposto de previsível.
 */
export const navSections: NavSection[] = [
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

export const adminItems: NavLeaf[] = [
  { to: "/admin/configuracoes", label: "Configurações", icon: Shield },
  { to: "/admin/uso", label: "Uso", icon: Shield },
  { to: "/admin/usuarios", label: "Usuários", icon: Shield },
  { to: "/admin/diagnostico", label: "Diagnóstico", icon: Shield },
];

export const isActive = (item: NavLeaf, pathname: string) =>
  item.exact ? pathname === item.to : pathname.startsWith(item.to);

/** Rótulo da tela atual, para o header não ficar sem contexto. */
export function currentLabel(pathname: string): string {
  const all = [...navSections.flatMap((s) => s.items), ...adminItems];
  // Do mais específico para o mais genérico, senão "/app" casaria com tudo.
  const match = [...all]
    .sort((a, b) => b.to.length - a.to.length)
    .find((item) => isActive(item, pathname));
  return match?.label ?? "Arq3D Studio";
}
