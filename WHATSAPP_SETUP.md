# Entrega das fotos por WhatsApp (n8n + BotConversa)

Quando um pedido vira **pago** (Pix confirmado, senha do atendente ou recuperação
manual), o servidor manda **um POST** para o n8n com o telefone do cliente e as
URLs das fotos que ele escolheu. O n8n repassa para o BotConversa, que envia no
WhatsApp.

```
pagamento confirmado ─▶ releaseIntent() (Edge Function)
                          └─▶ POST N8N_WEBHOOK_URL  { phone, photos[...] }
                                └─▶ n8n ─▶ BotConversa API ─▶ WhatsApp do cliente
```

O disparo sai do **servidor**, nunca do tablet. Assim nem a URL do n8n nem a
chave do BotConversa entram no APK.

## 1. Banco + functions (uma vez)

```bash
# colunas whatsapp_* em orders + eventos de auditoria
supabase db push            # aplica supabase/migrations/20261028120000_whatsapp_delivery.sql

# functions que usam releaseIntent() + a nova de reenvio
supabase functions deploy payment-webhook --no-verify-jwt
supabase functions deploy payment-attendant-confirm
supabase functions deploy payment-recover
supabase functions deploy whatsapp-resend
```

## 2. n8n

1. **Workflows → Import from File** → `n8n/fotobarco-whatsapp.workflow.json`
2. No nó **Segredo confere?**, troque `COLE_AQUI_O_N8N_WEBHOOK_SECRET` por um
   texto aleatório longo. É o mesmo valor do `N8N_WEBHOOK_SECRET` abaixo.
3. No nó **Enviar fotos (BotConversa)**, troque `COLE_AQUI_A_API_KEY_DO_BOTCONVERSA`
   pela chave em *BotConversa → Configurações → Integrações → API*.
4. **Ative** o workflow e copie a **Production URL** do nó *Pedido pago (Supabase)*.

## 3. Ligar o envio (só isto)

```bash
supabase secrets set N8N_WEBHOOK_URL=https://SEU-N8N/webhook/fotobarco-pedido-pago
supabase secrets set N8N_WEBHOOK_SECRET=<mesmo texto do passo 2>
```

Também dá para cadastrar pelo painel: *Project Settings → Edge Functions → Secrets*.
Sem `N8N_WEBHOOK_URL`, a venda funciona normal e o pedido fica `skipped`.

## O que o n8n recebe

```json
{
  "event": "order.paid",
  "orderId": "uuid",
  "phone": "5584999998888",
  "phoneLocal": "84999998888",
  "packageType": "half",
  "amountCents": 6000,
  "paymentMethod": "pix",
  "paidAt": "2026-10-28T15:00:00Z",
  "session": "Passeio 10:15",
  "group": "Familia 3",
  "photoCount": 2,
  "photos": [
    { "id": "uuid", "url": "https://...supabase.co/storage/v1/object/public/photos/...", "fileName": "foto-01.jpg" }
  ]
}
```

Header: `X-FotoBarco-Secret: <N8N_WEBHOOK_SECRET>`. No reenvio, `event` vem como `order.resend`.

## Acompanhar e reenviar

`orders.whatsapp_status`:

| valor     | significado                                              |
|-----------|----------------------------------------------------------|
| `null`    | ainda não tentou                                         |
| `sending` | falando com o n8n agora                                  |
| `sent`    | o n8n aceitou (respondeu 2xx)                            |
| `failed`  | n8n fora do ar / erro (ver `whatsapp_last_error`)        |
| `skipped` | sem telefone ou sem `N8N_WEBHOOK_URL`                    |

No **painel admin**, cada pedido mostra o status e tem o botão **Reenviar fotos**,
que chama a function `whatsapp-resend` e exige o admin logado.

## Limitações

- `sent` significa que **o n8n recebeu** o pedido, não que o WhatsApp entregou.
  O fluxo responde 200 antes de mandar, para o pagamento não esperar pelo
  BotConversa. Falhas de envio aparecem nas *Executions* do n8n.
- O bot apaga as fotos às 23h. Por isso o reenvio só funciona no mesmo dia.
- O envio passa por uma pausa de 1,5 s entre as fotos. Um pacote completo leva
  alguns segundos, e mandar tudo de uma vez aumenta o risco de bloqueio do número.
