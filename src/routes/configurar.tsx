import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Loader2,
  Check,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Upload,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Wordmark } from "@/components/brand/Wordmark";
import { WizardShell, type WizardStep } from "@/components/wizard/WizardShell";
import { toast } from "sonner";
import {
  TERMOS_USO_TEMPLATE,
  POLITICA_PRIVACIDADE_TEMPLATE,
} from "@/lib/legal-templates";

export const Route = createFileRoute("/configurar")({
  component: SetupWizard,
});

type TestState = "idle" | "testing" | "success" | "error";

type FormState = {
  replicateToken: string;
  replicateState: TestState;
  replicateError: string | null;
  replicateAccount: string | null;

  geminiKey: string;
  geminiState: TestState;
  geminiError: string | null;

  productName: string;
  logoUrl: string | null;
  brandColor: string;
  customDomain: string;

  legalTerms: string;
  legalPrivacy: string;
  legalAccepted: boolean;
};

function SetupWizard() {
  const { user, isAdmin, isLoading, setupCompleted, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<FormState>({
    replicateToken: "",
    replicateState: "idle",
    replicateError: null,
    replicateAccount: null,
    geminiKey: "",
    geminiState: "idle",
    geminiError: null,
    productName: "Arq3D Studio",
    logoUrl: null,
    brandColor: "#0A4F95",
    customDomain: "",
    legalTerms: TERMOS_USO_TEMPLATE,
    legalPrivacy: POLITICA_PRIVACIDADE_TEMPLATE,
    legalAccepted: false,
  });

  const update = (patch: Partial<FormState>) => setForm((s) => ({ ...s, ...patch }));

  const saveConfig = async (patch: Record<string, unknown>) => {
    const { error } = await supabase
      .from("instance_config")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(patch as any)
      .eq("id", 1);
    if (error) toast.error("Não foi possível salvar", { description: error.message });
  };

  const saveSecret = async (name: string, value: string) => {
    const { error } = await supabase.rpc(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      "admin_set_secret" as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { _name: name, _value: value } as any,
    );
    if (error) {
      toast.error("Não foi possível salvar a chave", { description: error.message });
      return false;
    }
    return true;
  };

  const testReplicate = async () => {
    if (!form.replicateToken) return;
    update({ replicateState: "testing", replicateError: null });
    const { data, error } = await supabase.functions.invoke<{
      ok: boolean;
      account?: string;
      error?: string;
    }>("setup-test-replicate", { body: { token: form.replicateToken } });
    if (error || !data?.ok) {
      update({
        replicateState: "error",
        replicateError: data?.error ?? error?.message ?? "Falha na conexão",
      });
      return;
    }
    const saved = await saveSecret("REPLICATE_API_TOKEN", form.replicateToken);
    if (!saved) {
      update({ replicateState: "error", replicateError: "Conexão ok, mas falha ao salvar" });
      return;
    }
    await saveConfig({ replicate_configured: true });
    update({
      replicateState: "success",
      replicateAccount: data.account ?? null,
      replicateError: null,
    });
  };

  const testGemini = async () => {
    if (!form.geminiKey) return;
    update({ geminiState: "testing", geminiError: null });
    const { data, error } = await supabase.functions.invoke<{ ok: boolean; error?: string }>(
      "setup-test-gemini",
      { body: { apiKey: form.geminiKey } },
    );
    if (error || !data?.ok) {
      update({
        geminiState: "error",
        geminiError: data?.error ?? error?.message ?? "Falha na conexão",
      });
      return;
    }
    const saved = await saveSecret("GEMINI_API_KEY", form.geminiKey);
    if (!saved) {
      update({ geminiState: "error", geminiError: "Conexão ok, mas falha ao salvar" });
      return;
    }
    await saveConfig({ gemini_configured: true });
    update({ geminiState: "success" });
  };

  const uploadLogo = async (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
    const path = `logo-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("branding").upload(path, file, {
      upsert: true,
      contentType: file.type,
    });
    if (error) {
      toast.error("Falha ao enviar logo", { description: error.message });
      return;
    }
    const { data } = supabase.storage.from("branding").getPublicUrl(path);
    update({ logoUrl: data.publicUrl });
    await saveConfig({ logo_url: data.publicUrl });
    toast.success("Logo enviado");
  };

  const finish = async () => {
    setSubmitting(true);
    await saveConfig({
      product_name: form.productName,
      brand_secondary_color: form.brandColor,
      custom_domain: form.customDomain || null,
      legal_terms: form.legalTerms,
      legal_privacy: form.legalPrivacy,
      legal_terms_accepted: true,
      setup_completed: true,
    });
    setSubmitting(false);
    await refreshProfile();
    toast.success("Instância configurada");
    navigate({ to: "/app", replace: true });
  };

  const steps: WizardStep[] = useMemo(
    () => [
      {
        id: "welcome",
        label: "Boas-vindas",
        shortLabel: "Início",
        content: <StepWelcome />,
      },
      {
        id: "supabase",
        label: "Supabase",
        shortLabel: "Banco",
        content: <StepSupabase />,
      },
      {
        id: "replicate",
        label: "Replicate",
        shortLabel: "Replicate",
        content: (
          <StepReplicate
            value={form.replicateToken}
            onChange={(v) => update({ replicateToken: v, replicateState: "idle" })}
            state={form.replicateState}
            error={form.replicateError}
            account={form.replicateAccount}
            onTest={testReplicate}
          />
        ),
      },
      {
        id: "gemini",
        label: "Gemini",
        shortLabel: "Gemini",
        content: (
          <StepGemini
            value={form.geminiKey}
            onChange={(v) => update({ geminiKey: v, geminiState: "idle" })}
            state={form.geminiState}
            error={form.geminiError}
            onTest={testGemini}
          />
        ),
      },
      {
        id: "branding",
        label: "Branding",
        shortLabel: "Marca",
        content: (
          <StepBranding
            productName={form.productName}
            onProductName={(v) => update({ productName: v })}
            logoUrl={form.logoUrl}
            onUpload={uploadLogo}
            color={form.brandColor}
            onColor={(v) => update({ brandColor: v })}
            domain={form.customDomain}
            onDomain={(v) => update({ customDomain: v })}
          />
        ),
      },
      {
        id: "legal",
        label: "Legal",
        shortLabel: "Termos",
        content: (
          <StepLegal
            terms={form.legalTerms}
            privacy={form.legalPrivacy}
            accepted={form.legalAccepted}
            onTerms={(v) => update({ legalTerms: v })}
            onPrivacy={(v) => update({ legalPrivacy: v })}
            onAccept={(v) => update({ legalAccepted: v })}
          />
        ),
      },
      {
        id: "done",
        label: "Concluir",
        shortLabel: "Pronto",
        content: <StepDone form={form} />,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [form],
  );

  const currentStep = steps[step];
  const isLast = step === steps.length - 1;

  const canProceed = (() => {
    switch (currentStep.id) {
      case "replicate":
        return form.replicateState === "success";
      case "gemini":
        return form.geminiState === "success";
      case "legal":
        return form.legalAccepted;
      default:
        return true;
    }
  })();

  const goNext = () => {
    if (isLast) return finish();
    setStep(step + 1);
  };

  const goBack = () => {
    if (step > 0) setStep(step - 1);
  };

  if (isLoading)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  if (!user) return <Navigate to="/entrar" replace />;
  if (!isAdmin) return <Navigate to="/app" replace />;
  if (setupCompleted === true) return <Navigate to="/app" replace />;

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-[760px]">
        <div className="mb-8 text-center">
          <Wordmark className="text-primary" />
        </div>
        <WizardShell
          steps={steps}
          currentIndex={step}
          onBack={goBack}
          onNext={goNext}
          canProceed={canProceed}
          isSubmitting={submitting}
          nextLabel={
            isLast ? "Ir para o painel" : currentStep.id === "welcome" ? "Vamos lá" : "Continuar"
          }
        />
      </div>
    </div>
  );
}

/* ============== STEP COMPONENTS ============== */

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-3xl font-black tracking-tight text-foreground">{children}</h2>
  );
}
function Lead({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 font-light leading-relaxed text-muted-foreground">{children}</p>;
}
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
      {children}
    </label>
  );
}

function StepWelcome() {
  const items = [
    "Conectar Replicate (geração 3D)",
    "Conectar Gemini (edição de imagens)",
    "Personalizar a marca",
    "Aceitar os termos de uso",
  ];
  return (
    <div>
      <H2>Bem-vindo ao Arq3D Studio</H2>
      <Lead>
        Vamos configurar sua instância em poucos passos: conexão das APIs de IA, branding e
        termos. Leva entre 3 e 5 minutos.
      </Lead>
      <ul className="mt-8 space-y-3">
        {items.map((it) => (
          <li key={it} className="flex items-center gap-3 text-sm text-foreground">
            <Check className="h-4 w-4 text-accent" strokeWidth={2.5} />
            <span className="font-light">{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StepSupabase() {
  const url = (import.meta.env.VITE_SUPABASE_URL as string) ?? "";
  return (
    <div>
      <H2>Backend conectado</H2>
      <div className="mt-4 inline-flex items-center gap-2 rounded-[4px] bg-emerald-50 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-emerald-700">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Conectado
      </div>
      <Lead>Seu backend já está conectado via Lovable Cloud. URL do projeto:</Lead>
      <div className="mt-3 rounded-md border border-border bg-muted/30 px-4 py-3 font-mono text-[12px] text-foreground break-all">
        {url || "—"}
      </div>
    </div>
  );
}

function TestStateView({
  state,
  error,
  successText,
}: {
  state: TestState;
  error: string | null;
  successText: string;
}) {
  if (state === "testing")
    return (
      <div className="mt-3 inline-flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Testando...
      </div>
    );
  if (state === "success")
    return (
      <div className="mt-3 inline-flex items-center gap-2 rounded-[4px] bg-emerald-50 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-emerald-700">
        <CheckCircle2 className="h-3.5 w-3.5" />
        {successText}
      </div>
    );
  if (state === "error")
    return (
      <div className="mt-3 inline-flex items-start gap-2 rounded-[4px] bg-red-50 px-3 py-2 text-[12px] text-red-700">
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span className="font-light">{error ?? "Falha na conexão"}</span>
      </div>
    );
  return null;
}

function ApiTestButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="mt-4 inline-flex h-10 items-center rounded-full border border-border bg-background px-5 text-[11px] font-black uppercase tracking-[0.12em] text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function ExternalDocLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
    >
      {children}
      <ExternalLink className="h-3.5 w-3.5" />
    </a>
  );
}

function StepReplicate({
  value,
  onChange,
  state,
  error,
  account,
  onTest,
}: {
  value: string;
  onChange: (v: string) => void;
  state: TestState;
  error: string | null;
  account: string | null;
  onTest: () => void;
}) {
  return (
    <div>
      <H2>Configure sua chave Replicate</H2>
      <Lead>
        O Replicate hospeda os modelos 3D (Hunyuan, Tripo). Você precisa de uma conta com créditos
        para gerar.
      </Lead>
      <ExternalDocLink href="https://replicate.com/account/api-tokens">
        Como criar uma conta Replicate e gerar API token
      </ExternalDocLink>

      <div className="mt-6">
        <FieldLabel>Token da API</FieldLabel>
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="r8_..."
          className="mt-2 block h-11 w-full rounded-md border border-border bg-background px-4 font-mono text-sm text-foreground focus:border-primary focus:outline-none"
        />
      </div>

      <ApiTestButton
        onClick={onTest}
        disabled={!value || state === "testing" || state === "success"}
      >
        {state === "success" ? "Conexão validada" : "Testar conexão"}
      </ApiTestButton>
      <TestStateView
        state={state}
        error={error}
        successText={account ? `Conectado como ${account}` : "Conexão validada"}
      />
    </div>
  );
}

function StepGemini({
  value,
  onChange,
  state,
  error,
  onTest,
}: {
  value: string;
  onChange: (v: string) => void;
  state: TestState;
  error: string | null;
  onTest: () => void;
}) {
  return (
    <div>
      <H2>Configure sua chave Google Gemini</H2>
      <Lead>
        O Gemini é usado para limpar fundos, gerar vistas multi-view e fazer edições antes de
        virar 3D. O plano gratuito do Google AI Studio funciona para começar.
      </Lead>
      <ExternalDocLink href="https://aistudio.google.com/apikey">
        Como pegar sua API key
      </ExternalDocLink>

      <div className="mt-6">
        <FieldLabel>API key</FieldLabel>
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="AIza..."
          className="mt-2 block h-11 w-full rounded-md border border-border bg-background px-4 font-mono text-sm text-foreground focus:border-primary focus:outline-none"
        />
      </div>

      <ApiTestButton
        onClick={onTest}
        disabled={!value || state === "testing" || state === "success"}
      >
        {state === "success" ? "Conexão validada" : "Testar conexão"}
      </ApiTestButton>
      <TestStateView state={state} error={error} successText="Conexão validada" />
    </div>
  );
}

function StepBranding({
  productName,
  onProductName,
  logoUrl,
  onUpload,
  color,
  onColor,
  domain,
  onDomain,
}: {
  productName: string;
  onProductName: (v: string) => void;
  logoUrl: string | null;
  onUpload: (f: File) => void;
  color: string;
  onColor: (v: string) => void;
  domain: string;
  onDomain: (v: string) => void;
}) {
  return (
    <div>
      <H2>Personalize sua marca</H2>
      <div className="mt-6 space-y-6">
        <div>
          <FieldLabel>Nome do produto</FieldLabel>
          <input
            value={productName}
            onChange={(e) => onProductName(e.target.value)}
            className="mt-2 block h-11 w-full rounded-md border border-border bg-background px-4 text-sm text-foreground focus:border-primary focus:outline-none"
          />
        </div>

        <div>
          <FieldLabel>Logo</FieldLabel>
          <label className="mt-2 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-background px-4 py-8 text-center transition-colors hover:bg-muted/40">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="h-12 w-auto" />
            ) : (
              <Upload className="h-5 w-5 text-muted-foreground" />
            )}
            <span className="text-sm font-light text-muted-foreground">
              {logoUrl ? "Trocar logo" : "Arraste seu logo PNG ou SVG aqui"}
            </span>
            <input
              type="file"
              accept="image/png,image/svg+xml"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUpload(f);
              }}
            />
          </label>
        </div>

        <div>
          <FieldLabel>Cor secundária</FieldLabel>
          <div className="mt-2 flex items-center gap-3">
            <input
              type="color"
              value={color}
              onChange={(e) => onColor(e.target.value)}
              className="h-11 w-14 cursor-pointer rounded-md border border-border bg-background"
            />
            <input
              value={color}
              onChange={(e) => onColor(e.target.value)}
              className="h-11 w-32 rounded-md border border-border bg-background px-3 font-mono text-sm uppercase text-foreground focus:border-primary focus:outline-none"
            />
            <button
              type="button"
              style={{ backgroundColor: color }}
              className="ml-auto inline-flex h-10 items-center rounded-full px-5 text-[11px] font-black uppercase tracking-[0.12em] text-white"
            >
              Botão de exemplo
            </button>
          </div>
          <p className="mt-2 text-xs font-light text-muted-foreground">
            Esta cor é o accent. O navy permanece como tinta principal.
          </p>
        </div>

        <div>
          <FieldLabel>Domínio personalizado (opcional)</FieldLabel>
          <input
            value={domain}
            onChange={(e) => onDomain(e.target.value)}
            placeholder="app.suamarca.com.br"
            className="mt-2 block h-11 w-full rounded-md border border-border bg-background px-4 text-sm text-foreground focus:border-primary focus:outline-none"
          />
          <p className="mt-2 text-xs font-light text-muted-foreground">
            Configure pelo Settings do Lovable depois.
          </p>
        </div>
      </div>
    </div>
  );
}

function StepLegal({
  terms,
  privacy,
  accepted,
  onTerms,
  onPrivacy,
  onAccept,
}: {
  terms: string;
  privacy: string;
  accepted: boolean;
  onTerms: (v: string) => void;
  onPrivacy: (v: string) => void;
  onAccept: (v: boolean) => void;
}) {
  return (
    <div>
      <H2>Termos de uso e política de privacidade</H2>
      <Lead>
        Recomendamos personalizar antes de abrir para os usuários. Você pode editar depois nas
        configurações. Substitua os marcadores entre colchetes pelos seus dados.
      </Lead>

      <div className="mt-6 space-y-5">
        <div>
          <FieldLabel>Termos de uso</FieldLabel>
          <textarea
            rows={10}
            value={terms}
            onChange={(e) => onTerms(e.target.value)}
            className="mt-2 block w-full rounded-md border border-border bg-background p-4 font-mono text-xs leading-relaxed text-foreground focus:border-primary focus:outline-none"
          />
        </div>
        <div>
          <FieldLabel>Política de privacidade</FieldLabel>
          <textarea
            rows={10}
            value={privacy}
            onChange={(e) => onPrivacy(e.target.value)}
            className="mt-2 block w-full rounded-md border border-border bg-background p-4 font-mono text-xs leading-relaxed text-foreground focus:border-primary focus:outline-none"
          />
        </div>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => onAccept(e.target.checked)}
            className="mt-1 h-4 w-4 cursor-pointer accent-primary"
          />
          <span className="text-sm font-light text-foreground">
            Confirmo que li e personalizei os termos para minha operação.
          </span>
        </label>
      </div>
    </div>
  );
}

function StepDone({ form }: { form: FormState }) {
  const items = [
    { label: "Replicate conectado", ok: form.replicateState === "success" },
    { label: "Gemini conectado", ok: form.geminiState === "success" },
    { label: "Branding salvo", ok: !!form.productName },
    { label: "Termos aceitos", ok: form.legalAccepted },
  ];
  return (
    <div>
      <H2>Configuração concluída</H2>
      <Lead>Tudo pronto. Você já pode entrar no painel e começar.</Lead>
      <ul className="mt-6 space-y-3">
        {items.map((it) => (
          <li key={it.label} className="flex items-center gap-3 text-sm">
            <CheckCircle2
              className={"h-4 w-4 " + (it.ok ? "text-accent" : "text-muted-foreground/40")}
            />
            <span className={it.ok ? "text-foreground" : "text-muted-foreground"}>
              {it.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
