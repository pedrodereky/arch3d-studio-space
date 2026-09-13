// Itera mais variações criando NOVA row generations apontando para a original.
// Padrão assíncrono: cria row e dispara processamento em background. Cliente
// faz polling em generations.status.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { callGptImage2OpenAI } from "../_shared/gpt-image-2-openai.ts";
import { composeStylePrompt, type StylePreset } from "../_shared/redecorate-prompt.ts";

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

const COST_PER_IMAGE = 0.17;

function mimeFromPath(p: string): string {
  const ext = p.split(".").pop()?.toLowerCase() ?? "jpg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}

type Body = {
  generationId?: string;
  addVariations?: 1 | 2 | 4;
  newPrompt?: string;
  newStylePreset?: StylePreset;
  keepLayout?: boolean;
};

async function processIterate(params: {
  newGenId: string;
  userId: string;
  parentId: string;
  sourcePath: string;
  stylePreset?: StylePreset;
  stylePrompt?: string;
  keepLayout: boolean;
  nVariations: 1 | 2 | 4;
}) {
  const {
    newGenId,
    userId,
    parentId,
    sourcePath,
    stylePreset,
    stylePrompt,
    keepLayout,
    nVariations,
  } = params;

  try {
    const { prompt } = composeStylePrompt({
      preset: stylePreset,
      userPrompt: stylePrompt,
      keepLayout,
    });

    const openaiKey = (await getSecret("OPENAI_API_KEY")) ?? Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) throw new Error("OPENAI_API_KEY não configurado");

    const { data: dlBlob, error: dlErr } = await admin.storage.from("inputs").download(sourcePath);
    if (dlErr || !dlBlob) throw new Error(`falha ao baixar foto: ${dlErr?.message ?? "?"}`);
    const srcBytes = new Uint8Array(await dlBlob.arrayBuffer());
    const srcMime = dlBlob.type || mimeFromPath(sourcePath);

    const seeds = Array.from({ length: nVariations }, () => Math.floor(Math.random() * 1_000_000));

    const results = await Promise.all(
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

    const variations: { url: string; seed: number; path: string }[] = [];
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r && "bytes" in r) {
        const path = `${userId}/${newGenId}/variation-${i}.jpg`;
        await admin.storage.from("outputs").upload(path, r.bytes, {
          upsert: true,
          contentType: r.mime,
        });
        const { data: vs } = await admin.storage
          .from("outputs")
          .createSignedUrl(path, 60 * 60 * 24 * 7);
        if (vs?.signedUrl) variations.push({ url: vs.signedUrl, seed: seeds[i], path });
      }
    }

    if (variations.length === 0) {
      throw new Error("todas as variações falharam");
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
          parent_id: parentId,
          style_preset: stylePreset ?? null,
          style_prompt: stylePrompt ?? null,
          keep_layout: keepLayout,
          variations: variations.map((v) => ({ url: v.url, seed: v.seed, path: v.path })),
          engine: "gpt_image_2",
        },
      } as never)
      .eq("id", newGenId);

    await admin.from("api_costs").insert(
      variations.map(() => ({
        generation_id: newGenId,
        user_id: userId,
        provider: "openai",
        operation: "gpt-image-2-edit",
        cost_usd: COST_PER_IMAGE,
      })),
    );
  } catch (e) {
    const msg = (e as Error).message ?? "falha desconhecida";
    console.error("redecorate-iterate background erro", msg);
    await admin
      .from("generations")
      .update({
        status: "failed",
        error_message: msg,
        completed_at: new Date().toISOString(),
      } as never)
      .eq("id", newGenId);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const userId = await getUserId(req);
    const body = (await req.json()) as Body;
    if (!body.generationId) throw new Error("generationId obrigatório");
    const nVariations = body.addVariations ?? 4;

    const { data: parent, error: parentErr } = await admin
      .from("generations")
      .select("id,user_id,metadata,source_images,prompt")
      .eq("id", body.generationId)
      .single();
    if (parentErr || !parent) throw new Error("geração de origem não encontrada");
    if (parent.user_id !== userId) throw new Error("forbidden");

    const parentMeta = (parent.metadata as Record<string, unknown>) ?? {};
    const sourceImages = (parent.source_images as string[] | null) ?? [];
    const sourcePath = sourceImages[0];
    if (!sourcePath) throw new Error("geração original sem foto-fonte");

    const stylePreset = (body.newStylePreset ?? parentMeta.style_preset) as StylePreset | undefined;
    const stylePrompt = body.newPrompt ?? (parent.prompt as string | null) ?? undefined;
    const keepLayout = body.keepLayout ?? Boolean(parentMeta.keep_layout ?? true);

    const { data: gen, error: insErr } = await admin
      .from("generations")
      .insert({
        user_id: userId,
        pipeline_type: "redecorate",
        engine: "gpt_image_2",
        status: "processing",
        source_images: parent.source_images,
        prompt: stylePrompt ?? null,
        metadata: {
          parent_id: parent.id,
          style_preset: stylePreset ?? null,
          keep_layout: keepLayout,
          variations_requested: nVariations,
        },
      } as never)
      .select("id")
      .single();
    if (insErr || !gen) throw insErr ?? new Error("falha ao criar generation");
    const newGenId = gen.id as string;

    EdgeRuntime.waitUntil(
      processIterate({
        newGenId,
        userId,
        parentId: parent.id as string,
        sourcePath,
        stylePreset,
        stylePrompt: stylePrompt ?? undefined,
        keepLayout,
        nVariations: nVariations as 1 | 2 | 4,
      }),
    );

    return new Response(
      JSON.stringify({ ok: true, generationId: newGenId, status: "processing" }),
      {
        status: 202,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    const msg = (e as Error).message ?? "falha desconhecida";
    console.error("redecorate-iterate erro", msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
