# Backend Supabase — Arq3D Studio

## O schema ainda não está versionado

`supabase/migrations/` está vazio. Todo o schema — tabelas, enums, RLS,
funções, triggers, buckets — existe apenas no projeto remoto
(`edikojlhcttxbeskmehe`). Isso significa que hoje:

- não dá para recriar o ambiente do zero, nem para desenvolver local;
- as políticas de RLS não passam por code review, embora sejam a única coisa
  separando os dados de um usuário dos de outro;
- não há histórico de mudanças de schema.

Exportar isso exige credenciais do projeto, que não ficam no repositório. O
procedimento é o abaixo; rode uma vez e commite o resultado.

### Como exportar

```sh
# 1. CLI do Supabase (uma vez)
npm install -g supabase

# 2. Autenticar e vincular ao projeto
supabase login
supabase link --project-ref edikojlhcttxbeskmehe

# 3. Puxar o schema atual como migration inicial
supabase db pull

# 4. Conferir o que veio antes de commitar
git diff --stat supabase/migrations/
```

`supabase db pull` gera a migration a partir do banco remoto. Depois dela, toda
mudança de schema deve nascer como migration (`supabase migration new <nome>`)
em vez de ser aplicada direto no painel.

### O que precisa estar capturado

Confira a migration gerada contra esta lista antes de considerar o trabalho
feito — `db pull` cobre quase tudo, mas vale verificar:

**Tabelas**: `api_costs`, `generation_assets`, `generation_logs`, `generations`,
`instance_config`, `profiles`, `project_assets`, `projects`, `public_library`,
`studio_runs`, `studio_workflows`, `user_roles`.

**Enums**: `app_role`, `asset_type`, `generation_status`, `pipeline_type`.

**Funções**: `admin_secret_exists`, `admin_set_secret`, `get_shared_project`,
`has_role`, `mark_stuck_generations_failed`, `service_get_secret`.

**RLS**: as políticas de cada tabela. São a parte mais importante e a mais fácil
de passar despercebida. As telas de admin (`/admin/uso`, `/admin/usuarios`)
dependem de o admin conseguir ler `profiles`, `user_roles` e `api_costs` de
todos os usuários; se elas mostrarem erro de permissão, é aqui que se resolve.

**Buckets de storage**: `inputs`, `outputs`, `branding` — e as policies deles.

**Cron**: se o agendamento de `mark_stuck_generations_failed` for feito por
`pg_cron` em vez do endpoint HTTP (ver abaixo), ele também vive no banco.

## Credenciais das edge functions

Cada chave é lida de um lugar diferente, e isso determina onde ela precisa ser
cadastrada. `/admin/configuracoes` mostra esse estado em tempo real.

| Secret                     | Lida de              | Destrava                                                    |
| -------------------------- | -------------------- | ----------------------------------------------------------- |
| `REPLICATE_API_TOKEN`      | cofre (`getSecret`)  | Malhas 3D (Hunyuan), plantas 2D, vídeo POV                  |
| `GEMINI_API_KEY`           | cofre (`getSecret`)  | Preparo de imagem, extração de planta e cena                |
| `OPENAI_API_KEY`           | cofre ou env         | Redecorar, render de planta em alta qualidade               |
| `LOVABLE_API_KEY`          | env da edge function | Studio, refino de prompt, texturas PBR, análise de pranchas |
| `REPLICATE_WEBHOOK_SECRET` | env da edge function | Conclusão das gerações 3D                                   |

As duas últimas não passam pelo cofre: precisam ser cadastradas nos secrets das
edge functions no painel do Supabase. Sem `REPLICATE_WEBHOOK_SECRET` o webhook
rejeita toda chamada e **nenhuma geração 3D finaliza** — ela fica em
`processing` até o cron marcá-la como falha.

## verify_jwt

`replicate-webhook` está declarado em `config.toml` com `verify_jwt = false`
porque o Replicate chama sem JWT; a autenticação dele é a assinatura HMAC
verificada dentro da função.

As demais functions não estão declaradas: todas validam o caller por conta
própria (`getUserId`, mais 403 quando o recurso é de outro usuário). Antes de
ligar `verify_jwt` nelas, note que `studio-publish` chama
`orchestrate-generation` usando a service role key — se o projeto usar o
formato novo de chave (`sb_secret_…`, que não é um JWT), o gateway rejeitaria
essa chamada interna.

## Cron de gerações travadas

A rota `/api/cron/stuck-generations` (em `src/routes/api/cron/`) chama
`mark_stuck_generations_failed`. Ela existe mas **não se agenda sozinha**:
cadastre um schedule apontando para ela, de hora em hora ou diário, com o
header `Authorization: Bearer $LOVABLE_CRON_SECRET`. É idempotente.

Sem esse agendamento, uma geração que morre no meio do pipeline fica em
`processing` para sempre na biblioteca do usuário.
