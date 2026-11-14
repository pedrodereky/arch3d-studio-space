# Arq3D Studio

**Da referência ao 3D pronto em 60 segundos.** Arquitetos e designers de interiores enviam uma foto, uma planta ou uma referência do Pinterest, e o Arq3D Studio devolve o modelo 3D pronto para usar no Lumion, no SketchUp ou no Revit.

## O que dá para fazer

| Fluxo           | Descrição                                                                                                               |
| --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Imagem → 3D** | Uma foto vira um modelo 3D. No modo _enriquecido_, a IA remove o fundo e gera vistas de vários ângulos antes de modelar |
| **Edita antes** | Muda cor, material ou tamanho do objeto antes de gerar o 3D                                                             |
| **Texto → 3D**  | Descreve o objeto e a IA cria o modelo do zero, sem imagem                                                              |
| **Planta**      | Analisa uma planta existente ou gera uma planta 2D a partir de um briefing                                              |
| **Redecorar**   | Redecora a foto de um ambiente e permite iterar sobre o resultado                                                       |
| **Studio**      | Detecta os móveis de uma cena e gera e publica cada um                                                                  |
| **Biblioteca**  | Reúne os modelos publicados, com busca no servidor e visualização 3D no navegador                                       |

Outros recursos:

- Exportação em **GLB, FBX, OBJ e DAE**: GLB para o Lumion; FBX para o SketchUp e o Revit
- Projetos para agrupar as gerações, com prévia lado a lado
- Busca global (paleta de comandos) sobre gerações, projetos, fluxos e telas
- Painel de custo medido por pipeline e de reaproveitamento de modelos
- Links públicos de compartilhamento, com cartão de prévia próprio para redes sociais
- As gerações são privadas por padrão e só aparecem na biblioteca se o usuário publicar

## Arquitetura

```
Navegador (TanStack Start + React)
   │
   ├── Supabase Auth / Postgres (RLS) / Storage
   │
   └── Edge Functions (Deno)
          ├── orchestrate-generation ──► Replicate (Hunyuan3D e outros modelos)
          │                               └── replicate-webhook (resultado assíncrono)
          ├── analyze-floorplan-vision / analyze-existing-floorplan ──► Gemini
          ├── generate-floorplan-2d, refine-text-prompt
          ├── redecorate-image / redecorate-iterate
          └── studio-detect-furniture / studio-execute / studio-publish
```

A geração 3D é assíncrona. O pedido vai para a Replicate, o webhook grava o resultado, e o banco limpa sozinho as gerações que ficaram travadas, com um job agendado por migration.

## Stack

| Camada    | Tecnologia                                                                                         |
| --------- | -------------------------------------------------------------------------------------------------- |
| Front-end | React 19, TanStack Start / Router / Query, Tailwind CSS 4, shadcn/ui, React Flow, `<model-viewer>` |
| Back-end  | Supabase: Postgres com RLS, Auth, Storage e Edge Functions em Deno                                 |
| IA        | Replicate (modelos 3D e de imagem) e Google Gemini (visão e texto)                                 |
| Deploy    | Cloudflare Workers                                                                                 |
| Qualidade | Vitest, ESLint, Prettier, `tsc` e `deno check` das Edge Functions na CI                            |

## Rodando localmente

```sh
npm install
npm run dev
```

Configure as variáveis do Supabase no front (`VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`) e os segredos das Edge Functions (`SUPABASE_SERVICE_ROLE_KEY`, `REPLICATE_WEBHOOK_SECRET`, `LOVABLE_API_KEY`, entre outros).

| Comando            | Descrição                   |
| ------------------ | --------------------------- |
| `npm run dev`      | Servidor de desenvolvimento |
| `npm run build`    | Build de produção           |
| `npm test`         | Testes (Vitest)             |
| `npm run lint`     | ESLint                      |
| `npm run format`   | Prettier                    |
| `npm run db:check` | Confere o dump do schema    |

## Design

- [`design/mockups/`](design/mockups): pranchas das direções de layout. A **Direção A, Ateliê,** é a aplicada no produto
