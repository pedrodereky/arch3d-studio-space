import { createFileRoute } from "@tanstack/react-router";
import { Shield } from "lucide-react";
import { Placeholder } from "@/components/internal/Placeholder";

export const Route = createFileRoute("/_authenticated/admin/usuarios")({
  component: () => (
    <Placeholder title="Usuários" description="Gerencie acessos, papéis e planos." icon={Shield} />
  ),
});
