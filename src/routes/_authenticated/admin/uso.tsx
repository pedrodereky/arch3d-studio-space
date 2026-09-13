import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin/uso")({
  component: UsoPage,
});

const PERIODS = [
  { days: 7, label: "7 dias" },
  { days: 30, label: "30 dias" },
  { days: 90, label: "90 dias" },
] as const;

// Teto defensivo: um período longo numa instância movimentada não pode puxar a
// tabela inteira para o navegador. Se bater o teto, a UI avisa que truncou.
const ROW_CAP = 5000;

type CostRow = {
  cost_usd: number | null;
  provider: string;
  operation: string;
  user_id: string | null;
};

type GenRow = {
  pipeline_type: string;
  status: string;
  user_id: string;
  cost_usd: number | null;
};

type Profile = { id: string; full_name: string | null; office_name: string | null };

const money = (v: number) => `$ ${v.toFixed(2)}`;

function UsoPage() {
  const [days, setDays] = useState<number>(30);
  const [costs, setCosts] = useState<CostRow[]>([]);
  const [gens, setGens] = useState<GenRow[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);

    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceIso = since.toISOString();

    void (async () => {
      const [costRes, genRes, profRes] = await Promise.all([
        supabase
          .from("api_costs")
          .select("cost_usd,provider,operation,user_id")
          .gte("created_at", sinceIso)
          .limit(ROW_CAP),
        supabase
          .from("generations")
          .select("pipeline_type,status,user_id,cost_usd")
          .gte("created_at", sinceIso)
          .limit(ROW_CAP),
        supabase.from("profiles").select("id,full_name,office_name"),
      ]);

      if (!alive) return;

      // Erro visível: sem isso a página mostraria zeros e pareceria "sem uso",
      // quando na verdade a query falhou (RLS, rede, permissão).
      const firstError = costRes.error ?? genRes.error ?? profRes.error;
      if (firstError) {
        setError(firstError.message);
        setLoading(false);
        return;
      }

      const costRows = (costRes.data ?? []) as CostRow[];
      const genRows = (genRes.data ?? []) as GenRow[];
      setCosts(costRows);
      setGens(genRows);
      setProfiles((profRes.data ?? []) as Profile[]);
      setTruncated(costRows.length >= ROW_CAP || genRows.length >= ROW_CAP);
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [days]);

  const stats = useMemo(() => {
    const totalCost = costs.reduce((acc, r) => acc + Number(r.cost_usd ?? 0), 0);
    const succeeded = gens.filter((g) => g.status === "succeeded").length;
    const failed = gens.filter((g) => g.status === "failed" || g.status === "cancelled").length;
    const activeUsers = new Set(gens.map((g) => g.user_id)).size;
    return {
      totalCost,
      generations: gens.length,
      succeeded,
      failed,
      activeUsers,
      avgCost: succeeded > 0 ? totalCost / succeeded : 0,
    };
  }, [costs, gens]);

  const byProvider = useMemo(() => groupSum(costs, (r) => r.provider), [costs]);
  const byOperation = useMemo(() => groupSum(costs, (r) => r.operation), [costs]);
  const byPipeline = useMemo(
    () =>
      groupSum(
        gens.map((g) => ({ cost_usd: g.cost_usd, key: g.pipeline_type })),
        (r) => r.key,
      ),
    [gens],
  );

  const topUsers = useMemo(() => {
    const nameById = new Map(profiles.map((p) => [p.id, p]));
    return groupSum(
      costs.map((c) => ({ cost_usd: c.cost_usd, key: c.user_id ?? "—" })),
      (r) => r.key,
    )
      .slice(0, 10)
      .map((row) => {
        const prof = nameById.get(row.label);
        return {
          ...row,
          name: prof?.full_name ?? "(sem perfil)",
          office: prof?.office_name ?? null,
        };
      });
  }, [costs, profiles]);

  return (
    <div className="mx-auto max-w-[1100px] space-y-10">
      <header>
        <h1 className="text-3xl font-black tracking-tight text-foreground">Uso e custos</h1>
        <p className="mt-2 font-light text-muted-foreground">
          Consumo de API e gerações da instância. Valores vêm de{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
            api_costs
          </code>{" "}
          e{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
            generations
          </code>
          .
        </p>
      </header>

      {/* Filtro de período */}
      <div className="flex flex-wrap items-center gap-2">
        {PERIODS.map((p) => (
          <button
            key={p.days}
            type="button"
            onClick={() => setDays(p.days)}
            className={`rounded-full px-4 py-1.5 text-[11px] font-black uppercase tracking-[0.12em] transition-colors ${
              days === p.days
                ? "bg-primary text-primary-foreground"
                : "border border-border bg-background text-muted-foreground hover:bg-muted"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-5">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" strokeWidth={1.75} />
          <div>
            <p className="text-sm font-bold text-foreground">Não foi possível carregar o uso</p>
            <p className="mt-1 text-sm font-light text-muted-foreground">{error}</p>
            <p className="mt-2 text-xs font-light text-muted-foreground">
              Se a mensagem for de permissão, confirme que o seu usuário tem papel admin e que as
              políticas de RLS de <code className="font-mono">api_costs</code> e{" "}
              <code className="font-mono">profiles</code> liberam leitura para admin.
            </p>
          </div>
        </div>
      ) : loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {truncated && (
            <p className="text-xs font-light text-muted-foreground">
              Mostrando as primeiras {ROW_CAP.toLocaleString("pt-BR")} linhas do período — os totais
              abaixo estão truncados.
            </p>
          )}

          {/* KPIs */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Custo no período" value={money(stats.totalCost)} />
            <Stat label="Gerações" value={String(stats.generations)} />
            <Stat
              label="Custo médio por geração"
              value={stats.succeeded > 0 ? money(stats.avgCost) : "—"}
              hint={`${stats.succeeded} concluídas · ${stats.failed} com falha`}
            />
            <Stat label="Usuários ativos" value={String(stats.activeUsers)} />
          </div>

          <MagnitudeSection
            title="Custo por provedor"
            description="Quanto cada provedor de IA consumiu no período."
            rows={byProvider}
            format={money}
          />

          <MagnitudeSection
            title="Gerações por pipeline"
            description="Volume por tipo de geração; o valor é o custo somado."
            rows={byPipeline}
            format={money}
          />

          {/* Operações: muitas classes → tabela */}
          <section>
            <h2 className="text-xl font-black tracking-tight text-foreground">
              Custo por operação
            </h2>
            <div className="mt-4 overflow-x-auto rounded-xl border border-border/60 bg-card">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                    <th className="px-5 py-3 text-left font-bold">Operação</th>
                    <th className="px-5 py-3 text-right font-bold">Chamadas</th>
                    <th className="px-5 py-3 text-right font-bold">Custo</th>
                  </tr>
                </thead>
                <tbody>
                  {byOperation.length === 0 ? (
                    <tr>
                      <td
                        colSpan={3}
                        className="px-5 py-8 text-center font-light text-muted-foreground"
                      >
                        Nenhuma chamada registrada no período.
                      </td>
                    </tr>
                  ) : (
                    byOperation.map((r) => (
                      <tr key={r.label} className="border-b border-border/60 last:border-b-0">
                        <td className="px-5 py-3 font-medium text-foreground">{r.label}</td>
                        <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">
                          {r.count}
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums text-foreground">
                          {money(r.value)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Top usuários */}
          <section>
            <h2 className="text-xl font-black tracking-tight text-foreground">
              Top usuários por custo
            </h2>
            <div className="mt-4 overflow-x-auto rounded-xl border border-border/60 bg-card">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                    <th className="px-5 py-3 text-left font-bold">Usuário</th>
                    <th className="px-5 py-3 text-right font-bold">Chamadas</th>
                    <th className="px-5 py-3 text-right font-bold">Custo</th>
                  </tr>
                </thead>
                <tbody>
                  {topUsers.length === 0 ? (
                    <tr>
                      <td
                        colSpan={3}
                        className="px-5 py-8 text-center font-light text-muted-foreground"
                      >
                        Nenhum consumo registrado no período.
                      </td>
                    </tr>
                  ) : (
                    topUsers.map((r) => (
                      <tr key={r.label} className="border-b border-border/60 last:border-b-0">
                        <td className="px-5 py-3">
                          <span className="font-medium text-foreground">{r.name}</span>
                          {r.office && (
                            <span className="block text-xs font-light text-muted-foreground">
                              {r.office}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">
                          {r.count}
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums text-foreground">
                          {money(r.value)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

type SumRow = { label: string; value: number; count: number };

function groupSum<T extends { cost_usd: number | null }>(
  rows: T[],
  keyOf: (r: T) => string,
): SumRow[] {
  const map = new Map<string, SumRow>();
  for (const r of rows) {
    const label = keyOf(r) || "—";
    const entry = map.get(label) ?? { label, value: 0, count: 0 };
    entry.value += Number(r.cost_usd ?? 0);
    entry.count += 1;
    map.set(label, entry);
  }
  return [...map.values()].sort((a, b) => b.value - a.value);
}

/**
 * Comparação de magnitude com uma só medida (custo): barra de hue única,
 * comprimento codifica o valor. Sem legenda — não há identidade a distinguir —
 * e cada barra leva rótulo direto com o valor exato.
 */
function MagnitudeSection({
  title,
  description,
  rows,
  format,
}: {
  title: string;
  description: string;
  rows: SumRow[];
  format: (v: number) => string;
}) {
  const max = rows.reduce((m, r) => Math.max(m, r.value), 0);
  const total = rows.reduce((s, r) => s + r.value, 0);

  return (
    <section>
      <h2 className="text-xl font-black tracking-tight text-foreground">{title}</h2>
      <p className="mt-1 text-sm font-light text-muted-foreground">{description}</p>
      <div
        className="mt-4 rounded-xl border border-border/60 bg-card p-5"
        style={{ boxShadow: "var(--via-shadow-card)" }}
      >
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm font-light text-muted-foreground">
            Nada registrado no período.
          </p>
        ) : (
          <ul className="space-y-4">
            {rows.map((r) => {
              const share = total > 0 ? (r.value / total) * 100 : 0;
              return (
                <li key={r.label}>
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="truncate text-sm font-medium text-foreground">{r.label}</span>
                    <span className="shrink-0 text-sm tabular-nums text-foreground">
                      {format(r.value)}
                      <span className="ml-2 text-xs font-light text-muted-foreground">
                        {r.count} {r.count === 1 ? "chamada" : "chamadas"}
                      </span>
                    </span>
                  </div>
                  <div
                    className="mt-1.5 h-2.5 w-full overflow-hidden rounded-[2px] bg-muted"
                    title={`${r.label}: ${format(r.value)} · ${r.count} chamadas · ${share.toFixed(1)}% do período`}
                  >
                    <div
                      className="h-full rounded-l-none rounded-r-[4px]"
                      style={{
                        width: max > 0 ? `${Math.max((r.value / max) * 100, 1)}%` : "0%",
                        backgroundColor: "var(--ring)",
                      }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div
      className="rounded-xl border border-border/60 bg-card p-5"
      style={{ boxShadow: "var(--via-shadow-card)" }}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-3 text-3xl font-black tracking-tight text-foreground">{value}</p>
      {hint && <p className="mt-1 text-xs font-light text-muted-foreground">{hint}</p>}
    </div>
  );
}
