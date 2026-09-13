import { supabase } from "@/integrations/supabase/client";

/**
 * Acompanha uma generation até ela chegar a um estado terminal.
 *
 * Realtime (postgres_changes) é o caminho rápido, mas o websocket pode nunca
 * conectar — rede corporativa, proxy, aba suspensa pelo navegador. Sem um
 * fallback, a UI fica girando para sempre. Este polling é a rede de segurança:
 * sempre termina, seja com o status final ou com `timeout`.
 */

export type GenerationOutcome =
  | { ok: true; status: "succeeded"; metadata: Record<string, unknown> }
  | { ok: false; status: "failed" | "cancelled" | "timeout"; error: string };

export const DEFAULT_POLL_TIMEOUT_MS = 5 * 60 * 1000;
export const DEFAULT_POLL_INTERVAL_MS = 3000;

export type PollOptions = {
  timeoutMs?: number;
  intervalMs?: number;
  /** Interrompe o polling (ex.: componente desmontado). Retorna `null`. */
  isCancelled?: () => boolean;
};

export async function pollGenerationStatus(
  generationId: string,
  options: PollOptions = {},
): Promise<GenerationOutcome | null> {
  const {
    timeoutMs = DEFAULT_POLL_TIMEOUT_MS,
    intervalMs = DEFAULT_POLL_INTERVAL_MS,
    isCancelled,
  } = options;

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    await new Promise((r) => setTimeout(r, intervalMs));
    if (isCancelled?.()) return null;

    const { data, error } = await supabase
      .from("generations")
      .select("status,error_message,metadata")
      .eq("id", generationId)
      .maybeSingle();

    // Erro de rede ou linha ainda não visível: tenta de novo no próximo ciclo.
    if (error || !data) continue;

    const row = data as {
      status?: string;
      error_message?: string | null;
      metadata?: Record<string, unknown> | null;
    };

    if (row.status === "succeeded") {
      return { ok: true, status: "succeeded", metadata: row.metadata ?? {} };
    }
    if (row.status === "failed" || row.status === "cancelled") {
      return {
        ok: false,
        status: row.status,
        error: row.error_message ?? "geração falhou",
      };
    }
  }

  if (isCancelled?.()) return null;
  return {
    ok: false,
    status: "timeout",
    error: "tempo esgotado — acompanhe pela Biblioteca",
  };
}
