# Horário — Design

Data: 2026-09-20
Status: aprovado para planejamento

## 1. Contexto e objetivo

Horário é um SaaS de agendamento multi-tenant para barbearias e estética. Cada negócio cria sua conta, cadastra serviços e horários de funcionamento, e os clientes finais agendam por um link público sem criar login.

O projeto é um rebuild completo de `agenda-saas` (backend FastAPI, sem interface). Aquele repositório fica arquivado e intacto; este nasce do zero em TypeScript.

Dois objetivos ao mesmo tempo, nessa ordem de prioridade:

1. **Peça de portfólio** — demonstrar arquitetura, não CRUD: invariantes garantidas no banco, domínio puro e testável, interface com acabamento real.
2. **Produto vendável** — a v1 precisa ser utilizável por uma barbearia real. Pagamento e notificações recorrentes ficam fora da v1, mas nada na arquitetura pode impedir que entrem.

Sucesso da v1: uma barbearia consegue cadastrar serviços e horários, divulgar o link, receber agendamentos corretos (sem sobreposição, dentro do expediente) e trabalhar a partir da agenda do dia — e um recrutador consegue ver tudo isso funcionando em uma demo sem criar conta.

### Fora de escopo na v1

Múltiplos profissionais por negócio; lembrete automático 24h antes; pagamento/sinal; CRM de clientes; relatórios; domínio próprio por cliente; light mode; app mobile.

## 2. Decisões de stack

| Decisão | Escolha | Motivo |
|---|---|---|
| Framework | Next.js 15 (App Router), TypeScript `strict` | Full-stack em um repo, tipos ponta a ponta |
| Banco | Postgres 17 — Neon em prod/preview, Docker local em dev | Constraint `EXCLUDE` exige Postgres; Neon dá branch por PR |
| ORM | Drizzle | SQL-first e tipado; a query de conflito fica explícita |
| Auth | Better Auth | TS nativo, schema no próprio banco, sem custo por usuário |
| Dados | React Server Components + Server Actions (`next-safe-action` + Zod) | Menos camadas; domínio isolado em `src/domain/` |
| E-mail | Resend | Free tier suficiente; entrega do link de cancelamento |
| UI | Tailwind v4 + shadcn/ui com tema próprio | Acessibilidade do Radix, visual descaracterizado |
| Testes | Vitest (domínio) + testcontainers (constraint) + Playwright (2 fluxos) | Cada camada testada onde é barata |
| Deploy | Vercel + GitHub Actions | Migrations no CI, nunca no build |
| Ferramentas | Node 22, pnpm, Biome | Lint e format numa ferramenta só |

Idioma da interface: pt-BR. Fuso padrão: `America/Sao_Paulo` (configurável por tenant).

## 3. Escopo funcional da v1

- Cadastro self-service de negócio (e-mail/senha, nome, slug).
- CRUD de serviços com nome, descrição, duração, buffer, preço e ativo/inativo.
- Horário semanal recorrente com múltiplas janelas por dia (intervalo de almoço).
- Exceções por data: fechado ou horário especial.
- Página pública de agendamento em `/b/[slug]`, em 3 etapas.
- E-mail de confirmação com link de gerenciamento.
- Cancelamento pelo cliente final via link com token.
- Agenda do dia e da semana no painel; marcar `completed`, `no_show` ou cancelar.
- Limite de plano: `free` permite 3 serviços ativos, `pro` é ilimitado. Upgrade é manual (coluna alterada por script); a interface mostra o paywall com botão desabilitado.
- Tenant de demonstração semeado, com login de demo divulgado na landing.

## 4. Modelo de dados

Postgres com extensão `btree_gist`. IDs `uuid` (`gen_random_uuid()`). Todo `timestamptz` é UTC; horário local existe apenas como minutos desde a meia-noite, interpretados no fuso do tenant.

### `tenant`

`id`, `slug` (unique), `name`, `timezone` (default `America/Sao_Paulo`), `plan` (`free` | `pro`), `min_notice_minutes` (default 120), `max_advance_days` (default 60), `created_at`.

`min_notice_minutes` tem dois usos deliberados: antecedência mínima para agendar e prazo limite para cancelar. Um parâmetro, uma regra.

### Tabelas do Better Auth

`user`, `session`, `account`, `verification` conforme o schema da biblioteca. `user` recebe `tenant_id` (FK): na v1 um usuário pertence a exatamente um negócio.

### `service`

`id`, `tenant_id`, `name`, `description`, `duration_minutes`, `buffer_minutes` (default 0), `price_cents`, `is_active`, `sort_order`.

O limite de plano conta apenas serviços com `is_active = true`; desativar libera vaga.

### `weekly_hours`

`id`, `tenant_id`, `weekday` (0–6), `start_minute`, `end_minute`.

Várias linhas por dia representam intervalos: segunda `540–720` e segunda `780–1080` produzem almoço entre 12:00 e 13:00 sem nenhuma coluna de pausa.

### `availability_exception`

`id`, `tenant_id`, `date` (data local), `is_closed`, `start_minute`, `end_minute` (nulos quando `is_closed`).

Regra sem ambiguidade: exceção **sobrescreve** o `weekly_hours` do dia inteiro, nunca soma.

### `appointment`

`id`, `tenant_id`, `service_id`, `customer_name`, `customer_email`, `customer_phone`, `starts_at`, `ends_at`, `status` (`confirmed` | `completed` | `cancelled` | `no_show`), `cancel_token` (unique), `created_at`, `cancelled_at`.

Snapshots gravados no momento do agendamento: `service_name`, `duration_minutes`, `buffer_minutes`, `price_cents`. Alterar o serviço depois não reescreve o histórico.

`cancel_token`: 24 bytes de `crypto.randomBytes`, base64url. É a única credencial do fluxo `/a/[token]`.

### Invariante central

```sql
blocked_range tstzrange GENERATED ALWAYS AS (
  tstzrange(starts_at, ends_at + make_interval(mins => buffer_minutes))
) STORED,

CONSTRAINT appointment_no_overlap EXCLUDE USING gist (
  tenant_id WITH =,
  blocked_range WITH &&
) WHERE (status = 'confirmed')
```

`ends_at` é o fim do atendimento (o que o cliente vê). `blocked_range` estende pelo buffer (o que bloqueia a agenda). São conceitos distintos e por isso são colunas distintas.

Cancelar muda o `status`, sai do predicado parcial da constraint, e o horário volta a ficar livre automaticamente. Não existe passo de "liberar slot".

### Índices

`tenant.slug` (unique), `appointment.cancel_token` (unique), `service(tenant_id, is_active)`, `appointment(tenant_id, starts_at)`, `weekly_hours(tenant_id, weekday)`, `availability_exception(tenant_id, date)`.

## 5. Domínio puro (`src/domain/`)

Sem nenhum import de `next`, `drizzle` ou `better-auth`. Única dependência externa permitida: `@date-fns/tz`.

Erros são valores, não exceções:

```ts
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E }
```

Códigos de erro: `SLOT_TAKEN`, `TOO_SOON`, `TOO_FAR`, `OUTSIDE_HOURS`, `PLAN_LIMIT`, `TOO_LATE_TO_CANCEL`, `ALREADY_CANCELLED`. A tradução para pt-BR vive num único mapa na camada de interface; o domínio não conhece idioma.

### `slots.ts`

```ts
generateSlots(input: {
  date: LocalDate
  timezone: string
  weeklyHours: TimeRange[]
  exception: DayException | null
  service: { durationMinutes: number; bufferMinutes: number }
  busy: Interval[]
  now: Date
  minNoticeMinutes: number
  maxAdvanceDays: number
}): Slot[]
```

Ordem de resolução: exceção sobrescreve o dia (fechado devolve lista vazia); janelas locais são convertidas para instantes UTC pelo fuso do tenant; a grade avança de 15 em 15 minutos. Um candidato sobrevive quando `startsAt + duration` cabe na janela, `[startsAt, startsAt + duration + buffer)` não intersecta nada em `busy`, e a janela de agendamento aceita o horário.

Regras de borda, decididas explicitamente:

- **O buffer pode ultrapassar o fim do expediente.** Fecha às 18:00; corte de 45 min às 17:15 com 10 min de buffer é válido. Buffer é folga do profissional, não atendimento; apenas a duração precisa caber.
- **Horário local inexistente por DST é descartado; horário ambíguo usa a primeira ocorrência.** O Brasil não tem horário de verão hoje, mas `timezone` é coluna livre.

### `booking-window.ts`

`validateBookingWindow({ startsAt, now, minNoticeMinutes, maxAdvanceDays })` → `Result<void, 'TOO_SOON' | 'TOO_FAR'>`. Separada de `generateSlots` porque a action revalida no servidor: o horário chega do cliente.

### `plan.ts`

`PLAN_LIMITS = { free: { maxActiveServices: 3 }, pro: { maxActiveServices: Infinity } }` e `canActivateService(plan, activeCount)` → `Result<void, 'PLAN_LIMIT'>`. Limite é dado, não `if`.

### `cancellation.ts`

`canCancel({ status, startsAt, now, minNoticeMinutes })` → `Result<void, 'TOO_LATE_TO_CANCEL' | 'ALREADY_CANCELLED'>`.

### `time.ts`

Conversões entre minuto local e instante UTC. `LocalDate` é `string` branded no formato `YYYY-MM-DD`, para não ser confundida com `Date`.

### Fronteira

O domínio não toca banco. `busy` em `generateSlots` evita **mostrar** um horário já ocupado; a verdade sobre sobreposição é a constraint. Duas camadas com propósitos diferentes: uma é experiência, a outra é integridade.

## 6. Actions, fluxos e bordas

### Três clientes de action

- `publicAction` — sem sessão; usada apenas por agendar. Recebe `slug` e resolve o tenant no servidor.
- `authedAction` — exige sessão Better Auth e injeta `ctx.tenantId` **a partir da sessão**. Regra dura: nenhuma action autenticada aceita `tenantId` vindo do input.
- `tokenAction` — autoriza pelo `cancel_token`.

O isolamento multi-tenant fica concentrado nessas três definições, auditável em um lugar, em vez de espalhado em cláusulas `WHERE` copiadas.

### `bookAppointment`

1. Zod valida `{ slug, serviceId, startsAt, customer }`.
2. Carrega tenant e serviço; serviço inativo ou de outro tenant responde 404 (não 403 — não confirma existência).
3. `validateBookingWindow`.
4. Recarrega `weeklyHours`, `exception` e `busy`, e confere que `startsAt` consta em `generateSlots`. Protege contra horário forjado fora do expediente.
5. `INSERT` com os snapshots e o `cancel_token`.
6. Erro Postgres `23P01` na constraint `appointment_no_overlap` é traduzido para `SLOT_TAKEN`. Apenas esse código nessa constraint; qualquer outro erro sobe.
7. `revalidatePath('/app')` e redirect para a tela de confirmação.

### E-mail

Resend é chamado **após** o commit. Falha de envio é registrada em log e **não** desfaz o agendamento. A tela de confirmação sempre exibe o link de gerenciamento com botão de copiar — o e-mail é conveniência, a tela é a garantia.

### `cancelAppointment`

Token → agendamento → `canCancel` → `UPDATE status = 'cancelled', cancelled_at = now()`.

### Actions do painel

CRUD de serviço (ativar chama `canActivateService` antes), edição de `weekly_hours`, exceções, configurações do tenant, e transição de status do agendamento.

### Leitura

Queries em `src/db/queries/`, chamadas diretamente pelos Server Components. Cada função recebe `tenantId` como primeiro argumento explícito. Não existe action para ler.

### Abuso do endpoint público

Risco aceito e mitigado no mínimo honesto: campo honeypot no formulário e teto de 3 agendamentos futuros por telefone por tenant, verificado antes do insert. Rate limit por IP fica documentado para a v2.

## 7. Interface

As skills `impeccable` (condutora), `ui-ux-pro-max` e `frontend-design` são carregadas no primeiro passo de interface do plano de implementação.

### Telas da v1

Público: `/` (landing), `/b/[slug]` (agendamento), `/b/[slug]/confirmado`, `/a/[token]` (gerenciar/cancelar).
Painel: `/login`, `/cadastro`, `/app` (agenda), `/app/servicos`, `/app/horarios`, `/app/configuracoes`.

Dez telas. `/app/clientes` e `/app/relatorios` estão explicitamente fora.

### Tokens

Tailwind v4 CSS-first (`@theme`), cores em `oklch`. Apenas dark na v1, mas os tokens são semânticos — `--color-surface`, `--color-surface-raised`, `--color-border`, `--color-fg`, `--color-fg-muted`, `--color-accent`, `--color-danger`. Nenhum componente usa cor literal. Light mode futuro é um bloco de override, não um refactor.

Base preta com viés quente, superfícies em três níveis de elevação, accent âmbar reservado a: CTA primário, slot selecionado e anel de foco. Um accent por tela.

### Tipografia

Display condensada e pesada nos títulos, com tracking negativo; sans neutra no corpo. Numerais tabulares obrigatórios em horário, preço e grade da agenda.

### Componentes próprios

`SlotGrid` (`radiogroup` navegável por teclado, agrupado em manhã/tarde/noite), `DateStrip` (marca dia sem vaga em vez de escondê-lo), `ServiceCard`, `AgendaDay` / `AgendaWeek` (bloco proporcional à duração, buffer hachurado), `AppointmentSheet`, `PaywallCard`.

### Responsividade

`/b/[slug]` é mobile-first: CTA fixo no rodapé, alvos de toque ≥44px, grade de slots legível sem zoom. `/app` é desktop-first e denso, com a agenda do dia como tela inicial.

### Estados

Cada tela especifica vazio, carregando, erro e sucesso. Carregando usa skeleton com a forma do conteúdo (Suspense), não spinner. `SLOT_TAKEN` tem tratamento próprio: recarrega a grade, destaca a mudança e mantém o usuário no mesmo passo.

### Acessibilidade

Contraste AA sobre fundo escuro, com atenção ao âmbar; foco visível em todos os controles; `prefers-reduced-motion` respeitado; campos com label e erro associados por `aria-describedby`.

### E-mail

O template do Resend reusa os mesmos tokens convertidos para HTML de e-mail.

### Landing

Explica o que é, para quem, e oferece o botão "ver demo" que entra no tenant semeado. Sem preços fictícios nem depoimentos inventados.

## 8. Testes

Ordem TDD: teste de domínio antes da implementação do domínio.

### Vitest — domínio

Casos obrigatórios: almoço gerando dois blocos; exceção `is_closed` devolvendo lista vazia; exceção com horário especial sobrescrevendo o dia; buffer ultrapassando o fechamento (válido); buffer bloqueando o slot seguinte; `min_notice` cortando os slots de hoje; `max_advance_days` cortando a cauda; DST inexistente descartado e ambíguo resolvido; `canActivateService` no 3º e no 4º serviço e após desativação; `canCancel` dentro do prazo, fora do prazo e já cancelado.

### Integração — constraint

Dois `INSERT` sobrepostos: o segundo levanta `23P01`. Sobreposição com status `cancelled` é aceita. Postgres real via testcontainers (`postgres:17`), porque a constraint exige `btree_gist`.

Verificação pendente no plano: se PGlite suportar `btree_gist`, substituir testcontainers por ele para ganhar velocidade. Enquanto não verificado, testcontainers é o caminho.

### Playwright — 2 fluxos

1. Cliente agenda em `/b/barbearia-do-ze` e chega à confirmação com o link de cancelamento.
2. Dono loga, vê o agendamento na agenda do dia e marca `no_show`.

### Sem mock de banco

Action é código de cola; testá-la contra um banco falso testa o mock.

### CI

GitHub Actions: `typecheck` → `lint` → `vitest` → `build` → `playwright`. Sem meta percentual de cobertura; a meta é invariante coberta.

## 9. Ambiente e deploy

Repositório novo `horario` em `C:\Users\likcv\Documents\horario`, público no GitHub. O `agenda-saas` permanece intacto; recebe apenas uma linha no README apontando para o sucessor.

### Banco por ambiente

Dev: Postgres 17 em Docker local (`docker compose up`), mesma versão do CI, funciona offline. Preview e produção: Neon, com branch de banco por PR via integração Vercel.

### Migrations

`drizzle-kit generate` cobre o schema. A extensão `btree_gist`, a coluna gerada `blocked_range` e a constraint `appointment_no_overlap` **não** são expressáveis no schema do Drizzle e vão em migration SQL escrita à mão (`drizzle-kit generate --custom`), versionada junto. `drizzle-kit push` não é usado neste projeto.

Migrations rodam no CI antes do deploy, nunca durante o build da Vercel.

### Variáveis de ambiente

`DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `RESEND_API_KEY`, `EMAIL_FROM`, `NEXT_PUBLIC_APP_URL`, `DEMO_EMAIL`, `DEMO_PASSWORD`. Validadas na inicialização com T3 Env — a aplicação não sobe com variável faltando. `.env.example` fica completo no repositório.

### Seed da demo

`pnpm seed` cria o tenant `barbearia-do-ze` (fuso `America/Sao_Paulo`), o usuário de demonstração, 4 serviços (um inativo, para o paywall aparecer em 3/3), horário de segunda a sábado com almoço, uma exceção de feriado, e cerca de 30 agendamentos relativos a `now()` — passados como `completed` ou `no_show`, futuros como `confirmed`.

A demo se auto-restaura: um Vercel Cron chama diariamente uma rota protegida por segredo que re-semeia o tenant de demonstração.

### Observabilidade

Log estruturado nas actions que falham, mais os logs da Vercel. Sentry entra quando houver usuário pagante.

### README

Documenta as decisões e o porquê — constraint `EXCLUDE` em vez de `SELECT` antes de `INSERT`, snapshot de preço e duração, UTC com fuso por tenant, domínio puro — em vez de instruções de instalação genéricas.

## 10. Riscos aceitos

| Risco | Decisão |
|---|---|
| Endpoint público sem rate limit por IP | Honeypot e teto por telefone na v1; Upstash na v2 |
| Sem notificação de lembrete | Cliente pode esquecer; lembrete 24h é v2 |
| Upgrade de plano manual | Paywall visível, Stripe na v3 |
| Um usuário por tenant | Staff múltiplo é v2; o schema já suporta mais linhas |
| PGlite pode não suportar `btree_gist` | Testcontainers é o padrão; PGlite é otimização a verificar |

## 11. Depois da v1

v2: lembrete 24h, múltiplos profissionais, rate limit por IP, light mode, subdomínio por tenant.
v3: Stripe (assinatura do negócio e sinal do cliente), relatórios, domínio próprio.
