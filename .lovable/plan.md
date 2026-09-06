## Contexto: o que já existe

O backend (`studio-execute`) **já sabe pular nós que tenham resultado salvo** em `studio_runs.node_results`. Ele só processa nós cujo resultado ainda não existe e cujas entradas já estão prontas. Ou seja, a infra de execução incremental existe.

O que **não existe** hoje:

1. Quando você clica em **Executar**, o frontend sempre cria um `studio_run` novo com `node_results: {}` — ou seja, parte do zero, mesmo que exista uma run anterior bem-sucedida do mesmo grafo.
2. O `runId` da última execução é perdido ao recarregar a página (vive só em `useState`).
3. Só existe **retry de um nó** (clicando no nó com erro), que limpa o nó + descendentes e reusa o mesmo `runId`. Não há "continuar a partir daqui" como ação intencional do usuário quando ele adiciona um passo novo.

Resultado prático: ao adicionar uma etapa nova no fim do fluxo, você re-executa (e re-paga) tudo desde o início.

## Objetivo

Quando o usuário adiciona/altera nós e clica em Executar, reaproveitar automaticamente os resultados dos nós que **não mudaram** e processar apenas o que é novo ou foi tocado. Também expor um controle manual "executar a partir deste nó".

## Plano

### 1. Persistir a última run do workflow

- Salvar `last_run_id` em `studio_workflows` (nova coluna `uuid nullable`), atualizado sempre que uma run termina (`succeeded` ou parcialmente).
- Ao abrir um workflow, carregar a última run e popular `node_results` no estado local → cada nó já aparece com seu `resultUrl` e status `done`.

### 2. Assinatura por nó (cache key)

Para decidir o que reaproveitar, calcular um hash determinístico por nó com base em:
- `op`, `model`, `prompt`, `quality`, demais params do nó;
- `storagePath` (para inputs);
- hashes dos nós de entrada (recursivo).

Guardar o hash junto com cada entrada em `node_results[nodeId].hash`. Na próxima execução, se o hash novo bate com o salvo, reaproveita; se não, invalida aquele nó **e todos os descendentes**.

### 3. Fluxo do botão Executar

Ao clicar em Executar:
1. Se existe `last_run_id` e o grafo atual é compatível, **reusar a mesma run** (UPDATE no `graph` + `node_results` filtrado pelos hashes válidos), em vez de criar uma nova.
2. Chamar `studio-execute` no loop normal — o backend só vai processar os nós sem resultado.
3. Mostrar na UI badges "reaproveitado" (cinza) vs "executado agora" (verde) para o usuário entender o que foi cobrado.

### 4. Ação manual "Executar a partir deste nó"

No menu de contexto do nó (mesmo lugar do retry hoje):
- **Executar a partir deste nó** → equivale ao retry atual: limpa o nó + descendentes e processa só esse trecho. Já funciona; só falta deixar exposto como ação intencional (hoje só aparece como "retry" depois de erro).

### 5. Indicadores na UI

- Selo "cache" no nó quando o resultado vem de run anterior.
- No header da run: "X de Y nós executados agora · Z reaproveitados · custo estimado $".

## Detalhes técnicos

- **Migration**: `alter table studio_workflows add column last_run_id uuid;` (sem FK para não engessar).
- **Hash**: `SHA-256(JSON.stringify({op, model, prompt, params, inputs: inputs.map(h)}))` — implementado em util compartilhada client+server.
- **Backend (`studio-execute/index.ts`)**: aceitar `node_results` populado vindo do request quando o cliente quiser semear (alternativa: cliente já faz UPDATE direto no row antes de invocar). Recomendado: cliente faz UPDATE → função roda como hoje.
- **Carregamento do workflow** (`studio.tsx`): após buscar `studio_workflows`, buscar `studio_runs` por `id = last_run_id`, hidratar `node.data.resultUrl` e `node.data.status = "done"` quando há `node_results[n.id].url`.
- **Retry/Continuar**: unificar `retryNode` e "continuar a partir daqui" no mesmo handler com label diferente.

## Fora de escopo

- Versionamento histórico de runs (manter só a última como cache; runs antigas continuam acessíveis pelo `studio_runs` mas não são reaproveitadas).
- Cache compartilhado entre workflows.
- Edição de prompt invalidando "parcialmente" um nó (qualquer mudança nos params invalida o nó inteiro + descendentes).
