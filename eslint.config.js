import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // design-system/ é um kit de referência versionado como documentação, não
  // código da aplicação. src/integrations/supabase é gerado — editá-lo para
  // agradar o lint seria desfeito na próxima geração.
  {
    ignores: ["dist", ".output", ".vinxi", "design-system", "src/integrations/supabase"],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  eslintPluginPrettier,
  // Edge functions rodam em Deno, fora do `include` do tsconfig — o tsc do
  // projeto não as cobre, e o que elas manipulam é payload JSON de API externa
  // (Replicate, OpenAI) e global de plataforma. Trocar esses `any` por tipos
  // inventados daria uma falsa sensação de garantia num código que este repo
  // não typecheca. O caminho certo é `deno check` na CI; até lá, a regra fica
  // desligada só aqui, e não no app.
  {
    files: ["supabase/functions/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      // @ts-ignore continua permitido nesses arquivos, mas só com justificativa.
      "@typescript-eslint/ban-ts-comment": ["error", { "ts-ignore": "allow-with-description" }],
    },
  },
);
