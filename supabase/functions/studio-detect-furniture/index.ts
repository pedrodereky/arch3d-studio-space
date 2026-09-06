// Studio: detecta móveis numa imagem de um nó já concluído.
// POST { runId, nodeId } -> { objects: SceneObject[] }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { extractScene } from "../_shared/scene-extract.ts";

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

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as unknown as number[]);
  }
  return btoa(bin);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const userId = await getUserId(req);
    const body = (await req.json()) as { runId: string; nodeId: string };
    if (!body.runId || !body.nodeId) throw new Error("faltam runId/nodeId");

    const { data: run, error } = await admin
      .from("studio_runs")
      .select("user_id, node_results")
      .eq("id", body.runId)
      .single();
    if (error || !run) throw new Error(`run não encontrada: ${error?.message ?? "?"}`);
    if (run.user_id !== userId) throw new Error("forbidden");

    const results = (run.node_results as Record<string, { url?: string; path?: string }>) ?? {};
    const node = results[body.nodeId];
    if (!node?.path && !node?.url) throw new Error("nó sem resultado");

    let imageUrl = node.url ?? null;
    if (node.path) {
      const { data } = await admin.storage
        .from("outputs")
        .createSignedUrl(node.path, 60 * 10);
      imageUrl = data?.signedUrl ?? imageUrl;
    }
    if (!imageUrl) throw new Error("sem url da imagem");

    const r = await fetch(imageUrl);
    if (!r.ok) throw new Error(`download imagem: ${r.status}`);
    const mime = r.headers.get("content-type") ?? "image/png";
    const bytes = new Uint8Array(await r.arrayBuffer());
    const b64 = bytesToBase64(bytes);

    const geminiKey = await getSecret("GEMINI_API_KEY");
    if (!geminiKey) throw new Error("GEMINI_API_KEY não configurada");

    const scene = await extractScene(geminiKey, b64, mime);
    return new Response(
      JSON.stringify({ ok: true, objects: scene.objects, bounds: scene.bounds_m }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = (e as Error).message;
    console.error("studio-detect-furniture erro", msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
