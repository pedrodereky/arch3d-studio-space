// Composição de prompt para o gpt-image-2 (OpenAI Images Edits).
// Linguagem natural funciona melhor que tags estilo SD.

export type StylePreset =
  | "scandinavian"
  | "modern_minimalist"
  | "industrial"
  | "boho"
  | "contemporary_brazilian"
  | "classic_timeless"
  | "japandi"
  | "tropical_premium"
  | "custom";

export const STYLE_PRESET_KEYWORDS: Record<Exclude<StylePreset, "custom">, string> = {
  scandinavian:
    "Redesign in Scandinavian style: light oak wood floors and furniture, soft white walls, linen and wool textiles in muted earth tones, abundant natural daylight, cozy minimalism with a few green plants.",
  modern_minimalist:
    "Redesign in modern minimalist style: clean lines, neutral palette of off-white and warm grey, matte concrete or microcement surfaces, designer furniture with simple geometry, integrated indirect lighting.",
  industrial:
    "Redesign in industrial loft style: exposed brick wall, raw concrete or dark wood floor, black steel frames, edison bulb pendant lighting, vintage leather sofa, mixed wood and metal furniture.",
  boho: "Redesign in boho style: layered textiles, rattan and macramé details, terracotta and ochre palette with cream accents, abundant indoor plants, warm ambient lighting, eclectic but cohesive composition.",
  contemporary_brazilian:
    "Redesign in contemporary Brazilian interior style: warm tropical hardwoods (freijó, cumaru), natural fiber rugs, organic curved upholstery, large windows with soft daylight, refined neutral palette with green plants.",
  classic_timeless:
    "Redesign in classic timeless style: crown moldings, neutral beige and ivory palette, upholstered armchairs in linen, brass accents, refined elegance with carefully arranged decor.",
  japandi:
    "Redesign in Japandi style: blonde wood, low-profile furniture, paper lantern lighting, neutral palette with muted greens, zen minimalism, soft diffused light, uncluttered surfaces.",
  tropical_premium:
    "Redesign in tropical premium style: dark wood furniture, natural stone surfaces, lush green plants, linen drapes, large openings to outdoor views, sophisticated tropical palette.",
};

const QUALITY_INSTRUCTION =
  "Render as a professional photorealistic interior photograph, magazine quality, sharp focus, natural lighting, true-to-life materials and textures.";

const NEGATIVE =
  "no text, no watermark, no signature, no cartoon or illustration look, no warped perspective, no extra furniture floating, no oversaturated colors.";

export function composeStylePrompt(opts: {
  preset?: StylePreset;
  userPrompt?: string;
  classCounts?: Record<string, number>;
  keepLayout?: boolean;
}): { prompt: string; negativePrompt: string } {
  const parts: string[] = [];

  const keepLayout = opts.keepLayout ?? true;
  if (keepLayout) {
    parts.push(
      "Keep the exact same room geometry: same walls, windows, doors, ceiling, floor outline and camera angle as the reference photo. Only change finishes, furniture, decor, lighting fixtures and color palette.",
    );
  } else {
    parts.push(
      "Reinterpret the room creatively while keeping the camera angle and overall proportions similar to the reference photo.",
    );
  }

  if (opts.preset && opts.preset !== "custom") {
    parts.push(STYLE_PRESET_KEYWORDS[opts.preset]);
  }

  if (opts.userPrompt && opts.userPrompt.trim().length > 0) {
    parts.push(opts.userPrompt.trim());
  }

  parts.push(QUALITY_INSTRUCTION);
  parts.push(NEGATIVE);

  return {
    prompt: parts.filter(Boolean).join(" "),
    negativePrompt: NEGATIVE,
  };
}
