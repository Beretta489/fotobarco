-- =============================================================================
-- ENTREGA DAS FOTOS POR WHATSAPP (n8n + BotConversa)
-- =============================================================================
-- Quando um pedido vira 'paid', a Edge Function avisa o n8n (secret
-- N8N_WEBHOOK_URL) com o telefone do cliente e as URLs das fotos compradas. O
-- n8n repassa para o BotConversa, que manda no WhatsApp.
--
-- As colunas abaixo registram o estado dessa entrega, para:
--   - nao mandar duas vezes (webhook + polling + retry chegam juntos);
--   - o admin ver quem nao recebeu e reenviar (whatsapp-resend).
--
--   null      -> nunca tentou (pedido nao pago, ou anterior a esta migration)
--   'sending' -> uma function pegou o envio e esta falando com o n8n
--   'sent'    -> o n8n respondeu 2xx
--   'failed'  -> n8n fora do ar / respondeu erro; ver whatsapp_last_error
--   'skipped' -> sem telefone ou sem N8N_WEBHOOK_URL cadastrado
-- =============================================================================

alter table public.orders
  add column if not exists whatsapp_status text
    check (whatsapp_status in ('sending','sent','failed','skipped')),
  add column if not exists whatsapp_attempts smallint not null default 0,
  add column if not exists whatsapp_sent_at timestamptz,
  add column if not exists whatsapp_last_error text,
  add column if not exists whatsapp_updated_at timestamptz;

create index if not exists orders_whatsapp_status_idx
  on public.orders (whatsapp_status, paid_at desc)
  where whatsapp_status is not null;

-- Eventos de auditoria da entrega.
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
    'attendant_rejected',
    'whatsapp_dispatched',
    'whatsapp_failed'
  ));
