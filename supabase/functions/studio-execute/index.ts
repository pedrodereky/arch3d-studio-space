// Studio: executa UM nó por chamada (modo step) para evitar IDLE_TIMEOUT/shutdown.
// POST { runId } -> processa o próximo nó pendente do grafo salvo em studio_runs.graph
// Retorno: { ok, done, status, nextNodeId?, finalUrl? }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { callGptImage2OpenAI } from "../_shared/gpt-image-2-openai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

async function getSecret(name: string): Promise<string | null> {
  const { data } = await admin.rpc("service_get_secret", { _name: name });
  return (data as string | null) ?? null;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as unknown as number[]);
  }
  return btoa(bin);
}
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function fetchAsBytes(
  url: string,
): Promise<{ bytes: Uint8Array<ArrayBuffer>; mime: string }> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch ${url}: ${r.status}`);
  const mime = r.headers.get("content-type") ?? "image/png";
  return { bytes: new Uint8Array(await r.arrayBuffer()), mime };
}

async function uploadResult(
  userId: string,
  runId: string,
  nodeId: string,
  bytes: Uint8Array,
  mime: string,
  ext = "png",
): Promise<{ url: string; path: string }> {
  const path = `studio/${userId}/${runId}/${nodeId}-${Date.now()}.${ext}`;
  const { error } = await admin.storage
    .from("outputs")
    .upload(path, bytes, { upsert: true, contentType: mime });
  if (error) throw error;
  const { data } = await admin.storage.from("outputs").createSignedUrl(path, 60 * 60 * 24 * 7);
  return { url: data?.signedUrl ?? path, path };
}

// bytes como Uint8Array<ArrayBuffer> para casar com o que o helper da OpenAI
// exige — `BlobPart` não aceita ArrayBufferLike.
type ImgIn = { url?: string; bytes?: Uint8Array<ArrayBuffer>; mime?: string };

async function imgToDataUrl(img: ImgIn): Promise<{ dataUrl: string; mime: string }> {
  if (img.bytes && img.mime) {
    return { dataUrl: `data:${img.mime};base64,${bytesToBase64(img.bytes)}`, mime: img.mime };
  }
  if (img.url) {
    const { bytes, mime } = await fetchAsBytes(img.url);
    return { dataUrl: `data:${mime};base64,${bytesToBase64(bytes)}`, mime };
  }
  throw new Error("imagem inválida");
}

async function callGemini(
  model: string,
  prompt: string,
  inputs: ImgIn[],
): Promise<{ bytes: Uint8Array; mime: string }> {
  const content: unknown[] = [{ type: "text", text: prompt }];
  for (const img of inputs) {
    const { dataUrl } = await imgToDataUrl(img);
    content.push({ type: "image_url", image_url: { url: dataUrl } });
  }
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content }],
      modalities: ["image", "text"],
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    if (r.status === 429)
      throw new Error("RATE_LIMIT: limite de requisições atingido, aguarde alguns segundos.");
    if (r.status === 402) throw new Error("CREDITS: créditos esgotados no workspace Lovable.");
    throw new Error(`gateway ${r.status}: ${t.slice(0, 300)}`);
  }
  const j = await r.json();
  const url: string | undefined = j?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!url || !url.startsWith("data:")) throw new Error("gateway: resposta sem imagem");
  const [meta, b64] = url.split(",");
  const mime = meta.match(/data:([^;]+);/)?.[1] ?? "image/png";
  return { bytes: base64ToBytes(b64), mime };
}

async function callGptImage2(
  prompt: string,
  inputs: ImgIn[],
  quality: "low" | "medium" | "high" = "high",
): Promise<{ bytes: Uint8Array; mime: string }> {
  const apiKey = (await getSecret("OPENAI_API_KEY")) ?? Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY ausente");
  const inputBytes: { bytes: Uint8Array<ArrayBuffer>; mime: string }[] = [];
  for (const img of inputs) {
    if (img.bytes && img.mime) inputBytes.push({ bytes: img.bytes, mime: img.mime });
    else if (img.url) inputBytes.push(await fetchAsBytes(img.url));
  }
  return await callGptImage2OpenAI(apiKey, inputBytes, prompt, { quality, output_format: "png" });
}

async function runOp(
  op: string,
  model: string,
  prompt: string,
  inputs: ImgIn[],
  params: Record<string, unknown>,
): Promise<{ bytes: Uint8Array; mime: string }> {
  const isGpt = model === "openai/gpt-image-2";
  const finalPrompt = (() => {
    switch (op) {
      case "remove_background":
        return "Isolate the main subject from the image. Output a PNG with a fully transparent background, keeping only the main subject. Preserve all detail and edges. No shadows, no extra elements.";
      case "compose":
        return (
          prompt ||
          "Combine the provided images into a single coherent, photorealistic scene. Match lighting, perspective and scale."
        );
      case "edit":
        return prompt || "Edit the image as instructed.";
      case "upscale":
        return "Upscale this image to higher resolution while preserving all details, sharpness, and original style. Do not change content.";
      case "variations":
        return prompt
          ? `Create a variation of this image with the following change: ${prompt}`
          : "Create a creative variation of this image.";
      default:
        return prompt;
    }
  })();
  if (isGpt) {
    const quality = (params.quality as "low" | "medium" | "high") ?? "high";
    return await callGptImage2(finalPrompt, inputs, quality);
  }
  return await callGemini(model, finalPrompt, inputs);
}

type GraphNode = {
  id: string;
  type: string;
  data: {
    model?: string;
    prompt?: string;
    storagePath?: string;
    signedUrl?: string;
    quality?: string;
    op?: string;
    [k: string]: unknown;
  };
};
type GraphEdge = { id?: string; source: string; target: string };
type Graph = { nodes: GraphNode[]; edges: GraphEdge[] };

function topoSort(graph: Graph): string[] {
  const indeg = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const n of graph.nodes) {
    indeg.set(n.id, 0);
    adj.set(n.id, []);
  }
  for (const e of graph.edges) {
    if (!indeg.has(e.target) || !indeg.has(e.source)) continue;
    indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1);
    adj.get(e.source)!.push(e.target);
  }
  const q: string[] = [];
  for (const [id, d] of indeg) if (d === 0) q.push(id);
  const out: string[] = [];
  while (q.length) {
    const id = q.shift()!;
    out.push(id);
    for (const nxt of adj.get(id) ?? []) {
      indeg.set(nxt, (indeg.get(nxt) ?? 0) - 1);
      if (indeg.get(nxt) === 0) q.push(nxt);
    }
  }
  if (out.length !== graph.nodes.length) throw new Error("Grafo cíclico ou desconexo");
  return out;
}

function inputsOf(graph: Graph, nodeId: string): string[] {
  return graph.edges.filter((e) => e.target === nodeId).map((e) => e.source);
}

function descendantsOf(graph: Graph, nodeId: string): Set<string> {
  const out = new Set<string>([nodeId]);
  const adj = new Map<string, string[]>();
  for (const n of graph.nodes) adj.set(n.id, []);
  for (const e of graph.edges) adj.get(e.source)?.push(e.target);
  const stack = [nodeId];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const nxt of adj.get(cur) ?? []) {
      if (!out.has(nxt)) {
        out.add(nxt);
        stack.push(nxt);
      }
    }
  }
  return out;
}

async function processStep(runId: string, retryNodeId?: string) {
  const { data: run, error } = await admin.from("studio_runs").select("*").eq("id", runId).single();
  if (error || !run) throw new Error(`run não encontrada: ${error?.message}`);

  const graph = run.graph as Graph;
  const userId = run.user_id as string;
  const order = topoSort(graph);
  const total = graph.nodes.length || 1;
  let nodeResults: Record<
    string,
    { url?: string; path?: string; mime?: string; ms?: number; error?: string }
  > = {
    ...((run.node_results as Record<
      string,
      { url?: string; path?: string; mime?: string; ms?: number; error?: string }
    >) ?? {}),
  };

  if (retryNodeId) {
    const toClear = descendantsOf(graph, retryNodeId);
    nodeResults = Object.fromEntries(
      Object.entries(nodeResults).filter(([id]) => !toClear.has(id)),
    );
    await admin
      .from("studio_runs")
      .update({
        status: "queued",
        error_message: null,
        completed_at: null,
        final_output_url: null,
        final_output_path: null,
        node_results: nodeResults,
      })
      .eq("id", runId);
  } else if (run.status === "succeeded" || run.status === "failed") {
    return { ok: true, done: true, status: run.status, finalUrl: run.final_output_url };
  } else if (run.status === "running" && run.current_node) {
    const cur = run.current_node as string;
    const nr = nodeResults[cur];
    if (!nr?.url && !nr?.error) {
      return { ok: true, done: false, status: "running", processedNodeId: cur, inFlight: true };
    }
  }

  let nextNodeId: string | null = null;
  for (const id of order) {
    if (nodeResults[id]?.url || nodeResults[id]?.error) continue;
    const ins = inputsOf(graph, id);
    const allReady = ins.every((s) => nodeResults[s]?.url);
    if (allReady) {
      nextNodeId = id;
      break;
    }
  }

  if (!nextNodeId) {
    const outputNode = graph.nodes.find((n) => (n.data?.op ?? n.type) === "output");
    const finalUrl = outputNode ? (nodeResults[outputNode.id]?.url ?? null) : null;
    const finalPath = outputNode ? (nodeResults[outputNode.id]?.path ?? null) : null;
    await admin
      .from("studio_runs")
      .update({
        status: "succeeded",
        progress_percent: 100,
        current_node: null,
        node_results: nodeResults,
        final_output_url: finalUrl,
        final_output_path: finalPath,
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);
    return { ok: true, done: true, status: "succeeded", finalUrl };
  }

  const node = graph.nodes.find((n) => n.id === nextNodeId)!;
  const op = ((node.data as { op?: string })?.op ?? node.type) as string;
  const processedCount = Object.keys(nodeResults).length;

  await admin
    .from("studio_runs")
    .update({
      status: "running",
      current_node: nextNodeId,
      progress_percent: Math.round((processedCount / total) * 90) + 5,
      error_message: null,
    })
    .eq("id", runId);

  const isTrivial = op === "image_upload" || op === "library_pick" || op === "output";
  const targetId = nextNodeId;

  const doWork = async () => {
    const t0 = Date.now();
    try {
      if (op === "image_upload" || op === "library_pick") {
        const url = node.data.signedUrl as string | undefined;
        const path = node.data.storagePath as string | undefined;
        if (!url && !path) throw new Error("nó de entrada sem imagem");
        nodeResults[targetId] = { url: url ?? path, path, ms: 0 };
      } else if (op === "output") {
        const ins = inputsOf(graph, targetId);
        if (ins.length === 0) throw new Error("nó de saída sem entrada conectada");
        const src = nodeResults[ins[0]];
        if (!src?.url) throw new Error("entrada do output sem resultado");
        nodeResults[targetId] = { url: src.url, path: src.path, ms: 0 };
      } else {
        const inIds = inputsOf(graph, targetId);
        if (inIds.length === 0) throw new Error(`nó de operação "${op}" sem entradas conectadas`);
        const inputs: ImgIn[] = [];
        for (const inId of inIds) {
          const r = nodeResults[inId];
          if (!r?.url) throw new Error(`entrada ${inId} sem resultado`);
          inputs.push({ url: r.url });
        }
        const model = (node.data.model as string) ?? "google/gemini-3.1-flash-image-preview";
        const prompt = (node.data.prompt as string) ?? "";
        const out = await runOp(op, model, prompt, inputs, node.data);
        const uploaded = await uploadResult(userId, runId, targetId, out.bytes, out.mime);
        nodeResults[targetId] = {
          url: uploaded.url,
          path: uploaded.path,
          mime: out.mime,
          ms: Date.now() - t0,
        };
      }
    } catch (e) {
      const msg = (e as Error).message;
      nodeResults[targetId] = { error: msg, ms: Date.now() - t0 };
      await admin
        .from("studio_runs")
        .update({
          status: "failed",
          error_message: `Nó ${op} (${targetId}) falhou: ${msg}`,
          node_results: nodeResults,
          completed_at: new Date().toISOString(),
        })
        .eq("id", runId);
      return;
    }

    let hasMore = false;
    for (const id of order) {
      if (!nodeResults[id]?.url && !nodeResults[id]?.error) {
        hasMore = true;
        break;
      }
    }

    if (!hasMore) {
      const outputNode = graph.nodes.find((n) => (n.data?.op ?? n.type) === "output");
      const finalUrl = outputNode ? (nodeResults[outputNode.id]?.url ?? null) : null;
      const finalPath = outputNode ? (nodeResults[outputNode.id]?.path ?? null) : null;
      await admin
        .from("studio_runs")
        .update({
          status: "succeeded",
          progress_percent: 100,
          current_node: null,
          node_results: nodeResults,
          final_output_url: finalUrl,
          final_output_path: finalPath,
          completed_at: new Date().toISOString(),
        })
        .eq("id", runId);
    } else {
      await admin.from("studio_runs").update({ node_results: nodeResults }).eq("id", runId);
    }
  };

  if (isTrivial) {
    await doWork();
    const nr = nodeResults[targetId];
    if (nr?.error) {
      return { ok: false, done: true, status: "failed", error: nr.error, nodeId: targetId };
    }
    const { data: after } = await admin
      .from("studio_runs")
      .select("status,final_output_url")
      .eq("id", runId)
      .single();
    return {
      ok: true,
      done: after?.status === "succeeded" || after?.status === "failed",
      status: after?.status ?? "running",
      finalUrl: after?.final_output_url,
      processedNodeId: targetId,
    };
  }

  // Pesado: dispara em background e retorna imediatamente (evita IDLE_TIMEOUT 150s).
  // deno-lint-ignore no-explicit-any
  const ER = (globalThis as any).EdgeRuntime;
  if (ER && typeof ER.waitUntil === "function") {
    ER.waitUntil(doWork());
  } else {
    doWork().catch((e) => console.error("doWork bg:", e));
  }

  return { ok: true, done: false, status: "running", processedNodeId: targetId, scheduled: true };
}

import { getUserId } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const callerId = await getUserId(req);
    if (!callerId) {
      return new Response(JSON.stringify({ ok: false, error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { runId, retryNodeId } = await req.json();
    if (!runId) throw new Error("runId obrigatório");
    const { data: run, error: runErr } = await admin
      .from("studio_runs")
      .select("user_id")
      .eq("id", runId)
      .maybeSingle();
    if (runErr || !run) {
      return new Response(JSON.stringify({ ok: false, error: "Run não encontrada" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (run.user_id !== callerId) {
      return new Response(JSON.stringify({ ok: false, error: "Acesso negado" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const result = await processStep(runId, retryNodeId);
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("studio-execute:", e);
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
