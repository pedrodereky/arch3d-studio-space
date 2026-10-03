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
