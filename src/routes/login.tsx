import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>) => ({
    redirect: typeof s.redirect === "string" ? s.redirect : "/app",
  }),
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/entrar", search });
  },
});
