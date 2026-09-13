// Helper para chamar o modelo openai/gpt-image-2 via Replicate.
// Usa o proxy do Replicate (sem openai_api_key) — cobrado pelo Replicate por imagem.
// Retorna bytes + mime da primeira imagem gerada.

const ENDPOINT = "https://api.replicate.com/v1/models/openai/gpt-image-2/predictions";

export type GptImage2Input = {
  b64: string;
  mime: string;
};

export type GptImage2Opts = {
  aspect_ratio?: "1:1" | "16:9" | "9:16" | "4:3" | "3:4";
  quality?: "auto" | "low" | "medium" | "high";
  output_format?: "png" | "webp" | "jpeg";
  timeoutMs?: number;
  pollIntervalMs?: number;
};

export async function callGptImage2(
  replicateToken: string,
  inputImages: GptImage2Input[],
  prompt: string,
  opts: GptImage2Opts = {},
): Promise<{ bytes: Uint8Array; mime: string }> {
  const aspect = opts.aspect_ratio ?? "1:1";
  const quality = opts.quality ?? "auto";
  const outputFormat = opts.output_format ?? "png";
  const timeoutMs = opts.timeoutMs ?? 300_000;
  const pollMs = opts.pollIntervalMs ?? 3000;

  const input_images = inputImages.map(({ b64, mime }) => `data:${mime};base64,${b64}`);

  // 1. Cria a prediction (com retry em 429)
  let createJson: any;
  let createStatus = 0;
  for (let attempt = 0; attempt <= 5; attempt++) {
    const r = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${replicateToken}`,
        "Content-Type": "application/json",
        Prefer: "wait=60",
      },
      body: JSON.stringify({
        input: {
          prompt,
          input_images,
          aspect_ratio: aspect,
          quality,
          output_format: outputFormat,
          number_of_images: 1,
        },
      }),
    });
    createJson = await r.json().catch(() => ({}));
    createStatus = r.status;
    if (r.status !== 429) break;
    const retryAfter = Number(createJson?.retry_after ?? 0);
    const wait = Math.min(Math.max(retryAfter * 1000, 2000 * Math.pow(2, attempt)), 30_000);
    console.warn(`gpt-image-2 429, retry em ${wait}ms (${attempt + 1}/5)`);
    await new Promise((res) => setTimeout(res, wait));
  }
  if (createStatus < 200 || createStatus >= 300) {
    throw new Error(
      `gpt-image-2 create ${createStatus}: ${JSON.stringify(createJson).slice(0, 300)}`,
    );
  }

  const getUrl: string | undefined = createJson?.urls?.get;
  if (!getUrl) {
    throw new Error("gpt-image-2: prediction sem urls.get");
  }

  // 2. Polling até succeeded/failed/canceled
  const start = Date.now();
  let predJson: any = createJson;
  while (
    predJson?.status !== "succeeded" &&
    predJson?.status !== "failed" &&
    predJson?.status !== "canceled"
  ) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`gpt-image-2: timeout após ${timeoutMs}ms`);
    }
    await new Promise((res) => setTimeout(res, pollMs));
    const r = await fetch(getUrl, {
      headers: { Authorization: `Bearer ${replicateToken}` },
    });
    predJson = await r.json().catch(() => ({}));
  }

  if (predJson.status !== "succeeded") {
    throw new Error(
      `gpt-image-2 ${predJson.status} (${predJson?.id ?? "?"}): ${predJson?.error ?? "erro desconhecido"}`,
    );
  }

  // output pode ser string ou array de strings (URIs)
  const out = predJson.output;
  const outputUrl: string | undefined = Array.isArray(out) ? out[0] : out;
  if (!outputUrl || typeof outputUrl !== "string") {
    throw new Error("gpt-image-2: sem output");
  }

  // 3. Baixa a imagem
  const imgR = await fetch(outputUrl);
  if (!imgR.ok) {
    throw new Error(`gpt-image-2 download: ${imgR.status}`);
  }
  const mime = imgR.headers.get("content-type") ?? `image/${outputFormat}`;
  const bytes = new Uint8Array(await imgR.arrayBuffer());
  return { bytes, mime };
}
