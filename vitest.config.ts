import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Config própria, sem tocar no vite.config.ts.
 *
 * Aquele arquivo é um wrapper do @lovable.dev/vite-tanstack-config com aviso
 * explícito de não acrescentar plugins à mão. Um config separado deixa os
 * testes isolados do build do app: mexer aqui não tem como quebrar o que vai
 * para produção.
 */
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    // Só o que escrevemos. Sem isto o vitest varreria .output/ e design/.
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "node",
  },
});
