// Compõe o prompt SD a partir do briefing do usuário.
// Pipeline B: briefing → planta baixa 2D via floor-plan-lora.

export type Tipologia = "casa_terrea" | "sobrado" | "apartamento";

export type EstiloArquitetonico =
  | "minimalista_moderno"
  | "industrial"
  | "escandinavo"
  | "neoclassico"
  | "contemporaneo_brasileiro";

export type ExtraId =
  | "varanda_gourmet"
  | "escritorio"
  | "lavabo"
  | "area_servico"
  | "closet"
  | "despensa";

const TIPOLOGIA_LABEL: Record<Tipologia, string> = {
  casa_terrea: "single-story house",
  sobrado: "two-story house",
  apartamento: "apartment unit",
};

const ESTILO_LABEL: Record<EstiloArquitetonico, string> = {
  minimalista_moderno: "modern minimalist",
  industrial: "industrial loft",
  escandinavo: "scandinavian",
  neoclassico: "neoclassical",
  contemporaneo_brasileiro: "contemporary brazilian",
};

const EXTRA_LABEL: Record<ExtraId, string> = {
  varanda_gourmet: "gourmet balcony",
  escritorio: "home office",
  lavabo: "powder room",
  area_servico: "laundry room",
  closet: "walk-in closet",
  despensa: "pantry",
};

export type BriefingInput = {
  tipologia: Tipologia;
  areaM2: number;
  quartos: number;
  suites: number;
  banhos: number;
  vagas: number;
  extras: ExtraId[];
  estilo: EstiloArquitetonico;
  observacoes?: string;
};

export function composeFloorplanPrompt(b: BriefingInput): {
  prompt: string;
  negativePrompt: string;
} {
  const parts: string[] = [
    "masterpiece",
    "architectural 2D floor plan",
    "top-down view",
    "black and white technical drawing",
    "clean lines",
    "labeled rooms",
    "high resolution",
    TIPOLOGIA_LABEL[b.tipologia],
    `${ESTILO_LABEL[b.estilo]} layout`,
    `${b.areaM2} sqm total area`,
    `${b.quartos} bedroom${b.quartos === 1 ? "" : "s"}`,
  ];

  if (b.suites > 0) parts.push(`${b.suites} en-suite${b.suites === 1 ? "" : "s"}`);
  if (b.banhos > 0) parts.push(`${b.banhos} bathroom${b.banhos === 1 ? "" : "s"}`);
  if (b.vagas > 0) parts.push(`${b.vagas}-car garage`);

  for (const e of b.extras) parts.push(EXTRA_LABEL[e]);

  if (b.observacoes && b.observacoes.trim()) {
    parts.push(b.observacoes.trim().slice(0, 300));
  }

  return {
    prompt: parts.join(", "),
    negativePrompt:
      "perspective, 3d, photo, furniture clutter, render, colorful, blurry, watermark, text, signature, people",
  };
}
