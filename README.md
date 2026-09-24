# Horário

Agendamento multi-tenant para barbearias. O dono cria a conta, cadastra os serviços, define o horário de funcionamento e as exceções (feriado, folga, expediente diferente num dia específico); o cliente final agenda por um link público, sem precisar criar login.

Feito como peça de portfólio para mostrar julgamento de engenharia, não só CRUD: as seções abaixo explicam as decisões que doeriam de verdade se estivessem erradas, e o que a suíte de ponta a ponta encontrou que os testes unitários não encontraram.

## Stack

Next.js 16.3.5 (App Router), React 19, TypeScript em modo strict, Drizzle ORM sobre Postgres, Better Auth, Server Actions com next-safe-action + Zod, Tailwind v4, Vitest, Playwright, Biome.

## Testes

143 testes unitários/integração e 3 testes de ponta a ponta, todos passando:

```bash
pnpm test       # 143 testes, ~19s, roda contra PGlite — sem Postgres, sem Docker
pnpm test:e2e   # 3 testes, sobe o Next real + browser real sobre um PGlite descartável
```

## Decisões

### O banco impede sobreposição — a aplicação não decide isso

Nenhum agendamento confirmado pode se sobrepor a outro, e quem garante isso é o Postgres, não uma checagem em código. A tabela `appointment` tem uma constraint `EXCLUDE USING gist` sobre `tstzrange(starts_at, blocked_until)`, casada por `tenant_id` (o elemento `WITH =`) e parcial em `status = 'confirmed'` (a cláusula `WHERE`). A alternativa óbvia — `SELECT` para checar conflito, depois `INSERT` — tem uma janela de corrida: duas requisições simultâneas podem checar "livre" ao mesmo tempo e as duas inserirem. A constraint fecha essa janela no nível que realmente importa, o commit da transação, e como efeito colateral cancelar um agendamento vira só uma troca de `status`: o horário se libera sozinho, sem nenhum código de "devolver o slot" para ficar dessincronizado do resto.

### Por que não é uma coluna gerada

A primeira versão do schema tentava `blocked_range` como `GENERATED ALWAYS AS (tstzrange(starts_at, ends_at + make_interval(mins => buffer_minutes))) STORED`. O Postgres rejeita: erro `42P17`, porque `timestamptz + interval` é `STABLE`, não `IMMUTABLE` — o resultado depende do `TimeZone` da sessão, e uma coluna gerada exige uma expressão imutável. A solução foi guardar `blocked_until` como uma coluna normal, escrita pela aplicação, com a constraint de exclusão operando sobre a expressão `tstzrange(starts_at, blocked_until)` (essa sim imutável) e um `CHECK (blocked_until >= ends_at)` para a aplicação não poder mentir sobre o valor.

### `ends_at` e `blocked_until` são coisas diferentes de propósito

`ends_at` é o que o cliente vê: quando o serviço termina. `blocked_until` é `ends_at` mais o buffer do serviço (tempo de limpeza, deslocamento) e é o que a constraint de sobreposição realmente usa. Misturar os dois faria o cliente ver um horário de término que não é o horário real, ou faria o buffer virar parte pública do agendamento — nenhuma das duas coisas é o que ele representa.

### Cada agendamento guarda uma cópia do serviço no momento da reserva

`appointment` armazena `serviceName`, `durationMinutes`, `bufferMinutes` e `priceCents` como snapshot, além da referência a `serviceId`. Editar um serviço amanhã (mudar preço, duração) não reescreve o histórico de ontem — um agendamento de duas semanas atrás continua mostrando o preço que foi cobrado, não o preço atual.

### Tudo em UTC; hora local é só uma interpretação, nunca o dado

Todo instante gravado no banco (`starts_at`, `ends_at`, `blocked_until`) é UTC. Horário de funcionamento não é armazenado como hora — é armazenado como minutos-desde-meia-noite (`start_minute`/`end_minute`) mais o fuso IANA do tenant (`timezone`, ex. `America/Sao_Paulo`). Isso significa que um cliente acessando de outro fuso vê os horários convertidos corretamente para o dele, enquanto a barbearia continua raciocinando em "abre às 9h" sem se importar com fuso nenhum — e evita a classe inteira de bug de "9h em UTC vira 6h local e o slot desaparece".

### A camada de domínio não conhece o framework

`src/domain/` não importa React, Next, Drizzle ou qualquer coisa de infraestrutura — é TypeScript puro: geração de slots, regra de cancelamento, limite de plano, conversão de fuso horário. A régua inteira do negócio (o que conta como horário disponível, quando um cancelamento é permitido, quantos serviços ativos um plano free permite) é testável em milissegundos, sem subir banco nem servidor, e sem depender de mock de nada.

### Limite de plano é aplicado sob lock de linha

Ativar um serviço acima do limite do plano free é bloqueado por um `SELECT ... FOR UPDATE` no tenant, dentro de uma transação (`lockTenantForUpdate`), não por uma contagem lida e comparada sem lock. Um limite de cobrança que só é respeitado "na maior parte das vezes" — porque duas ativações simultâneas passaram pela mesma checagem TOCTOU (time-of-check to time-of-use) antes de qualquer uma escrever — não é um limite, é uma sugestão.

### Contraste é medido, não assumido

Cada par de cores do design system (texto sobre fundo, botão, estado de erro) é validado por um teste que lê os tokens direto do CSS (`tests/design/contrast.test.ts`) e calcula o contraste real segundo WCAG AA (conversão OKLCH → sRGB linear → luminância relativa, sem depender de biblioteca externa). Esse teste pegou a variante do botão destrutivo (`danger` sobre `fg`) saindo a 3.37:1 — abaixo do mínimo de 4.5:1 — porque não existia um token de primeiro plano dedicado para `danger` e um foi chutado. O chute estava errado exatamente porque nada media; agora todo par usado no código tem um teste, não só os quatro que o design original previa.

### A suíte de testes não depende do relógio

Quatro suítes derivavam a data de `new Date()` no momento da carga do módulo ou do teste e assumiam que isso seria seguro para sempre. Um teste que caminhava até "a próxima segunda-feira" nunca avançava quando hoje já era segunda, então rodar depois das 18h (quando o expediente fecha) zerava os horários disponíveis e a asserção falhava. Outras três suítes derivavam agendamentos futuros por offset em minutos a partir de um `NOW` capturado uma vez; rodando tarde o suficiente no dia, `NOW + offset` cruzava a meia-noite local e caía na guarda de minuto inválido do domínio. A correção fixou o relógio com `vi.useFakeTimers()`/`vi.setSystemTime()` em vez de tentar calcular datas relativas "seguras". Uma suíte que falha só depois das 17h30 é pior do que nenhuma suíte, porque o time aprende a ignorar o vermelho.

## O que a suíte de ponta a ponta encontrou que os testes unitários, todos verdes, não encontraram

Testes unitários e de integração provam que cada peça funciona isolada. O que eles não provam é que as peças se encaixam pelo caminho real — navegador de verdade, servidor de verdade, uma requisição HTTP de cada vez. Foi exatamente aí que a suíte Playwright ganhou o espaço no repositório:

- **O link de gerenciar o agendamento apontava para uma rota que não existia.** Todo cliente que clicasse no único link que o produto promete a ele — cancelar ou ver o agendamento depois da confirmação — bateria em um 404. Nenhum teste unitário passa por esse link porque nenhum teste unitário navega.
- **As relations do Drizzle chamavam a tabela de `user`, mas o adapter do Better Auth procura por `users`.** Resultado: `getSession()` lia toda sessão válida como deslogada, e o painel do dono nunca abria — mesmo com login retornando sucesso. Um teste de integração que monta a query manualmente não reproduz esse bug porque ele não passa pelo adapter de verdade.
- **O client do banco era um singleton de módulo, e o Next reavalia módulos por bundle de rota.** Sob PGlite isso significava uma escrita do sign-in e a leitura de sessão da requisição seguinte batendo em duas instâncias de banco diferentes — sem erro, só divergência silenciosa. Só aparece rodando o servidor real, servindo requisições reais, uma depois da outra.
- **O Next mantém a página de saída interativa durante uma transição client-side.** Um clique rápido num horário, imediatamente após trocar de dia, podia ser aceito pela grade antiga — que seria descartada milissegundos depois pelo remount — e o clique do cliente simplesmente não tinha efeito nenhum. Silencioso, sem erro no console, sem teste unitário capaz de perceber porque nenhum teste unitário tem "milissegundos de janela entre dois componentes".

Nenhum desses quatro apareceria numa suíte que só chama funções puras ou faz `INSERT`/`SELECT` direto no banco. É exatamente para isso que a camada de ponta a ponta existe.

## O que não foi construído

Sem pagamento, sem lembrete por e-mail ou SMS, sem múltiplos profissionais por barbearia (um tenant é uma agenda), sem modo claro — a interface é escura, ponto (`color-scheme: dark` fixo em `globals.css`, sem media query de preferência de tema).

Um item ficou deliberadamente sem teste automatizado: o caso de apertar Voltar do navegador enquanto uma navegação de dia/serviço ainda está pendente. A correção (`useTransition` controlando o estado de "carregando" da grade de horários, em vez de uma flag manual) cobre esse caso — mas `router.push()` dentro de `startTransition` não atualiza a URL de forma síncrona, então não existe um momento observável de fora entre "a navegação foi pedida" e "o histórico foi atualizado" para o Playwright agir sobre ele. Um teste que clica um dia e chama `page.goBack()` em seguida passaria com ou sem a correção — pior do que nenhum teste, porque dá falsa confiança. Documentado, não escondido.

## Rodando localmente

Requisitos: Node 22+, pnpm.

```bash
pnpm install
```

Os testes automatizados não exigem Postgres nem Docker — rodam contra PGlite (Postgres compilado para WASM), o mesmo caminho que o CI usa:

```bash
pnpm test        # 143 testes unitários/integração
pnpm test:e2e    # 3 testes de ponta a ponta (Next real + browser real)
pnpm typecheck
pnpm lint
pnpm build
```

Para rodar o app de verdade com `pnpm dev`, é preciso um Postgres real. O repositório inclui um `docker-compose.yml` para quem tem Docker disponível:

```bash
cp .env.example .env   # os scripts abaixo leem o .env automaticamente

# Opção A — Docker:
docker compose up -d

# Opção B — Postgres instalado na máquina (testado com o 18): crie a role e o
# banco que o .env.example espera, como superusuário:
#   CREATE ROLE horario LOGIN PASSWORD 'horario';
#   CREATE DATABASE horario OWNER horario;
# A extensão btree_gist, que a constraint de sobreposição usa, já vem nos
# instaladores oficiais e é "trusted" — o dono do banco consegue criá-la.

# Opção C — Postgres remoto (Neon, Supabase, Railway, RDS): aponte
# DATABASE_URL no .env para ele.

pnpm db:migrate
pnpm seed
pnpm dev
```

`pnpm seed` cria um tenant de demonstração (uma barbearia com serviços, horário de funcionamento e uma semana de agendamentos) e um usuário dono com as credenciais definidas em `DEMO_EMAIL`/`DEMO_PASSWORD` no `.env`.
