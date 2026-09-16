// =============================================================================
// CONFIRMACAO DE PAGAMENTO -- o coracao da seguranca do sistema
// =============================================================================
// Tres caminhos diferentes podem dizer "esse pedido foi pago":
//
//   1. payment-confirm  -- o app, depois do retorno do deeplink (InfiniteTap)
//   2. payment-webhook  -- a InfinitePay, quando o Pix cai
//   3. payment-status   -- o app, perguntando de tempos em tempos (Pix)
//
// NENHUM dos tres e confiavel por si so:
//   - o deeplink chega pelo aparelho do cliente e pode ser forjado;
//   - o webhook da InfinitePay NAO tem assinatura, entao qualquer um que
//     descubra a URL consegue posta-lo;
//   - o polling e disparado pelo proprio app.
//
// Por isso os tres entram AQUI, e aqui as mesmas cinco validacoes sao aplicadas
// antes de qualquer pedido virar 'paid'. Centralizar e proposital: se cada
// entrada tivesse sua propria copia da regra, bastaria uma delas esquecer uma
// checagem para abrir o sistema inteiro.
// =============================================================================

import { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { config } from "./config.ts";
import { generateDownloadToken, logEvent } from "./db.ts";
import { checkTransaction } from "./infinitepay.ts";

const DOWNLOAD_TTL_DAYS = 30;

export interface ConfirmInput {
  orderNsu: string;
  transactionNsu?: string | null;
  slug?: string | null;
  /** Campo 'warning' do deeplink: presente = transacao nao concluida. */
  warning?: string | null;
  /** De onde veio a tentativa -- so para auditoria. */
  source: "deeplink" | "webhook" | "polling";
  /** Dados opcionais do cartao, para o comprovante. */
  aut?: string | null;
  cardBrand?: string | null;
}

export interface ConfirmResult {
  status: "paid" | "failed" | "expired" | "pending" | "not_found";
  httpStatus: number;
  code?: string;
  orderId?: string;
  downloadToken?: string | null;
  downloadExpiresAt?: string | null;
  alreadyConfirmed?: boolean;
  /** true = vale a pena o app tentar de novo (falha temporaria). */
  retry?: boolean;
}

export async function confirmIntent(
  db: SupabaseClient,
  input: ConfirmInput,
): Promise<ConfirmResult> {
  const { orderNsu, source } = input;
  const transactionNsu = (input.transactionNsu ?? "").trim();

  // ------------------------------------------------ 1. localizar o intent --
  const { data: intent, error: intentError } = await db
    .from("payment_intents")
    .select("*")
    .eq("order_nsu", orderNsu)
    .maybeSingle();

  if (intentError) {
    console.error("[confirm] falha ao buscar intent", intentError);
    return { status: "pending", httpStatus: 500, code: "ERRO_INTERNO", retry: true };
  }

  // Resposta identica para "nao existe" e "nao e seu": nao confirmamos a
  // existencia de um nsu para quem esta sondando.
  if (!intent) {
    return { status: "not_found", httpStatus: 404, code: "PAGAMENTO_NAO_ENCONTRADO" };
  }

  // ----------------------------------------------------- 2. idempotencia --
  // As tres entradas podem chegar para o MESMO pagamento: o webhook do Pix, o
  // polling do app e um retry do usuario. Repetir devolve o mesmo resultado --
  // nunca libera duas vezes nem cobra de novo.
  if (intent.status === "paid") {
    const { data: order } = await db
      .from("orders")
      .select("id, download_token, download_expires_at")
      .eq("id", intent.order_id)
      .single();

    return {
      status: "paid",
      httpStatus: 200,
      alreadyConfirmed: true,
      orderId: intent.order_id,
      downloadToken: order?.download_token ?? null,
      downloadExpiresAt: order?.download_expires_at ?? null,
    };
  }

  if (["failed", "canceled", "expired"].includes(intent.status)) {
    return {
      status: intent.status as "failed" | "expired",
      httpStatus: 409,
      code: "PAGAMENTO_ENCERRADO",
      orderId: intent.order_id,
    };
  }

  // ---------------------------------------------- 3. validade e tentativas --
  if (new Date(intent.expires_at).getTime() < Date.now()) {
    await db.from("payment_intents")
      .update({ status: "expired", failure_reason: "expirado_antes_da_confirmacao" })
      .eq("id", intent.id)
      .eq("status", "pending");

    await logEvent(db, {
      type: "payment_failed", intentId: intent.id, orderId: intent.order_id,
      payload: { reason: "expired", source },
    });

    return { status: "expired", httpStatus: 409, code: "PAGAMENTO_EXPIRADO", orderId: intent.order_id };
  }

  // Trava de forca bruta: sem isso da para varrer transactionNsu contra um
  // orderNsu conhecido ate acertar uma transacao valida de outro cliente.
  //
  // O polling do Pix e isento: ele nao adivinha nada -- so pergunta se o
  // pagamento ja caiu, e roda a cada poucos segundos por minutos a fio.
  if (source !== "polling" && intent.confirm_attempts >= config.maxConfirmAttempts) {
    await logEvent(db, {
      type: "rate_limited", intentId: intent.id, orderId: intent.order_id,
      payload: { attempts: intent.confirm_attempts, source },
    });
    return { status: "pending", httpStatus: 429, code: "TENTATIVAS_EXCEDIDAS", orderId: intent.order_id };
  }

  if (source !== "polling") {
    await db.from("payment_intents")
      .update({ confirm_attempts: intent.confirm_attempts + 1 })
      .eq("id", intent.id);
  }

  // ------------------------------------ 4. o proprio retorno acusou falha --
  if (input.warning) {
    await failIntent(db, intent, `provider_warning: ${String(input.warning).slice(0, 200)}`, source);
    return { status: "failed", httpStatus: 402, code: "PAGAMENTO_RECUSADO", orderId: intent.order_id };
  }

  // Sem transaction_nsu nao ha o que conferir. No polling isso e normal (o
  // cliente ainda nao pagou); nos outros caminhos e falha.
  if (!transactionNsu) {
    if (source === "polling") {
      return { status: "pending", httpStatus: 200, code: "AGUARDANDO_PAGAMENTO", orderId: intent.order_id };
    }
    await failIntent(db, intent, "retorno_sem_transaction_nsu", source);
    return { status: "failed", httpStatus: 402, code: "PAGAMENTO_RECUSADO", orderId: intent.order_id };
  }

  // -------------------------------------------------------- 5. anti-replay --
  // Uma transacao da InfinitePay quita um unico pedido. A constraint unique em
  // transaction_nsu garante isso no banco; checar antes so melhora a mensagem.
  const { data: jaUsada } = await db
    .from("payment_intents")
    .select("id")
    .eq("transaction_nsu", transactionNsu)
    .neq("id", intent.id)
    .maybeSingle();

  if (jaUsada) {
    await logEvent(db, {
      type: "replay_blocked", intentId: intent.id, orderId: intent.order_id,
      payload: { transactionNsu, usadaEm: jaUsada.id, source },
    });
    await failIntent(db, intent, "transacao_ja_utilizada_em_outro_pedido", source);
    return { status: "failed", httpStatus: 409, code: "TRANSACAO_JA_UTILIZADA", orderId: intent.order_id };
  }

  // -------------------------------------- 6. conferir com a InfinitePay ----
  if (config.infinitepay.requireProviderCheck) {
    let check;
    try {
      check = await checkTransaction({
        orderNsu,
        transactionNsu,
        // O Pix precisa do invoice_slug; o Tap nao tem slug e passa null.
        slug: input.slug ?? intent.invoice_slug ?? null,
      });

      await logEvent(db, {
        type: "provider_checked", intentId: intent.id, orderId: intent.order_id,
        payload: { ...(check.raw as object), source },
      });
    } catch (e) {
      // Provedor fora do ar NAO vira recusa. O cliente pode ter pago de
      // verdade; tratar indisponibilidade como "nao pagou" faria ele pagar sem
      // receber as fotos.
      console.error("[confirm] provedor indisponivel", e);
      await logEvent(db, {
        type: "payment_failed", intentId: intent.id, orderId: intent.order_id,
        payload: { reason: "provider_unreachable", detail: String(e).slice(0, 300), source },
      });
      return { status: "pending", httpStatus: 503, code: "PROVEDOR_INDISPONIVEL", retry: true, orderId: intent.order_id };
    }

    if (!check.paid) {
      // No polling, "ainda nao pago" e o estado esperado -- nao e falha.
      if (source === "polling") {
        return { status: "pending", httpStatus: 200, code: "AGUARDANDO_PAGAMENTO", orderId: intent.order_id };
      }
      await failIntent(db, intent, "provedor_nao_confirmou_pagamento", source);
      return { status: "failed", httpStatus: 402, code: "PAGAMENTO_NAO_CONFIRMADO", orderId: intent.order_id };
    }

    // --- valor: a checagem que impede pagar R$ 1 e levar R$ 100 em fotos ---
    //
    // Comparamos com 'amount' (valor da cobranca), nunca com 'paid_amount':
    // em compra parcelada o paid_amount vem MAIOR por causa dos juros, e usar
    // ele aqui recusaria venda legitima.
    if (check.amountCents !== null && check.amountCents !== intent.amount_cents) {
      await logEvent(db, {
        type: "amount_mismatch", intentId: intent.id, orderId: intent.order_id,
        payload: { esperado: intent.amount_cents, recebido: check.amountCents, source },
      });
      await failIntent(
        db, intent,
        `valor_divergente: esperado ${intent.amount_cents}, recebido ${check.amountCents}`,
        source,
      );
      return { status: "failed", httpStatus: 409, code: "VALOR_DIVERGENTE", orderId: intent.order_id };
    }
  } else {
    // Modo sem conferencia: aceita o aviso como verdade. Inseguro por
    // definicao -- existe so para testar o fluxo antes de fechar contrato.
    console.warn("[confirm] INFINITEPAY_REQUIRE_PROVIDER_CHECK=false -- NAO USE EM PRODUCAO");
  }

  // ------------------------------------------- 7. confirmar e liberar -----
  const downloadToken = generateDownloadToken();
  const downloadExpiresAt = new Date(Date.now() + DOWNLOAD_TTL_DAYS * 86_400_000);

  // O update e condicionado a status='pending'. Se o webhook e o polling
  // chegarem juntos, so um encontra o registro pendente -- o outro cai na
  // idempotencia do passo 2. E a trava contra dupla liberacao.
  const { data: updatedIntent, error: updateError } = await db
    .from("payment_intents")
    .update({
      status: "paid",
      transaction_nsu: transactionNsu,
      authorization_code: input.aut ? String(input.aut).slice(0, 50) : null,
      card_brand: input.cardBrand ? String(input.cardBrand).slice(0, 30) : null,
      merchant_handle: config.infinitepay.handle,
      confirmed_at: new Date().toISOString(),
    })
    .eq("id", intent.id)
    .eq("status", "pending")
    .select()
    .maybeSingle();

  if (updateError || !updatedIntent) {
    // Corrida perdida: outra entrada confirmou primeiro. Nao e erro.
    console.warn("[confirm] intent confirmado em paralelo", intent.id, updateError);
    const { data: order } = await db
      .from("orders")
      .select("download_token, download_expires_at")
      .eq("id", intent.order_id)
      .single();

    return {
      status: "paid", httpStatus: 200, alreadyConfirmed: true,
      orderId: intent.order_id,
      downloadToken: order?.download_token ?? null,
      downloadExpiresAt: order?.download_expires_at ?? null,
    };
  }

  const { data: paidOrder, error: orderError } = await db
    .from("orders")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      download_token: downloadToken,
      download_expires_at: downloadExpiresAt.toISOString(),
    })
    .eq("id", intent.order_id)
    .select("id, download_token, download_expires_at")
    .single();

  if (orderError) {
    // Dinheiro capturado mas pedido nao atualizou: precisa de atencao humana.
    // O intent ja esta 'paid', entao a auditoria mostra o descasamento.
    console.error("[confirm] CRITICO: pago mas pedido nao atualizado", intent.order_id, orderError);
    await logEvent(db, {
      type: "payment_failed", intentId: intent.id, orderId: intent.order_id,
      payload: { reason: "order_update_failed_after_capture", detail: orderError.message },
    });
    return { status: "pending", httpStatus: 500, code: "ERRO_AO_LIBERAR_PEDIDO", orderId: intent.order_id };
  }

  await logEvent(db, {
    type: "payment_confirmed", intentId: intent.id, orderId: intent.order_id,
    payload: { amountCents: intent.amount_cents, method: intent.payment_method, source },
  });

  return {
    status: "paid",
    httpStatus: 200,
    orderId: intent.order_id,
    downloadToken: paidOrder.download_token,
    downloadExpiresAt: paidOrder.download_expires_at,
  };
}

/** Marca o intent como falho e registra o motivo na auditoria. */
async function failIntent(
  db: SupabaseClient,
  intent: { id: string; order_id: string },
  reason: string,
  source: string,
): Promise<void> {
  await db.from("payment_intents")
    .update({ status: "failed", failure_reason: reason.slice(0, 300) })
    .eq("id", intent.id)
    .eq("status", "pending");

  await logEvent(db, {
    type: "payment_failed",
    intentId: intent.id,
    orderId: intent.order_id,
    payload: { reason, source },
  });
}
