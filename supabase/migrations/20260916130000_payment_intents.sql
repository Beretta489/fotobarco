-- =============================================================================
-- ESTRUTURA DE PAGAMENTO -- InfiniteTap (InfinitePay / CloudWalk)
-- =============================================================================
-- MODELO DE AMEACA (quem e o atacante aqui):
--   O app roda num tablet a bordo, com a ANON KEY embutida no APK. Essa chave e
--   publica por definicao -- qualquer pessoa que baixe o app consegue extrai-la
--   e falar direto com o banco. Alem disso o retorno do InfiniteTap chega por
--   DEEPLINK, e qualquer app instalado no aparelho consegue disparar um deeplink
--   para o FotoBarco fingindo ser a InfinitePay.
--
--   Portanto duas regras valem em todo este arquivo:
--     1. O cliente nunca define quanto custa.
--     2. O cliente nunca declara que pagou. Quem carimba "pago" e o servidor,
--        e so depois de perguntar para a InfinitePay.
--
-- FLUXO:
--   [app] escolhe fotos/extras
--     -> Edge Function payment-intent-create  (recalcula preco, cria intent)
--     -> app abre deeplink infinitepaydash://infinitetap-app?...
--     -> cliente paga na maquininha/celular
--     -> InfinitePay devolve por deeplink: order_id + nsu (NAO CONFIAVEL)
--     -> Edge Function payment-confirm  (consulta a InfinitePay, valida, libera)
-- =============================================================================

create extension if not exists pgcrypto;

-- =============================================================================
-- payment_intents -- uma tentativa de cobranca
-- =============================================================================
create table if not exists public.payment_intents (
  id uuid primary key default gen_random_uuid(),

  order_id uuid not null references public.orders(id) on delete cascade,

  -- Identificador enviado no parametro 'order_id' do deeplink e usado depois
  -- como 'order_nsu' na consulta de confirmacao.
  --
  -- NAO usamos orders.id aqui de proposito: esse valor trafega por deeplink,
  -- fica no log do sistema operacional e pode ser lido por outros apps. Um
  -- valor aleatorio e de uso unico evita que alguem correlacione pedidos ou
  -- tente confirmar um pedido alheio adivinhando o id.
  order_nsu text not null unique,

  -- Valor AUTORITATIVO, calculado por compute_order_amount_cents().
  -- E contra este numero que a resposta da InfinitePay e conferida.
  amount_cents integer not null check (amount_cents > 0),

  -- credit/debit = InfiniteTap (cartao presencial, por deeplink)
  -- pix          = Checkout InfinitePay (link + QR Code na tela do tablet)
  payment_method text not null check (payment_method in ('credit','debit','pix')),

  -- Regra da InfinitePay: cada parcela precisa ser >= R$ 1,00. A checagem real
  -- (amount_cents / installments >= 100) fica na Edge Function, que tem o valor.
  installments smallint not null default 1 check (installments between 1 and 12),

  -- ---- especifico do Pix / Checkout -------------------------------------
  -- URL do checkout. O tablet transforma isso em QR Code para o cliente
  -- escanear com o proprio celular.
  checkout_url text,

  -- invoice_slug devolvido pelo Checkout. Entra no payment_check junto com o
  -- transaction_nsu -- sem ele a conferencia do Pix pode nao resolver.
  invoice_slug text,

  status text not null default 'pending'
    check (status in ('pending','paid','failed','expired','canceled')),

  -- ---- dados devolvidos pela InfinitePay (preenchidos na confirmacao) ----
  transaction_nsu text,            -- 'nsu' do retorno: uuid da transacao
  authorization_code text,         -- 'aut'
  card_brand text,                 -- 'mastercard', 'elo', ...
  merchant_handle text,            -- 'handle' que efetivou a venda

  -- Uma transacao da InfinitePay so pode quitar UM intent. Sem esta unique,
  -- um mesmo comprovante poderia ser reapresentado para liberar varios pedidos.
  constraint payment_intents_transaction_nsu_key unique (transaction_nsu),

  failure_reason text,

  -- Janela de validade do intent. Um deeplink antigo nao pode ser reaproveitado
  -- dias depois para liberar fotos de um pedido que ficou pendente.
  expires_at timestamptz not null default now() + interval '15 minutes',

  confirmed_at timestamptz,
  confirm_attempts smallint not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payment_intents_order_id_idx    on public.payment_intents (order_id);
create index if not exists payment_intents_status_idx      on public.payment_intents (status, created_at desc);
-- Busca por order_nsu acontece a cada confirmacao; unique ja cria o indice.

-- =============================================================================
-- payment_events -- trilha de auditoria (append-only)
-- =============================================================================
-- Guarda TODA tentativa: criada, retorno do deeplink, resposta da InfinitePay,
-- recusa, divergencia de valor. Serve para conferir caixa no fim do dia e para
-- investigar contestacao de cartao (chargeback).
--
-- Nunca grave aqui numero de cartao, CVV ou token de pagamento -- so os campos
-- que a propria InfinitePay devolve (nsu, aut, bandeira).
create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  payment_intent_id uuid references public.payment_intents(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,

  event_type text not null check (event_type in (
    'intent_created',
    'deeplink_opened',
    'deeplink_returned',
    'provider_checked',
    'payment_confirmed',
    'payment_failed',
    'amount_mismatch',
    'replay_blocked',
    'rate_limited'
  )),

  -- Payload cru do provedor, para auditoria. A Edge Function passa por um
  -- sanitizador antes de gravar (ver _shared/redact.ts).
  payload jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now()
);

create index if not exists payment_events_intent_idx on public.payment_events (payment_intent_id, created_at desc);
create index if not exists payment_events_order_idx  on public.payment_events (order_id, created_at desc);
create index if not exists payment_events_type_idx   on public.payment_events (event_type, created_at desc);


-- =============================================================================
-- TRAVAS DE INTEGRIDADE -- defesa em profundidade
-- =============================================================================
-- Estes triggers protegem mesmo contra erro do proprio backend: se um bug (ou
-- alguem com a service_role em maos) tentar reescrever o valor de um intent ja
-- criado, ou reverter um pagamento confirmado, o banco recusa.
-- =============================================================================

create or replace function public.payment_intents_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  -- O valor e o pedido de um intent sao imutaveis depois de criados. Quer cobrar
  -- outro valor? Crie um intent novo -- assim a trilha de auditoria preserva a
  -- tentativa anterior.
  if new.amount_cents is distinct from old.amount_cents then
    raise exception 'VALOR_IMUTAVEL: intent % ja foi criado com % centavos',
      old.id, old.amount_cents;
  end if;

  if new.order_id is distinct from old.order_id then
    raise exception 'ORDER_ID_IMUTAVEL';
  end if;

  if new.order_nsu is distinct from old.order_nsu then
    raise exception 'ORDER_NSU_IMUTAVEL';
  end if;

  -- 'paid' e estado terminal. Nada volta de pago para pendente/falho: isso
  -- transformaria um estorno mal feito em liberacao de fotos ja pagas.
  if old.status = 'paid' and new.status <> 'paid' then
    raise exception 'INTENT_PAGO_NAO_REGRIDE: % -> %', old.status, new.status;
  end if;

  -- O nsu da transacao so e escrito uma vez.
  if old.transaction_nsu is not null
     and new.transaction_nsu is distinct from old.transaction_nsu then
    raise exception 'TRANSACTION_NSU_IMUTAVEL';
  end if;

  new.updated_at := now();
  return new;
end;
$fn$;

drop trigger if exists payment_intents_guard_trg on public.payment_intents;
create trigger payment_intents_guard_trg
  before update on public.payment_intents
  for each row execute function public.payment_intents_guard();


-- ---------------------------------------------------------------- orders ----
-- Mesma logica para o pedido: um pedido pago nao volta a pendente, e o token de
-- download nao pode ser trocado depois de emitido (o cliente ja recebeu o link).
create or replace function public.orders_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if old.status = 'paid' and new.status not in ('paid','refunded') then
    raise exception 'PEDIDO_PAGO_NAO_REGRIDE: % -> %', old.status, new.status;
  end if;

  if old.download_token is not null
     and new.download_token is distinct from old.download_token then
    raise exception 'DOWNLOAD_TOKEN_IMUTAVEL';
  end if;

  return new;
end;
$fn$;

drop trigger if exists orders_guard_trg on public.orders;
create trigger orders_guard_trg
  before update on public.orders
  for each row execute function public.orders_guard();


-- =============================================================================
-- RLS -- fail-closed
-- =============================================================================
-- Ligar RLS sem criar policy = ninguem acessa, exceto service_role (que ignora
-- RLS por design). E exatamente o que queremos: so as Edge Functions tocam
-- nestas tabelas.
alter table public.payment_intents enable row level security;
alter table public.payment_events  enable row level security;

-- Conferencia de caixa pelo admin logado. Somente leitura, e sem expor a coluna
-- de payload cru (use uma view se quiser restringir colunas).
drop policy if exists payment_intents_select_admin on public.payment_intents;
create policy payment_intents_select_admin on public.payment_intents
  for select to authenticated using (true);

drop policy if exists payment_events_select_admin on public.payment_events;
create policy payment_events_select_admin on public.payment_events
  for select to authenticated using (true);

-- NENHUMA policy de insert/update/delete para anon ou authenticated.
-- Escrita aqui e exclusividade da service_role.


-- =============================================================================
-- FECHANDO O BURACO DO PRECO NO CLIENTE
-- =============================================================================
-- A policy atual "orders_insert" aceita INSERT de qualquer um com qualquer
-- 'total' (with check = true). Com o pedido passando a nascer dentro da Edge
-- Function, o app nao precisa mais inserir direto -- e nao deve.
--
-- ATENCAO / ORDEM DE IMPLANTACAO: estes DROPs quebram services/orders.js na
-- versao antiga. Aplique esta migration SOMENTE depois de publicar o app que
-- usa services/infinitepay.js. Ate la, mantenha as linhas comentadas.
--
-- drop policy if exists orders_insert       on public.orders;
-- drop policy if exists order_items_insert  on public.order_items;
-- drop policy if exists order_extras_insert on public.order_extras;

-- Independente do passo acima: o anon nunca pode dar UPDATE em orders. Hoje nao
-- existe policy de UPDATE (por isso ordersService.confirmPayment ja falha em
-- producao). Os REVOKEs abaixo garantem que nenhuma policy futura reabra isso
-- por descuido -- policy concede, mas GRANT ainda precisa existir.
revoke update, delete on public.orders       from anon;
revoke update, delete on public.order_items  from anon;
revoke update, delete on public.order_extras from anon;

-- Advisor 0028/0029: toda funcao no schema 'public' fica exposta em
-- /rest/v1/rpc, inclusive funcao de trigger. Chamar uma destas por RPC falharia
-- ("trigger functions can only be called as triggers"), mas nao ha motivo para
-- elas aparecerem na superficie publica da API.
--
-- Os triggers seguem funcionando: quem os dispara e o proprio Postgres, que nao
-- passa pela checagem de GRANT do chamador.
revoke execute on function public.orders_guard()          from public, anon, authenticated;
revoke execute on function public.payment_intents_guard() from public, anon, authenticated;
