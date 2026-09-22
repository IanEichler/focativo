# Estoque IA

SaaS multi-tenant de gestão comercial: estoque, catálogo, CRM, atendimento via WhatsApp, venda assistida por IA, reservas, vendas, pagamentos e administração da plataforma.

**Um código · uma aplicação · um deploy · vários tenants.** Diferenças entre empresas acontecem por configuração, plano, permissões e feature flags — nunca por cópias do código.

> Status: **Fases 1 a 8 concluídas** (fundação/auth/tenants/RBAC/RLS/Super Admin + catálogo, variantes, atributos dinâmicos, alérgenos, nutrição, estoque e lotes com FEFO + clientes, CRM Kanban, timeline, ProductCompatibilityEngine e busca estruturada/recomendação + reservas, vendas/PDV, cancelamento com estorno e concorrência testada + pagamentos com PaymentProvider, webhook real com assinatura HMAC e financeiro operacional básico + inbox de WhatsApp com conversas/handoff humano, `WhatsAppProvider` e o serviço `services/whatsapp` (whatsapp-web.js) pronto para conectar + assistente de IA com `AIProvider`, tools controladas (buscar produto, criar reserva, escalar para humano), estado conversacional e custo por tenant + tenants de **varejo ou serviços** com módulos habilitáveis por tenant (`tenant_module_flags`), Agenda de serviços/profissionais/agendamentos para tenants de serviço, e administração de tenants/usuários/módulos ampliada no Super Admin + dashboard e relatórios com indicadores comerciais reais (faturamento, ticket médio, produtos e clientes campeões, funil de CRM, resumo da agenda), sino de notificações operacionais e um processo de jobs em segundo plano). Verificado de ponta a ponta contra um projeto Supabase Cloud real. Veja [Roadmap](#roadmap).

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
- [WhatsApp, IA, pagamentos e jobs](#whatsapp-ia-pagamentos-e-jobs)
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
├── services/                     whatsapp/ (Fase 6) · jobs/ (Fase 8) — processos isolados
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
| `PAYMENT_WEBHOOK_SECRET`               | **servidor** | HMAC de `/api/webhooks/payments` (Fase 5). Gere com `openssl rand -hex 32`          |
| `WHATSAPP_SERVICE_URL`                 | servidor     | URL de `services/whatsapp` (Fase 6). Vazio → provider DEV (sem WhatsApp real)       |
| `WHATSAPP_SERVICE_SECRET`              | **servidor** | HMAC entre o app e `services/whatsapp` (Fase 6). Gere com `openssl rand -hex 32`    |
| `ANTHROPIC_API_KEY`                    | **servidor** | Chave da API da Anthropic (Fase 7). Vazio → provider DEV (sem custo, sem IA real)   |
| `JOBS_INTERVAL_MINUTES`                | servidor     | Intervalo (minutos) entre varreduras de `services/jobs` (Fase 8). Padrão: `5`       |

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

> **Alternativa 100% local (opcional, requer Docker):** para testar contra Postgres/Auth/Storage reais sem depender do Cloud, `pnpm exec supabase start` sobe uma stack local completa (`supabase db reset` aplica as migrations). Isso é só uma conveniência de desenvolvimento — a arquitetura do produto e o deploy em produção continuam sem Docker (veja [Produção em VPS](#produção-em-vps-sem-docker)).
>
> No Windows, `pnpm seed:dev` e `pnpm admin:grant` podem imprimir o resultado com sucesso e em seguida travar com uma falha nativa do `tsx`/Node ao encerrar (ver [Troubleshooting](#troubleshooting)) — não afeta o resultado.

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

Cria a empresa fictícia **Gorila Suplementos** com um usuário por papel (`owner@gorila.dev`, `admin@`, `gerente@`, `vendedor@`), um catálogo de 5 produtos com estoque/lotes, 4 clientes com uma oportunidade cada (etapas "novo", "interessado", "vendido" e "perdido", exercitando a timeline e o CRM — Fase 3), reservas pendentes + vendas já concluídas (uma delas com desconto — Fase 4), o assistente de IA já ligado com um prompt de exemplo (Fase 7) e uma conta de WhatsApp conectada (provider DEV) com uma conversa de exemplo (mensagem recebida + resposta enviada — Fase 6), usando os mesmos fluxos da aplicação (RPCs com a identidade de cada usuário). Recusa execução com `NODE_ENV=production`. **Nunca dependa do seed em produção.**

## Testes

```bash
pnpm test        # tudo
pnpm test:db     # banco: RLS, RBAC, concorrência, guardas de schema
pnpm check       # formatação + typecheck + lint + testes
```

- **Banco (`packages/database`)**: Postgres 17 **real** embutido (`embedded-postgres`, sem Docker), com um shim do ambiente Supabase (roles `anon`/`authenticated`/`service_role`, `auth.uid()`, schema `storage` mínimo, default privileges). Cada arquivo de teste recebe um banco clonado do template migrado. As sessões simulam exatamente o PostgREST (`set role` + `request.jwt.claims`).
  - isolamento entre tenants, colunas protegidas, SUPER_ADMIN não concedível pela API
  - convites, hierarquia de papéis, auto-alteração, remoção/desativação
  - concorrência: dois OWNERs rebaixando um ao outro simultaneamente → sempre resta um; dez perdas de estoque disputando as últimas unidades → nunca vende mais do que existe
  - auditoria append-only e trilha da plataforma
  - catálogo: hierarquia de categorias (ciclos, profundidade), SKU/código de barras únicos por tenant, preços efetivos com herança produto→variante, arquivamento automático da variante "Padrão" não utilizada
  - características: alérgenos TRUE/FALSE/UNKNOWN (nunca "sem X" por omissão), tabela nutricional (nutriente ausente ≠ zero), atributos dinâmicos tipados
  - estoque: idempotência de movimentações, FEFO em perdas e vendas, lotes vencidos ignorados na saída, políticas de Storage do bucket de imagens
  - clientes: contato obrigatório, unicidade de WhatsApp por tenant (liberado ao arquivar), isolamento entre tenants, `customer_stats` (Fase 4: gasto total/nº de compras/ticket médio reais, ignorando vendas canceladas)
  - CRM: etapas padrão semeadas por tenant, criação/edição/movimentação de oportunidades, `won_at`/`lost_at`/motivo de perda, timeline emitida a cada transição, tabelas de oportunidade só graváveis via RPC
  - ProductCompatibilityEngine: os três estados do exemplo do escopo (contém → INCOMPATIBLE, sem → COMPATIBLE, não informado → UNKNOWN), status agregado pela pior evidência, atributos só contam quando `is_compatibility_enabled`
  - busca estruturada: filtros de texto/categoria/marca/preço/estoque combinados, ranking (compatível primeiro, depois disponibilidade/preferência/preço), paginação com `total_count` estável
  - reservas: reservar aumenta `reserved_quantity` sem tocar `physical_quantity`, preço travado no momento da reserva (nunca confia no cliente), idempotência, fluxo PENDING→CONFIRMED→AWAITING_PICKUP com transições inválidas rejeitadas, cancelamento libera estoque, conclusão vira venda consumindo a reserva exatamente uma vez, varredura de expiração
  - vendas (PDV): preço/custo sempre resolvidos no servidor, item duplicado no carrinho rejeitado, desconto exige `sales.discount`, FEFO respeitado, idempotência, cancelamento estorna via `RETURN` **para o(s) lote(s) exato(s) de origem** (bug pego ao vivo — veja abaixo), integração com CRM (venda linkada a uma oportunidade move para a etapa de ganho)
  - concorrência (seção 28 do escopo, cenário literal "estoque = 1, dois clientes disputando"): reserva-vs-reserva, reserva-vs-venda e vendas concorrentes — sempre serializadas pelo lock em `stock_levels` dentro de `apply_stock_movement`; nunca vende ou reserva mais do que existe
  - pagamentos: valor da cobrança sempre calculado a partir da reserva (nunca aceito do cliente), confirmação pelo caminho autenticado E pelo caminho de webhook (`auth.uid()` nulo, mesma condição do service role), **idempotência real de webhook** — confirmar a mesma cobrança 3x ou 2x concorrentemente nunca duplica a venda nem a movimentação de estoque (seção 46 do escopo, testado literalmente), transições inválidas rejeitadas (confirmar cobrança falha, falhar cobrança confirmada), `financial.read` como permissão própria (VENDEDOR tem `sales.read` mas não vê o financeiro agregado)
  - financeiro: `financial_summary`/`sales_receivables` agregando receita/recebido/pendente/contas a receber a partir de `sales` (sem tabela de razão duplicada), ignorando vendas canceladas
  - WhatsApp/inbox (Fase 6): mensagem de número desconhecido cria cliente + conversa automaticamente; conversa é sempre uma só por cliente (nunca uma por mensagem), com contagem de não lidas acumulando; idempotência por `external_message_id` (reentrega do serviço nunca duplica mensagem nem incrementa não lidas de novo); ciclo completo de handoff humano (`AI_ACTIVE` ⇄ `HUMAN_ACTIVE` ⇄ `PAUSED`) com timeline emitida a cada transição; tabelas graváveis só via RPC/webhook (nenhuma escrita direta autenticada)
  - IA (Fase 7): `tenant_ai_settings` liga/desliga por tenant e é OWNER/ADMIN-only; conversa nova nasce `AI_ACTIVE` só quando o tenant tem a IA ligada, sem nunca mexer no status de uma conversa já existente; as três ações da IA (`ai_message_send`, `ai_reservation_create`, `ai_escalate_conversation`) exigem `auth.uid()` nulo (só o caminho de serviço — um usuário autenticado nunca as chama) e confirmam `tenant_ai_settings.enabled`; `ai_reservation_create` trava o preço no servidor e reserva estoque de verdade, igual a `reservation_create`, só que atribuída a `origin = 'ai'`; `ai_usage_events` é append-only e só visível com `financial.read` (mesma regra do financeiro); regressão para um bug real (abaixo) onde a tool de busca da IA, rodando como service_role, esbarrava numa função sem esse grant.
  - Relatórios e jobs (Fase 8): `report_sales_by_day`/`report_top_products`/`report_top_customers`/`report_crm_funnel`/`report_agenda_summary` exigem `financial.read` (mesmo nível do Financeiro) e ignoram vendas canceladas; `reservations_expire_due_sweep` (só service_role, `auth.uid()` precisa ser nulo) expira reservas vencidas em **todos os tenants de uma vez**, testado com dois tenants simultâneos para garantir que a varredura não vaza dados nem estoque de um tenant para o outro.
- **Aplicação (`apps/web`)**: Vitest para regras puras — proteção de open redirect, CPF/CNPJ, schemas Zod (incluindo números em formato brasileiro, o parsing de produtos vinculados a uma oportunidade, o carrinho de vendas/reservas, o formulário de envio/simulação de mensagem do WhatsApp e as configurações da IA), tradução de erros, catálogo de permissões sincronizado com as migrations, navegação por permissão, regras de exibição de alérgenos/características, assinatura/verificação HMAC compartilhada entre os webhooks de pagamentos e WhatsApp, e a extração de termo de busca do `DevAIProvider`.
- **Ponta a ponta (manual, contra Supabase Cloud real)**: login por papel, catálogo, características, estoque/lotes/alertas, cadastros, upload de imagem no Storage, clientes/timeline, Kanban do CRM (drag-and-drop real e diálogo de motivo de perda), o seletor de produtos com o ProductCompatibilityEngine, o PDV (criar e cancelar venda de ponta a ponta), a conversão de reserva em venda e o **fluxo completo de pagamento** (gerar cobrança PIX → simular confirmação via uma requisição HTTP real e assinada para `/api/webhooks/payments` → reserva vira venda; e o caminho de recusa) foram verificados com Playwright contra o projeto Supabase Cloud do time — não apenas contra o stack local. Essa verificação pegou dois bugs reais que a suíte local não cobria: um parâmetro `jsonb` da busca estruturada sendo serializado duas vezes ao chamar a RPC (Fase 3), e `sale_cancel` falhando com `lot_required` ao estornar a venda de um produto com controle de lote (Fase 4, corrigido com uma migration nova já que a anterior tinha sido aplicada). Ambos ganharam teste de regressão. Sem navegador disponível nas Fases 6-7, os pipelines de webhook foram verificados com requisições HTTP reais e assinadas contra o projeto Cloud, com o resultado sempre conferido direto no banco (não só pelo código de resposta): na Fase 6, evento `message` cria cliente/conversa e é idempotente por `external_message_id`, evento `qr` atualiza `whatsapp_accounts`; na Fase 7, uma mensagem real disparou o agente, que chamou a tool de busca, encontrou o produto certo no catálogo semeado e respondeu automaticamente pelo WhatsApp — o que revelou um bug real (`private.search_normalize` só tinha `EXECUTE` para `authenticated`, nunca para `service_role`, porque nenhuma chamada anterior ao catálogo tinha vindo de um contexto sem sessão de usuário), corrigido numa migration nova e coberto por um teste de regressão.

## Design System

- Tokens em `apps/web/src/app/globals.css` (claro/escuro, semânticas, marca, tipografia, raios). Componentes nunca usam hex direto.
- Referência viva: **`/design-system`** (dev; em produção só com `ENABLE_DESIGN_SYSTEM_PAGE=true`).
- Componentes base: `AppShell`, `Sidebar` (recolhível, sheet no mobile), `Topbar`, `PageHeader`, `PageContainer`, `DataTable` (busca/filtros/ordenação/paginação via URL), `MetricCard`, `MoneyValue`, `PercentageChange`, `StatusBadge`, `EmptyState`, `Timeline`, `KanbanCard`, `CommandPalette` (Ctrl+K), `TextField`, `SelectField`.
- CRM (Fase 3): `Timeline`/`KanbanCard` ganharam dados reais; o drag-and-drop do Kanban usa `@dnd-kit/core` (único acréscimo de dependência da fase).
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

## WhatsApp, IA, pagamentos e jobs

**Pagamentos (Fase 5)**: `PaymentProvider` (`createCharge`/`getCharge`/`cancelCharge`) em `apps/web/src/domains/payments/provider.ts`. Sem gateway real configurado, o provider ativo é o **`DevPaymentProvider`**, claramente identificado na UI ("Ambiente de desenvolvimento") — mas o pipeline de webhook roda de verdade: `POST /api/webhooks/payments` valida uma assinatura HMAC-SHA256 (`PAYMENT_WEBHOOK_SECRET`) antes de chamar `payment_confirm`/`payment_fail` via service role (`proxy.ts` já exclui `/api/webhooks/*` do redirecionamento de autenticação, de propósito). Cobranças só existem para reservas (o fluxo do escopo é charge → webhook → venda, nunca o contrário); uma venda de balcão com pagamento imediato continua usando os campos diretos de `sale_create` (Fase 4), sem cobrança assíncrona. Para plugar um gateway real (Mercado Pago, Stripe etc.) no futuro: implementar `PaymentProvider` e apontar `getPaymentProvider()` para a nova classe — nenhum outro código muda.

**WhatsApp (Fase 6)**: `WhatsAppProvider` (`requestConnection`/`disconnect`/`getConnectionStatus`/`sendText`/`sendImage`/`sendDocument`/`getContact`) em `apps/web/src/domains/whatsapp/provider.ts`. Sem `WHATSAPP_SERVICE_URL`/`WHATSAPP_SERVICE_SECRET` configuradas, o provider ativo é o **`DevWhatsAppProvider`** (status lido direto da tabela, envios simulados) — a página `/app/whatsapp` mostra isso claramente e oferece um botão "simular leitura do QR"; `/app/atendimento` traz um formulário para simular mensagem recebida. O pipeline de webhook roda de verdade: `POST /api/webhooks/whatsapp` valida assinatura HMAC-SHA256 (`WHATSAPP_SERVICE_SECRET`) antes de chamar `whatsapp_receive_message` (mensagens) ou atualizar `whatsapp_accounts` (qr/ready/disconnected/auth_failure) via service role — verificado com requisições reais contra o Supabase Cloud (veja [Testes](#testes)). O serviço real (`services/whatsapp`) já está implementado por completo com `whatsapp-web.js` + `LocalAuth` por tenant, Express com as mesmas rotas assinadas que `ServiceWhatsAppProvider` chama, e emite os eventos `qr`/`ready`/`disconnected`/`auth_failure`/`message` de volta para o app — mas **nunca foi executado nesta sessão**: sem um celular disponível para escanear o QR, instalar o Chromium do Puppeteer e abrir uma sessão real fica como pendência para quem for de fato conectar um número (veja abaixo). Ele roda como **processo PM2 separado** (`estoque-ia-whatsapp`) — uma sessão do WhatsApp travada nunca derruba estoque, CRM, vendas ou financeiro (seção 33 do escopo).

- `pnpm-workspace.yaml` marca `puppeteer: false` em `allowBuilds` de propósito — nenhum `pnpm install` baixa os ~300 MB do Chromium sem essa decisão explícita. Para conectar um WhatsApp real: edite para `puppeteer: true` (ou rode `pnpm approve-builds`), `pnpm install`, configure `services/whatsapp/.env` (veja `.env.example` do serviço) e as mesmas `WHATSAPP_SERVICE_URL`/`WHATSAPP_SERVICE_SECRET` em `apps/web/.env.local`/`/etc/estoque-ia/web.env`.
- Na VPS, o Chromium do Puppeteer também precisa das libs do sistema: `sudo apt-get install -y libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libxcomposite1 libxdamage1 libxrandr2 libgbm1 libasound2`.
- Trocar de provider é só apontar as duas variáveis — nenhum outro código muda (mesmo padrão do `PaymentProvider`).

**IA (Fase 7)**: `AIProvider` (`chat`) em `apps/web/src/domains/ai/provider.ts`, mesmo espírito dos outros dois. Sem `ANTHROPIC_API_KEY`, o provider ativo é o **`DevAIProvider`** — sem custo e sem chamada de LLM real, mas exercitando de verdade o loop de tools por regras de palavra-chave (busca no catálogo de verdade, nunca inventa produto). Com a chave configurada, `AnthropicAIProvider` fala direto com a Messages API da Anthropic (`fetch`, sem SDK) usando o modelo/prompt/limite de tokens configurados em `/app/ia`.

- **Liga/desliga por tenant** (`tenant_ai_settings`, só OWNER/ADMIN): desligada por padrão — nenhuma empresa paga por IA sem ativar explicitamente. Uma conversa nova nasce `AI_ACTIVE` só se o tenant estiver com a IA ligada nesse momento; uma conversa já existente nunca tem o status alterado por uma mensagem chegando.
- **Tools controladas** (`apps/web/src/domains/ai/tools.ts`): `buscar_produtos` (lê o catálogo real via `catalog_search_variants`), `criar_reserva` (venda assistida — trava preço e reserva estoque de verdade, igual ao PDV) e `escalar_para_humano` (válvula de segurança). Cada uma chama uma RPC própria da IA (`ai_reservation_create`, `ai_escalate_conversation`…) que exige `auth.uid()` nulo — a IA nunca reaproveita as RPCs de staff (`reservation_create`, `message_send`) via um desvio de permissão; são usadas por humanos todo dia e não deviam ganhar uma porta lateral.
- **Estado conversacional** (`ai_conversation_states`): enxuto de propósito — contador de turnos + última tool usada + rascunho de itens, sem pedir ao modelo para autodescrever seu estado numa chamada separada.
- **Custos** (`ai_usage_events`, ledger append-only): tokens de entrada/saída e custo estimado em USD por turno (tabela de preço por modelo mantida à mão em `pricing.ts` — mesmo espírito "V1 operacional" do financeiro). Um orçamento mensal opcional (`/app/ia`) escala a conversa para um humano automaticamente em vez de continuar respondendo quando estourado. O provider DEV nunca grava custo (nenhuma chamada real acontece).
- Trocar de provider é só configurar `ANTHROPIC_API_KEY` — nenhum outro código muda.

**Jobs (Fase 8)**: `services/jobs` é um processo PM2 isolado (`estoque-ia-jobs`) que varre todos os tenants periodicamente com a `SUPABASE_SECRET_KEY` (service role) — hoje só `reservations_expire_due_sweep()`, que expira reservas vencidas e libera o estoque reservado em qualquer tenant, mesmo que ninguém abra `/app/reservas` (a página continua chamando `reservations_expire_due` também, como fallback oportunista — nunca conflita, a varredura é idempotente). Intervalo configurável por `JOBS_INTERVAL_MINUTES` (padrão 5 minutos). Mesmo padrão de isolamento do `services/whatsapp`: se o processo de jobs cair, estoque/vendas/CRM continuam no ar normalmente.

## Troubleshooting

| Sintoma                                                                                                            | Causa provável                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Configuração pública inválida`                                                                                    | `apps/web/.env.local` ausente ou incompleto                                                                                                                                                                                                                                                                                           |
| Login funciona mas volta ao `/login`                                                                               | `NEXT_PUBLIC_SUPABASE_URL` diferente do projeto das chaves, ou cookies bloqueados por domínio                                                                                                                                                                                                                                         |
| Link de e-mail cai em "link inválido"                                                                              | Template sem `token_hash`, link expirado ou URL não listada em _Redirect URLs_                                                                                                                                                                                                                                                        |
| Convite não chega                                                                                                  | SMTP padrão do Supabase com limite atingido — configure SMTP próprio                                                                                                                                                                                                                                                                  |
| `Invalid Server Actions request` em produção                                                                       | Nginx sem `proxy_set_header Host $host` / `X-Forwarded-Host`                                                                                                                                                                                                                                                                          |
| `pnpm test:db` falha ao iniciar Postgres                                                                           | Porta bloqueada por antivírus ou diretório temporário sem permissão; tente `DEBUG_PG=1 pnpm test:db`                                                                                                                                                                                                                                  |
| Scripts de build ignorados pelo pnpm                                                                               | Aprove em `pnpm-workspace.yaml` → `allowBuilds`                                                                                                                                                                                                                                                                                       |
| `seed:dev`/`admin:grant` imprimem sucesso e travam com `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)...` | Bug conhecido do `tsx` com Node 24 no Windows ao encerrar conexões HTTP mantidas vivas pelo `supabase-js` — só ocorre em dev no Windows, não na VPS Linux. A operação já havia sido concluída com sucesso antes do crash (confira com uma consulta direta, ex. `select * from platform_admins`); não indica falha nem corrompe dados. |

## Roadmap

| Fase | Escopo                                                                                                                                                                                     | Status     |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| 1    | Fundação, Design System, auth, tenants, RBAC, RLS, AppShell, Super Admin base                                                                                                              | ✅         |
| 2    | Categorias, marcas, fornecedores, produtos, variantes, atributos, nutrição, alérgenos (TRUE/FALSE/UNKNOWN), estoque, lotes, movimentações                                                  | ✅         |
| 3    | Clientes, CRM, timeline, ProductCompatibilityEngine, busca estruturada, recomendação                                                                                                       | ✅         |
| 4    | Reservas, pedidos, vendas, PDV, concorrência e transações                                                                                                                                  | ✅         |
| 5    | Pagamentos (PaymentProvider, webhooks idempotentes), financeiro                                                                                                                            | ✅         |
| 6    | Serviço WhatsApp, sessões/QR, inbox, handoff humano                                                                                                                                        | ✅         |
| 7    | AIProvider, tools controladas, estado conversacional, venda assistida, custos                                                                                                              | ✅         |
| 7.5  | Tenants de varejo/serviços com módulos habilitáveis, Agenda de serviços/profissionais, administração de tenants ampliada (não estava no escopo original — adicionado entre as Fases 7 e 8) | ✅         |
| 8    | Dashboards, relatórios, inteligência comercial, notificações, jobs                                                                                                                         | ✅         |
| 9    | Planos, assinaturas, feature flags, Super Admin completo, saúde, impersonation                                                                                                             | ⏭️ próxima |
| 10   | Hardening (CSP com nonce, rate limiting), performance, observabilidade, polish                                                                                                             |            |
