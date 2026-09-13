// Gera GLBs para cada objeto detectado em uma cena.
// Para cada objeto: usa Gemini para isolar em fundo branco a partir da imagem
// original da cena, depois manda imagem isolada pro Hunyuan3D 2.1 single-view
// com generate_texture=true. Concorrência limitada + retry 429.

import type { MeshResult } from "./furniture-mesh.ts";
import type { SceneObject } from "./scene-extract.ts";

const HUNYUAN3D_2_VERSION = "895e514f953d39e8b5bfb859df9313481ad3fa3a8631e5c54c7e5c9c85a6aa9f";

const MAX_CONCURRENCY = 2;
const MAX_RETRIES = 4;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
      throw new Error("prediction sem output utilizável");
    }
    if (j.status === "failed" || j.status === "canceled") {
      throw new Error(`prediction ${j.status}: ${j.error ?? "?"}`);
    }
    await sleep(3000);
  }
  throw new Error("prediction timeout");
}

async function generateMeshFromImageUrl(token: string, imageUrl: string): Promise<Uint8Array> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const r = await fetch("https://api.replicate.com/v1/predictions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Prefer: "wait=1",
        },
        body: JSON.stringify({
          version: HUNYUAN3D_2_VERSION,
          input: {
            image: imageUrl,
            generate_texture: true,
            steps: 30,
          },
        }),
      });
      const pred = await r.json();
      if (!r.ok) {
        const msg = JSON.stringify(pred);
        if (r.status === 429 || msg.includes("RequestLimitExceeded")) {
          const wait = Math.min(
            Math.max(Number(pred?.retry_after ?? 0) * 1000, 2000 * 2 ** attempt),
            30_000,
          );
          await sleep(wait);
          continue;
        }
        throw new Error(`hunyuan ${r.status}: ${msg.slice(0, 300)}`);
      }
      let glbUrl: string;
      if (pred.status === "succeeded") {
        const out = pred.output;
        glbUrl =
          typeof out === "string" ? out : Array.isArray(out) ? out[out.length - 1] : out?.mesh;
      } else {
        const url = pred.urls?.get;
        if (!url) throw new Error("prediction sem url de get");
        glbUrl = await pollPrediction(url, token);
      }
      if (!glbUrl) throw new Error("sem glb url");
      const dl = await fetch(glbUrl);
      if (!dl.ok) throw new Error(`download glb: ${dl.status}`);
      return new Uint8Array(await dl.arrayBuffer());
    } catch (e) {
      lastErr = e as Error;
      await sleep(2000);
    }
  }
  throw lastErr ?? new Error("hunyuan: falha desconhecida");
}

export type SceneMeshContext = {
  callGemini: (
    imageB64: string,
    mime: string,
    prompt: string,
  ) => Promise<{ bytes: Uint8Array; mime: string }>;
  uploadIntermediate: (name: string, bytes: Uint8Array, mime: string) => Promise<string>;
  bytesToBase64: (bytes: Uint8Array) => string;
  sceneImageB64: string;
  sceneImageMime: string;
};

export async function generateSceneObjectMeshes(
  replicateToken: string,
  objects: SceneObject[],
  ctx: SceneMeshContext,
  onProgress?: (done: number, total: number) => void,
): Promise<MeshResult[]> {
  const results: MeshResult[] = objects.map((f, i) => ({
    index: i,
    furniture: f,
    bytes: null,
  }));
  let done = 0;
  let cursor = 0;

  async function worker() {
    while (true) {
      const idx = cursor++;
      if (idx >= objects.length) return;
      const obj = objects[idx];
      try {
        // 1. Gemini isola este objeto da cena em fundo branco
        const isolated = await ctx.callGemini(
          ctx.sceneImageB64,
          ctx.sceneImageMime,
          obj.isolation_prompt,
        );
        const isoUrl = await ctx.uploadIntermediate(
          `scene-obj-${idx}-${obj.type}.png`,
          isolated.bytes,
          isolated.mime,
        );
        // 2. Hunyuan 2.1 single-view gera GLB texturizado
        results[idx].bytes = await generateMeshFromImageUrl(replicateToken, isoUrl);
      } catch (e) {
        results[idx].error = (e as Error).message;
        console.error(`scene obj ${idx} (${obj.type}):`, results[idx].error);
      }
      done++;
      onProgress?.(done, objects.length);
    }
  }

  const workers = Array.from({ length: Math.min(MAX_CONCURRENCY, objects.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
