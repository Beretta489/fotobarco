-- =============================================================================
-- PAGAMENTO PELO ATENDENTE -- credito, debito e dinheiro
-- =============================================================================
-- O InfiniteTap saiu. A unica cobranca integrada agora e o Pix (Checkout +
-- webhook). Credito, debito e dinheiro sao recebidos pelo atendente, fora do
-- app, e liberados no tablet com uma senha.
--
-- FLUXO:
--   [app] cliente escolhe credito / debito / dinheiro
--     -> Edge Function payment-intent-create  (recalcula preco, cria intent)
--     -> tela "chame o atendente" com o valor REAL do servidor
--     -> atendente recebe e digita a senha
--     -> Edge Function payment-attendant-confirm (confere a senha, libera)
--
-- A senha NAO fica no app nem no banco: e o secret ATTENDANT_PASSWORD da Edge
-- Function. Se ficasse no APK, qualquer pessoa que descompactasse o app
-- liberaria fotos sem pagar.
-- =============================================================================

-- 'cash' entra como metodo; 'credit'/'debit' passam a significar "maquininha
-- do atendente", nao mais InfiniteTap.
alter table public.payment_intents
  drop constraint if exists payment_intents_payment_method_check;

alter table public.payment_intents
  add constraint payment_intents_payment_method_check
  check (payment_method in ('credit','debit','pix','cash'));

-- Eventos da liberacao pelo atendente, para a auditoria. (O limite de
-- tentativas NAO conta estes eventos -- usa attendant_attempts, abaixo.)
alter table public.payment_events
  drop constraint if exists payment_events_event_type_check;

alter table public.payment_events
  add constraint payment_events_event_type_check
  check (event_type in (
    'intent_created',
    'deeplink_opened',
    'deeplink_returned',
    'provider_checked',
    'payment_confirmed',
    'payment_failed',
    'amount_mismatch',
    'replay_blocked',
    'rate_limited',
    'attendant_confirmed',
    'attendant_rejected'
  ));


-- =============================================================================
-- attendant_attempts -- cada senha digitada, para limitar forca bruta
-- =============================================================================
-- Os limites precisam ser ATOMICOS. Contar erros com um SELECT e depois gravar
-- o erro deixa uma janela: mil requisicoes em paralelo leem "0 erros" juntas e
-- todas testam uma senha. Aqui a tentativa e RESERVADA antes de conferir a
-- senha, sob um lock, e so deixa de contar se a senha estava certa.
create table if not exists public.attendant_attempts (
  id uuid primary key default gen_random_uuid(),
  payment_intent_id uuid not null references public.payment_intents(id) on delete cascade,
  succeeded boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists attendant_attempts_window_idx
  on public.attendant_attempts (created_at desc) where not succeeded;
create index if not exists attendant_attempts_intent_idx
  on public.attendant_attempts (payment_intent_id) where not succeeded;

-- Sem policy: so a service_role (Edge Function) le e escreve.
alter table public.attendant_attempts enable row level security;

-- Reserva uma tentativa ou diz por que nao pode.
-- Devolve: { "id": <uuid> } ou { "blocked": "intent" | "global" }
create or replace function public.attendant_reserve_attempt(
  p_intent_id uuid,
  p_max_per_intent int,
  p_max_global int,
  p_window_minutes int
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_id uuid;
begin
  -- Um lock so para todas as tentativas: serializa a conta + insercao.
  perform pg_advisory_xact_lock(hashtext('attendant_reserve_attempt'));

  -- Por pedido conta a vida toda do intent; global conta so a janela.
  if (select count(*) from attendant_attempts
      where payment_intent_id = p_intent_id and not succeeded) >= p_max_per_intent then
    return jsonb_build_object('blocked', 'intent');
  end if;

  if (select count(*) from attendant_attempts
      where not succeeded
        and created_at > now() - make_interval(mins => p_window_minutes)) >= p_max_global then
    return jsonb_build_object('blocked', 'global');
  end if;

  insert into attendant_attempts (payment_intent_id) values (p_intent_id)
  returning id into v_id;

  return jsonb_build_object('id', v_id);
end;
$fn$;

-- So a Edge Function chama. Exposta ao anon, qualquer um poderia encher a
-- tabela e travar o atendente.
revoke execute on function public.attendant_reserve_attempt(uuid, int, int, int)
  from public, anon, authenticated;
