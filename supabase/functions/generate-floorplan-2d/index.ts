// Pipeline B: briefing → planta baixa 2D via floor-plan-lora.
// Síncrona, ~30-60s para 4 plantas em paralelo.
//
// POST {
//   briefing: BriefingInput,
//   projectId?: string
// }
// → { generationId, assets: [{ id, url, seed, path }] }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  runFloorplanLora,
  downloadAsBytes,
} from "../_shared/replicate-floorplan.ts";
import {
  composeFloorplanPrompt,
  type BriefingInput,
} from "../_shared/floorplan-prompt.ts";
import { createLogger } from "../_shared/pipeline-logger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

async function getSecret(name: string): Promise<string | null> {
  const { data } = await admin.rpc("service_get_secret", { _name: name });
  return (data as string | null) ?? null;
}

async function getUserId(req: Request): Promise<string> {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) throw new Error("não autenticado");
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) throw new Error("sessão inválida");
  return data.user.id;
}

const COST_PER_VARIATION = 0.012; // estimativa floor-plan-lora (GPU maior)
const N_VARIATIONS = 4;

function validateBriefing(b: unknown): BriefingInput {
  if (!b || typeof b !== "object") throw new Error("briefing obrigatório");
  const obj = b as Record<string, unknown>;
  const tipologia = obj.tipologia;
  if (tipologia !== "casa_terrea" && tipologia !== "sobrado" && tipologia !== "apartamento") {
    throw new Error("tipologia inválida");
  }
  const areaM2 = Number(obj.areaM2);
  if (!Number.isFinite(areaM2) || areaM2 < 20 || areaM2 > 2000) {
    throw new Error("área deve estar entre 20 e 2000 m²");
  }
  const num = (k: string, min = 0, max = 20) => {
    const v = Number(obj[k]);
    if (!Number.isFinite(v) || v < min || v > max) {
      throw new Error(`${k} inválido`);
    }
    return v;
  };
  const estilo = obj.estilo;
  const validEstilos = [
    "minimalista_moderno", "industrial", "escandinavo",
    "neoclassico", "contemporaneo_brasileiro",
  ];
  if (typeof estilo !== "string" || !validEstilos.includes(estilo)) {
    throw new Error("estilo inválido");
  }
  const extras = Array.isArray(obj.extras) ? (obj.extras as unknown[]) : [];
  const validExtras = ["varanda_gourmet", "escritorio", "lavabo", "area_servico", "closet", "despensa"];
  const filteredExtras = extras.filter(
    (e): e is string => typeof e === "string" && validExtras.includes(e),
  );
  const obs = typeof obj.observacoes === "string" ? obj.observacoes.slice(0, 500) : undefined;

  return {
    tipologia: tipologia as BriefingInput["tipologia"],
    areaM2,
    quartos: num("quartos", 0, 15),
    suites: num("suites", 0, 15),
    banhos: num("banhos", 0, 15),
    vagas: num("vagas", 0, 15),
    extras: filteredExtras as BriefingInput["extras"],
    estilo: estilo as BriefingInput["estilo"],
    observacoes: obs,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let generationId: string | null = null;
  let userId: string | null = null;

  try {
    userId = await getUserId(req);
    const body = (await req.json()) as { briefing?: unknown; projectId?: string };
    const briefing = validateBriefing(body.briefing);

    // rate limit: máx 5 em processing
    const { count: inProgress } = await admin
      .from("generations")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("pipeline_type", "floorplan_2d")
      .in("status", ["queued", "processing"]);
    if ((inProgress ?? 0) >= 5) {
      throw new Error("muitas gerações em andamento, aguarde algumas finalizarem");
    }

    const { prompt, negativePrompt } = composeFloorplanPrompt(briefing);

    const { data: gen, error: insErr } = await admin
      .from("generations")
      .insert({
        user_id: userId,
        pipeline_type: "floorplan_2d",
        engine: "floor_plan_lora",
        status: "processing",
        source_images: [],
        prompt,
        metadata: { briefing, negative_prompt: negativePrompt, analyses: {} },
      } as never)
      .select("id")
      .single();
    if (insErr || !gen) throw insErr ?? new Error("falha ao criar generation");
    generationId = gen.id as string;

    const logger = createLogger({
      admin,
      generationId: generationId!,
      userId: userId!,
      enabled: true,
    });
    logger.info("floorplan_2d", "started", { briefing });

    const replicateToken = await getSecret("REPLICATE_API_TOKEN");
    if (!replicateToken) throw new Error("REPLICATE_API_TOKEN não configurado");

    // gera N plantas em paralelo
    const seeds = Array.from({ length: N_VARIATIONS }, () =>
      Math.floor(Math.random() * 1_000_000),
    );

    const stepRender = logger.start("floor_plan_lora_variations");
    const results = await Promise.all(
      seeds.map((seed) =>
        runFloorplanLora(replicateToken, { prompt, negativePrompt, seed })
          .then((url) => ({ url, seed }))
          .catch((e: Error) => ({ error: e.message, seed })),
      ),
    );
    logger.end(stepRender);

    type AssetRow = { id: string; url: string; seed: number; path: string };
    const assets: AssetRow[] = [];

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if ("error" in r) {
        logger.error("variation", new Error(r.error), { index: i });
        continue;
      }
      const dl = await downloadAsBytes(r.url);
      const path = `${userId}/${generationId}/floorplan-${i}.png`;
      const { error: upErr } = await admin.storage
        .from("outputs")
        .upload(path, dl.bytes, { upsert: true, contentType: dl.mime });
      if (upErr) {
        logger.error("upload", upErr, { index: i });
        continue;
      }
      const { data: signed } = await admin.storage
        .from("outputs")
        .createSignedUrl(path, 60 * 60 * 24 * 7);
      const url = signed?.signedUrl ?? r.url;

      const { data: asset, error: aErr } = await admin
        .from("generation_assets")
        .insert({
          generation_id: generationId,
          user_id: userId,
          type: "floorplan",
          storage_path: path,
          signed_url: url,
          metadata: { seed: r.seed, index: i },
        } as never)
        .select("id")
        .single();
      if (aErr || !asset) {
        logger.error("asset_insert", aErr ?? new Error("?"), { index: i });
        continue;
      }
      assets.push({ id: asset.id as string, url, seed: r.seed, path });
    }

    if (assets.length === 0) {
      throw new Error("todas as gerações falharam — tente outro briefing");
    }

    const totalCost = COST_PER_VARIATION * assets.length;
    await admin
      .from("generations")
      .update({
        status: "succeeded",
        thumbnail_url: assets[0].url,
        final_render_url: assets[0].url,
        cost_usd: totalCost,
        completed_at: new Date().toISOString(),
        metadata: {
          briefing,
          negative_prompt: negativePrompt,
          analyses: {},
          assets: assets.map((a) => ({ id: a.id, url: a.url, seed: a.seed, path: a.path })),
        },
      } as never)
      .eq("id", generationId);

    await admin.from("api_costs").insert(
      assets.map(() => ({
        generation_id: generationId,
        user_id: userId,
        provider: "replicate",
        operation: "floor-plan-lora",
        cost_usd: COST_PER_VARIATION,
      })),
    );

    if (body.projectId) {
      const { data: proj } = await admin
        .from("projects")
        .select("id")
        .eq("id", body.projectId)
        .eq("user_id", userId)
        .maybeSingle();
      if (proj) {
        await admin
          .from("project_assets")
          .insert({ project_id: proj.id, generation_id: generationId } as never);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        generationId,
        assets: assets.map((a) => ({ id: a.id, url: a.url, seed: a.seed })),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = (e as Error).message ?? "falha desconhecida";
    console.error("generate-floorplan-2d erro", msg);
    if (generationId) {
      await admin
        .from("generations")
        .update({
          status: "failed",
          error_message: msg,
          completed_at: new Date().toISOString(),
        } as never)
        .eq("id", generationId);
    }
    return new Response(
      JSON.stringify({ ok: false, error: msg, generationId }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
