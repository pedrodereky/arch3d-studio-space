/**
 * Metadados de compartilhamento, num lugar só.
 *
 * Crawlers (WhatsApp, Twitter, LinkedIn) não executam JS: o cartão sai do HTML
 * servido. Por isso estes valores são estáticos e não podem depender de dados
 * carregados no cliente.
 */

/**
 * Origem pública do site, para montar URLs absolutas.
 *
 * A especificação do Open Graph pede URL absoluta em `og:image`. Sem
 * VITE_SITE_URL definida sobra um caminho relativo: WhatsApp e Facebook
 * resolvem contra a página, o Twitter é mais exigente. Defina a variável em
 * produção — o fallback existe para não quebrar o build, não para ser o normal.
 */
const SITE_URL = (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/+$/, "") ?? "";

export const absoluteUrl = (path: string) =>
  `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;

export const SITE_NAME = "Arq3D Studio";
export const SITE_TITLE = "Arq3D Studio — Da referência ao 3D em 60 segundos";
export const SITE_DESCRIPTION =
  "Plataforma brasileira de IA 3D para arquitetos. Suba uma foto ou uma planta e receba modelos prontos para Lumion, SketchUp e Revit.";

/** 1200×630, gerada a partir da marca — ver public/og-image.png. */
export const OG_IMAGE = absoluteUrl("/og-image.png");
export const OG_IMAGE_WIDTH = "1200";
export const OG_IMAGE_HEIGHT = "630";
