// Pipeline C: análise de planta existente enviada pelo usuário.
// POST { imageUrl: string, projectId?: string, briefingGenerationId?: string }
// → { ok, generationId, analysis }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { runFloorplanVision } from "../_shared/replicate-floorplan.ts";

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

const COST_VISION = 0.003;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const userId = await getUserId(req);
    const body = (await req.json()) as {
      imageUrl?: string;
      storagePath?: string;
      projectId?: string;
      briefingGenerationId?: string;
    };
    if (!body.imageUrl || typeof body.imageUrl !== "string") {
      throw new Error("imageUrl obrigatório");
    }

    // Cria generation
    const { data: gen, error: gErr } = await admin
      .from("generations")
      // deno-lint-ignore no-explicit-any
      .insert({
        user_id: userId,
        pipeline_type: "floorplan_analysis",
        engine: "gemini_vision",
        status: "processing",
        source_images: [body.imageUrl],
        metadata: {
          briefing_generation_id: body.briefingGenerationId ?? null,
          storage_path: body.storagePath ?? null,
        },
      } as any)
      .select("id")
      .single();
    if (gErr || !gen) throw gErr ?? new Error("falha ao criar generation");

    const replicateToken = await getSecret("REPLICATE_API_TOKEN");
    if (!replicateToken) throw new Error("REPLICATE_API_TOKEN não configurado");

    let analysis;
    try {
      analysis = await runFloorplanVision(replicateToken, body.imageUrl);
    } catch (e) {
      await admin
        .from("generations")
        .update({
          status: "failed",
          error_message: (e as Error).message,
          completed_at: new Date().toISOString(),
        })
        .eq("id", gen.id);
      throw e;
    }

    await admin
      .from("generations")
      // deno-lint-ignore no-explicit-any
      .update({
        status: "succeeded",
        completed_at: new Date().toISOString(),
        thumbnail_url: body.imageUrl,
        cost_usd: COST_VISION,
        metadata: {
          briefing_generation_id: body.briefingGenerationId ?? null,
          storage_path: body.storagePath ?? null,
          analysis,
        },
      } as any)
      .eq("id", gen.id);

    await admin.from("api_costs").insert({
      generation_id: gen.id,
      user_id: userId,
      provider: "lovable-ai",
      operation: "gemini-floorplan-vision",
      cost_usd: COST_VISION,
    } as never);

    return new Response(
      JSON.stringify({ ok: true, generationId: gen.id, analysis }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = (e as Error).message ?? "falha desconhecida";
    console.error("analyze-existing-floorplan erro", msg);
    return new Response(
      JSON.stringify({ ok: false, error: msg }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
