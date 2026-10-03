import type { Enums } from "@/integrations/supabase/types";

export type GenStatus = Enums<"generation_status">;

/** As abas da Biblioteca. */
export type GenerationFilter = "all" | "succeeded" | "processing" | "failed";

/**
 * Quais status do banco cada aba cobre. `null` é "todos", sem filtro.
 *
 * Isto existe como dado, e não espalhado em condicionais, porque a mesma
 * definição é usada em dois lugares — a lista e as contagens dos chips. Se as
 * duas discordassem, o chip diria "12 falhas" e a lista mostraria 9, e ninguém
 * saberia qual está certo.
 *
 * Note que "falhas" inclui `cancelled`: para quem usa, uma geração cancelada
 * também não produziu nada.
 */
export const FILTER_STATUSES: Record<GenerationFilter, GenStatus[] | null> = {
  all: null,
  succeeded: ["succeeded"],
  processing: ["queued", "pending", "processing"],
  failed: ["failed", "cancelled"],
};

export const GENERATION_FILTERS = Object.keys(FILTER_STATUSES) as GenerationFilter[];
