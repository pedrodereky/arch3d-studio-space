import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck, KeyRound, Cpu, ExternalLink, Receipt, Loader2 } from "lucide-react";
import { AI_PROVIDERS, PROVIDER_BY_ID, stepsByFeature } from "@/lib/ai-transparency";
import { usePipelineCosts, formatUsd } from "@/lib/pipeline-costs";
import { pipelineLabel } from "@/lib/pipeline-labels";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/app/transparencia")({
  component: TransparenciaPage,
});

function TransparenciaPage() {
  const groups = stepsByFeature();
  const { user } = useAuth();
  const { data: costs, isPending: costsPending } = usePipelineCosts(user?.id);

  // Ordena pelo que pesa mais na conta: a pergunta é "o que está me custando".
  const costRows = Object.entries(costs ?? {})
    .map(([pipeline, c]) => ({ pipeline, ...c! }))
    .sort((a, b) => b.median * b.samples - a.median * a.samples);

  return (
    <div className="mx-auto max-w-[1100px] space-y-10">
      <header>
        <h1 className="text-[30px] font-black leading-[1.1] tracking-tight text-foreground">
          Transparência de IA
        </h1>
        <p className="mt-2 max-w-2xl font-light text-muted-foreground">
          Como o Arq3D Studio usa inteligência artificial: quais provedores são chamados, qual
          credencial autoriza cada chamada e qual modelo roda em cada etapa de cada recurso.
        </p>
      </header>

      {/* Provedores */}
      <section>
        <div className="flex items-center gap-3">
          <KeyRound className="h-5 w-5 text-foreground" strokeWidth={1.75} />
          <h2 className="text-xl font-black tracking-tight text-foreground">
            Provedores e credenciais
          </h2>
        </div>
        <p className="mt-2 max-w-2xl font-light text-muted-foreground">
          Não existe um provedor único. Parte das chamadas passa pelo gateway da Lovable e parte vai
          direto ao provedor — cada uma com credencial e faturamento próprios.
        </p>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {AI_PROVIDERS.map((p) => (
            <div
              key={p.id}
              className="rounded-xl border border-border/60 bg-card p-5"
              style={{ boxShadow: "var(--via-shadow-card)" }}
            >
              <h3 className="text-base font-black tracking-tight text-foreground">{p.name}</h3>
              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                    Endpoint
                  </dt>
                  <dd className="mt-1 font-mono text-xs break-all text-muted-foreground">
                    {p.endpoint}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                    Credencial
                  </dt>
                  <dd className="mt-1">
                    <code className="rounded bg-muted px-2 py-1 font-mono text-xs text-foreground">
                      {p.credential}
                    </code>
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                    Faturamento
                  </dt>
                  <dd className="mt-1 font-light text-muted-foreground">{p.billing}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      </section>

      {/* Modelos por etapa */}
      <section>
        <div className="flex items-center gap-3">
          <Cpu className="h-5 w-5 text-foreground" strokeWidth={1.75} />
          <h2 className="text-xl font-black tracking-tight text-foreground">Modelos por recurso</h2>
        </div>
        <p className="mt-2 max-w-2xl font-light text-muted-foreground">
          Cada etapa identifica o modelo chamado, o provedor que o serve e o arquivo da função no
          backend.
        </p>

        <div className="mt-5 space-y-6">
          {groups.map((group) => (
            <div key={group.feature}>
              <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                {group.feature}
              </h3>
              <div
                className="mt-2 overflow-hidden rounded-xl border border-border/60 bg-card"
                style={{ boxShadow: "var(--via-shadow-card)" }}
              >
                <ul>
                  {group.steps.map((s) => (
                    <li
                      key={`${group.feature}-${s.stage}`}
                      className="grid gap-2 border-b border-border/60 px-5 py-4 last:border-b-0 md:grid-cols-[1.2fr_1.8fr_1.3fr_1.3fr] md:gap-4"
                    >
                      <div className="font-bold text-foreground">{s.stage}</div>
                      <div className="text-sm font-light text-muted-foreground">{s.purpose}</div>
                      <div className="flex flex-wrap items-center gap-2">
                        <code className="rounded bg-muted px-2 py-1 font-mono text-xs text-foreground">
                          {s.model}
                        </code>
                        <span
                          className="rounded-[4px] border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                          style={{
                            borderColor:
                              s.provider === "lovable"
                                ? "color-mix(in oklab, var(--primary) 25%, transparent)"
                                : "color-mix(in oklab, var(--muted-foreground) 30%, transparent)",
                            color:
                              s.provider === "lovable"
                                ? "var(--primary)"
                                : "var(--muted-foreground)",
                          }}
                        >
                          {PROVIDER_BY_ID[s.provider].name}
                        </span>
                      </div>
                      <code className="font-mono text-[11px] break-all text-muted-foreground">
                        {s.file}
                      </code>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Custo por pipeline */}
      <section>
        <div className="flex items-center gap-3">
          <Receipt className="h-5 w-5 text-foreground" strokeWidth={1.75} />
          <h2 className="text-xl font-black tracking-tight text-foreground">Custo por pipeline</h2>
        </div>
        <p className="mt-2 max-w-2xl font-light text-muted-foreground">
          Medido, não tabelado: é a mediana do que{" "}
          <strong className="font-semibold text-foreground">você</strong> já pagou em cada pipeline,
          nas suas últimas gerações bem-sucedidas. Não há preço fixo — o custo real varia com o
          modelo, o tamanho da entrada e o que o provedor cobrou no dia.
        </p>

        <div
          className="mt-5 overflow-hidden rounded-xl border border-border/60 bg-card"
          style={{ boxShadow: "var(--via-shadow-card)" }}
        >
          {costsPending ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : costRows.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm font-light text-muted-foreground">
              Nenhuma geração cobrada ainda. Assim que você gerar, o custo medido aparece aqui.
            </p>
          ) : (
            <ul>
              {costRows.map((r) => (
                <li
                  key={r.pipeline}
                  className="flex items-baseline justify-between gap-4 border-b border-border/60 px-5 py-4 last:border-b-0"
                >
                  <span className="min-w-0 truncate text-sm font-medium text-foreground">
                    {pipelineLabel(r.pipeline)}
                  </span>
                  <span className="flex shrink-0 items-baseline gap-3">
                    <span className="text-[11px] font-light text-muted-foreground">
                      {r.samples} {r.samples === 1 ? "geração" : "gerações"}
                    </span>
                    <span className="text-sm font-semibold tabular-nums text-foreground">
                      {formatUsd(r.median)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="mt-2.5 text-[11px] font-light text-muted-foreground">
          Amostra: até 500 gerações mais recentes. Mediana, não média — uma geração que estourou por
          retry envenenaria a média.
        </p>
      </section>

      {/* Garantias */}
      <section
        className="rounded-xl border border-border/60 bg-card p-6"
        style={{ boxShadow: "var(--via-shadow-card)" }}
      >
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
            <ShieldCheck className="h-[22px] w-[22px]" strokeWidth={1.75} />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-black tracking-tight text-foreground">Garantias</h2>
            <ul className="mt-3 space-y-2 text-sm font-light text-muted-foreground">
              <li>
                O navegador nunca chama Replicate, OpenAI ou Google diretamente: toda requisição de
                IA sai de uma edge function autenticada no backend.
              </li>
              <li>
                Nenhuma chave de provedor aparece no bundle do navegador — as credenciais ficam nos
                secrets do backend e são lidas só em tempo de execução.
              </li>
              <li>
                Cada geração registra o modelo usado em{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                  generations.metadata
                </code>{" "}
                e o custo por chamada em{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                  api_costs
                </code>{" "}
                para auditoria.
              </li>
            </ul>

            <a
              href="https://docs.lovable.dev/features/ai"
              target="_blank"
              rel="noreferrer"
              className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline"
            >
              Documentação do Lovable AI
              <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} />
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
