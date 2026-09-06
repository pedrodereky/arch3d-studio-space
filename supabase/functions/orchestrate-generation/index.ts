// Orquestrador de geração 3D — Arq3D Studio
// Recebe { generationId }, prepara imagens (Gemini quando aplicável)
// e dispara prediction no Replicate (Hunyuan3D) com webhook.
// Pipeline `floorplan` é totalmente procedural (sem Replicate).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { Document, WebIO } from "https://esm.sh/@gltf-transform/core@4.0.7";
import { extractFloorplan } from "./floorplan-extract.ts";
import { buildFloorplanGLB, requiredTextureKeys } from "./floorplan-build.ts";
import { generateTextureSet } from "./pbr-textures.ts";
import { generateFurnitureMeshes } from "./furniture-mesh.ts";
import { mergeFurnitureIntoGLB } from "./glb-merge.ts";
import { extractScene } from "./scene-extract.ts";
import { generateSceneObjectMeshes } from "./scene-objects-mesh.ts";
import { callGptImage2 } from "../_shared/gpt-image-2.ts";
import { callGptImage2OpenAI } from "../_shared/gpt-image-2-openai.ts";
import { analyzeFloorplan } from "../_shared/floorplan-analyzer.ts";
import { createLogger } from "../_shared/pipeline-logger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

async function getSecret(name: string): Promise<string | null> {
  const { data, error } = await admin.rpc("service_get_secret", { _name: name });
  if (error) {
    console.error(`secret ${name}:`, error.message);
    return null;
  }
  return (data as string | null) ?? null;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(
      null,
      bytes.subarray(i, i + CHUNK) as unknown as number[],
    );
  }
  return btoa(bin);
}

async function fetchAsBase64(url: string): Promise<{ b64: string; mime: string }> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch ${url}: ${r.status}`);
  const mime = r.headers.get("content-type") ?? "image/jpeg";
  const buf = new Uint8Array(await r.arrayBuffer());
  return { b64: bytesToBase64(buf), mime };
}

async function uploadIntermediate(
  userId: string,
  genId: string,
  name: string,
  bytes: Uint8Array,
  mime: string,
): Promise<string> {
  const path = `${userId}/${genId}/intermediates/${name}`;
  const { error } = await admin.storage
    .from("outputs")
    .upload(path, bytes, { upsert: true, contentType: mime });
  if (error) throw error;
  const { data } = await admin.storage.from("outputs").createSignedUrl(path, 60 * 60 * 24);
  return data?.signedUrl ?? path;
}

// Constrói um GLB mínimo com apenas um plano de piso (cinza claro) centralizado em (0,0).
// Tamanho em metros (X = w, Z = h), normal Y+, com material PBR neutro.
async function buildFloorPlaneGLB(w: number, h: number): Promise<Uint8Array> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const hx = w / 2, hz = h / 2;
  const positions = new Float32Array([
    -hx, 0, -hz,
     hx, 0, -hz,
     hx, 0,  hz,
    -hx, 0,  hz,
  ]);
  const normals = new Float32Array([
    0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0,
  ]);
  const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
  const posAcc = doc.createAccessor()
    .setType("VEC3").setArray(positions).setBuffer(buffer);
  const nrmAcc = doc.createAccessor()
    .setType("VEC3").setArray(normals).setBuffer(buffer);
  const idxAcc = doc.createAccessor()
    .setType("SCALAR").setArray(indices).setBuffer(buffer);
  const mat = doc.createMaterial("floor")
    .setBaseColorFactor([0.85, 0.85, 0.85, 1])
    .setRoughnessFactor(0.9)
    .setMetallicFactor(0)
    .setDoubleSided(true);
  const prim = doc.createPrimitive()
    .setAttribute("POSITION", posAcc)
    .setAttribute("NORMAL", nrmAcc)
    .setIndices(idxAcc)
    .setMaterial(mat);
  const mesh = doc.createMesh("floor").addPrimitive(prim);
  const node = doc.createNode("floor").setMesh(mesh);
  const scene = doc.createScene("scene").addChild(node);
  doc.getRoot().setDefaultScene(scene);
  return await new WebIO().writeBinary(doc);
}

// Chama Gemini 2.5 Flash Image Preview e retorna a primeira imagem inline (bytes + mime)
async function callGemini(
  apiKey: string,
  imageB64: string,
  mime: string,
  prompt: string,
): Promise<{ bytes: Uint8Array; mime: string }> {
  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=" +
    apiKey;
  const body = {
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt },
          { inline_data: { mime_type: mime, data: imageB64 } },
        ],
      },
    ],
  };
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`gemini ${r.status}: ${t}`);
  }
  const json = await r.json();
  const parts = json?.candidates?.[0]?.content?.parts ?? [];
  for (const p of parts) {
    const inline = p.inline_data ?? p.inlineData;
    if (inline?.data) {
      const bin = atob(inline.data);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return { bytes, mime: inline.mime_type ?? inline.mimeType ?? "image/png" };
    }
  }
  throw new Error("gemini: nenhuma imagem retornada");
}

// (Helper writeFloorplanPromptWithGpt5 removido — substituído por analyzeFloorplan
//  em _shared/floorplan-analyzer.ts: 1 chamada que consolida classificação +
//  seleção de refs + prompt final, sem decodificar imagens no worker.)


// Base compartilhada por todas as vistas — força consistência total de cor,
// material, escala e iluminação. Só o ângulo de câmera muda entre prompts.
const VIEW_BASE =
  "Render the SAME object as the reference image from a different camera angle. " +
  "STRICT REQUIREMENTS — do not change anything except camera position: " +
  "(1) preserve every color exactly as in the reference (same hue, same saturation, same brightness, same color zones on each part); " +
  "(2) preserve every material and texture exactly (wood grain, fabric, leather, metal, plastic — same finish, same pattern, same wear); " +
  "(3) preserve the exact geometry, proportions and scale of every part; " +
  "(4) the object is fully opaque and solid — no transparency, no reflections of the environment; " +
  "(5) pure white background (#FFFFFF), no floor, no shadows on the ground, no props; " +
  "(6) flat even studio lighting from all sides, no directional highlights, no cast shadows, no rim light; " +
  "(7) orthographic-like framing, object centered and fully visible with small even margin, no cropping, no perspective distortion; " +
  "(8) photorealistic, sharp focus, no stylization, no painterly effect, no outlines. " +
  "The output must look like the SAME physical object photographed in the SAME lighting setup, only rotated. ";

const VIEW_PROMPTS = {
  front: VIEW_BASE + "Camera angle: FRONT view (0°), looking straight at the front face of the object.",
  right: VIEW_BASE + "Camera angle: RIGHT side view (90° clockwise from front), looking straight at the right face of the object.",
  back: VIEW_BASE + "Camera angle: BACK view (180° from front), looking straight at the back face of the object.",
  left: VIEW_BASE + "Camera angle: LEFT side view (90° counter-clockwise from front), looking straight at the left face of the object.",
};

// ndreca/hunyuan3d-2.1 — suporta `generate_texture` (PBR). Modelos sem esse parâmetro
// devolvem mesh cinza sem textura.
const HUNYUAN3D_2_VERSION = "895e514f953d39e8b5bfb859df9313481ad3fa3a8631e5c54c7e5c9c85a6aa9f";
const HUNYUAN3D_2MV_VERSION = "71798fbc3c9f7b7097e3bb85496e5a797d8b8f616b550692e7c3e176a8e9e5db";

// POST ao Replicate com retry/backoff em 429 (rate limit).
async function postReplicate(
  endpoint: string,
  token: string,
  payload: unknown,
  maxRetries = 5,
): Promise<{ ok: boolean; status: number; json: any }> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const r = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "respond-async",
      },
      body: JSON.stringify(payload),
    });
    const json = await r.json().catch(() => ({}));
    if (r.status !== 429) return { ok: r.ok, status: r.status, json };
    const retryAfter = Number(json?.retry_after ?? 0);
    const wait = Math.min(
      Math.max(retryAfter * 1000, 2000 * Math.pow(2, attempt)),
      30_000,
    );
    console.warn(`replicate 429, retry em ${wait}ms (tentativa ${attempt + 1}/${maxRetries})`);
    await new Promise((res) => setTimeout(res, wait));
  }
  return { ok: false, status: 429, json: { detail: "rate limit excedido após retries" } };
}

async function processGeneration(generationId: string): Promise<void> {
  try {

    const replicateToken = await getSecret("REPLICATE_API_TOKEN");
    const geminiKey = await getSecret("GEMINI_API_KEY");
    const openaiKey = Deno.env.get("OPENAI_API_KEY") ?? await getSecret("OPENAI_API_KEY");
    if (!replicateToken) throw new Error("REPLICATE_API_TOKEN não configurado");

    // Wrapper: usa OpenAI direto se a key estiver configurada; senão cai no proxy do Replicate.
    const callImage2 = async (
      refs: Array<{ b64: string; mime: string }>,
      prompt: string,
      o: { aspect_ratio: "1:1" | "16:9" | "9:16" | "4:3" | "3:4" | "3:2" | "2:3"; output_format?: "png" | "webp" | "jpeg" },
    ): Promise<{ bytes: Uint8Array; mime: string }> => {
      const outFmt = o.output_format ?? "png";
      if (openaiKey) {
        const inputs = refs.map((r) => {
          const bin = atob(r.b64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          return { bytes, mime: r.mime };
        });
        return await callGptImage2OpenAI(openaiKey, inputs, prompt, {
          aspect_ratio: o.aspect_ratio,
          quality: "high",
          output_format: outFmt,
        });
      }
      return await callGptImage2(replicateToken, refs, prompt, {
        aspect_ratio: o.aspect_ratio,
        quality: "high",
        output_format: outFmt,
      });
    };

    const { data: gen, error: genErr } = await admin
      .from("generations")
      .select("*")
      .eq("id", generationId)
      .single();
    if (genErr || !gen) throw genErr ?? new Error("Geração não encontrada");

    if (gen.pipeline_type === "floorplan" || gen.pipeline_type === "scene_to_3d") {
      await admin.from("generations").update({
        status: "failed",
        error_message: "Este modo foi descontinuado.",
        completed_at: new Date().toISOString(),
      }).eq("id", generationId);
      return;
    }

    await admin.from("generations").update({ status: "processing" }).eq("id", generationId);

    // Pipeline text-to-3D: vai direto pro Hunyuan 3.1 com prompt, sem imagem nem Gemini.
    if (gen.pipeline_type === "text_to_3d") {
      const prompt = (gen.prompt as string | null)?.trim();
      if (!prompt) throw new Error("Prompt obrigatório para text-to-3d");
      const webhookUrl = `${SUPABASE_URL}/functions/v1/replicate-webhook`;
      const endpoint = "https://api.replicate.com/v1/models/tencent/hunyuan-3d-3.1/predictions";
      const payload = {
        input: {
          prompt,
          enable_pbr: true,
          face_count: 500000,
          generate_type: "Normal",
        },
        webhook: webhookUrl,
        webhook_events_filter: ["completed"],
      };
      const { ok, status, json: pred } = await postReplicate(endpoint, replicateToken, payload);
      if (!ok) throw new Error(`replicate ${status}: ${JSON.stringify(pred)}`);
      await admin
        .from("generations")
        .update({ replicate_prediction_id: pred.id })
        .eq("id", generationId);
      return;
    }

    // Pipeline render_to_video: anima um render existente (POV walkthrough) via alibaba/happyhorse-1.0.
    if (gen.pipeline_type === "render_to_video") {
      const sources: string[] = (gen.source_images as string[]) ?? [];
      const imageUrl = sources[0];
      if (!imageUrl) throw new Error("Sem imagem de origem para o vídeo");

      const userPrompt = ((gen.prompt as string | null) ?? "").trim();
      const cameraMode = ((gen.metadata as Record<string, unknown> | null)?.camera_mode as
        | "pov_walk"
        | "aerial_flyover"
        | "facade_tour"
        | undefined) ?? "pov_walk";
      const BASE_PROMPTS: Record<string, string> = {
        pov_walk:
          "First-person POV walkthrough of this interior space. Smooth, slow camera movement at human eye level, gently exploring the room as if walking through it. Cinematic, photorealistic, natural lighting, no people visible, no text overlays.",
        aerial_flyover:
          "Slow aerial drone shot orbiting and gradually rising above this isometric architectural model, smooth continuous camera movement revealing the full layout from above. Cinematic, photorealistic, natural lighting, no people visible, no text overlays.",
        facade_tour:
          "Smooth lateral dolly shot at street level in front of this building facade, slight forward push-in toward the entrance, daylight. Cinematic, photorealistic, no people visible, no text overlays.",
      };
      const basePrompt = BASE_PROMPTS[cameraMode] ?? BASE_PROMPTS.pov_walk;
      const finalPrompt = userPrompt ? `${basePrompt} ${userPrompt}` : basePrompt;

      await admin.from("generations").update({
        progress_percent: 20,
        progress_stage: "Enviando para o gerador de vídeo (Happyhorse)",
      }).eq("id", generationId);

      const webhookUrl = `${SUPABASE_URL}/functions/v1/replicate-webhook`;
      const endpoint = "https://api.replicate.com/v1/models/alibaba/happyhorse-1.0/predictions";
      const payload = {
        input: {
          image: imageUrl,
          prompt: finalPrompt,
          resolution: "1080p",
          duration: 15,
          aspect_ratio: "16:9",
        },
        webhook: webhookUrl,
        webhook_events_filter: ["completed"],
      };
      const { ok, status, json: pred } = await postReplicate(endpoint, replicateToken, payload);
      if (!ok) throw new Error(`replicate ${status}: ${JSON.stringify(pred)}`);
      await admin
        .from("generations")
        .update({
          replicate_prediction_id: pred.id,
          progress_percent: 40,
          progress_stage: "Vídeo em processamento (até ~5 min)",
        })
        .eq("id", generationId);
      return;
    }

    const sourceImages: string[] = (gen.source_images as string[]) ?? [];
    const sourceUrl: string | undefined = sourceImages[0];
    if (!sourceUrl) throw new Error("Sem imagem de origem");

    // ========= Pipeline floorplan_render: planta 2D (PDF multipágina) → render isométrico 3D =========
    if (gen.pipeline_type === "floorplan_render") {
      const diagnosticsMode = (gen.metadata as Record<string, unknown> | null)?.diagnostics_mode === true;
      const log = createLogger({
        admin,
        generationId,
        userId: gen.user_id,
        enabled: diagnosticsMode,
      });
      log.info("pipeline.start", `floorplan_render diagnostics=${diagnosticsMode}`, {
        source_pages: sourceImages.length,
      });

      const extra = (gen.prompt as string | null)?.trim() ?? "";
      const lovableKey = Deno.env.get("LOVABLE_API_KEY") ?? await getSecret("LOVABLE_API_KEY");
      if (!lovableKey) throw new Error("LOVABLE_API_KEY não configurado");
      const viewMode = ((gen.metadata as Record<string, unknown> | null)?.view_mode as
        | "isometric_aerial"
        | "frontal_interior"
        | "facade_exterior"
        | undefined) ?? "isometric_aerial";
      const metadataLog: Record<string, unknown> = { diagnostics_mode: diagnosticsMode, view_mode: viewMode };

      // ===== Etapa 1: Download das páginas (BYTES brutos, sem decodificar) =====
      // CRÍTICO: nunca chamar imagescript aqui. Decodificar páginas A3 estoura
      // a memória do worker Deno (~150MB heap). O cliente já manda JPEGs em
      // resolução adequada (~400KB-1MB cada).
      await admin.from("generations").update({
        progress_percent: 10,
        progress_stage: "Baixando páginas do projeto",
      }).eq("id", generationId);

      const pages: { b64: string; mime: string }[] = [];
      for (let i = 0; i < sourceImages.length; i++) {
        const u = sourceImages[i];
        const h = log.start(`download.page_${i}`, { url: u.slice(0, 200) });
        try {
          const raw = await fetchAsBase64(u);
          const kb = Math.round((raw.b64.length * 3) / 4 / 1024);
          pages.push({ b64: raw.b64, mime: raw.mime });
          log.end(h, { payload_kb: kb, details: { mime: raw.mime } });
        } catch (e) {
          log.error(`download.page_${i}`, e);
          throw e;
        }
      }
      if (pages.length === 0) throw new Error("Nenhuma página de origem");

      // ===== Etapa 2: Análise consolidada (1 chamada gpt-5.5) =====
      // Substitui: classifier + cropper + brief + compose. Sem decode no worker.
      await admin.from("generations").update({
        progress_percent: 30,
        progress_stage: "Analisando pranchas e gerando briefing",
      }).eq("id", generationId);

      const totalKb = pages.reduce((s, p) => s + Math.round((p.b64.length * 3) / 4 / 1024), 0);
      const ah = log.start("analyzer", { pages_count: pages.length, total_payload_kb: totalKb });
      const analysis = await analyzeFloorplan(lovableKey, pages, extra, viewMode);
      log.end(ah, {
        payload_kb: totalKb,
        message: `${analysis.classifications.length} páginas, ${analysis.reference_page_indices.length} refs`,
        details: {
          refs: analysis.reference_page_indices,
          primary_category: analysis.primary_category,
          ...analysis.diagnostics,
        },
      });
      metadataLog.analyzer_model = "openai/gpt-5.5";
      metadataLog.classifications = analysis.classifications;
      metadataLog.reference_page_indices = analysis.reference_page_indices;
      metadataLog.primary_category = analysis.primary_category;
      metadataLog.analyzer_diagnostics = analysis.diagnostics;
      metadataLog.generated_prompt = analysis.prompt_for_gpt_image_2;

      // ===== Etapa 3: Monta refs para o gpt-image-2 e libera o resto =====
      const refImages = analysis.reference_page_indices.map((i) => ({
        b64: pages[i].b64,
        mime: pages[i].mime,
      }));
      // Libera bytes das páginas não referenciadas
      const refSet = new Set(analysis.reference_page_indices);
      for (let i = 0; i < pages.length; i++) {
        if (!refSet.has(i)) (pages[i] as { b64: string }).b64 = "";
      }

      // ===== Etapa 4: 2 candidatos em paralelo =====
      await admin.from("generations").update({
        progress_percent: 60,
        progress_stage: "Gerando 2 candidatos em paralelo",
      }).eq("id", generationId);

      const promptStrict = analysis.prompt_for_gpt_image_2 +
        `\n\nPRIORITY: maximize geometric and layout fidelity over visual polish. The render should look like a faithful technical 3D maquette, even if slightly less polished. Do NOT decorate beyond what is in the references.`;
      const promptBalanced = analysis.prompt_for_gpt_image_2 +
        `\n\nPRIORITY: balance geometric fidelity with polished commercial architectural presentation. Maintain all layout constraints but produce a clean, well-lit professional render.`;

      const variants: Array<{ name: string; prompt: string }> = [
        { name: "fidelity_strict", prompt: promptStrict },
        { name: "balanced", prompt: promptBalanced },
      ];

      const successful: Array<{ variant: string; bytes: Uint8Array; mime: string }> = [];
      const failures: Array<{ variant: string; error: string }> = [];
      const refKb = refImages.reduce((s, r) => s + Math.round((r.b64.length * 3) / 4 / 1024), 0);

      const renderTasks = variants.map(async (v) => {
        const h = log.start(`render.${v.name}`, { ref_count: refImages.length, payload_kb: refKb });
        try {
          const res = await callImage2(refImages, v.prompt, {
            aspect_ratio: "3:2", output_format: "png",
          });
          log.end(h, { payload_kb: Math.round(res.bytes.length / 1024), message: "ok" });
          return { ok: true as const, variant: v.name, bytes: res.bytes, mime: res.mime };
        } catch (e) {
          log.error(`render.${v.name}`, e);
          return { ok: false as const, variant: v.name, error: (e as Error).message };
        }
      });

      const renderResults = await Promise.all(renderTasks);
      for (const r of renderResults) {
        if (r.ok) successful.push({ variant: r.variant, bytes: r.bytes, mime: r.mime });
        else failures.push({ variant: r.variant, error: r.error });
      }

      if (successful.length === 0) {
        throw new Error(`Ambos candidatos falharam: ${failures.map((f) => `${f.variant}: ${f.error}`).join(" | ")}`);
      }

      await admin.from("generations").update({
        progress_percent: 90,
        progress_stage: "Salvando resultados",
      }).eq("id", generationId);

      const candidateUrls: { variant: string; url: string }[] = [];
      for (const s of successful) {
        const url = await uploadIntermediate(
          gen.user_id, gen.id, `render_${s.variant}.png`, s.bytes, s.mime,
        );
        candidateUrls.push({ variant: s.variant, url });
      }

      metadataLog.candidates = candidateUrls;

      const primary = candidateUrls.find((x) => x.variant === "fidelity_strict") ?? candidateUrls[0];
      const intermediates = candidateUrls.filter((x) => x.url !== primary.url).map((x) => x.url);

      // gpt-image-2 high (~$0.19 each) + gpt-5.5 analyzer consolidado (~$0.25)
      const cost = 0.19 * successful.length + 0.25;

      await admin.from("generations").update({
        status: "succeeded",
        progress_percent: 100,
        progress_stage: "Concluído",
        final_render_url: primary.url,
        thumbnail_url: primary.url,
        intermediate_images: intermediates,
        metadata: metadataLog,
        cost_usd: cost,
        completed_at: new Date().toISOString(),
      }).eq("id", generationId);

      await admin.from("api_costs").insert({
        generation_id: gen.id,
        user_id: gen.user_id,
        provider: "openai",
        operation: `gpt-image-2/floorplan_render x${successful.length} + analyzer`,
        cost_usd: cost,
      });

      return;
    }


    let processed = await fetchAsBase64(sourceUrl);
    const intermediateUrls: string[] = [];

    // ========= Pipeline floorplan: 100% procedural + IA, sem Replicate webhook =========
    if (gen.pipeline_type === "floorplan") {
      if (!geminiKey) throw new Error("GEMINI_API_KEY não configurado");
      const lovableKey = await getSecret("LOVABLE_API_KEY");

      // 1. Gemini extrai estrutura JSON
      await admin.from("generations").update({
        progress_percent: 10, progress_stage: "Analisando planta",
      }).eq("id", generationId);
      const blueprint = await extractFloorplan(geminiKey, processed.b64, processed.mime);

      // 2. Em paralelo: texturas PBR + meshes IA dos móveis
      await admin.from("generations").update({
        progress_percent: 25, progress_stage: "Gerando texturas e móveis",
      }).eq("id", generationId);

      const totalFurniture = blueprint.furniture.length;
      let lastReportedDone = -1;
      const onFurnitureProgress = (done: number, total: number) => {
        if (done === lastReportedDone) return;
        lastReportedDone = done;
        const pct = total > 0 ? 25 + Math.round((done / total) * 55) : 80;
        admin.from("generations").update({
          progress_percent: pct,
          progress_stage: `Gerando móveis ${done}/${total}`,
        }).eq("id", generationId).then(() => {}, () => {});
      };

      const texturesPromise = lovableKey
        ? generateTextureSet(lovableKey, requiredTextureKeys(blueprint))
            .catch((e) => {
              console.error("textura set fail:", (e as Error).message);
              return new Map();
            })
        : Promise.resolve(new Map());

      const meshesPromise = totalFurniture > 0
        ? generateFurnitureMeshes(replicateToken, blueprint.furniture, onFurnitureProgress)
            .catch((e) => {
              console.error("furniture meshes fail:", (e as Error).message);
              return [];
            })
        : Promise.resolve([]);

      const [textures, meshResults] = await Promise.all([texturesPromise, meshesPromise]);
      console.log(`textures: ${textures.size}, meshes ok: ${meshResults.filter((m) => m.bytes).length}/${totalFurniture}`);

      // 3. Builder constrói GLB base (paredes + piso, sem móveis primitivos)
      await admin.from("generations").update({
        progress_percent: 82, progress_stage: "Construindo cena 3D",
      }).eq("id", generationId);
      const baseGlb = buildFloorplanGLB(blueprint, textures, { includePrimitiveFurniture: false });

      // 4. Merge dos GLBs de móveis na cena
      let finalGlb = baseGlb;
      if (meshResults.some((m) => m.bytes)) {
        await admin.from("generations").update({
          progress_percent: 90, progress_stage: "Compondo móveis na cena",
        }).eq("id", generationId);
        try {
          const merged = await mergeFurnitureIntoGLB(baseGlb, meshResults);
          finalGlb = merged.glb;
        } catch (e) {
          console.error("merge fail, usando base:", (e as Error).message);
          finalGlb = baseGlb;
        }
      }

      // 5. Upload do GLB final
      await admin.from("generations").update({
        progress_percent: 95, progress_stage: "Salvando cena",
      }).eq("id", generationId);
      const glbPath = `${gen.user_id}/${gen.id}/scene.glb`;
      const { error: upErr } = await admin.storage
        .from("outputs")
        .upload(glbPath, finalGlb, { upsert: true, contentType: "model/gltf-binary" });
      if (upErr) throw upErr;
      const { data: signed } = await admin.storage
        .from("outputs")
        .createSignedUrl(glbPath, 60 * 60 * 24 * 7);

      await admin
        .from("generations")
        .update({
          status: "succeeded",
          glb_url: signed?.signedUrl ?? glbPath,
          progress_percent: 100,
          progress_stage: "Concluído",
          completed_at: new Date().toISOString(),
        })
        .eq("id", generationId);

      return;
    }

    // ========= Pipeline scene_to_3d: detecta objetos + gera cada um + compõe =========
    if (gen.pipeline_type === "scene_to_3d") {
      if (!geminiKey) throw new Error("GEMINI_API_KEY não configurado");

      await admin.from("generations").update({
        progress_percent: 10, progress_stage: "Detectando objetos da cena",
      }).eq("id", generationId);

      const scene = await extractScene(geminiKey, processed.b64, processed.mime);
      console.log(`scene: ${scene.objects.length} objetos detectados`);

      await admin.from("generations").update({
        progress_percent: 20,
        progress_stage: `Gerando ${scene.objects.length} móveis`,
      }).eq("id", generationId);

      let lastDone = -1;
      const onProgress = (done: number, total: number) => {
        if (done === lastDone) return;
        lastDone = done;
        const pct = total > 0 ? 20 + Math.round((done / total) * 65) : 85;
        admin.from("generations").update({
          progress_percent: pct,
          progress_stage: `Gerando móveis ${done}/${total}`,
        }).eq("id", generationId).then(() => {}, () => {});
      };

      const meshResults = await generateSceneObjectMeshes(
        replicateToken,
        scene.objects,
        {
          callGemini: (b64, mime, prompt) =>
            callGemini(geminiKey, b64, mime, prompt),
          uploadIntermediate: (name, bytes, mime) =>
            uploadIntermediate(gen.user_id, gen.id, name, bytes, mime),
          bytesToBase64,
          sceneImageB64: processed.b64,
          sceneImageMime: processed.mime,
        },
        onProgress,
      );

      const okCount = meshResults.filter((m) => m.bytes).length;
      if (okCount === 0) throw new Error("Nenhum objeto da cena pôde ser gerado em 3D");

      // Coleta URLs de imagens isoladas geradas (intermediates) para preview
      const { data: cur } = await admin
        .from("generations").select("intermediate_images").eq("id", generationId).single();
      const intermediates = (cur?.intermediate_images as string[]) ?? [];
      const sceneThumb = intermediates[0] ?? sourceUrl;

      await admin.from("generations").update({
        progress_percent: 88, progress_stage: "Compondo cena 3D",
      }).eq("id", generationId);

      // Cena base com piso simples cinza claro do tamanho da bounds detectada
      const floorW = Math.max(2, scene.bounds_m?.w ?? 6);
      const floorH = Math.max(2, scene.bounds_m?.h ?? 6);
      const baseGlb = await buildFloorPlaneGLB(floorW, floorH);

      let finalGlb: Uint8Array;
      let attached = 0;
      try {
        const merged = await mergeFurnitureIntoGLB(baseGlb, meshResults);
        finalGlb = merged.glb;
        attached = merged.attached;
      } catch (e) {
        throw new Error(`Falha ao compor cena: ${(e as Error).message}`);
      }
      if (attached === 0) {
        throw new Error(
          "Falha ao compor cena: nenhum móvel pôde ser fundido no GLB final",
        );
      }
      console.log(`scene_to_3d: glb final=${finalGlb.byteLength}B (${attached} móveis)`);

      await admin.from("generations").update({
        progress_percent: 95, progress_stage: "Salvando cena",
      }).eq("id", generationId);
      const glbPath = `${gen.user_id}/${gen.id}/scene.glb`;
      const { error: upErr } = await admin.storage
        .from("outputs")
        .upload(glbPath, finalGlb, { upsert: true, contentType: "model/gltf-binary" });
      if (upErr) throw upErr;
      const { data: signed } = await admin.storage
        .from("outputs")
        .createSignedUrl(glbPath, 60 * 60 * 24 * 7);

      await admin
        .from("generations")
        .update({
          status: "succeeded",
          glb_url: signed?.signedUrl ?? glbPath,
          thumbnail_url: sceneThumb,
          progress_percent: 100,
          progress_stage: "Concluído",
          completed_at: new Date().toISOString(),
          intermediate_images: intermediates,
        })
        .eq("id", generationId);

      return;
    }

    if (gen.pipeline_type === "edit") {
      const out = await callImage2(
        [{ b64: processed.b64, mime: processed.mime }],
        `Edit this image: ${gen.edit_instruction}. Keep same object, same angle, same style. Pure white background, soft studio lighting.`,
        { aspect_ratio: "1:1", output_format: "png" },
      );
      const url = await uploadIntermediate(gen.user_id, gen.id, "edited.png", out.bytes, out.mime);
      intermediateUrls.push(url);
      processed = { b64: bytesToBase64(out.bytes), mime: out.mime };
    }

    // Multi-view só para `enriched`. Para `edit`, manda a imagem editada direto
    // ao single-view com generate_texture (preserva 100% material/cor editados).
    const multiViewUrls: string[] = [];
    if (gen.pipeline_type === "enriched") {
      const views: Array<keyof typeof VIEW_PROMPTS> = ["front", "right", "back", "left"];
      // Paraleliza as 4 vistas — gpt-image-2 é lento (~15-25s/imagem)
      const results = await Promise.all(
        views.map(async (v) => {
          try {
            const out = await callImage2(
              [{ b64: processed.b64, mime: processed.mime }],
              VIEW_PROMPTS[v],
              { aspect_ratio: "1:1", output_format: "png" },
            );
            const url = await uploadIntermediate(
              gen.user_id,
              gen.id,
              `view-${v}.png`,
              out.bytes,
              out.mime,
            );
            return url;
          } catch (e) {
            console.error(`view ${v}:`, (e as Error).message);
            return null;
          }
        }),
      );
      for (const u of results) if (u) multiViewUrls.push(u);
    } else if (gen.pipeline_type === "edit") {
      // intermediateUrls[0] é a imagem editada
      multiViewUrls.push(intermediateUrls[0] ?? sourceUrl);
    } else {
      multiViewUrls.push(sourceUrl);
    }

    await admin
      .from("generations")
      .update({
        intermediate_images: [...intermediateUrls, ...multiViewUrls],
      })
      .eq("id", generationId);

    // Hunyuan3D 2.1 — multi-view quando há 4 vistas, single caso contrário.
    const webhookUrl = `${SUPABASE_URL}/functions/v1/replicate-webhook`;
    const useMultiView = multiViewUrls.length > 1;
    const version = useMultiView ? HUNYUAN3D_2MV_VERSION : HUNYUAN3D_2_VERSION;
    const input: Record<string, unknown> = useMultiView
      ? {
          front_image: multiViewUrls[0],
          right_image: multiViewUrls[1],
          back_image: multiViewUrls[2],
          left_image: multiViewUrls[3],
          steps: 30,
          file_type: "glb",
        }
      : {
          image: multiViewUrls[0],
          generate_texture: true,
          steps: 30,
        };
    const endpoint = "https://api.replicate.com/v1/predictions";
    const payload = {
      version,
      input,
      webhook: webhookUrl,
      webhook_events_filter: ["completed"],
    };

    const { ok, status, json: pred } = await postReplicate(endpoint, replicateToken, payload);
    if (!ok) throw new Error(`replicate ${status}: ${JSON.stringify(pred)}`);

    await admin
      .from("generations")
      .update({ replicate_prediction_id: pred.id })
      .eq("id", generationId);

    return;
  } catch (e) {
    const msg = (e as Error).message;
    console.error("orchestrate error:", msg);
    await admin
      .from("generations")
      .update({ status: "failed", error_message: msg })
      .eq("id", generationId);
  }
}

import { getUserId } from "../_shared/auth.ts";

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  return (async () => {
    try {
      const callerId = await getUserId(req);
      if (!callerId) {
        return new Response(JSON.stringify({ error: "Não autenticado" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { generationId } = await req.json();
      if (!generationId) {
        return new Response(JSON.stringify({ error: "generationId obrigatório" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: gen, error: genErr } = await admin
        .from("generations")
        .select("user_id, status")
        .eq("id", generationId)
        .maybeSingle();
      if (genErr || !gen) {
        return new Response(JSON.stringify({ error: "Generation não encontrada" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (gen.user_id !== callerId) {
        return new Response(JSON.stringify({ error: "Acesso negado" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (gen.status !== "pending" && gen.status !== "queued") {
        return new Response(
          JSON.stringify({ error: `Generation já está em status "${gen.status}"` }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      // @ts-ignore EdgeRuntime is global no Supabase Edge Functions
      EdgeRuntime.waitUntil(processGeneration(generationId));
      return new Response(JSON.stringify({ ok: true, accepted: true }), {
        status: 202,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: (e as Error).message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  })();
});
