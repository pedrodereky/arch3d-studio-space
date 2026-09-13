// Guarda de gasto por usuário.
//
// Nada no produto limitava consumo: qualquer conta cadastrada podia disparar
// gerações indefinidamente na chave do dono da instância. Este helper barra a
// chamada antes de ela chegar ao provedor.
//
// O limite vem de MAX_COST_USD_PER_USER_30D, nos secrets das edge functions.
// Sem essa variável não há limite — desligado por padrão, para não mudar o
// comportamento de uma instância já em uso sem alguém decidir o número.
//
// O gasto é somado de `api_costs` numa janela móvel de 30 dias, e não de
// `profiles.total_cost_usd`, para não depender de um acumulador que este repo
// não consegue verificar.

// deno-lint-ignore no-explicit-any
type AdminClient = any;

export type BudgetCheck = { allowed: true } | { allowed: false; reason: string };

const WINDOW_DAYS = 30;

export async function checkUserBudget(admin: AdminClient, userId: string): Promise<BudgetCheck> {
  const raw = Deno.env.get("MAX_COST_USD_PER_USER_30D");
  if (!raw) return { allowed: true };

  const limit = Number(raw);
  if (!Number.isFinite(limit) || limit <= 0) {
    console.warn(`MAX_COST_USD_PER_USER_30D inválido (${raw}) — limite ignorado`);
    return { allowed: true };
  }

  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await admin
    .from("api_costs")
    .select("cost_usd")
    .eq("user_id", userId)
    .gte("created_at", since);

  // Falha aberta de propósito: derrubar todas as gerações por causa de uma
  // leitura que falhou seria pior que deixar passar. O erro fica no log.
  if (error) {
    console.error("spend-guard: não foi possível somar api_costs —", error.message);
    return { allowed: true };
  }

  const spent = (data ?? []).reduce(
    (sum: number, row: { cost_usd: number | null }) => sum + Number(row.cost_usd ?? 0),
    0,
  );

  if (spent >= limit) {
    return {
      allowed: false,
      reason:
        `limite de gasto atingido: $${spent.toFixed(2)} usados nos últimos ` +
        `${WINDOW_DAYS} dias, teto de $${limit.toFixed(2)}`,
    };
  }

  return { allowed: true };
}
