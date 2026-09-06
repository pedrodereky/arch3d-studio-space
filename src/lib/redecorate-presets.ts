import type { LucideIcon } from "lucide-react";
import { Trees, Square, Factory, Flower2, Sun, Crown, Mountain, Palmtree } from "lucide-react";

export type RedecoratePresetId =
  | "scandinavian"
  | "modern_minimalist"
  | "industrial"
  | "boho"
  | "contemporary_brazilian"
  | "classic_timeless"
  | "japandi"
  | "tropical_premium";

export type RedecoratePreset = {
  id: RedecoratePresetId;
  label: string;
  description: string;
  icon: LucideIcon;
};

export const REDECORATE_PRESETS: RedecoratePreset[] = [
  {
    id: "scandinavian",
    label: "Escandinavo claro",
    description: "Madeira clara, branco, linho, muita luz natural",
    icon: Trees,
  },
  {
    id: "modern_minimalist",
    label: "Moderno minimalista",
    description: "Linhas limpas, paleta neutra, concreto e iluminação indireta",
    icon: Square,
  },
  {
    id: "industrial",
    label: "Industrial",
    description: "Tijolo aparente, concreto cru, aço preto, couro vintage",
    icon: Factory,
  },
  {
    id: "boho",
    label: "Boho aconchegante",
    description: "Texturas em camadas, rattan, terracota, plantas internas",
    icon: Flower2,
  },
  {
    id: "contemporary_brazilian",
    label: "Contemporâneo brasileiro",
    description: "Madeiras tropicais, sisal, móveis orgânicos, luz suave",
    icon: Sun,
  },
  {
    id: "classic_timeless",
    label: "Clássico atemporal",
    description: "Molduras, paleta bege, poltronas estofadas, detalhes em latão",
    icon: Crown,
  },
  {
    id: "japandi",
    label: "Japandi",
    description: "Madeira loira, móveis baixos, paleta neutra, zen minimalismo",
    icon: Mountain,
  },
  {
    id: "tropical_premium",
    label: "Tropical premium",
    description: "Madeira escura, pedra natural, plantas exuberantes",
    icon: Palmtree,
  },
];

export const PRESET_BY_ID: Record<RedecoratePresetId, RedecoratePreset> = Object.fromEntries(
  REDECORATE_PRESETS.map((p) => [p.id, p]),
) as Record<RedecoratePresetId, RedecoratePreset>;
