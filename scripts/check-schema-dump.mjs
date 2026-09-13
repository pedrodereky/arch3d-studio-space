#!/usr/bin/env node
/**
 * Confere se uma migration exportada do banco está completa.
 *
 * `supabase db pull` é o passo que este repositório não consegue executar
 * (o ambiente de CI/agente não alcança o projeto), então o risco é o dump sair
 * parcial e ninguém notar. Este script compara o SQL contra o inventário que o
 * types.ts gerado já conhece — tabelas, enums e funções — e avisa quando algo
 * esperado não aparece.
 *
 * Uso:  node scripts/check-schema-dump.mjs supabase/migrations/<arquivo>.sql
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const TYPES = "src/integrations/supabase/types.ts";
const MIGRATIONS_DIR = "supabase/migrations";

function inventory() {
  const src = readFileSync(TYPES, "utf8");

  const section = (name) => {
    const start = src.indexOf(`    ${name}: {`);
    if (start === -1) return "";
    // Até o próximo bloco de mesmo nível.
    const rest = src.slice(start + 1);
    const end = rest.search(/\n {4}\w+: \{/);
    return end === -1 ? rest : rest.slice(0, end);
  };

  const tables = [...section("Tables").matchAll(/\n {6}(\w+): \{/g)].map((m) => m[1]);
  const enums = [...section("Enums").matchAll(/\n {6}(\w+):/g)].map((m) => m[1]);
  const functions = [...section("Functions").matchAll(/\n {6}(\w+): (?:\{|\()/g)].map((m) => m[1]);
  return { tables, enums, functions };
}

/**
 * O schema mora na união dos arquivos, não no último.
 *
 * Antes isto pegava `files.sort().at(-1)` — a migração mais recente. Bastou
 * existir uma migração escrita à mão (o agendamento do pg_cron) para o script
 * conferir o inventário contra ELA e relatar "dump incompleto", como se o
 * `supabase db pull` tivesse falhado. O dump e as migrações posteriores
 * juntos é que descrevem o banco.
 */
function resolveTargets(arg) {
  if (arg) return [arg];
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  if (files.length === 0) {
    console.error(
      `Nenhum .sql em ${MIGRATIONS_DIR}/. Rode \`supabase db pull\` primeiro — ver supabase/README.md.`,
    );
    process.exit(1);
  }
  return files.map((f) => join(MIGRATIONS_DIR, f));
}

const targets = resolveTargets(process.argv[2]);
const sql = targets.map((t) => readFileSync(t, "utf8")).join("\n");
const { tables, enums, functions } = inventory();

const missing = {
  tabelas: tables.filter((t) => !new RegExp(`\\b${t}\\b`).test(sql)),
  enums: enums.filter((e) => !new RegExp(`\\b${e}\\b`).test(sql)),
  funções: functions.filter((f) => !new RegExp(`\\b${f}\\b`).test(sql)),
};

const policies = (sql.match(/CREATE POLICY/gi) ?? []).length;
const rlsEnabled = (sql.match(/ENABLE ROW LEVEL SECURITY/gi) ?? []).length;

console.log(`Conferindo ${targets.length} arquivo(s) em ${MIGRATIONS_DIR}/:`);
for (const t of targets) console.log(`  · ${t}`);
console.log("");
console.log(`  tabelas esperadas:  ${tables.length}`);
console.log(`  enums esperados:    ${enums.length}`);
console.log(`  funções esperadas:  ${functions.length}`);
console.log(`  CREATE POLICY:      ${policies}`);
console.log(`  RLS habilitado em:  ${rlsEnabled} tabela(s)\n`);

let failed = false;
for (const [label, items] of Object.entries(missing)) {
  if (items.length) {
    failed = true;
    console.error(`  FALTANDO (${label}): ${items.join(", ")}`);
  }
}

// RLS é o que separa os dados de um usuário dos de outro. Um dump sem política
// nenhuma quase certamente saiu incompleto.
if (policies === 0) {
  failed = true;
  console.error("  FALTANDO: nenhuma CREATE POLICY no dump — o RLS não veio junto.");
}
if (rlsEnabled === 0) {
  failed = true;
  console.error("  FALTANDO: nenhum ENABLE ROW LEVEL SECURITY no dump.");
}

if (failed) {
  console.error("\nDump incompleto. Confira o passo a passo em supabase/README.md.");
  process.exit(1);
}

console.log("  OK — o dump contém tudo que o types.ts conhece, e traz RLS.");
console.log("  Isto confere presença, não corretude: revise as políticas você mesmo.");
