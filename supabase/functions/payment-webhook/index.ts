// =============================================================================
// payment-webhook -- a InfinitePay avisa que um Pix caiu
// =============================================================================
// Recebe a notificacao que o Checkout dispara para a webhook_url informada na
// criacao da cobranca.
//
// ┌─────────────────────── ATENCAO AO FAZER O DEPLOY ───────────────────────┐
// │ Esta function precisa ser PUBLICA -- a InfinitePay nao manda JWT:       │
// │                                                                         │
// │   supabase functions deploy payment-webhook --no-verify-jwt             │
// │                                                                         │
// │ As outras duas (payment-intent-create, payment-confirm) NAO levam essa  │
// │ flag: elas so devem aceitar chamadas do app autenticado.                │
// └─────────────────────────────────────────────────────────────────────────┘
//
// ESTE ENDPOINT E PUBLICO E SEM ASSINATURA.
//   A documentacao da InfinitePay nao descreve HMAC nem segredo compartilhado
//   para o webhook. Ou seja: qualquer pessoa que descubra esta URL consegue
//   postar um JSON dizendo que o pedido X foi pago.
//
//   Por isso o corpo do webhook e tratado apenas como um AVISO ("va olhar esse
//   pedido"), nunca como a afirmacao de que ele foi pago. confirmIntent()
//   ignora os valores recebidos aqui e pergunta direto a InfinitePay.
//
//   Consequencia pratica: forjar uma chamada para ca nao libera nada. No pior
//   caso gera uma consulta a mais ao provedor.
//
// Corpo enviado pela InfinitePay:
//   { invoice_slug, amount, paid_amount, installments, capture_method,
//     transaction_nsu, order_nsu, receipt_url, items }
//
// Respostas: 200 = processado. 400 = a InfinitePay tenta reenviar depois.
// =============================================================================

import { corsHeaders, json } from "../_shared/config.ts";
import { logEvent, serviceClient } from "../_shared/db.ts";
import { confirmIntent } from "../_shared/confirm.ts";
import type { WebhookPayload } from "../_shared/infinitepay.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false }, 405);

  const db = serviceClient();

  try {
    const body: WebhookPayload = await req.json().catch(() => ({}));

    // Registra a chegada antes de qualquer validacao: mesmo um webhook forjado
    // vira registro de auditoria, e um pico deles indica que alguem descobriu
    // a URL e esta sondando.
    await logEvent(db, { type: "deeplink_returned", payload: { via: "webhook", ...body } });

    const orderNsu = String(body.order_nsu ?? "").trim();
    const transactionNsu = String(body.transaction_nsu ?? "").trim();

    if (!orderNsu || !transactionNsu) {
      // 400 faz a InfinitePay reenviar. Como o payload veio incompleto, um
      // reenvio pode de fato trazer os campos -- vale a pena.
      console.warn("[webhook] payload sem order_nsu/transaction_nsu");
      return json({ ok: false, error: "PAYLOAD_INCOMPLETO" }, 400);
    }

    const result = await confirmIntent(db, {
      orderNsu,
      transactionNsu,
      slug: body.invoice_slug ?? null,
      source: "webhook",
      // Note que amount/paid_amount do webhook NAO sao repassados: o valor
      // conferido e o que a InfinitePay devolve no payment_check, nao o que
      // chegou neste corpo (que pode ser forjado).
    });

    // ---------------------------------------------------- codigo de retorno --
    // 200 encerra a fila de reenvio da InfinitePay. So devolvemos erro quando
    // um reenvio teria chance de dar certo:
    //
    //   - PROVEDOR_INDISPONIVEL / ERRO_INTERNO -> 503, vale reenviar
    //   - recusado, expirado, ja pago          -> 200, reenviar nao muda nada
    //
    // Devolver erro num caso definitivo faria a InfinitePay reenviar em laco.
    if (result.retry) {
      return json({ ok: false, error: result.code }, 503);
    }

    if (result.status === "not_found") {
      // Pedido inexistente: ou e sondagem, ou um webhook de outro sistema que
      // caiu aqui. Reenviar nao resolve -- 200 encerra.
      console.warn("[webhook] order_nsu desconhecido");
      return json({ ok: true, ignored: true }, 200);
    }

    return json({ ok: true, status: result.status }, 200);
  } catch (e) {
    console.error("[webhook] erro inesperado", e);
    // 503: erro nosso, o reenvio da InfinitePay pode dar certo.
    return json({ ok: false }, 503);
  }
});
