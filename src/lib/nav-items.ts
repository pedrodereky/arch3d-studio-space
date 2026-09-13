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

export type NavLeaf = {
  to: string;
  label: string;
  icon: typeof Home;
  exact?: boolean;
  /**
   * Rotas irmãs que também acendem este item. "Plantas" é uma entrada só na
   * barra lateral, mas cobre três telas — sem isso, estar em /gerar/analise
   * apagaria a navegação inteira.
   */
  match?: string[];
};
export type NavSection = { label?: string; items: NavLeaf[] };

/**
 * As três telas de planta, na ordem do fluxo de trabalho: sem planta nenhuma,
 * com uma planta para entender, com uma planta para renderizar. Dividem uma
 * entrada só na barra lateral e alternam entre si pelas abas de PlantasTabs.
 */
export const PLANTA_ROUTES: NavLeaf[] = [
  { to: "/app/gerar/briefing", label: "Briefing → Planta 2D", icon: Type },
  { to: "/app/gerar/analise", label: "Análise de planta", icon: ImageUp },
  { to: "/app/gerar/planta", label: "Render de planta", icon: Map },
];

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
      {
        // Aponta para o render, que é o que o Dashboard já promove como
        // entrada de planta; as outras duas ficam a uma aba de distância.
        to: "/app/gerar/planta",
        label: "Plantas",
        icon: Map,
        match: ["/app/gerar/briefing", "/app/gerar/analise"],
      },
      { to: "/app/gerar/video", label: "Vídeo POV", icon: Video },
    ],
  },
  {
    items: [
      { to: "/app/studio", label: "Studio", icon: Workflow },
      { to: "/app/biblioteca", label: "Biblioteca", icon: Library },
      { to: "/app/projetos", label: "Projetos", icon: FolderOpen },
    ],
  },
];

/**
 * Destinos de conta, fora da barra lateral: são raros e não competem com o
 * trabalho. Ficam no menu do avatar — Transparência não tinha nenhum outro
 * link no app, e sair da barra lateral sem isso a deixaria alcançável só por
 * ⌘K, o que é pouco para uma página que existe para ser mostrada.
 */
export const ACCOUNT_ITEMS: NavLeaf[] = [
  { to: "/app/conta", label: "Conta", icon: User },
  { to: "/app/transparencia", label: "Transparência IA", icon: ShieldCheck },
];

export const adminItems: NavLeaf[] = [
  { to: "/admin/configuracoes", label: "Configurações", icon: Shield },
  { to: "/admin/uso", label: "Uso", icon: Shield },
  { to: "/admin/usuarios", label: "Usuários", icon: Shield },
  { to: "/admin/diagnostico", label: "Diagnóstico", icon: Shield },
];

export const isActive = (item: NavLeaf, pathname: string) =>
  item.exact
    ? pathname === item.to
    : pathname.startsWith(item.to) || (item.match ?? []).some((m) => pathname.startsWith(m));

/**
 * Toda tela com rótulo próprio, inclusive as que a barra lateral agrupa.
 *
 * A barra lateral consolidou "Plantas", mas o cabeçalho e a busca continuam
 * precisando do nome específico: quem está em /gerar/analise quer ler "Análise
 * de planta" no cabeçalho, e quem busca "briefing" precisa achar a tela.
 */
export const ALL_SCREENS: NavLeaf[] = [
  ...navSections.flatMap((s) => s.items).filter((i) => i.to !== "/app/gerar/planta"),
  ...PLANTA_ROUTES,
  ...ACCOUNT_ITEMS,
  ...adminItems,
];

/** Rótulo da tela atual, para o header não ficar sem contexto. */
export function currentLabel(pathname: string): string {
  // Do mais específico para o mais genérico, senão "/app" casaria com tudo.
  // `exact: true` aqui atrapalharia: comparamos rota a rota, sem agrupamento.
  const match = [...ALL_SCREENS]
    .sort((a, b) => b.to.length - a.to.length)
    .find((item) => (item.exact ? pathname === item.to : pathname.startsWith(item.to)));
  return match?.label ?? "Arq3D Studio";
}
