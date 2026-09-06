// deno-lint-ignore-file no-explicit-any
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

    const { token } = await req.json();
    if (!token || typeof token !== "string") {
      return json({ ok: false, error: "Token ausente" });
    }
    const r = await fetch("https://api.replicate.com/v1/account", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return json({ ok: false, error: `Token inválido (${r.status})` });
    const account: any = await r.json();
    return json({ ok: true, account: account.username ?? account.name ?? null });
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
