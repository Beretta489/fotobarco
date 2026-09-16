// =============================================================================
// payment-confirm -- o app avisa que voltou do InfiniteTap
// =============================================================================
// Chamado pelo tablet logo apos o deeplink de retorno da InfinitePay.
//
// O QUE CHEGA AQUI NAO E PROVA DE PAGAMENTO. Qualquer app instalado no aparelho
// consegue disparar "fotobarco://payment/result?order_id=X&nsu=inventado", e
// qualquer um com a anon key consegue chamar este endpoint. Quem decide se o
// pedido foi pago e confirmIntent(), que pergunta a InfinitePay.
//
// Entrada: { orderNsu, transactionNsu, aut?, cardBrand?, warning? }
// Saida:   { ok, status, orderId, downloadToken?, downloadExpiresAt? }
// =============================================================================

import { corsHeaders, errorResponse, json } from "../_shared/config.ts";
import { logEvent, serviceClient } from "../_shared/db.ts";
import { confirmIntent } from "../_shared/confirm.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("METODO_NAO_PERMITIDO", 405);

  const db = serviceClient();

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return errorResponse("PAYLOAD_INVALIDO");

    const orderNsu = String(body.orderNsu ?? "").trim();
    if (!orderNsu) return errorResponse("ORDER_NSU_AUSENTE");

    // Guarda o retorno cru antes de validar: se algo der errado, a auditoria
    // mostra exatamente o que o aparelho mandou. redact() limpa o sensivel.
    await logEvent(db, { type: "deeplink_returned", payload: body });

    const result = await confirmIntent(db, {
      orderNsu,
      transactionNsu: body.transactionNsu ?? null,
      aut: body.aut ?? null,
      cardBrand: body.cardBrand ?? null,
      warning: body.warning ?? null,
      source: "deeplink",
    });

    return json({
      ok: result.status === "paid",
      status: result.status,
      error: result.code,
      orderId: result.orderId,
      downloadToken: result.downloadToken,
      downloadExpiresAt: result.downloadExpiresAt,
      alreadyConfirmed: result.alreadyConfirmed,
      retry: result.retry,
    }, result.httpStatus);
  } catch (e) {
    console.error("[confirm] erro inesperado", e);
    return errorResponse("ERRO_INTERNO", 500);
  }
});
