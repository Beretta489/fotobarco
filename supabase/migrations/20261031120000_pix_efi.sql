-- =============================================================================
-- PIX PELO EFI BANK -- colunas do provedor em payment_intents
-- =============================================================================
-- So ADICIONA. Nada da InfinitePay e removido: checkout_url, invoice_slug e o
-- resto continuam la, e os intents antigos seguem sendo conferidos na
-- InfinitePay (provider = 'infinitepay').
--
-- Mapeamento Efi -> colunas que ja existiam:
--   txid (cobranca)   = order_nsu        ("FB" + 32 hex, 34 caracteres)
--   endToEndId (pago) = transaction_nsu  (a unique ja impede que um mesmo
--                                         pagamento libere dois pedidos)
-- =============================================================================

alter table public.payment_intents
  add column if not exists provider               text,
  add column if not exists provider_env           text,
  add column if not exists provider_loc_id        text,
  add column if not exists provider_status        text,
  add column if not exists pix_copia_e_cola       text,
  add column if not exists last_provider_check_at timestamptz;

alter table public.payment_intents
  drop constraint if exists payment_intents_provider_check;
alter table public.payment_intents
  add constraint payment_intents_provider_check
  check (provider is null or provider in ('infinitepay', 'efi'));

alter table public.payment_intents
  drop constraint if exists payment_intents_provider_env_check;
alter table public.payment_intents
  add constraint payment_intents_provider_env_check
  check (provider_env is null or provider_env in ('homologacao', 'producao'));

-- Todo Pix criado ate aqui foi pela InfinitePay. Credito/debito/dinheiro ficam
-- com provider null: nao tem provedor, quem libera e o atendente.
update public.payment_intents
   set provider = 'infinitepay'
 where payment_method = 'pix' and provider is null;

-- =============================================================================
-- TRAVA: provedor e ambiente sao imutaveis depois de gravados
-- =============================================================================
-- Mesma funcao de 20260916130000_payment_intents.sql, com duas regras a mais.
-- Sem elas, trocar provider_env de um intent faria a conferencia perguntar ao
-- ambiente errado (ex.: homologacao, onde o Pix "paga" sozinho).

create or replace function public.payment_intents_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
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

  if old.status = 'paid' and new.status <> 'paid' then
    raise exception 'INTENT_PAGO_NAO_REGRIDE: % -> %', old.status, new.status;
  end if;

  if old.transaction_nsu is not null
     and new.transaction_nsu is distinct from old.transaction_nsu then
    raise exception 'TRANSACTION_NSU_IMUTAVEL';
  end if;

  if old.provider is not null and new.provider is distinct from old.provider then
    raise exception 'PROVIDER_IMUTAVEL';
  end if;

  if old.provider_env is not null and new.provider_env is distinct from old.provider_env then
    raise exception 'PROVIDER_ENV_IMUTAVEL';
  end if;

  new.updated_at := now();
  return new;
end;
$fn$;

revoke execute on function public.payment_intents_guard() from public, anon, authenticated;
