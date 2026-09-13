// Cron: marca como `failed` as gerações que ficaram presas em processamento.
//
// O RPC `mark_stuck_generations_failed` existe no banco desde o início, mas
// nada o chamava — uma geração que morria no meio do pipeline ficava em
// `processing` para sempre na biblioteca do usuário, girando sem fim.
//
// Agendamento: chamar este endpoint de hora em hora (ou diariamente) com
//   Authorization: Bearer $LOVABLE_CRON_SECRET
// A rota é idempotente: rodar mais vezes não causa efeito extra.
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function handler({ request }: { request: Request }) {
  const unauthorized = await authenticateCronRequest(request);
  if (unauthorized) return unauthorized;

  try {
    // client.server só pode ser carregado dentro do handler: um import no topo
    // faria a service role key entrar no bundle do cliente.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data, error } = await supabaseAdmin.rpc("mark_stuck_generations_failed");
    if (error) {
      console.error("[cron/stuck-generations]", error.message);
      return json({ ok: false, error: error.message }, 500);
    }

    return json({ ok: true, markedFailed: data ?? 0 });
  } catch (e) {
    // Sem SUPABASE_SERVICE_ROLE_KEY o client admin lança na criação. Um 500 sem
    // corpo não diz nada ao log do scheduler; devolve a causa.
    const message = e instanceof Error ? e.message : "erro desconhecido";
    console.error("[cron/stuck-generations]", message);
    return json({ ok: false, error: message }, 500);
  }
}

export const Route = createFileRoute("/api/cron/stuck-generations")({
  server: {
    // Schedulers variam entre GET e POST; o secret é o que protege a rota.
    handlers: { GET: handler, POST: handler },
  },
});
