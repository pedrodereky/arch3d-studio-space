// Refina prompts vagos do pipeline text_to_3d via Lovable AI Gateway.
// Dois modos:
//   - questions: gera 3-5 perguntas estruturadas em pt-BR
//   - compose: monta prompt final em inglês incorporando respostas

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

type Answer = { questionId: string; questionLabel: string; value: string };

import { getUserId } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const callerId = await getUserId(req);
    if (!callerId) return json({ error: "Não autenticado" }, 401);

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "LOVABLE_API_KEY ausente" }, 500);

    const body = await req.json().catch(() => ({}));
    const prompt: string = (body?.prompt ?? "").toString().trim();
    if (prompt.length < 3) return json({ error: "Prompt vazio" }, 400);

    const answers: Answer[] | undefined = Array.isArray(body?.answers)
      ? body.answers
      : undefined;

    const mode = answers && answers.length > 0 ? "compose" : "questions";

    if (mode === "questions") {
      return await generateQuestions(apiKey, prompt);
    }
    return await composePrompt(apiKey, prompt, answers!);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha";
    return json({ error: msg }, 500);
  }
});

async function generateQuestions(apiKey: string, prompt: string) {
  const system =
    "Você é um diretor de arte 3D especialista em mobiliário e design de interiores. " +
    "Recebe um prompt curto/vago de um móvel ou objeto e gera de 3 a 5 perguntas em português do Brasil " +
    "para enriquecer a descrição antes de virar modelo 3D. Foque em: estilo de design, material principal, " +
    "cor/acabamento, proporção/escala e contexto de uso. NÃO repita o que já está claro no prompt do usuário. " +
    "Cada pergunta tem 3 a 4 opções concretas e curtas (2-4 palavras). Tom direto, profissional, sem emoji.";

  const tool = {
    type: "function",
    function: {
      name: "submit_questions",
      description: "Envia as perguntas de refinamento.",
      parameters: {
        type: "object",
        properties: {
          questions: {
            type: "array",
            minItems: 3,
            maxItems: 5,
            items: {
              type: "object",
              properties: {
                id: { type: "string", description: "slug curto, ex: 'estilo'" },
                label: { type: "string", description: "Pergunta em pt-BR" },
                hint: { type: "string", description: "Dica curta opcional" },
                options: {
                  type: "array",
                  minItems: 3,
                  maxItems: 4,
                  items: { type: "string" },
                },
                allowOther: { type: "boolean" },
              },
              required: ["id", "label", "options", "allowOther"],
              additionalProperties: false,
            },
          },
        },
        required: ["questions"],
        additionalProperties: false,
      },
    },
  };

  const r = await fetch(GATEWAY, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: `Prompt do usuário:\n"""${prompt}"""` },
      ],
      tools: [tool],
      tool_choice: { type: "function", function: { name: "submit_questions" } },
    }),
  });

  return forwardOrParse(r, (parsed) => ({ questions: parsed.questions ?? [] }));
}

async function composePrompt(apiKey: string, prompt: string, answers: Answer[]) {
  const system =
    "Você reescreve prompts de mobiliário para um modelo text-to-3D fotorrealista. " +
    "Receba o prompt original em qualquer idioma e respostas de refinamento, e produza UM ÚNICO prompt em INGLÊS, " +
    "denso e descritivo (1 a 3 frases), incorporando todas as respostas de forma natural. " +
    "Sempre termine exatamente com: 'photorealistic, single object, isolated, white background, neutral studio lighting'.";

  const answersText = answers
    .map((a) => `- ${a.questionLabel}: ${a.value}`)
    .join("\n");

  const tool = {
    type: "function",
    function: {
      name: "submit_prompt",
      description: "Envia o prompt final em inglês.",
      parameters: {
        type: "object",
        properties: { finalPrompt: { type: "string" } },
        required: ["finalPrompt"],
        additionalProperties: false,
      },
    },
  };

  const r = await fetch(GATEWAY, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: `Prompt original:\n"""${prompt}"""\n\nRespostas de refinamento:\n${answersText}`,
        },
      ],
      tools: [tool],
      tool_choice: { type: "function", function: { name: "submit_prompt" } },
    }),
  });

  return forwardOrParse(r, (parsed) => ({ finalPrompt: parsed.finalPrompt ?? "" }));
}

async function forwardOrParse(
  r: Response,
  pick: (parsed: any) => Record<string, unknown>,
) {
  if (!r.ok) {
    if (r.status === 429) {
      return json({ error: "Limite de requisições atingido. Tente em alguns segundos." }, 429);
    }
    if (r.status === 402) {
      return json({ error: "Créditos de IA esgotados. Adicione saldo no workspace." }, 402);
    }
    const t = await r.text();
    return json({ error: `Gateway ${r.status}: ${t.slice(0, 200)}` }, 500);
  }
  const data = await r.json();
  const call = data?.choices?.[0]?.message?.tool_calls?.[0];
  if (!call?.function?.arguments) {
    return json({ error: "Resposta sem tool_call" }, 500);
  }
  let parsed: any;
  try {
    parsed = JSON.parse(call.function.arguments);
  } catch {
    return json({ error: "JSON inválido na resposta" }, 500);
  }
  return json(pick(parsed), 200);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
