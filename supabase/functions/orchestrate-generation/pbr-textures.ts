// Gera texturas PBR (baseColor) seamless via Lovable AI Gateway (Nano Banana 2).
// Retorna PNG bytes. Tudo em memória — não persiste no storage.

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3.1-flash-image-preview";

export type TextureKey =
  | "wall_painted_white"
  | "wall_painted_warm"
  | "wall_wood_panel"
  | "wall_exposed_brick"
  | "floor_wood"
  | "floor_tile"
  | "floor_carpet"
  | "floor_concrete";

const PROMPTS: Record<TextureKey, string> = {
  wall_painted_white:
    "seamless tileable PBR base color texture of smooth painted matte off-white interior wall, very subtle roller texture, neutral lighting, no shadows, no perspective, 4k photorealistic, repeating pattern",
  wall_painted_warm:
    "seamless tileable PBR base color texture of warm beige painted plaster interior wall, very subtle texture, neutral lighting, no shadows, no perspective, 4k photorealistic, repeating pattern",
  wall_wood_panel:
    "seamless tileable PBR base color texture of vertical oak wood panel wall cladding, fine grain, warm tone, neutral even lighting, no shadows, no perspective, 4k photorealistic, repeating pattern",
  wall_exposed_brick:
    "seamless tileable PBR base color texture of exposed red brick wall with light mortar, neutral even lighting, no shadows, no perspective, 4k photorealistic, repeating pattern",
  floor_wood:
    "seamless tileable PBR base color texture of natural oak wood plank floor, fine grain, warm tone, top-down orthographic, neutral even lighting, no shadows, no perspective, 4k photorealistic, repeating pattern",
  floor_tile:
    "seamless tileable PBR base color texture of large format white porcelain floor tile with subtle grey veining and thin grout lines, top-down orthographic, neutral lighting, no shadows, no perspective, 4k photorealistic, repeating pattern",
  floor_carpet:
    "seamless tileable PBR base color texture of beige low-pile loop carpet, fine fiber detail, top-down orthographic, neutral lighting, no shadows, no perspective, 4k photorealistic, repeating pattern",
  floor_concrete:
    "seamless tileable PBR base color texture of polished light grey concrete floor, very subtle stains, top-down orthographic, neutral lighting, no shadows, no perspective, 4k photorealistic, repeating pattern",
};

export async function generateTexture(
  apiKey: string,
  key: TextureKey,
): Promise<Uint8Array> {
  const r = await fetch(GATEWAY, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: PROMPTS[key] }],
      modalities: ["image", "text"],
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`texture ${key} ${r.status}: ${t.slice(0, 300)}`);
  }
  const json = await r.json();
  const url: string | undefined =
    json?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!url || !url.startsWith("data:")) {
    throw new Error(`texture ${key}: sem image url`);
  }
  const b64 = url.split(",", 2)[1];
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export async function generateTextureSet(
  apiKey: string,
  keys: TextureKey[],
): Promise<Map<TextureKey, Uint8Array>> {
  const unique = Array.from(new Set(keys));
  const results = await Promise.all(
    unique.map(async (k) => {
      try {
        return [k, await generateTexture(apiKey, k)] as const;
      } catch (e) {
        console.error(`texture ${k} fail:`, (e as Error).message);
        return [k, null] as const;
      }
    }),
  );
  const map = new Map<TextureKey, Uint8Array>();
  for (const [k, v] of results) if (v) map.set(k, v);
  return map;
}
