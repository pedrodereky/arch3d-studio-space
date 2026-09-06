// Helper para chamar gpt-image-2 direto na OpenAI Images API.
// Usa multipart/form-data com /images/edits — as imagens enviadas como
// referência são preservadas pelo modelo por padrão.

const ENDPOINT = "https://api.openai.com/v1/images/edits";

export type OpenAIGptImage2Input = {
  bytes: Uint8Array;
  mime: string;
  filename?: string;
};

export type OpenAIGptImage2Opts = {
  aspect_ratio?: "1:1" | "16:9" | "9:16" | "4:3" | "3:4" | "3:2" | "2:3";
  quality?: "auto" | "low" | "medium" | "high";
  output_format?: "png" | "webp" | "jpeg";
  timeoutMs?: number;
};

const SIZE_BY_RATIO: Record<string, string> = {
  "1:1": "1024x1024",
  "3:2": "1536x1024",
  "16:9": "1536x1024",
  "4:3": "1536x1024",
  "2:3": "1024x1536",
  "9:16": "1024x1536",
  "3:4": "1024x1536",
};

function extFromMime(mime: string): string {
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  return "png";
}

export async function callGptImage2OpenAI(
  apiKey: string,
  inputImages: OpenAIGptImage2Input[],
  prompt: string,
  opts: OpenAIGptImage2Opts = {},
): Promise<{ bytes: Uint8Array; mime: string }> {
  const aspect = opts.aspect_ratio ?? "1:1";
  const size = SIZE_BY_RATIO[aspect] ?? "1024x1024";
  const quality = opts.quality ?? "high";
  const outputFormat = opts.output_format ?? "png";
  const timeoutMs = opts.timeoutMs ?? 300_000;

  const buildForm = () => {
    const form = new FormData();
    form.append("model", "gpt-image-2");
    form.append("prompt", prompt);
    form.append("size", size);
    form.append("quality", quality);
    form.append("output_format", outputFormat);
    form.append("n", "1");
    inputImages.forEach((img, i) => {
      const ext = extFromMime(img.mime);
      const file = new File([img.bytes], img.filename ?? `image_${i}.${ext}`, {
        type: img.mime,
      });
      form.append("image[]", file);
    });
    return form;
  };

  let lastErrText = "";
  let lastStatus = 0;
  for (let attempt = 0; attempt <= 4; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: buildForm(),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      lastStatus = r.status;
      const text = await r.text();
      if (r.status === 429 || r.status >= 500) {
        lastErrText = text.slice(0, 400);
        const wait = Math.min(2000 * Math.pow(2, attempt), 30_000);
        console.warn(`gpt-image-2 OpenAI ${r.status}, retry em ${wait}ms (${attempt + 1}/5)`);
        await new Promise((res) => setTimeout(res, wait));
        continue;
      }
      if (!r.ok) {
        throw new Error(`gpt-image-2 OpenAI ${r.status}: ${text.slice(0, 400)}`);
      }
      const json = JSON.parse(text);
      const b64: string | undefined = json?.data?.[0]?.b64_json;
      if (!b64) throw new Error("gpt-image-2 OpenAI: resposta sem b64_json");
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const mime = `image/${outputFormat}`;
      return { bytes, mime };
    } catch (e) {
      clearTimeout(t);
      if (attempt === 4) throw e;
      const wait = Math.min(2000 * Math.pow(2, attempt), 30_000);
      await new Promise((res) => setTimeout(res, wait));
    }
  }
  throw new Error(`gpt-image-2 OpenAI falhou após retries (${lastStatus}): ${lastErrText}`);
}
