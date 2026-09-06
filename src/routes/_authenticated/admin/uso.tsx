import { createFileRoute } from "@tanstack/react-router";
import { Shield } from "lucide-react";
import { Placeholder } from "@/components/internal/Placeholder";

export const Route = createFileRoute("/_authenticated/admin/uso")({
  component: () => (
    <Placeholder
      title="Uso e custos"
      description="Consumo de créditos e custos de API por usuário."
      icon={Shield}
    />
  ),
});
