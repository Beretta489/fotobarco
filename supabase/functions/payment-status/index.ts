// =============================================================================
// payment-status -- o tablet pergunta "ja caiu?"
// =============================================================================
// Usado pela tela de Pix enquanto o cliente escaneia o QR Code no celular dele.
//
// ┌──────────────────── LIMITACAO IMPORTANTE DO FLUXO PIX ─────────────────────┐
// │ O payment_check da InfinitePay exige 'transaction_nsu' -- e esse valor so  │
// │ nasce QUANDO o pagamento acontece, chegando pelo webhook.                  │
// │                                                                            │
// │ Antes disso o tablet nao tem o que perguntar ao provedor. Ou seja:         │
// │                                                                            │
// │   quem confirma um Pix e SEMPRE o webhook (payment-webhook).               │
// │   este endpoint so LE o resultado que o webhook ja gravou.                 │
// │                                                                            │
// │ Consequencia: se o webhook nao chegar, o Pix fica pendente mesmo tendo     │
// │ sido pago. Por isso existe o modo de recuperacao abaixo.                   │
// └────────────────────────────────────────────────────────────────────────────┘
//
// Entrada: { orderNsu }
// Saida:   { ok, status, orderId, downloadToken?, downloadExpiresAt? }
//
// ┌──────── ESTE ENDPOINT SO LE. NAO CONFIRMA PAGAMENTO. ─────────────────────┐
// │ Ele ja aceitou um 'transactionNsu' para recuperacao manual, e isso era um │
// │ furo: quem chama aqui e o tablet, com a ANON KEY -- que esta dentro do    │
// │ APK e portanto e publica. Pior, aquele caminho rodava como source         │
// │ 'polling', que e isento do teto de tentativas (de proposito, porque o     │
// │ polling normal nao adivinha nada). Juntando as duas coisas, dava para     │
// │ varrer transaction_nsu contra um order_nsu conhecido, sem limite.         │
// │                                                                           │
// │ A recuperacao manual agora vive em payment-recover, que exige admin       │
// │ logado de verdade e conta as tentativas.                                  │
// └───────────────────────────────────────────────────────────────────────────┘
// =============================================================================

import { corsHeaders, errorResponse, json } from "../_shared/config.ts";
import { serviceClient } from "../_shared/db.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("METODO_NAO_PERMITIDO", 405);

  const db = serviceClient();

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return errorResponse("PAYLOAD_INVALIDO");

    const orderNsu = String(body.orderNsu ?? "").trim();
    if (!orderNsu) return errorResponse("ORDER_NSU_AUSENTE");

    // Um 'transactionNsu' que chegue aqui e ignorado em silencio -- a porta de
    // confirmacao manual e a payment-recover. Responder com erro so informaria
    // a quem esta sondando que o campo um dia existiu.

    // ------------------------------- consulta simples (polling normal) ------
    const { data: intent, error } = await db
      .from("payment_intents")
      .select("id, order_id, status, expires_at")
      .eq("order_nsu", orderNsu)
      .maybeSingle();

    if (error) {
      console.error("[status] falha ao consultar intent", error);
      return errorResponse("ERRO_INTERNO", 500);
    }
    if (!intent) return errorResponse("PAGAMENTO_NAO_ENCONTRADO", 404);

    if (intent.status === "paid") {
      const { data: order } = await db
        .from("orders")
        .select("id, download_token, download_expires_at")
        .eq("id", intent.order_id)
        .single();

      return json({
        ok: true,
        status: "paid",
        orderId: intent.order_id,
        downloadToken: order?.download_token ?? null,
        downloadExpiresAt: order?.download_expires_at ?? null,
      });
    }

    // Expirou mas ninguem marcou ainda (o polling costuma ser quem percebe).
    if (intent.status === "pending" && new Date(intent.expires_at).getTime() < Date.now()) {
      await db.from("payment_intents")
        .update({ status: "expired", failure_reason: "expirado_sem_pagamento" })
        .eq("id", intent.id)
        .eq("status", "pending");

      return json({ ok: false, status: "expired", error: "PAGAMENTO_EXPIRADO" }, 200);
    }

    return json({ ok: false, status: intent.status, orderId: intent.order_id }, 200);
  } catch (e) {
    console.error("[status] erro inesperado", e);
    return errorResponse("ERRO_INTERNO", 500);
  }
});
