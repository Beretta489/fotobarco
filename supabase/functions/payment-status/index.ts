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
// │                                                                            │
// │ EFI: essa limitacao NAO existe. O txid e conhecido desde a criacao, entao  │
// │ este endpoint tambem consulta a cobranca no Efi (com freio de frequencia)  │
// │ e confirma por la -- e a reserva do webhook.                               │
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

import { config, corsHeaders, errorResponse, json } from "../_shared/config.ts";
import { serviceClient } from "../_shared/db.ts";
import { confirmIntent } from "../_shared/confirm.ts";
import { providerForIntent } from "../_shared/pix/index.ts";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

/**
 * Reserva o direito de consultar o provedor agora. Update condicionado: dois
 * tablets (ou duas abas) perguntando juntos -> so um consulta.
 */
async function reservarConsulta(db: SupabaseClient, intentId: string): Promise<boolean> {
  const agora = new Date();
  const limite = new Date(agora.getTime() - config.pix.pollMinIntervalSeconds * 1000).toISOString();

  const { data, error } = await db
    .from("payment_intents")
    .update({ last_provider_check_at: agora.toISOString() })
    .eq("id", intentId)
    .or(`last_provider_check_at.is.null,last_provider_check_at.lt."${limite}"`)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[status] falha ao reservar consulta", error);
    return false;
  }
  return Boolean(data);
}

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
      .select("id, order_id, status, expires_at, payment_method, provider, provider_env")
      .eq("order_nsu", orderNsu)
      .maybeSingle();

    if (error) {
      console.error("[status] falha ao consultar intent", error);
      return errorResponse("ERRO_INTERNO", 500);
    }
    if (!intent) return errorResponse("PAGAMENTO_NAO_ENCONTRADO", 404);

    // ------------------------- reserva: consultar a cobranca no provedor ----
    // Provedores que consultam por txid (Efi) permitem conferir o Pix mesmo
    // que o webhook nao chegue. Isto NAO reabre o furo descrito acima: a
    // entrada continua sendo so o orderNsu (128 bits aleatorios), e quem
    // decide e o GET /v2/cob/:txid -- nao ha nada para o chamador adivinhar.
    //
    // Freio: no maximo uma consulta ao provedor a cada
    // EFI_POLL_MIN_INTERVAL_SECONDS por intent, reservada de forma atomica.
    // Fora da janela, cai na leitura simples abaixo.
    if (
      intent.payment_method === "pix"
      && ["pending", "expired"].includes(intent.status)
      && providerForIntent(intent).checkCharge
      && await reservarConsulta(db, intent.id)
    ) {
      const r = await confirmIntent(db, { orderNsu, source: "polling" });

      if (r.status === "paid") {
        return json({
          ok: true,
          status: "paid",
          orderId: r.orderId,
          downloadToken: r.downloadToken ?? null,
          downloadExpiresAt: r.downloadExpiresAt ?? null,
        });
      }
      if (r.status === "expired" || r.status === "failed") {
        return json({ ok: false, status: r.status, error: r.code, orderId: intent.order_id }, 200);
      }
      // pending / provedor fora do ar: o tablet segue esperando.
      return json({ ok: false, status: "pending", orderId: intent.order_id }, 200);
    }

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
