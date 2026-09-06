import { createFileRoute } from "@tanstack/react-router";
import { Shield } from "lucide-react";
import { Placeholder } from "@/components/internal/Placeholder";

export const Route = createFileRoute("/_authenticated/admin/configuracoes")({
  component: () => (
    <Placeholder
      title="Configurações da instância"
      description="Marca, domínio, integrações e modo de operação."
      icon={Shield}
    />
  ),
});
