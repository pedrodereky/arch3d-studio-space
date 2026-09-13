# Arq3D Studio

Crie um projeto em branco chamado Arq3D Studio

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/8956518d-6fec-432b-abf6-fed71ca8b04d).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

Checagens que a CI roda, e que valem antes de abrir um PR:

```sh
npx prettier --check .
npm run lint
npx tsc --noEmit
npm run build
```

### Lockfiles

O repositório carrega dois, e nenhum serve para uma instalação reproduzível
fora da Lovable:

- `package-lock.json` está defasado em relação ao `package.json` — não lista
  `@supabase/supabase-js`, `@xyflow/react` e outras dependências que o app
  importa. `npm ci` falha; `npm i` funciona porque resolve do `package.json`.
- `bun.lockb` fixa parte dos pacotes no registry privado da Lovable
  (`europe-west1-npm.pkg.dev/lovable-core-prod`), inacessível de fora — um
  runner público leva 403.

Por isso a CI usa `npm install` em vez de `npm ci`. Decidir um gerenciador
canônico e regerar o lockfile correspondente deixaria a instalação
reproduzível e a CI mais rápida, mas é uma escolha sobre como o projeto
sincroniza com a Lovable, não uma correção mecânica.

## Backend

O schema, as credenciais das edge functions e o agendamento de cron estão
documentados em [`supabase/README.md`](supabase/README.md).
