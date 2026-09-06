import { getUserId, isAdmin } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const callerId = await getUserId(req);
    if (!callerId) return json({ ok: false, error: "Não autenticado" }, 401);
    if (!(await isAdmin(callerId))) return json({ ok: false, error: "Acesso negado" }, 403);

    const { apiKey } = await req.json();
    if (!apiKey || typeof apiKey !== "string") {
      return json({ ok: false, error: "API key ausente" });
    }
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: "ping" }] }] }),
      },
    );
    if (!r.ok) {
      const txt = await r.text();
      return json({ ok: false, error: `Gemini retornou ${r.status}: ${txt.slice(0, 120)}` });
    }
    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : "Falha na requisição" });
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
