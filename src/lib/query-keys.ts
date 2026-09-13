/**
 * Chaves de query em um lugar só.
 *
 * Sem isso, invalidar vira adivinhação: quem escreve precisa saber exatamente
 * o array que quem lê usou. Cada chave começa pelo escopo, então
 * `invalidateQueries({ queryKey: qk.generations() })` alcança todas as
 * variantes daquele escopo.
 */
export const qk = {
  generations: () => ["generations"] as const,
  generationsList: (params: Record<string, unknown>) => ["generations", "list", params] as const,
  generation: (id: string) => ["generations", "detail", id] as const,

  projects: () => ["projects"] as const,
  projectsList: (userId: string | undefined) => ["projects", "list", userId] as const,
  project: (id: string) => ["projects", "detail", id] as const,

  profiles: () => ["profiles"] as const,
  profilesList: () => ["profiles", "list"] as const,

  apiCosts: (days: number) => ["api-costs", days] as const,
  pipelineCosts: (userId: string | undefined) => ["pipeline-costs", userId] as const,
  studioNodeCost: (userId: string | undefined) => ["studio-node-cost", userId] as const,
  userRoles: () => ["user-roles"] as const,

  instanceConfig: () => ["instance-config"] as const,
  secrets: () => ["secrets"] as const,

  studioWorkflows: (userId: string | undefined) => ["studio-workflows", userId] as const,
  studioRuns: (userId: string | undefined) => ["studio-runs", userId] as const,

  sharedProject: (token: string) => ["shared-project", token] as const,
} as const;
