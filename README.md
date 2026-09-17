# Estoque IA

SaaS multi-tenant de gestão comercial: estoque, catálogo, CRM, atendimento via WhatsApp, venda assistida por IA, reservas, vendas, pagamentos e administração da plataforma.

**Um código · uma aplicação · um deploy · vários tenants.** Diferenças entre empresas acontecem por configuração, plano, permissões e feature flags — nunca por cópias do código.

> Status: **Fase 1 concluída** (fundação, Design System, auth, tenants, RBAC, RLS, AppShell e base do Super Admin). Veja [Roadmap](#roadmap).

---

## Sumário

- [Arquitetura](#arquitetura)
- [Multi-tenant e RLS](#multi-tenant-e-rls)
- [Instalação](#instalação)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Supabase](#supabase)
- [Migrations e tipos](#migrations-e-tipos)
- [Seed de desenvolvimento](#seed-de-desenvolvimento)
- [Testes](#testes)
- [Design System](#design-system)
- [Produção em VPS (sem Docker)](#produção-em-vps-sem-docker)
- [WhatsApp, IA e pagamentos](#whatsapp-ia-e-pagamentos)
- [Troubleshooting](#troubleshooting)
- [Roadmap](#roadmap)

---

## Arquitetura

```
/
├── apps/web/                     Next.js 16 (App Router) · React 19 · Tailwind v4 · shadcn/ui
│   └── src/
│       ├── app/                  Rotas
│       │   ├── (auth)/           /login /cadastro /recuperar-senha /redefinir-senha
│       │   ├── auth/confirm/     Confirmação de links de e-mail
│       │   ├── onboarding/       Criar empresa · aceitar convites
│       │   ├── app/              Painel da empresa (/app/*)
│       │   ├── admin/            Administração da plataforma (/admin/*)
│       │   └── design-system/    Referência visual (dev)
│       ├── components/           ui/ (primitivos) · layout/ · data/ · forms/ · feedback/
│       ├── domains/              Regras por domínio: auth, tenants, users, profile, admin…
│       │   └── <domínio>/        schemas.ts (Zod) · queries.ts (leitura) · actions.ts (Server Actions) · components/
│       ├── lib/                  supabase/ · env · logger · errors · permissions · routes · format
│       ├── proxy.ts              Sessão, x-request-id, redirecionamento otimista
│       └── types/database.types.ts  Gerado a partir das migrations
├── packages/database/            Testes de banco (Postgres embutido), gerador de tipos, seed, scripts
├── supabase/                     config.toml · migrations/
├── services/                     (Fase 6) serviço WhatsApp isolado
└── deploy/                       PM2 + Nginx para VPS
```

**Princípios**

- **Regras críticas no banco/servidor.** Estoque, permissões, tenant, reservas, vendas e pagamentos são garantidos por RLS, constraints e funções SQL transacionais — nunca só pelo frontend.
- **Data Access Layer.** Server Components e Server Actions usam `domains/*/queries.ts` e `actions.ts`, que retornam DTOs mínimos. Toda Server Action revalida sessão e permissão.
- **Erros sem vazamento.** RPCs lançam códigos estáveis (`forbidden`, `last_owner`…) traduzidos em `lib/errors.ts`. Detalhes do Postgres nunca chegam à UI.
- **Logs estruturados** (`lib/logger.ts`): JSON por linha com `event`, `tenant_id`, `user_id`, `status`, `request_id`; chaves sensíveis são mascaradas.
- **Auditoria append-only** (`audit_logs`, `platform_audit_logs`): gravada por funções/triggers no banco, com `request_id` propagado do proxy.

## Multi-tenant e RLS

Banco e schema compartilhados, `tenant_id` em todo dado de empresa e **Row Level Security** em todas as tabelas.

| Peça                                    | Papel                                                                                           |
| --------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `private.user_tenant_ids()`             | Tenants com associação **ativa** (tenant `CANCELED` fica inacessível)                           |
| `private.tenant_ids_with_permission(p)` | Tenants onde o usuário tem a permissão `p` (exige tenant `ACTIVE` → suspenso = somente leitura) |
| `private.is_super_admin()`              | Consulta `platform_admins` (sem nenhuma policy de escrita)                                      |
| Policies                                | `tenant_id in (select private.user_tenant_ids())` — avaliado uma vez por query                  |

- O schema `private` **não é exposto** pela API. Funções `SECURITY DEFINER` sempre com `search_path` fixo.
- O tenant ativo vem de um cookie, mas é só **preferência**: a associação é relida do banco em toda requisição.
- Escritas em `tenant_users` só por RPCs (`invite_tenant_user`, `update_tenant_user_role`…), que validam hierarquia de papéis, impedem auto-alteração e garantem pelo menos um `OWNER` (serializado por lock).
- **SUPER_ADMIN** fica fora do RBAC do tenant. Vê tabelas de plataforma e agregados via RPCs `admin_*`, **sem** leitura livre de dados comerciais. Só a secret key concede o papel (`pnpm admin:grant`).
- Testes-guarda falham se uma migration criar tabela sem RLS, tabela com `tenant_id` sem policy, função executável por `anon` ou `SECURITY DEFINER` sem `search_path`.

**Papéis:** `OWNER` (40) · `ADMIN` (30) · `GERENTE` (20) · `VENDEDOR` (10). Permissões ficam em `permissions`/`role_permissions` e cada módulo adiciona as suas em sua migration.

## Instalação

Requisitos: **Node.js ≥ 20.9** (recomendado 22), **pnpm 11**, conta no **Supabase Cloud**.

```bash
pnpm install
cp .env.example apps/web/.env.local   # preencha as chaves do Supabase
pnpm db:push                          # aplica migrations no projeto linkado (ver abaixo)
pnpm dev                              # http://localhost:3000
```

> **OneDrive/Dropbox:** evite manter o projeto em pasta sincronizada — `node_modules` e `.next` geram milhares de arquivos e deixam tudo lento. Prefira algo como `C:\dev\estoque-ia`.

## Variáveis de ambiente

Veja [`.env.example`](.env.example).

| Variável                               | Onde         | Descrição                                                                           |
| -------------------------------------- | ------------ | ----------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | público      | URL do projeto                                                                      |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | público      | Chave publicável (`sb_publishable_…`); RLS protege os dados                         |
| `SUPABASE_SECRET_KEY`                  | **servidor** | Chave secreta (`sb_secret_…`). Usada só para Admin API do Auth (convites) e scripts |
| `NEXT_PUBLIC_APP_URL`                  | público      | URL pública usada em links de e-mail                                                |
| `LOG_LEVEL`                            | servidor     | `debug` · `info` · `warn` · `error`                                                 |
| `ENABLE_DESIGN_SYSTEM_PAGE`            | servidor     | Libera `/design-system` em produção                                                 |
| `SEED_DEV_PASSWORD`                    | dev          | Senha das contas fictícias do seed                                                  |

Variáveis `NEXT_PUBLIC_*` são embutidas no bundle **no build** — faça o build com elas definidas.

## Supabase

1. Crie o projeto em [supabase.com](https://supabase.com) (região São Paulo recomendada).
2. **API Keys:** copie a publishable e a secret key para `apps/web/.env.local`.
3. **Link do CLI** (não requer Docker):
   ```bash
   pnpm exec supabase login
   pnpm exec supabase link --project-ref SEU_PROJECT_REF
   ```
4. **Authentication → URL Configuration:** `Site URL` = sua URL pública; em _Redirect URLs_ adicione `http://localhost:3000/**` e a URL de produção.
5. **Authentication → Providers → Email:** mantenha _Confirm email_ ligado em produção. Senha mínima 8, letras e dígitos.
6. **Email Templates** (fluxo `token_hash`, recomendado para SSR — funciona mesmo abrindo o link em outro dispositivo):

   | Template       | Link                                                                                          |
   | -------------- | --------------------------------------------------------------------------------------------- |
   | Confirm signup | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/onboarding`         |
   | Invite user    | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/redefinir-senha`   |
   | Reset password | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/redefinir-senha` |
   | Change email   | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change`                   |

7. **SMTP próprio** (Authentication → SMTP) em produção — o SMTP padrão do Supabase tem limite baixo de envios.
8. Primeiro Super Admin: crie a conta pelo `/cadastro` e rode `pnpm admin:grant -- voce@empresa.com "fundador"`.

## Migrations e tipos

- Migrations em `supabase/migrations/` (SQL puro, ordenadas por timestamp).
- Aplicar no projeto linkado: `pnpm db:push`.
- Tipos TypeScript: `pnpm db:types` — sobe um Postgres embutido, aplica as migrations e gera `apps/web/src/types/database.types.ts` no formato do `supabase gen types` (**sem Docker**). Com o projeto linkado, o gerador oficial também funciona: `pnpm exec supabase gen types typescript --linked --schema public`.
- **Regra:** nenhuma tabela com dados de empresa sem `tenant_id` + RLS + policy. Os testes-guarda bloqueiam.

## Seed de desenvolvimento

```bash
# em apps/web/.env.local: SEED_DEV_PASSWORD=algumaSenha123
pnpm seed:dev -- --confirm
```

Cria a empresa fictícia **Gorila Suplementos** com um usuário por papel (`owner@gorila.dev`, `admin@`, `gerente@`, `vendedor@`), usando os mesmos fluxos da aplicação (RPCs com a identidade de cada usuário). Recusa execução com `NODE_ENV=production`. Produtos, estoque, clientes, conversas, reservas e vendas entram no seed junto com seus módulos. **Nunca dependa do seed em produção.**

## Testes

```bash
pnpm test        # tudo
pnpm test:db     # banco: RLS, RBAC, concorrência, guardas de schema
pnpm check       # formatação + typecheck + lint + testes
```

- **Banco (`packages/database`)**: Postgres 17 **real** embutido (`embedded-postgres`, sem Docker), com um shim do ambiente Supabase (roles `anon`/`authenticated`/`service_role`, `auth.uid()`, default privileges). Cada arquivo de teste recebe um banco clonado do template migrado. As sessões simulam exatamente o PostgREST (`set role` + `request.jwt.claims`).
  - isolamento entre tenants, colunas protegidas, SUPER_ADMIN não concedível pela API
  - convites, hierarquia de papéis, auto-alteração, remoção/desativação
  - concorrência: dois OWNERs rebaixando um ao outro simultaneamente → sempre resta um
  - auditoria append-only e trilha da plataforma
- **Aplicação (`apps/web`)**: Vitest para regras puras — proteção de open redirect, CPF/CNPJ, schemas Zod, tradução de erros, catálogo de permissões sincronizado com as migrations, navegação por permissão.

## Design System

- Tokens em `apps/web/src/app/globals.css` (claro/escuro, semânticas, marca, tipografia, raios). Componentes nunca usam hex direto.
- Referência viva: **`/design-system`** (dev; em produção só com `ENABLE_DESIGN_SYSTEM_PAGE=true`).
- Componentes base: `AppShell`, `Sidebar` (recolhível, sheet no mobile), `Topbar`, `PageHeader`, `PageContainer`, `DataTable` (busca/filtros/ordenação/paginação via URL), `MetricCard`, `MoneyValue`, `PercentageChange`, `StatusBadge`, `EmptyState`, `Timeline`, `KanbanCard`, `CommandPalette` (Ctrl+K), `TextField`, `SelectField`.
- Tema Sistema/Claro/Escuro persistido. Acessibilidade: foco visível, labels e `aria-*` ligados, skip link, status nunca só por cor.

## Produção em VPS (sem Docker)

Alvo: Ubuntu 22.04/24.04 LTS, 2 vCPU / 4 GB RAM (mínimo recomendado com o serviço WhatsApp).

```bash
# 1. Dependências do sistema
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs nginx
sudo corepack enable && corepack prepare pnpm@11.0.8 --activate
sudo npm i -g pm2

# 2. Usuário e código
sudo adduser --system --group --home /opt/estoque-ia estoque
sudo -u estoque git clone <repo> /opt/estoque-ia/app && cd /opt/estoque-ia/app

# 3. Segredos (fora do repositório)
sudo mkdir -p /etc/estoque-ia && sudo cp .env.example /etc/estoque-ia/web.env
sudo chown root:estoque /etc/estoque-ia/web.env && sudo chmod 640 /etc/estoque-ia/web.env
sudo nano /etc/estoque-ia/web.env    # NODE_ENV não é necessário aqui

# 4. Build (NEXT_PUBLIC_* precisam existir no build)
pnpm install --frozen-lockfile
set -a && . /etc/estoque-ia/web.env && set +a && pnpm build

# 5. Processo
pm2 start deploy/ecosystem.config.cjs --env production
pm2 save && pm2 startup systemd

# 6. Nginx + TLS
sudo cp deploy/nginx/estoque-ia-proxy.conf /etc/nginx/snippets/
sudo cp deploy/nginx/estoque-ia.conf /etc/nginx/sites-available/ && sudo ln -s ../sites-available/estoque-ia.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d app.seudominio.com.br
```

**Atualização (todas as empresas recebem a nova versão juntas):**

```bash
git pull && pnpm install --frozen-lockfile
pnpm db:push                                     # migrations primeiro (compatíveis com a versão anterior)
set -a && . /etc/estoque-ia/web.env && set +a && pnpm build
pm2 reload estoque-ia-web
```

- Next escuta apenas em `127.0.0.1:3000`; só o Nginx é exposto (firewall: `ufw allow 'Nginx Full' && ufw allow OpenSSH && ufw enable`).
- O Nginx precisa repassar `Host`/`X-Forwarded-*` (Server Actions validam Origin × Host) e `X-Request-Id`.
- Logs: `pm2 logs estoque-ia-web` (JSON por linha). Rotação: `pm2 install pm2-logrotate`.

## WhatsApp, IA e pagamentos

Ainda não implementados — entram nas Fases 5 a 7, sempre atrás de interfaces (`WhatsAppProvider`, `AIProvider`, `PaymentProvider`). Sem credenciais, haverá providers **DEV claramente identificados** na UI; mocks nunca serão apresentados como integração real. O serviço WhatsApp (whatsapp-web.js + Chromium) rodará como **processo PM2 separado**, para que uma sessão travada não derrube estoque, CRM ou vendas. Na VPS: `sudo apt-get install -y chromium` (ou as libs do Puppeteer).

## Troubleshooting

| Sintoma                                      | Causa provável                                                                                       |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `Configuração pública inválida`              | `apps/web/.env.local` ausente ou incompleto                                                          |
| Login funciona mas volta ao `/login`         | `NEXT_PUBLIC_SUPABASE_URL` diferente do projeto das chaves, ou cookies bloqueados por domínio        |
| Link de e-mail cai em "link inválido"        | Template sem `token_hash`, link expirado ou URL não listada em _Redirect URLs_                       |
| Convite não chega                            | SMTP padrão do Supabase com limite atingido — configure SMTP próprio                                 |
| `Invalid Server Actions request` em produção | Nginx sem `proxy_set_header Host $host` / `X-Forwarded-Host`                                         |
| `pnpm test:db` falha ao iniciar Postgres     | Porta bloqueada por antivírus ou diretório temporário sem permissão; tente `DEBUG_PG=1 pnpm test:db` |
| Scripts de build ignorados pelo pnpm         | Aprove em `pnpm-workspace.yaml` → `allowBuilds`                                                      |

## Roadmap

| Fase | Escopo                                                                                                                                    | Status     |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1    | Fundação, Design System, auth, tenants, RBAC, RLS, AppShell, Super Admin base                                                             | ✅         |
| 2    | Categorias, marcas, fornecedores, produtos, variantes, atributos, nutrição, alérgenos (TRUE/FALSE/UNKNOWN), estoque, lotes, movimentações | ⏭️ próxima |
| 3    | Clientes, CRM, timeline, ProductCompatibilityEngine, busca estruturada, recomendação                                                      |            |
| 4    | Reservas, pedidos, vendas, PDV, concorrência e transações                                                                                 |            |
| 5    | Pagamentos (PaymentProvider, webhooks idempotentes), financeiro                                                                           |            |
| 6    | Serviço WhatsApp, sessões/QR, inbox, handoff humano                                                                                       |            |
| 7    | AIProvider, tools controladas, estado conversacional, venda assistida, custos                                                             |            |
| 8    | Dashboards, relatórios, inteligência comercial, notificações, jobs                                                                        |            |
| 9    | Planos, assinaturas, feature flags, Super Admin completo, saúde, impersonation                                                            |            |
| 10   | Hardening (CSP com nonce, rate limiting), performance, observabilidade, polish                                                            |            |
