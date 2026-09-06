// Pipeline B (etapa de análise): roda floor-plan-vision na planta gerada
// e devolve metadados estruturados (cômodos, áreas, NBR 9050).
//
// POST { assetId: string }
// → { rooms[], totalAreaApprox, accessibility, raw }

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
    const { assetId } = (await req.json()) as { assetId?: string };
    if (!assetId || typeof assetId !== "string") {
      throw new Error("assetId obrigatório");
    }

    // valida ownership do asset
    const { data: asset, error: aErr } = await admin
      .from("generation_assets")
      .select("id,generation_id,storage_path,signed_url,type")
      .eq("id", assetId)
      .eq("user_id", userId)
      .maybeSingle();
    if (aErr || !asset) throw aErr ?? new Error("asset não encontrado");
    if (asset.type !== "floorplan") {
      throw new Error("asset não é uma planta");
    }

    // re-assina (signed_url pode estar expirada)
    const { data: signed } = await admin.storage
      .from("outputs")
      .createSignedUrl(asset.storage_path as string, 60 * 30);
    const imageUrl = signed?.signedUrl ?? (asset.signed_url as string);
    if (!imageUrl) throw new Error("URL da planta indisponível");

    const replicateToken = await getSecret("REPLICATE_API_TOKEN");
    if (!replicateToken) throw new Error("REPLICATE_API_TOKEN não configurado");

    const result = await runFloorplanVision(replicateToken, imageUrl);

    // persiste no metadata da generation (merge em analyses[assetId])
    const { data: gen } = await admin
      .from("generations")
      .select("metadata")
      .eq("id", asset.generation_id as string)
      .maybeSingle();
    const meta = (gen?.metadata as Record<string, unknown> | null) ?? {};
    const analyses = (meta.analyses as Record<string, unknown> | undefined) ?? {};
    analyses[assetId] = result;
    await admin
      .from("generations")
      .update({ metadata: { ...meta, analyses } } as never)
      .eq("id", asset.generation_id as string);

    await admin.from("api_costs").insert({
      generation_id: asset.generation_id,
      user_id: userId,
      provider: "lovable-ai",
      operation: "gemini-floorplan-vision",
      cost_usd: COST_VISION,
    } as never);

    return new Response(
      JSON.stringify({ ok: true, analysis: result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = (e as Error).message ?? "falha desconhecida";
    console.error("analyze-floorplan-vision erro", msg);
    return new Response(
      JSON.stringify({ ok: false, error: msg }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
