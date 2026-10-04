import { PIPELINE_LABEL, type PipelineType } from "@/lib/pipeline-labels";

/**
 * Normaliza o termo antes de montar um filtro do PostgREST.
 *
 * O `.or()` do PostgREST é uma string onde vírgula e parêntese são SINTAXE: um
 * termo com vírgula viraria dois filtros, e um com parêntese quebraria a query
 * inteira. Reduzir o termo ao que pode aparecer cru é o que mantém a busca
 * previsível — e é a razão de isto ter teste.
 */
export function sanitizeSearchTerm(term: string): string {
  return term.replace(/[^\p{L}\p{N}\s@.\-_]/gu, " ").trim();
}

/** Minúscula e sem acento: ninguém digita "análise" com o acento na pressa. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * Casa se uma string contém a outra, ou se compartilham um prefixo longo.
 *
 * O prefixo é o que resolve flexão: a barra lateral diz "Redecorar" e o rótulo
 * do pipeline é "Redecoração" — nenhum contém o outro, mas os dois começam com
 * "redecora". Cinco caracteres é o piso que aceita isso sem casar "plano" com
 * "planta", que dividem só quatro.
 */
const MIN_PREFIX = 5;

function related(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a.includes(b) || b.includes(a)) return true;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i >= MIN_PREFIX;
}

/**
 * Pipelines cujo RÓTULO casa com o termo.
 *
 * Quem busca digita o que a interface mostra, não o valor do enum. Compara
 * palavra a palavra do rótulo, para "planta" achar "Render de planta" sem
 * depender de onde a palavra cai.
 */
export function pipelinesMatchingLabel(term: string): PipelineType[] {
  const q = normalize(term);
  if (!q) return [];
  return (Object.entries(PIPELINE_LABEL) as [PipelineType, string][])
    .filter(([, label]) => {
      const n = normalize(label);
      if (related(n, q)) return true;
      return n.split(/[^a-z0-9]+/).some((word) => related(word, q));
    })
    .map(([id]) => id);
}
