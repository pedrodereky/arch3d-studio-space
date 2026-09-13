import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Loader2, CheckCircle2, AlertCircle, AlertTriangle, KeyRound, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/configuracoes")({
  component: ConfiguracoesPage,
});

/**
 * De onde a edge function lê cada credencial. Isto não é detalhe cosmético: o
 * cofre (`admin_set_secret`) só alcança as chaves lidas por `getSecret`. As que
 * vêm de `Deno.env.get` precisam ser cadastradas nos secrets das edge functions,
 * e para essas o cofre não consegue nem dizer se estão configuradas.
 */
type Source = "vault" | "env" | "both";

type Integration = {
  name: string;
  label: string;
  source: Source;
  unlocks: string;
  readAt: string;
  test?: "replicate" | "gemini";
};

const INTEGRATIONS: Integration[] = [
  {
    name: "REPLICATE_API_TOKEN",
    label: "Replicate",
    source: "vault",
    unlocks: "Malhas 3D (Hunyuan), plantas 2D, vídeo POV e o render de planta sem OpenAI.",
    readAt: "getSecret — cofre da instância",
    test: "replicate",
  },
  {
    name: "GEMINI_API_KEY",
    label: "Google AI (Gemini)",
    source: "vault",
    unlocks: "Preparo de imagem, extração de planta e de cena para os pipelines 3D.",
    readAt: "getSecret — cofre da instância",
    test: "gemini",
  },
  {
    name: "OPENAI_API_KEY",
    label: "OpenAI",
    source: "both",
    unlocks: "Redecorar ambiente e o render de planta em alta qualidade.",
    readAt: "getSecret com fallback para a env da edge function",
  },
  {
    name: "LOVABLE_API_KEY",
    label: "Lovable AI Gateway",
    source: "env",
    unlocks: "Studio, refino de prompt, texturas PBR e análise de pranchas.",
    readAt: "Deno.env.get — env da edge function (o Studio não tem fallback para o cofre)",
  },
  {
    name: "REPLICATE_WEBHOOK_SECRET",
    label: "Webhook do Replicate",
    source: "env",
    unlocks:
      "Conclusão das gerações 3D. Sem ele o webhook rejeita tudo e as gerações nunca finalizam.",
    readAt: "Deno.env.get — env da edge function",
  },
];

type InstanceConfig = {
  product_name: string;
  brand_secondary_color: string | null;
  custom_domain: string | null;
  setup_completed: boolean;
  replicate_configured: boolean;
  gemini_configured: boolean;
};

function ConfiguracoesPage() {
  const [vault, setVault] = useState<Record<string, boolean>>({});
  const [config, setConfig] = useState<InstanceConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    const [cfgRes, ...secretRes] = await Promise.all([
      supabase
        .from("instance_config")
        .select(
          "product_name,brand_secondary_color,custom_domain,setup_completed,replicate_configured,gemini_configured",
        )
        .eq("id", 1)
        .maybeSingle(),
      ...INTEGRATIONS.map((i) =>
        supabase.rpc("admin_secret_exists", { _name: i.name }).then((r) => ({ name: i.name, r })),
      ),
    ]);

    if (cfgRes.error) {
      setError(cfgRes.error.message);
      setLoading(false);
      return;
    }
    setConfig((cfgRes.data as InstanceConfig | null) ?? null);

    const next: Record<string, boolean> = {};
    for (const item of secretRes) {
      next[item.name] = item.r.error ? false : Boolean(item.r.data);
    }
    setVault(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="mx-auto max-w-[1100px] space-y-8">
      <header>
        <h1 className="text-3xl font-black tracking-tight text-foreground">
          Configurações da instância
        </h1>
        <p className="mt-2 max-w-2xl font-light text-muted-foreground">
          Estado das credenciais que os pipelines usam. Uma chave ausente não derruba o app — ela
          derruba só o recurso que depende dela, no momento em que alguém tenta usá-lo.
        </p>
      </header>

      {error ? (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-5">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" strokeWidth={1.75} />
          <div>
            <p className="text-sm font-bold text-foreground">Não foi possível carregar</p>
            <p className="mt-1 text-sm font-light text-muted-foreground">{error}</p>
          </div>
        </div>
      ) : loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {config && (
            <section
              className="rounded-xl border border-border/60 bg-card p-6"
              style={{ boxShadow: "var(--via-shadow-card)" }}
            >
              <h2 className="text-xl font-black tracking-tight text-foreground">Instância</h2>
              <dl className="mt-4 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-[180px_1fr]">
                <dt className="font-bold text-foreground">Produto</dt>
                <dd className="font-light text-muted-foreground">{config.product_name}</dd>
                <dt className="font-bold text-foreground">Domínio</dt>
                <dd className="font-light text-muted-foreground">{config.custom_domain ?? "—"}</dd>
                <dt className="font-bold text-foreground">Cor da marca</dt>
                <dd className="flex items-center gap-2 font-light text-muted-foreground">
                  {config.brand_secondary_color ? (
                    <>
                      <span
                        className="inline-block h-4 w-4 rounded-[3px] border border-border"
                        style={{ backgroundColor: config.brand_secondary_color }}
                      />
                      <code className="font-mono text-xs">{config.brand_secondary_color}</code>
                    </>
                  ) : (
                    "—"
                  )}
                </dd>
                <dt className="font-bold text-foreground">Setup concluído</dt>
                <dd className="font-light text-muted-foreground">
                  {config.setup_completed ? "Sim" : "Não"}
                </dd>
              </dl>
            </section>
          )}

          <section>
            <div className="flex items-center gap-3">
              <KeyRound className="h-5 w-5 text-foreground" strokeWidth={1.75} />
              <h2 className="text-xl font-black tracking-tight text-foreground">Integrações</h2>
            </div>
            <p className="mt-2 max-w-2xl font-light text-muted-foreground">
              O cofre da instância só alcança as chaves lidas por{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                getSecret
              </code>
              . As marcadas como env vivem nos secrets das edge functions e precisam ser cadastradas
              lá.
            </p>

            <div className="mt-5 space-y-4">
              {INTEGRATIONS.map((integration) => (
                <IntegrationCard
                  key={integration.name}
                  integration={integration}
                  inVault={vault[integration.name] ?? false}
                  onSaved={refresh}
                />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function IntegrationCard({
  integration,
  inVault,
  onSaved,
}: {
  integration: Integration;
  inVault: boolean;
  onSaved: () => Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const canStoreInVault = integration.source !== "env";

  const save = async () => {
    if (!value.trim()) return;
    setSaving(true);
    const { error } = await supabase.rpc("admin_set_secret", {
      _name: integration.name,
      _value: value.trim(),
    });
    setSaving(false);
    if (error) {
      toast.error("Não foi possível salvar", { description: error.message });
      return;
    }
    setValue("");
    toast.success(`${integration.label} salvo no cofre`);
    await onSaved();
  };

  const test = async () => {
    if (!integration.test || !value.trim()) return;
    setTesting(true);
    setTestResult(null);
    const fn = integration.test === "replicate" ? "setup-test-replicate" : "setup-test-gemini";
    // As funções de teste exigem a chave no corpo — elas não leem o cofre. Por
    // isso o botão só habilita com algo digitado: testar sem valor devolveria
    // "chave ausente", que o admin leria como credencial inválida.
    const body =
      integration.test === "replicate" ? { token: value.trim() } : { apiKey: value.trim() };
    const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>(fn, {
      body,
    });
    setTesting(false);
    if (error || !data?.ok) {
      setTestResult({ ok: false, message: data?.error ?? error?.message ?? "Falha na conexão" });
      return;
    }
    setTestResult({ ok: true, message: "Conexão bem-sucedida" });
  };

  return (
    <div
      className="rounded-xl border border-border/60 bg-card p-5"
      style={{ boxShadow: "var(--via-shadow-card)" }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-black tracking-tight text-foreground">
              {integration.label}
            </h3>
            <StatusBadge source={integration.source} inVault={inVault} />
          </div>
          <code className="mt-1 block font-mono text-xs text-muted-foreground">
            {integration.name}
          </code>
          <p className="mt-2 text-sm font-light text-muted-foreground">{integration.unlocks}</p>
          <p className="mt-1 text-xs font-light text-muted-foreground">
            Lida em: {integration.readAt}
          </p>
        </div>
      </div>

      {canStoreInVault ? (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={inVault ? "Substituir a chave salva" : "Colar a chave"}
            autoComplete="off"
            className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
          />
          {integration.test && (
            <button
              type="button"
              onClick={() => void test()}
              disabled={testing || !value.trim()}
              title="Testa a chave digitada acima, não a que já está salva"
              className="inline-flex items-center justify-center gap-2 rounded-md border border-border px-4 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-foreground transition-colors hover:bg-muted disabled:opacity-50"
            >
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Testar"}
            </button>
          )}
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !value.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar
          </button>
        </div>
      ) : (
        <p className="mt-4 rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs font-light text-muted-foreground">
          Esta chave é lida da env da edge function — cadastre-a nos secrets do projeto Supabase. O
          cofre não consegue salvá-la nem verificar se ela existe.
        </p>
      )}

      {testResult && (
        <p
          className={`mt-3 flex items-center gap-2 text-xs font-medium ${
            testResult.ok ? "text-emerald-700" : "text-destructive"
          }`}
        >
          {testResult.ok ? (
            <CheckCircle2 className="h-4 w-4" strokeWidth={2} />
          ) : (
            <AlertCircle className="h-4 w-4" strokeWidth={2} />
          )}
          {testResult.message}
        </p>
      )}
    </div>
  );
}

function StatusBadge({ source, inVault }: { source: Source; inVault: boolean }) {
  if (source === "env") {
    return (
      <span className="inline-flex items-center gap-1 rounded-[4px] border border-border px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-muted-foreground">
        <AlertTriangle className="h-3 w-3" strokeWidth={2} />
        Env — não verificável
      </span>
    );
  }
  if (inVault) {
    return (
      <span className="inline-flex items-center gap-1 rounded-[4px] bg-emerald-600/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-emerald-700">
        <CheckCircle2 className="h-3 w-3" strokeWidth={2} />
        No cofre
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-[4px] bg-destructive/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-destructive">
      <AlertCircle className="h-3 w-3" strokeWidth={2} />
      {source === "both" ? "Fora do cofre" : "Não configurado"}
    </span>
  );
}
