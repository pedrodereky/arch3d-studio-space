// Gera mesh 3D para cada móvel via Replicate Hunyuan3D 3.1 (text-to-3d).
// Retorna o GLB em bytes. Concorrência limitada + retry com backoff.

import type { Furniture } from "./floorplan-extract.ts";

const HUNYUAN_URL = "https://api.replicate.com/v1/models/tencent/hunyuan-3d-3.1/predictions";

const MAX_CONCURRENCY = 2;
const MAX_RETRIES = 4;

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function pollPrediction(
  predUrl: string,
  token: string,
  timeoutMs = 300_000,
): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const r = await fetch(predUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const j = await r.json();
    if (j.status === "succeeded") {
      const out = j.output;
      if (typeof out === "string") return out;
      if (Array.isArray(out)) return out[out.length - 1];
      if (out?.mesh) return out.mesh;
      throw new Error(`prediction sem output utilizável`);
    }
    if (j.status === "failed" || j.status === "canceled") {
      throw new Error(`prediction ${j.status}: ${j.error ?? "?"}`);
    }
    await sleep(3000);
  }
  throw new Error("prediction timeout");
}

async function generateOneMesh(token: string, prompt: string): Promise<Uint8Array> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const r = await fetch(HUNYUAN_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Prefer: "wait=1",
        },
        body: JSON.stringify({
          input: {
            prompt,
            enable_pbr: true,
            face_count: 80000,
            generate_type: "Normal",
          },
        }),
      });
      const pred = await r.json();
      if (!r.ok) {
        const msg = JSON.stringify(pred);
        if (msg.includes("RequestLimitExceeded") || r.status === 429) {
          const wait = Math.min(2000 * Math.pow(2, attempt), 30_000);
          console.warn(`hunyuan rate limit, retry em ${wait}ms`);
          await sleep(wait);
          continue;
        }
        throw new Error(`replicate ${r.status}: ${msg.slice(0, 300)}`);
      }
      let glbUrl: string;
      if (pred.status === "succeeded") {
        const out = pred.output;
        glbUrl =
          typeof out === "string" ? out : Array.isArray(out) ? out[out.length - 1] : out?.mesh;
      } else {
        const url = pred.urls?.get;
        if (!url) throw new Error(`prediction sem url de get`);
        glbUrl = await pollPrediction(url, token);
      }
      if (!glbUrl) throw new Error("sem glb url");
      const dl = await fetch(glbUrl);
      if (!dl.ok) throw new Error(`download glb: ${dl.status}`);
      return new Uint8Array(await dl.arrayBuffer());
    } catch (e) {
      lastErr = e as Error;
      const msg = lastErr.message;
      if (msg.includes("RequestLimitExceeded") || msg.includes("429")) {
        const wait = Math.min(3000 * Math.pow(2, attempt), 30_000);
        await sleep(wait);
        continue;
      }
      // erro não-rate: ainda assim tenta backoff curto
      await sleep(2000);
    }
  }
  throw lastErr ?? new Error("hunyuan: falha desconhecida");
}

export type MeshResult = {
  index: number;
  furniture: Furniture;
  bytes: Uint8Array | null;
  error?: string;
};

export async function generateFurnitureMeshes(
  token: string,
  items: Furniture[],
  onProgress?: (done: number, total: number) => void,
): Promise<MeshResult[]> {
  const results: MeshResult[] = items.map((f, i) => ({
    index: i,
    furniture: f,
    bytes: null,
  }));
  let done = 0;
  let cursor = 0;
  async function worker() {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      const f = items[idx];
      const prompt = (f as Furniture & { prompt?: string }).prompt ?? defaultPromptFor(f);
      try {
        results[idx].bytes = await generateOneMesh(token, prompt);
      } catch (e) {
        results[idx].error = (e as Error).message;
        console.error(`furniture ${idx} (${f.type}):`, results[idx].error);
      }
      done++;
      onProgress?.(done, items.length);
    }
  }
  const workers = Array.from({ length: Math.min(MAX_CONCURRENCY, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

function defaultPromptFor(f: Furniture): string {
  const map: Record<string, string> = {
    sofa: "a modern 3-seat fabric sofa, beige linen upholstery, wooden legs",
    armchair: "a modern fabric armchair, grey upholstery, wooden legs",
    chair: "a modern wooden dining chair",
    bed_double: "a modern double bed with grey fabric headboard and white bedding",
    bed_single: "a modern single bed with white bedding",
    table_dining: "a modern wooden dining table for 6 people",
    table_coffee: "a modern wooden coffee table",
    desk: "a modern wooden office desk",
    wardrobe: "a modern wooden wardrobe with sliding doors",
    tv: "a flat screen wall-mounted television, black",
    toilet: "a modern white porcelain toilet",
    sink: "a modern white porcelain bathroom sink with wooden vanity",
    bathtub: "a modern white freestanding bathtub",
    shower: "a modern glass walk-in shower enclosure",
    stove: "a modern stainless steel kitchen stove with oven",
    fridge: "a modern stainless steel refrigerator",
    kitchen_counter: "a modern kitchen counter with white quartz top and wooden cabinets",
    lamp: "a modern floor lamp with fabric shade",
    plant: "a tall indoor potted plant in a wooden pot",
  };
  const base = map[f.type] ?? `a modern ${f.type}`;
  return `${base}, photorealistic, high detail, single object, isolated, white background, neutral lighting`;
}
