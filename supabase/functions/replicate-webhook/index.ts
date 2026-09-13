// Webhook do Replicate — recebe a conclusão da prediction Hunyuan3D
// e finaliza a generation: salva GLB, thumbnail, custos e (Pipeline 4) compõe render.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { callGptImage2 } from "../_shared/gpt-image-2.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

async function getSecret(name: string): Promise<string | null> {
  const { data } = await admin.rpc("service_get_secret", { _name: name });
  return (data as string | null) ?? null;
}

async function downloadToOutputs(
  url: string,
  userId: string,
  genId: string,
  filename: string,
  mime: string,
): Promise<string> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download ${url}: ${r.status}`);
  const bytes = new Uint8Array(await r.arrayBuffer());
  const path = `${userId}/${genId}/${filename}`;
  const { error } = await admin.storage
    .from("outputs")
    .upload(path, bytes, { upsert: true, contentType: mime });
  if (error) throw error;
  const { data } = await admin.storage.from("outputs").createSignedUrl(path, 60 * 60 * 24 * 30);
  return data?.signedUrl ?? path;
}

// Verifica assinatura HMAC do Replicate (spec standard-webhooks).
// Header: webhook-signature: "v1,<base64-sig> v1,<base64-sig> ..."
// Conteúdo assinado: `${webhook-id}.${webhook-timestamp}.${body}` com chave secreta `whsec_<base64>`.
async function verifyReplicateSignature(req: Request, rawBody: string): Promise<boolean> {
  const secret = Deno.env.get("REPLICATE_WEBHOOK_SECRET");
  if (!secret) {
    console.error(
      "REPLICATE_WEBHOOK_SECRET ausente — webhook rejeitado. Configure o secret nas edge functions.",
    );
    return false;
  }
  const id = req.headers.get("webhook-id");
  const ts = req.headers.get("webhook-timestamp");
  const sigHeader = req.headers.get("webhook-signature");
  if (!id || !ts || !sigHeader) {
    console.error("webhook sem headers de assinatura");
    return false;
  }
  // Tolera timestamp até 5 min de diferença
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum) || Math.abs(Date.now() / 1000 - tsNum) > 300) {
    console.error("webhook timestamp inválido ou expirado");
    return false;
  }
  const secretB64 = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  const keyBytes = Uint8Array.from(atob(secretB64), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const data = new TextEncoder().encode(`${id}.${ts}.${rawBody}`);
  const sigBytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, data));
  const expected = btoa(String.fromCharCode(...sigBytes));
  // Header pode ter múltiplas assinaturas separadas por espaço, prefixadas por "v1,"
  const provided = sigHeader.split(" ").map((p) => p.replace(/^v1,/, ""));
  const ok = provided.some((p) => p === expected);
  if (!ok) console.error("assinatura HMAC inválida");
  return ok;
}

Deno.serve(async (req) => {
  try {
    const rawBody = await req.text();
    const valid = await verifyReplicateSignature(req, rawBody);
    if (!valid) return new Response("invalid signature", { status: 401 });
    const payload = JSON.parse(rawBody);
    const predictionId: string | undefined = payload?.id;
    if (!predictionId) return new Response("missing id", { status: 400 });

    const { data: gen } = await admin
      .from("generations")
      .select("*")
      .eq("replicate_prediction_id", predictionId)
      .maybeSingle();
    if (!gen) return new Response("generation not found", { status: 404 });

    if (payload.status !== "succeeded") {
      await admin
        .from("generations")
        .update({
          status: "failed",
          error_message: payload?.error ? String(payload.error) : "replicate failure",
        })
        .eq("id", gen.id);
      return new Response("ok");
    }

    // ===== Pipeline render_to_video: output é um vídeo .mp4 =====
    if (gen.pipeline_type === "render_to_video") {
      const out = payload.output;
      let videoUrl: string | undefined;
      if (typeof out === "string") videoUrl = out;
      else if (Array.isArray(out)) videoUrl = out.find((u: unknown) => typeof u === "string");
      else if (out?.video) videoUrl = out.video;

      if (!videoUrl) {
        await admin
          .from("generations")
          .update({
            status: "failed",
            error_message: "Vídeo ausente no output",
            completed_at: new Date().toISOString(),
          })
          .eq("id", gen.id);
        return new Response("ok");
      }

      const sources = (gen.source_images as string[]) ?? [];
      const stored = await downloadToOutputs(
        videoUrl,
        gen.user_id,
        gen.id,
        "walkthrough.mp4",
        "video/mp4",
      );
      const cost = 0.5;
      await admin
        .from("generations")
        .update({
          status: "succeeded",
          video_url: stored,
          thumbnail_url: sources[0] ?? null,
          completed_at: new Date().toISOString(),
          cost_usd: cost,
          progress_percent: 100,
          progress_stage: "Vídeo pronto",
        })
        .eq("id", gen.id);
      await admin.from("api_costs").insert({
        user_id: gen.user_id,
        generation_id: gen.id,
        provider: "replicate",
        operation: "render_to_video",
        cost_usd: cost,
      });
      return new Response("ok");
    }

    const output = payload.output;
    let glbUrl: string | undefined;
    if (typeof output === "string") {
      glbUrl = output;
    } else if (output?.mesh) {
      glbUrl = output.mesh;
    } else if (Array.isArray(output)) {
      glbUrl = output.find((u: string) => typeof u === "string" && u.endsWith(".glb"));
    } else if (output?.glb) {
      glbUrl = output.glb;
    }
    if (!glbUrl) {
      await admin
        .from("generations")
        .update({ status: "failed", error_message: "GLB ausente no output" })
        .eq("id", gen.id);
      return new Response("ok");
    }

    const storedGlb = await downloadToOutputs(
      glbUrl,
      gen.user_id,
      gen.id,
      "model.glb",
      "model/gltf-binary",
    );

    // Thumbnail = primeira intermediate (multi-view) ou source
    const intermediates = (gen.intermediate_images as string[]) ?? [];
    const sources = (gen.source_images as string[]) ?? [];
    const thumbnail = intermediates[0] ?? sources[0] ?? null;

    // Custo aproximado: Hunyuan3D 2.1 ≈ $0.05, 3.1 ≈ $0.10
    const engine = (gen as { engine?: string }).engine ?? "hunyuan_2_1";
    const cost = engine === "hunyuan_3_1" ? 0.1 : 0.05;

    // Pipeline 4: compõe render da cena com gpt-image-2 via Replicate (best-effort)
    let finalRenderUrl: string | null = null;
    if (gen.pipeline_type === "in_scene" && gen.context_image_url) {
      try {
        const replicateToken = await getSecret("REPLICATE_API_TOKEN");
        if (replicateToken && thumbnail) {
          const objR = await fetch(thumbnail);
          const sceneR = await fetch(gen.context_image_url);
          if (objR.ok && sceneR.ok) {
            const objB = new Uint8Array(await objR.arrayBuffer());
            const sceneB = new Uint8Array(await sceneR.arrayBuffer());
            const objB64 = btoa(String.fromCharCode(...objB));
            const sceneB64 = btoa(String.fromCharCode(...sceneB));
            const prompt =
              "Place the object from the first image into the room shown in the second image. " +
              (gen.prompt ?? "") +
              " Match perspective, scale and lighting. Keep the room unchanged.";
            const out = await callGptImage2(
              replicateToken,
              [
                { b64: objB64, mime: "image/png" },
                { b64: sceneB64, mime: "image/jpeg" },
              ],
              prompt,
              { aspect_ratio: "16:9", quality: "auto", output_format: "webp" },
            );
            const path = `${gen.user_id}/${gen.id}/scene.png`;
            await admin.storage.from("outputs").upload(path, out.bytes, {
              upsert: true,
              contentType: out.mime,
            });
            const { data } = await admin.storage
              .from("outputs")
              .createSignedUrl(path, 60 * 60 * 24 * 30);
            finalRenderUrl = data?.signedUrl ?? null;
          }
        }
      } catch (e) {
        console.error("scene compose:", (e as Error).message);
      }
    }

    await admin
      .from("generations")
      .update({
        status: "succeeded",
        glb_url: storedGlb,
        thumbnail_url: thumbnail,
        final_render_url: finalRenderUrl,
        completed_at: new Date().toISOString(),
        cost_usd: cost,
      })
      .eq("id", gen.id);

    await admin.from("api_costs").insert({
      user_id: gen.user_id,
      generation_id: gen.id,
      provider: "replicate",
      operation: gen.pipeline_type,
      cost_usd: cost,
    });

    return new Response("ok");
  } catch (e) {
    console.error("webhook error:", (e as Error).message);
    return new Response("error", { status: 500 });
  }
});
