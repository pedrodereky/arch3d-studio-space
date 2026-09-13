// Redecoração virtual via OpenAI gpt-image-2 (/v1/images/edits).
// Padrão assíncrono: valida input, cria row, dispara processamento em background
// via EdgeRuntime.waitUntil e retorna 202 imediato. Cliente faz polling em
// `generations.status` até succeeded/failed.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { callGptImage2OpenAI } from "../_shared/gpt-image-2-openai.ts";
import { checkUserBudget } from "../_shared/spend-guard.ts";
import { composeStylePrompt, type StylePreset } from "../_shared/redecorate-prompt.ts";
import { createLogger } from "../_shared/pipeline-logger.ts";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

type Body = {
  sourceImagePath?: string;
  stylePreset?: StylePreset;
  stylePrompt?: string;
  keepLayout?: boolean;
  variations?: 1 | 2 | 4;
  projectId?: string;
};

const COST_PER_IMAGE = 0.17;

function mimeFromPath(p: string): string {
  const ext = p.split(".").pop()?.toLowerCase() ?? "jpg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}

async function processGeneration(params: {
  generationId: string;
  userId: string;
  sourceImagePath: string;
  stylePreset?: StylePreset;
  stylePrompt?: string;
  keepLayout: boolean;
  nVariations: 1 | 2 | 4;
  projectId?: string;
}) {
  const {
    generationId,
    userId,
    sourceImagePath,
    stylePreset,
    stylePrompt,
    keepLayout,
    nVariations,
    projectId,
  } = params;

  const logger = createLogger({
    admin,
    generationId,
    userId,
    enabled: true,
  });

  try {
    logger.info("redecorate", "started", {
      preset: stylePreset,
      n: nVariations,
      keepLayout,
      engine: "gpt_image_2",
    });

    const openaiKey = (await getSecret("OPENAI_API_KEY")) ?? Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) throw new Error("OPENAI_API_KEY não configurado");

    const { data: dlBlob, error: dlErr } = await admin.storage
      .from("inputs")
      .download(sourceImagePath);
    if (dlErr || !dlBlob) throw new Error(`falha ao baixar foto: ${dlErr?.message ?? "?"}`);
    const srcBytes = new Uint8Array(await dlBlob.arrayBuffer());
    const srcMime = dlBlob.type || mimeFromPath(sourceImagePath);

    const { prompt } = composeStylePrompt({
      preset: stylePreset,
      userPrompt: stylePrompt,
      keepLayout,
    });
    logger.info("prompt", prompt.slice(0, 200));

    const seeds: number[] = [];
    for (let i = 0; i < nVariations; i++) {
      seeds.push(Math.floor(Math.random() * 1_000_000));
    }

    const stepRender = logger.start("gpt_image_2_variations");
    const renderResults = await Promise.all(
      seeds.map(() =>
        callGptImage2OpenAI(
          openaiKey,
          [
            {
              bytes: srcBytes,
              mime: srcMime,
              filename: `room.${srcMime.includes("png") ? "png" : "jpg"}`,
            },
          ],
          prompt,
          { aspect_ratio: "3:2", quality: "high", output_format: "jpeg" },
        ).catch((e: Error) => ({ error: e.message })),
      ),
    );
    logger.end(stepRender);

    const variations: { url: string; seed: number; path: string }[] = [];
    for (let i = 0; i < renderResults.length; i++) {
      const r = renderResults[i];
      if (r && "bytes" in r) {
        const path = `${userId}/${generationId}/variation-${i}.jpg`;
        await admin.storage.from("outputs").upload(path, r.bytes, {
          upsert: true,
          contentType: r.mime,
        });
        const { data: vs } = await admin.storage
          .from("outputs")
          .createSignedUrl(path, 60 * 60 * 24 * 7);
        if (vs?.signedUrl) variations.push({ url: vs.signedUrl, seed: seeds[i], path });
      } else {
        logger.error("variation", new Error((r as { error: string }).error), { index: i });
      }
    }

    if (variations.length === 0) {
      throw new Error("todas as variações falharam — tente outro estilo ou foto");
    }

    const totalCost = COST_PER_IMAGE * variations.length;
    await admin
      .from("generations")
      .update({
        status: "succeeded",
        final_render_url: variations[0].url,
        thumbnail_url: variations[0].url,
        intermediate_images: [],
        cost_usd: totalCost,
        completed_at: new Date().toISOString(),
        metadata: {
          style_preset: stylePreset ?? null,
          style_prompt: stylePrompt ?? null,
          keep_layout: keepLayout,
          variations: variations.map((v) => ({ url: v.url, seed: v.seed, path: v.path })),
          engine: "gpt_image_2",
        },
      } as never)
      .eq("id", generationId);

    await admin.from("api_costs").insert(
      variations.map(() => ({
        generation_id: generationId,
        user_id: userId,
        provider: "openai",
        operation: "gpt-image-2-edit",
        cost_usd: COST_PER_IMAGE,
      })),
    );

    if (projectId) {
      const { data: proj } = await admin
        .from("projects")
        .select("id")
        .eq("id", projectId)
        .eq("user_id", userId)
        .maybeSingle();
      if (proj) {
        await admin
          .from("project_assets")
          .insert({ project_id: proj.id, generation_id: generationId } as never);
      }
    }
  } catch (e) {
    const msg = (e as Error).message ?? "falha desconhecida";
    console.error("redecorate-image background erro", msg);
    await admin
      .from("generations")
      .update({
        status: "failed",
        error_message: msg,
        completed_at: new Date().toISOString(),
      } as never)
      .eq("id", generationId);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const userId = await getUserId(req);
    const budget = await checkUserBudget(admin, userId);
    if (!budget.allowed) {
      return new Response(JSON.stringify({ ok: false, error: budget.reason }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as Body;

    if (!body.sourceImagePath) throw new Error("sourceImagePath obrigatório");
    if (!body.stylePreset && !(body.stylePrompt && body.stylePrompt.trim().length >= 4)) {
      throw new Error("informe um stylePreset ou stylePrompt com pelo menos 4 caracteres");
    }
    const nVariations =
      body.variations === 1 || body.variations === 2 || body.variations === 4 ? body.variations : 4;
    const keepLayout = body.keepLayout ?? true;

    const { count: inProgress } = await admin
      .from("generations")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("pipeline_type", "redecorate")
      .in("status", ["queued", "processing"]);
    if ((inProgress ?? 0) >= 10) {
      throw new Error("muitas redecorações em andamento, aguarde algumas finalizarem");
    }

    if (!body.sourceImagePath.startsWith(`${userId}/`)) {
      throw new Error("path da imagem não pertence ao usuário");
    }

    const { data: gen, error: insErr } = await admin
      .from("generations")
      .insert({
        user_id: userId,
        pipeline_type: "redecorate",
        engine: "gpt_image_2",
        status: "processing",
        source_images: [body.sourceImagePath],
        prompt: (body.stylePrompt ?? "").trim() || null,
        metadata: {
          style_preset: body.stylePreset ?? null,
          keep_layout: keepLayout,
          variations_requested: nVariations,
        },
      } as never)
      .select("id")
      .single();
    if (insErr || !gen) throw insErr ?? new Error("falha ao criar generation");
    const generationId = gen.id as string;

    EdgeRuntime.waitUntil(
      processGeneration({
        generationId,
        userId,
        sourceImagePath: body.sourceImagePath,
        stylePreset: body.stylePreset,
        stylePrompt: body.stylePrompt,
        keepLayout,
        nVariations,
        projectId: body.projectId,
      }),
    );

    return new Response(JSON.stringify({ ok: true, generationId, status: "processing" }), {
      status: 202,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = (e as Error).message ?? "falha desconhecida";
    console.error("redecorate-image erro", msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
