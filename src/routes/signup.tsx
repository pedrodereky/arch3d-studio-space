import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/signup")({
  validateSearch: (s: Record<string, unknown>) => ({
    redirect: typeof s.redirect === "string" ? s.redirect : "/app",
  }),
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/cadastrar", search });
  },
});
