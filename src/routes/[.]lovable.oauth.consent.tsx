import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type OAuthClient = { name?: string | null };
type AuthorizationDetails = {
  client?: OAuthClient | null;
  redirect_url?: string | null;
  redirect_to?: string | null;
};
type OAuthResult = { data: AuthorizationDetails | null; error: Error | null };
type OAuthNamespace = {
  getAuthorizationDetails: (id: string) => Promise<OAuthResult>;
  approveAuthorization: (id: string) => Promise<OAuthResult>;
  denyAuthorization: (id: string) => Promise<OAuthResult>;
};

const oauth = () =>
  (supabase.auth as unknown as { oauth: OAuthNamespace }).oauth;

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id:
      typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("authorization_id ausente");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      throw redirect({
        to: "/entrar",
        search: { redirect: location.pathname + location.searchStr },
      });
    }
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get(
      "authorization_id",
    )!;
    const { data, error } = await oauth().getAuthorizationDetails(authorizationId);
    if (error) throw error;
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-3 px-6">
      <h1 className="text-xl font-black uppercase tracking-tight text-foreground">
        Não foi possível carregar
      </h1>
      <p className="text-sm text-muted-foreground">
        {String((error as Error)?.message ?? error)}
      </p>
    </main>
  ),
});

const pill =
  "inline-flex items-center justify-center rounded-full px-5 h-11 text-[11px] font-black uppercase tracking-[0.12em] transition-colors disabled:opacity-50";

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clientName = details?.client?.name ?? "um aplicativo";

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const { data, error } = approve
      ? await oauth().approveAuthorization(authorization_id)
      : await oauth().denyAuthorization(authorization_id);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("O servidor de autorização não retornou um redirecionamento.");
      return;
    }
    window.location.href = target;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-black uppercase tracking-tight text-foreground">
          Conectar {clientName}
        </h1>
        <p className="text-sm text-muted-foreground">
          {clientName} poderá acessar seus projetos e sua biblioteca do Arq3D
          Studio agindo como você. Você pode revogar o acesso a qualquer momento.
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => decide(true)}
          className={`${pill} bg-primary text-primary-foreground hover:bg-primary/90`}
        >
          Autorizar
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => decide(false)}
          className={`${pill} border border-border text-foreground hover:bg-muted`}
        >
          Recusar
        </button>
      </div>
    </main>
  );
}
