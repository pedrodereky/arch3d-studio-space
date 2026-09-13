// Helpers compartilhados pelos pipelines B (briefing → planta 2D) e
// C (análise de planta existente).
//
// Geração: `csviverdeia/floor-plan-lora` no Replicate (LoRA dedicado a
// plantas baixas). Modelo version-pinned — usa endpoint /v1/predictions.
//
// Análise visual: Gemini 2.5 Flash via Lovable AI Gateway (multimodal
// nativo + JSON estruturado).

const REPLICATE_BASE = "https://api.replicate.com/v1";

// LoRA dedicado a plantas baixas (version pin obrigatório).
const FLOORPLAN_VERSION = "bd06041a2dfb3abf159bc407ba8872a5f968c94c5917844f23887e512b4e9c42";

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const VISION_MODEL = "google/gemini-2.5-flash";

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

type ReplicatePrediction = {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output: unknown;
  error?: string;
  urls?: { get: string };
};

async function pollPrediction(
  predUrl: string,
  token: string,
  timeoutMs = 180_000,
): Promise<ReplicatePrediction> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const r = await fetch(predUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const j = (await r.json()) as ReplicatePrediction;
    if (j.status === "succeeded") return j;
    if (j.status === "failed" || j.status === "canceled") {
      throw new Error(`prediction ${j.status}: ${j.error ?? "?"}`);
    }
    await sleep(2000);
  }
  throw new Error("prediction timeout");
}

async function runReplicate(
  token: string,
  modelSlug: string,
  input: Record<string, unknown>,
  timeoutMs = 180_000,
): Promise<unknown> {
  const url = `${REPLICATE_BASE}/models/${modelSlug}/predictions`;
  const MAX_RETRIES = 3;
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Prefer: "wait=1",
        },
        body: JSON.stringify({ input }),
      });
      const pred = (await r.json()) as ReplicatePrediction;
      if (!r.ok) {
        const msg = JSON.stringify(pred);
        if (r.status === 429 || msg.includes("RequestLimitExceeded")) {
          const wait = Math.min(2000 * Math.pow(2, attempt), 20_000);
          await sleep(wait);
          continue;
        }
        throw new Error(`replicate ${r.status}: ${msg.slice(0, 300)}`);
      }
      if (pred.status === "succeeded") return pred.output;
      const getUrl = pred.urls?.get;
      if (!getUrl) throw new Error("prediction sem url de get");
      const final = await pollPrediction(getUrl, token, timeoutMs);
      return final.output;
    } catch (e) {
      lastErr = e as Error;
      if (lastErr.message.includes("429") || lastErr.message.includes("RequestLimitExceeded")) {
        await sleep(Math.min(3000 * Math.pow(2, attempt), 20_000));
        continue;
      }
      throw lastErr;
    }
  }
  throw lastErr ?? new Error("replicate: falha desconhecida");
}

// Variante para modelos version-pinned (sem endpoint /models/{slug}/predictions).
async function runReplicateVersion(
  token: string,
  version: string,
  input: Record<string, unknown>,
  timeoutMs = 180_000,
): Promise<unknown> {
  const url = `${REPLICATE_BASE}/predictions`;
  const MAX_RETRIES = 3;
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Prefer: "wait=1",
        },
        body: JSON.stringify({ version, input }),
      });
      const pred = (await r.json()) as ReplicatePrediction;
      if (!r.ok) {
        const msg = JSON.stringify(pred);
        if (r.status === 429 || msg.includes("RequestLimitExceeded")) {
          await sleep(Math.min(2000 * Math.pow(2, attempt), 20_000));
          continue;
        }
        throw new Error(`replicate ${r.status}: ${msg.slice(0, 300)}`);
      }
      if (pred.status === "succeeded") return pred.output;
      const getUrl = pred.urls?.get;
      if (!getUrl) throw new Error("prediction sem url de get");
      const final = await pollPrediction(getUrl, token, timeoutMs);
      return final.output;
    } catch (e) {
      lastErr = e as Error;
      if (lastErr.message.includes("429") || lastErr.message.includes("RequestLimitExceeded")) {
        await sleep(Math.min(3000 * Math.pow(2, attempt), 20_000));
        continue;
      }
      throw lastErr;
    }
  }
  throw lastErr ?? new Error("replicate: falha desconhecida");
}

export type FloorplanLoraParams = {
  prompt: string;
  negativePrompt?: string;
  seed?: number;
  width?: number;
  height?: number;
  steps?: number;
  guidanceScale?: number;
  loraScale?: number;
};

export async function runFloorplanLora(token: string, p: FloorplanLoraParams): Promise<string> {
  const input: Record<string, unknown> = {
    prompt: p.prompt,
    negative_prompt:
      p.negativePrompt ??
      "blurry, low quality, distorted, text, watermark, 3D, perspective, furniture render, photographic, people",
    num_inference_steps: p.steps ?? 25,
    guidance_scale: p.guidanceScale ?? 7.5,
    lora_scale: p.loraScale ?? 1,
    width: p.width ?? 768,
    height: p.height ?? 768,
  };
  if (p.seed != null) input.seed = p.seed;

  const out = await runReplicateVersion(token, FLOORPLAN_VERSION, input);

  if (typeof out === "string") return out;
  if (Array.isArray(out) && typeof out[0] === "string") return out[0] as string;
  if (Array.isArray(out) && typeof out[out.length - 1] === "string") {
    return out[out.length - 1] as string;
  }
  throw new Error(`floor-plan-lora sem url de imagem na saída`);
}

export type FloorplanVisionResult = {
  rooms: Array<{ name: string; areaM2?: number; type?: string }>;
  totalAreaApprox?: number;
  bedrooms?: number;
  suites?: number;
  bathrooms?: number;
  garages?: number;
  accessibility?: { nbr9050?: boolean; notes?: string[] };
  raw: unknown;
};

const VISION_TOOL_SCHEMA = {
  type: "function" as const,
  function: {
    name: "submit_floorplan_analysis",
    description: "Estrutura a análise da planta baixa em JSON.",
    parameters: {
      type: "object",
      properties: {
        rooms: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Nome do cômodo em pt-BR" },
              area_m2: { type: "number" },
              type: {
                type: "string",
                description: "social, intimo, servico, molhado, circulacao, externo, outro",
              },
            },
            required: ["name"],
          },
        },
        total_area_m2: { type: "number" },
        bedrooms: { type: "integer" },
        suites: { type: "integer" },
        bathrooms: { type: "integer" },
        garages: { type: "integer" },
        accessibility: {
          type: "object",
          properties: {
            nbr9050: { type: "boolean", description: "Conformidade aproximada com NBR 9050" },
            notes: { type: "array", items: { type: "string" } },
          },
        },
      },
      required: ["rooms"],
    },
  },
};

/**
 * Análise visual da planta. O parâmetro `token` é mantido por compatibilidade
 * de assinatura com chamadores existentes, mas a chamada usa LOVABLE_API_KEY
 * lido do ambiente do edge function.
 */
// deno-lint-ignore no-unused-vars
export async function runFloorplanVision(
  _legacyToken: string,
  imageUrl: string,
): Promise<FloorplanVisionResult> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY não configurado");

  const body = {
    model: VISION_MODEL,
    messages: [
      {
        role: "system",
        content:
          "Você é um arquiteto sênior brasileiro analisando plantas baixas 2D. " +
          "Sempre responda chamando a tool submit_floorplan_analysis com dados " +
          "extraídos da imagem. Áreas em m², estimadas se não rotuladas. " +
          "Identifique cômodos em português do Brasil.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              "Analise esta planta baixa e extraia: lista de cômodos com áreas estimadas em m², " +
              "área total, contagem de quartos/suítes/banheiros/garagens, e avalie " +
              "conformidade aproximada com NBR 9050 (acessibilidade: larguras de porta, " +
              "circulação, banheiro PCD).",
          },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      },
    ],
    tools: [VISION_TOOL_SCHEMA],
    tool_choice: {
      type: "function",
      function: { name: "submit_floorplan_analysis" },
    },
  };

  const r = await fetch(LOVABLE_AI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = (await r.text()).slice(0, 500);
    if (r.status === 429) throw new Error(`vision rate limit (429): ${t}`);
    if (r.status === 402) throw new Error(`vision créditos esgotados (402): ${t}`);
    throw new Error(`vision ${r.status}: ${t}`);
  }
  const json = await r.json();
  const argsStr = json?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!argsStr) throw new Error("vision: sem tool_call");
  const parsed = JSON.parse(argsStr) as Record<string, unknown>;

  const rooms = Array.isArray(parsed.rooms)
    ? (parsed.rooms as Array<Record<string, unknown>>).map((r) => ({
        name: String(r.name ?? "Cômodo"),
        areaM2: typeof r.area_m2 === "number" ? (r.area_m2 as number) : undefined,
        type: typeof r.type === "string" ? (r.type as string) : undefined,
      }))
    : [];

  return {
    rooms,
    totalAreaApprox:
      typeof parsed.total_area_m2 === "number" ? (parsed.total_area_m2 as number) : undefined,
    bedrooms: typeof parsed.bedrooms === "number" ? (parsed.bedrooms as number) : undefined,
    suites: typeof parsed.suites === "number" ? (parsed.suites as number) : undefined,
    bathrooms: typeof parsed.bathrooms === "number" ? (parsed.bathrooms as number) : undefined,
    garages: typeof parsed.garages === "number" ? (parsed.garages as number) : undefined,
    accessibility: parsed.accessibility as FloorplanVisionResult["accessibility"],
    raw: parsed,
  };
}

export async function downloadAsBytes(url: string): Promise<{ bytes: Uint8Array; mime: string }> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download ${url}: ${r.status}`);
  return {
    bytes: new Uint8Array(await r.arrayBuffer()),
    mime: r.headers.get("content-type") ?? "image/png",
  };
}
