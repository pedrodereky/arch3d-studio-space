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

    const { secretKey } = await req.json();
    if (!secretKey || typeof secretKey !== "string") {
      return json({ ok: false, error: "Secret key ausente" });
    }
    const r = await fetch("https://api.stripe.com/v1/account", {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    if (!r.ok) return json({ ok: false, error: `Stripe retornou ${r.status}` });
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
