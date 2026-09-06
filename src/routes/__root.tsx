import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/lib/auth-context";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-black text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A página que você procura não existe ou foi movida.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-full bg-primary px-6 py-2 text-xs font-bold uppercase tracking-[0.12em] text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Voltar ao início
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Arq3D Studio — Da referência ao 3D em 60 segundos" },
      {
        name: "description",
        content:
          "Plataforma brasileira de IA 3D para arquitetos. Suba uma foto ou planta e receba modelos prontos para Lumion, SketchUp e Revit.",
      },
      { name: "author", content: "Arq3D Studio" },
      { property: "og:title", content: "Arq3D Studio — Da referência ao 3D em 60 segundos" },
      {
        property: "og:description",
        content:
          "Plataforma brasileira de IA 3D para arquitetos. Da referência ao modelo pronto em 60 segundos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "twitter:title", content: "Arq3D Studio — Da referência ao 3D em 60 segundos" },
      { name: "description", content: "Arq3D Studio generates 3D models from text or 2D images, offering realistic textures and furniture." },
      { property: "og:description", content: "Arq3D Studio generates 3D models from text or 2D images, offering realistic textures and furniture." },
      { name: "twitter:description", content: "Arq3D Studio generates 3D models from text or 2D images, offering realistic textures and furniture." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/7605fd76-cdcf-4093-bc2c-0c618489faae/id-preview-c1fd17f7--853a096e-caff-4593-84be-13443c2bc0f7.lovable.app-1778102748099.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/7605fd76-cdcf-4093-bc2c-0c618489faae/id-preview-c1fd17f7--853a096e-caff-4593-84be-13443c2bc0f7.lovable.app-1778102748099.png" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <AuthProvider>
      <Outlet />
      <Toaster />
    </AuthProvider>
  );
}
