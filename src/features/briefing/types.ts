// Tipos compartilhados do Pipeline B — Briefing → Planta 2D.

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

export const TIPOLOGIA_OPTIONS: { id: Tipologia; label: string }[] = [
  { id: "casa_terrea", label: "Casa térrea" },
  { id: "sobrado", label: "Sobrado" },
  { id: "apartamento", label: "Apartamento" },
];

export const ESTILO_OPTIONS: { id: EstiloArquitetonico; label: string }[] = [
  { id: "minimalista_moderno", label: "Minimalista moderno" },
  { id: "industrial", label: "Industrial" },
  { id: "escandinavo", label: "Escandinavo" },
  { id: "neoclassico", label: "Neoclássico" },
  { id: "contemporaneo_brasileiro", label: "Contemporâneo brasileiro" },
];

export const EXTRA_OPTIONS: { id: ExtraId; label: string }[] = [
  { id: "varanda_gourmet", label: "Varanda gourmet" },
  { id: "escritorio", label: "Escritório" },
  { id: "lavabo", label: "Lavabo" },
  { id: "area_servico", label: "Área de serviço" },
  { id: "closet", label: "Closet" },
  { id: "despensa", label: "Despensa" },
];

export type Briefing = {
  tipologia: Tipologia;
  areaM2: number;
  quartos: number;
  suites: number;
  banhos: number;
  vagas: number;
  extras: ExtraId[];
  estilo: EstiloArquitetonico;
  observacoes: string;
};

export type FloorplanAsset = {
  id: string;
  url: string;
  seed: number;
};

export type FloorplanRoom = {
  name: string;
  areaM2?: number;
  type?: string;
};

export type FloorplanAnalysis = {
  rooms: FloorplanRoom[];
  totalAreaApprox?: number;
  bedrooms?: number;
  suites?: number;
  bathrooms?: number;
  garages?: number;
  accessibility?: { nbr9050?: boolean; notes?: string[] };
  raw?: unknown;
};

export const DEFAULT_BRIEFING: Briefing = {
  tipologia: "casa_terrea",
  areaM2: 120,
  quartos: 3,
  suites: 1,
  banhos: 2,
  vagas: 2,
  extras: ["varanda_gourmet", "area_servico"],
  estilo: "minimalista_moderno",
  observacoes: "",
};

// Prompt preview (sem as labels técnicas EN — espelho leve do que o backend monta)
export function composeBriefingPreview(b: Briefing): string {
  const parts = [
    "planta baixa 2D",
    "vista superior",
    "desenho técnico",
    `${b.areaM2} m²`,
    `${b.quartos} quarto${b.quartos === 1 ? "" : "s"}`,
  ];
  if (b.suites > 0) parts.push(`${b.suites} suíte${b.suites === 1 ? "" : "s"}`);
  if (b.banhos > 0) parts.push(`${b.banhos} banho${b.banhos === 1 ? "" : "s"}`);
  if (b.vagas > 0) parts.push(`${b.vagas} vagas`);
  parts.push(b.estilo.replace(/_/g, " "));
  if (b.observacoes.trim()) parts.push(b.observacoes.trim().slice(0, 80));
  return parts.join(", ");
}
