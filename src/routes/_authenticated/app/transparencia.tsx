import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck, KeyRound, Cpu, ExternalLink } from "lucide-react";
import { AI_GATEWAY, AI_PIPELINE_STEPS } from "@/lib/ai-transparency";

export const Route = createFileRoute("/_authenticated/app/transparencia")({
  component: TransparenciaPage,
});

function TransparenciaPage() {
  return (
    <div className="mx-auto max-w-[1100px] space-y-10">
      <header>
        <h1 className="text-3xl font-black tracking-tight text-foreground">Transparência de IA</h1>
        <p className="mt-2 max-w-2xl font-light text-muted-foreground">
          Como o Arq3D Studio usa inteligência artificial: qual credencial autoriza as chamadas e
          qual modelo roda em cada etapa do pipeline de geração.
        </p>
      </header>

      {/* Credencial */}
      <section
        className="rounded-xl border border-border/60 bg-card p-6"
        style={{ boxShadow: "var(--via-shadow-card)" }}
      >
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
            <KeyRound className="h-[22px] w-[22px]" strokeWidth={1.75} />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-black tracking-tight text-foreground">Credencial usada</h2>
            <p className="mt-1 font-light text-muted-foreground">
              Todas as chamadas de IA passam por um único gateway, autenticado por uma chave
              gerenciada pela Lovable.
            </p>

            <dl className="mt-5 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-[180px_1fr]">
              <dt className="font-bold text-foreground">Provedor</dt>
              <dd className="font-light text-muted-foreground">{AI_GATEWAY.provider}</dd>

              <dt className="font-bold text-foreground">Endpoint</dt>
              <dd className="font-mono text-xs text-muted-foreground break-all">
                {AI_GATEWAY.endpoint}
              </dd>

              <dt className="font-bold text-foreground">Credencial</dt>
              <dd>
                <code className="rounded bg-muted px-2 py-1 font-mono text-xs text-foreground">
                  {AI_GATEWAY.credential}
                </code>
                <span className="ml-2 font-light text-muted-foreground">
                  armazenada como secret no backend, nunca exposta no cliente.
                </span>
              </dd>

              <dt className="font-bold text-foreground">Faturamento</dt>
              <dd className="font-light text-muted-foreground">{AI_GATEWAY.billing}</dd>
            </dl>
          </div>
        </div>
      </section>

      {/* Modelos por etapa */}
      <section>
        <div className="flex items-center gap-3">
          <Cpu className="h-5 w-5 text-foreground" strokeWidth={1.75} />
          <h2 className="text-xl font-black tracking-tight text-foreground">Modelos por etapa</h2>
        </div>
        <p className="mt-2 max-w-2xl font-light text-muted-foreground">
          Pipeline de render de planta. Cada etapa abaixo identifica o modelo chamado e o arquivo da
          função no backend.
        </p>

        <div
          className="mt-5 overflow-hidden rounded-xl border border-border/60 bg-card"
          style={{ boxShadow: "var(--via-shadow-card)" }}
        >
          <div className="hidden grid-cols-[1.2fr_1.8fr_1.2fr_1.4fr] gap-4 border-b border-border/60 px-5 py-3 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground md:grid">
            <span>Etapa</span>
            <span>Função</span>
            <span>Modelo</span>
            <span>Arquivo</span>
          </div>
          <ul>
            {AI_PIPELINE_STEPS.map((s) => (
              <li
                key={s.stage}
                className="grid gap-2 border-b border-border/60 px-5 py-4 last:border-b-0 md:grid-cols-[1.2fr_1.8fr_1.2fr_1.4fr] md:gap-4"
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
                      borderColor: s.viaGateway
                        ? "color-mix(in oklab, var(--primary) 25%, transparent)"
                        : "color-mix(in oklab, var(--muted-foreground) 30%, transparent)",
                      color: s.viaGateway ? "var(--primary)" : "var(--muted-foreground)",
                    }}
                  >
                    {s.viaGateway ? "via Gateway" : "engine externa"}
                  </span>
                </div>
                <code className="font-mono text-[11px] text-muted-foreground break-all">
                  {s.file}
                </code>
              </li>
            ))}
          </ul>
        </div>
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
                O cliente nunca chama OpenAI ou Google diretamente — toda requisição passa pelo
                backend autenticado com a{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                  LOVABLE_API_KEY
                </code>
                .
              </li>
              <li>Nenhuma chave aparece no bundle do navegador.</li>
              <li>
                Cada geração registra o modelo usado em{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                  generations.metadata
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
