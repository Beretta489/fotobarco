// =============================================================================
// CONFIRMACAO DE PAGAMENTO -- o coracao da seguranca do sistema
// =============================================================================
// Tres caminhos diferentes podem dizer "esse Pix foi pago":
//
//   1. payment-webhook  -- o Efi, quando o Pix cai
//   2. payment-status   -- o app, perguntando de tempos em tempos
//   3. payment-recover  -- o admin logado, liberando um Pix na mao
//
// NENHUM dos tres e prova de pagamento. Eles so dizem QUAL cobranca olhar; quem
// decide e a consulta GET /v2/cob/:txid no Efi (ver confirmByCharge()).
//
// (Credito, debito e dinheiro NAO passam por aqui: sao liberados pela senha do
// atendente em payment-attendant-confirm, que reaproveita releaseIntent().)
//
// Centralizar e proposital: se cada entrada tivesse sua propria copia da regra,
// bastaria uma delas esquecer uma checagem para abrir o sistema inteiro.
// =============================================================================

import { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { config } from "./config.ts";
import { generateDownloadToken, logEvent } from "./db.ts";
import { providerForIntent, type PixProvider } from "./pix/index.ts";
import { scheduleWhatsappDispatch } from "./whatsapp.ts";

const DOWNLOAD_TTL_DAYS = 30;

export interface ConfirmInput {
  orderNsu: string;
  /**
   * De onde veio a tentativa. Vale para auditoria E para duas regras:
   *
   *   'polling'  -- "ainda nao pago" nao e auditado a cada consulta.
   *   'recovery' -- operador logado liberando um Pix na mao. Unico caminho com
   *                 teto de tentativas (confirm_attempts).
   */
  source: "webhook" | "polling" | "recovery";
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

  // Resposta identica para "nao existe", "nao e Pix" e "nao e do Efi": nao
  // confirmamos a existencia de um nsu para quem esta sondando.
  const notFound: ConfirmResult = { status: "not_found", httpStatus: 404, code: "PAGAMENTO_NAO_ENCONTRADO" };
  if (!intent) return notFound;

  // Credito, debito e dinheiro so saem pela senha do atendente
  // (payment-attendant-confirm). Este caminho e exclusivo do Pix.
  if (intent.payment_method !== "pix") return notFound;

  const provider = providerForIntent(intent);
  if (!provider) return notFound;

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

  // -------------------------------------- 3. a prova: consulta da cobranca --
  return await confirmByCharge(db, intent, provider, source);
}

// =============================================================================
// CONFIRMACAO POR CONSULTA DA COBRANCA (Efi)
// =============================================================================
// Webhook, polling e recuperacao manual chegam aqui com o mesmo pedido:
// "confira o txid X". Nenhum deles traz prova -- quem diz se foi pago e o
// GET /v2/cob/:txid. O corpo do webhook nunca e usado para decidir pagamento.
//
// Regras, todas porque o provedor e a fonte da verdade e o txid existe antes
// do pagamento:
//
//   - 'expired' nao bloqueia: se o Efi diz CONCLUIDA com o valor certo, o
//     dinheiro entrou (o aviso so chegou depois do nosso prazo) e as fotos
//     saem. O limite continua sendo recoveryWindowDays.
//   - "ainda nao pago" nunca queima o intent: um webhook forjado ou adiantado
//     nao pode condenar um pedido que o cliente ainda vai pagar.
//   - Recuperacao manual nao precisa de NSU.
// =============================================================================

async function confirmByCharge(
  db: SupabaseClient,
  // deno-lint-ignore no-explicit-any
  intent: any,
  provider: PixProvider,
  source: ConfirmInput["source"],
): Promise<ConfirmResult> {
  const base = { orderId: intent.order_id };

  // 'failed' = alguma validacao ja recusou esta cobranca (valor divergente,
  // replay, cobranca removida). Reabrir anularia a recusa.
  if (["failed", "canceled"].includes(intent.status)) {
    return { ...base, status: intent.status, httpStatus: 409, code: "PAGAMENTO_ENCERRADO" };
  }

  const limite = new Date(intent.created_at).getTime() + config.recoveryWindowDays * 86_400_000;
  if (Date.now() > limite) {
    return { ...base, status: "expired", httpStatus: 409, code: "PAGAMENTO_EXPIRADO" };
  }

  // Teto de tentativas so para a recuperacao manual. Aqui nao ha NSU para
  // adivinhar (a entrada e so o txid), entao o teto servia apenas para nao
  // martelar o Efi -- e aplica-lo ao webhook deixaria quem conhece um txid
  // esgotar as tentativas e fazer o Efi parar de avisar. O webhook ja e
  // autenticado pelo segredo da URL; o polling e freado por
  // pollMinIntervalSeconds em payment-status.
  if (source === "recovery") {
    if (intent.confirm_attempts >= config.maxConfirmAttempts) {
      await logEvent(db, {
        type: "rate_limited", intentId: intent.id, orderId: intent.order_id,
        payload: { attempts: intent.confirm_attempts, source },
      });
      return { ...base, status: "pending", httpStatus: 429, code: "TENTATIVAS_EXCEDIDAS" };
    }
    await db.from("payment_intents")
      .update({ confirm_attempts: intent.confirm_attempts + 1 })
      .eq("id", intent.id);
  }

  // ------------------------------------------------- consulta ao provedor --
  let check;
  try {
    check = await provider.checkCharge(intent.order_nsu);
  } catch (e) {
    // Provedor fora do ar NAO vira recusa: o cliente pode ter pago.
    console.error("[confirm] provedor indisponivel", e);
    await logEvent(db, {
      type: "payment_failed", intentId: intent.id, orderId: intent.order_id,
      payload: { reason: "provider_unreachable", provider: provider.name, detail: String(e).slice(0, 300), source },
    });
    return { ...base, status: "pending", httpStatus: 503, code: "PROVEDOR_INDISPONIVEL", retry: true };
  }

  // O polling consulta a cada ~10 s; auditar cada "ainda ATIVA" geraria
  // dezenas de linhas por pedido. Do polling, so fica registrado o que muda.
  const statusMudou = Boolean(check.providerStatus) && check.providerStatus !== intent.provider_status;
  if (source !== "polling" || check.paid || statusMudou) {
    await logEvent(db, {
      type: "provider_checked", intentId: intent.id, orderId: intent.order_id,
      payload: { ...check.audit, paid: check.paid, source },
    });
  }

  if (statusMudou && check.providerStatus) {
    await db.from("payment_intents")
      .update({ provider_status: check.providerStatus.slice(0, 50) })
      .eq("id", intent.id);
  }

  // ------------------------------------------------------- nao foi pago ----
  if (!check.paid) {
    if (check.final) {
      await failIntent(db, intent, `cobranca_encerrada_no_provedor: ${check.providerStatus}`, source);
      return { ...base, status: "failed", httpStatus: 409, code: "PAGAMENTO_ENCERRADO" };
    }
    if (source === "recovery") {
      return { ...base, status: "failed", httpStatus: 402, code: "PAGAMENTO_NAO_CONFIRMADO" };
    }
    if (new Date(intent.expires_at).getTime() < Date.now()) {
      await db.from("payment_intents")
        .update({ status: "expired", failure_reason: "expirado_sem_pagamento" })
        .eq("id", intent.id)
        .eq("status", "pending");
      return { ...base, status: "expired", httpStatus: 409, code: "PAGAMENTO_EXPIRADO" };
    }
    return { ...base, status: "pending", httpStatus: 200, code: "AGUARDANDO_PAGAMENTO" };
  }

  // ---------------------------------------------------------- valor ------
  // A cobranca foi criada por nos com o valor do servidor; divergir aqui
  // significa algo muito errado (ou alguem mexendo na cobranca no painel).
  const valorOk = check.amountCents === intent.amount_cents
    && (check.paidAmountCents === null || check.paidAmountCents >= intent.amount_cents);

  if (!valorOk) {
    await logEvent(db, {
      type: "amount_mismatch", intentId: intent.id, orderId: intent.order_id,
      payload: { esperado: intent.amount_cents, cobranca: check.amountCents, pago: check.paidAmountCents, source },
    });
    await failIntent(db, intent, `valor_divergente: esperado ${intent.amount_cents}, cobranca ${check.amountCents}, pago ${check.paidAmountCents}`, source);
    return { ...base, status: "failed", httpStatus: 409, code: "VALOR_DIVERGENTE" };
  }

  // -------------------------------------------------------- anti-replay --
  // Um endToEndId quita um unico pedido (unique em transaction_nsu).
  const paymentId = check.paymentId!;
  const { data: jaUsada } = await db
    .from("payment_intents")
    .select("id")
    .eq("transaction_nsu", paymentId)
    .neq("id", intent.id)
    .maybeSingle();

  if (jaUsada) {
    await logEvent(db, {
      type: "replay_blocked", intentId: intent.id, orderId: intent.order_id,
      payload: { paymentId, usadaEm: jaUsada.id, source },
    });
    await failIntent(db, intent, "pagamento_ja_utilizado_em_outro_pedido", source);
    return { ...base, status: "failed", httpStatus: 409, code: "TRANSACAO_JA_UTILIZADA" };
  }

  // ------------------------------------------------- confirmar e liberar --
  // Idempotente: releaseIntent so atualiza se o status ainda for
  // pending/expired. Webhook + polling + reenvio do Efi chegando juntos ->
  // um libera, os outros recebem "ja pago" com o mesmo token.
  return await releaseIntent(db, intent, {
    statusLiberaveis: ["pending", "expired"],
    intentFields: {
      transaction_nsu: paymentId,
      provider_status: check.providerStatus?.slice(0, 50) ?? null,
    },
    eventType: "payment_confirmed",
    source,
  });
}

/**
 * Marca o intent como pago e libera o pedido (gera o token de download).
 *
 * Usado pelo Pix (confirmIntent) e pela liberacao do atendente. NAO valida
 * nada sobre o pagamento -- quem chama ja precisa ter decidido que o dinheiro
 * entrou. O que esta funcao garante e que a liberacao acontece uma vez so.
 */
export async function releaseIntent(
  db: SupabaseClient,
  intent: { id: string; order_id: string; amount_cents: number; payment_method: string },
  opts: {
    statusLiberaveis: string[];
    intentFields: Record<string, unknown>;
    eventType: "payment_confirmed" | "attendant_confirmed";
    source: string;
  },
): Promise<ConfirmResult> {
  const downloadToken = generateDownloadToken();
  const downloadExpiresAt = new Date(Date.now() + DOWNLOAD_TTL_DAYS * 86_400_000);

  // O update e condicionado ao status anterior. Se o webhook e o polling
  // chegarem juntos, so um encontra o registro pendente -- o outro cai na
  // idempotencia. E a trava contra dupla liberacao.
  const { data: updatedIntent, error: updateError } = await db
    .from("payment_intents")
    .update({
      ...opts.intentFields,
      status: "paid",
      confirmed_at: new Date().toISOString(),
    })
    .eq("id", intent.id)
    .in("status", opts.statusLiberaveis)
    .select()
    .maybeSingle();

  if (updateError || !updatedIntent) {
    // So e "corrida perdida" se o intent estiver MESMO pago agora. Erro
    // transitorio do banco, constraint violada ou o intent ter mudado para
    // failed/expired no meio do caminho NAO podem virar "pago" -- antes isso
    // respondia paid com token nulo e o tablet mostrava sucesso sem fotos.
    const { data: atual } = await db
      .from("payment_intents")
      .select("status")
      .eq("id", intent.id)
      .maybeSingle();

    if (atual?.status !== "paid") {
      console.error("[confirm] liberacao nao aplicada", intent.id, atual?.status, updateError);
      return {
        status: "pending", httpStatus: 503, code: "ERRO_INTERNO", retry: true,
        orderId: intent.order_id,
      };
    }

    // Corrida perdida: outra entrada confirmou primeiro. Nao e erro.
    console.warn("[confirm] intent confirmado em paralelo", intent.id);
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
    type: opts.eventType, intentId: intent.id, orderId: intent.order_id,
    payload: { amountCents: intent.amount_cents, method: intent.payment_method, source: opts.source },
  });

  // Fotos pelo WhatsApp. So aqui, na liberacao que GANHOU a corrida: as
  // repeticoes (idempotencia, corrida perdida) saem antes e nao reenviam.
  scheduleWhatsappDispatch(db, intent.order_id);

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
