// Studio: a partir de um nó concluído, dispara uma ação
// (salvar na biblioteca, gerar 3D da cena, gerar vídeo POV ou
//  gerar 3D individual de móveis selecionados).
//
// POST body: {
//   runId, nodeId,
//   action: "save_only" | "scene_to_3d" | "render_to_video" | "furniture_individual",
//   videoParams?: { cameraMode, prompt },
//   furniture?: Array<{ prompt: string; type: string; isolation_prompt: string }>
// }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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

type Body = {
  runId: string;
  nodeId: string;
  action: "save_only" | "scene_to_3d" | "render_to_video" | "furniture_individual";
  videoParams?: { cameraMode?: string; prompt?: string };
  furniture?: Array<{ prompt: string; type: string; isolation_prompt: string }>;
};

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

async function freshSignedUrl(path: string, ttlSec = 60 * 60 * 24 * 7): Promise<string> {
  const { data, error } = await admin.storage.from("outputs").createSignedUrl(path, ttlSec);
  if (error || !data?.signedUrl) throw new Error(`assinar url: ${error?.message ?? "?"}`);
  return data.signedUrl;
}

async function insertGeneration(row: Record<string, unknown>): Promise<string> {
  const { data, error } = await admin.from("generations").insert(row).select("id").single();
  if (error || !data) throw new Error(`insert generation: ${error?.message ?? "?"}`);
  return data.id as string;
}

/**
 * Dispara o orchestrate para uma generation recém-criada.
 *
 * Encaminha o Authorization do próprio usuário. A versão anterior mandava
 * `Bearer ${SERVICE_ROLE}`, mas o orchestrate resolve o caller com
 * `auth.getUser(token)`, que valida token de usuário e rejeita service role key
 * — o kickoff levava 401 em toda chamada e a generation ficava em `queued` para
 * sempre. Como toda linha criada aqui tem `user_id` do próprio caller, o JWT
 * dele satisfaz a checagem de dono do orchestrate sem precisar de exceção.
 *
 * Retorna null em caso de sucesso, ou a mensagem de erro.
 */
async function invokeOrchestrate(generationId: string, authHeader: string): Promise<string | null> {
  let detail: string;
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/orchestrate-generation`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
        apikey: ANON_KEY,
      },
      body: JSON.stringify({ generationId }),
    });
    if (r.ok) return null;
    detail = `${r.status}: ${(await r.text()).slice(0, 300)}`;
  } catch (e) {
    detail = e instanceof Error ? e.message : "falha de rede";
  }

  // Qualquer resposta não-ok é registrada. Antes só >= 500 era logado, e foi
  // exatamente por isso que um 401 constante passou despercebido.
  const message = `não foi possível iniciar a geração (${detail})`;
  console.error("studio-publish kickoff", generationId, message);

  // Sem isto a linha ficaria em `queued` indefinidamente, girando na biblioteca
  // até o cron de gerações travadas alcançá-la.
  await admin
    .from("generations")
    .update({ status: "failed", error_message: message })
    .eq("id", generationId);

  return message;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const userId = await getUserId(req);
    // getUserId já garantiu que é um Bearer válido de usuário.
    const authHeader = req.headers.get("Authorization")!;
    const body = (await req.json()) as Body;
    if (!body.runId || !body.nodeId || !body.action) {
      throw new Error("faltam campos: runId, nodeId, action");
    }

    const { data: run, error: runErr } = await admin
      .from("studio_runs")
      .select("id, user_id, node_results, graph")
      .eq("id", body.runId)
      .single();
    if (runErr || !run) throw new Error(`run não encontrada: ${runErr?.message ?? "?"}`);
    if (run.user_id !== userId) throw new Error("forbidden");

    const results = (run.node_results as Record<string, { url?: string; path?: string }>) ?? {};
    const node = results[body.nodeId];
    if (!node?.path && !node?.url) throw new Error("nó sem resultado para publicar");

    const storagePath = node.path ?? null;
    const freshUrl = storagePath ? await freshSignedUrl(storagePath) : node.url!;

    // Recupera prompt do grafo do nó (best effort)
    const graph = run.graph as { nodes?: Array<{ id: string; data?: { prompt?: string } }> } | null;
    const nodeData = graph?.nodes?.find((n) => n.id === body.nodeId)?.data;
    const inheritedPrompt = nodeData?.prompt ?? null;

    const studioOrigin = { run_id: body.runId, node_id: body.nodeId };

    if (body.action === "save_only") {
      const id = await insertGeneration({
        user_id: userId,
        pipeline_type: "edit",
        engine: "studio_save",
        status: "succeeded",
        source_images: storagePath ? [storagePath] : [freshUrl],
        prompt: inheritedPrompt,
        final_render_url: freshUrl,
        thumbnail_url: freshUrl,
        progress_percent: 100,
        completed_at: new Date().toISOString(),
        metadata: { studio_origin: studioOrigin, kind: "saved_image" },
      });
      return new Response(JSON.stringify({ ok: true, generationIds: [id] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body.action === "scene_to_3d") {
      const id = await insertGeneration({
        user_id: userId,
        pipeline_type: "scene_to_3d",
        engine: "hunyuan_2_1",
        status: "queued",
        source_images: [freshUrl],
        context_image_url: freshUrl,
        prompt: inheritedPrompt,
        metadata: { studio_origin: studioOrigin },
      });
      const kickoffError = await invokeOrchestrate(id, authHeader);
      return new Response(
        JSON.stringify({
          ok: !kickoffError,
          generationIds: [id],
          ...(kickoffError ? { error: kickoffError } : {}),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (body.action === "render_to_video") {
      const id = await insertGeneration({
        user_id: userId,
        pipeline_type: "render_to_video",
        engine: "happyhorse_1_0",
        status: "queued",
        source_images: [freshUrl],
        prompt: body.videoParams?.prompt?.trim() || inheritedPrompt,
        metadata: {
          studio_origin: studioOrigin,
          duration: 15,
          resolution: "1080p",
          aspect_ratio: "16:9",
          mode: "pov",
          camera_mode: body.videoParams?.cameraMode ?? "pov_walk",
        },
      });
      const kickoffError = await invokeOrchestrate(id, authHeader);
      return new Response(
        JSON.stringify({
          ok: !kickoffError,
          generationIds: [id],
          ...(kickoffError ? { error: kickoffError } : {}),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (body.action === "furniture_individual") {
      const items = body.furniture ?? [];
      if (items.length === 0) throw new Error("nenhum móvel selecionado");
      const ids: string[] = [];
      const failures: string[] = [];
      for (const f of items) {
        const promptText = f.prompt?.trim()
          ? f.prompt
          : `a ${f.type}, photorealistic, single object, isolated, white background, neutral lighting`;
        const id = await insertGeneration({
          user_id: userId,
          pipeline_type: "text_to_3d",
          engine: "hunyuan_3_1",
          status: "queued",
          source_images: [],
          prompt: promptText,
          metadata: {
            studio_origin: studioOrigin,
            furniture_type: f.type,
            isolation_prompt: f.isolation_prompt,
            kind: "single_furniture",
          },
        });
        ids.push(id);
        const kickoffError = await invokeOrchestrate(id, authHeader);
        if (kickoffError) failures.push(kickoffError);
      }
      return new Response(
        JSON.stringify({
          ok: failures.length === 0,
          generationIds: ids,
          ...(failures.length > 0
            ? {
                error: `${ids.length - failures.length} de ${ids.length} iniciadas — ${failures[0]}`,
              }
            : {}),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    throw new Error(`ação desconhecida: ${body.action}`);
  } catch (e) {
    const msg = (e as Error).message;
    console.error("studio-publish erro", msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
