// =============================================================================
// payment-attendant-confirm -- o atendente libera credito, debito ou dinheiro
// =============================================================================
// O cliente escolheu pagar com cartao ou dinheiro. O atendente recebe fora do
// app (maquininha propria ou especie) e digita a senha no tablet. Senha certa
// = pedido pago e fotos liberadas.
//
// A SENHA E A UNICA COISA ENTRE O TABLET E AS FOTOS. Por isso:
//   - ela vive so no secret ATTENDANT_PASSWORD, nunca no app (APK e publico);
//   - sem o secret, a function recusa tudo (fail-closed);
//   - a comparacao e em tempo constante;
//   - ha limite de erros POR PEDIDO e GLOBAL, reservados de forma atomica em
//     attendant_attempts -- o global existe porque qualquer um com a anon key
//     cria pedidos novos, e so o limite por pedido seria contornado abrindo um
//     pedido a cada poucas tentativas.
//
// So vale para intents credit/debit/cash. Um intent Pix nunca e liberado aqui:
// Pix so sai com a InfinitePay confirmando (confirmIntent).
//
// Entrada: { orderNsu, password }
// Saida:   { ok, status, error?, orderId, downloadToken?, downloadExpiresAt? }
// =============================================================================

import { config, corsHeaders, errorResponse, json } from "../_shared/config.ts";
import { logEvent, serviceClient } from "../_shared/db.ts";
import { releaseIntent } from "../_shared/confirm.ts";

const METODOS_ATENDENTE = ["credit", "debit", "cash"];

/**
 * Compara a senha sem vazar, pelo tempo de resposta, quantos caracteres
 * bateram. Comparar os hashes iguala tambem o tamanho das duas entradas.
 */
async function senhaConfere(digitada: string, correta: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(digitada)),
    crypto.subtle.digest("SHA-256", enc.encode(correta)),
  ]);
  const va = new Uint8Array(a);
  const vb = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("METODO_NAO_PERMITIDO", 405);

  const db = serviceClient();
  const cfg = config.attendant;

  try {
    if (!cfg.password) {
      console.error("[attendant] ATTENDANT_PASSWORD nao configurado -- liberacao desligada");
      return errorResponse("LIBERACAO_DESATIVADA", 503);
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return errorResponse("PAYLOAD_INVALIDO");

    const orderNsu = String(body.orderNsu ?? "").trim();
    if (!orderNsu) return errorResponse("ORDER_NSU_AUSENTE");

    // Teto de tamanho: a senha vai para um hash, mas nao ha motivo para
    // aceitar megabytes.
    const password = String(body.password ?? "").slice(0, 200);
    if (!password) return errorResponse("SENHA_AUSENTE");

    // ------------------------------------------------ 1. localizar o intent --
    const { data: intent, error: intentError } = await db
      .from("payment_intents")
      .select("*")
      .eq("order_nsu", orderNsu)
      .maybeSingle();

    if (intentError) {
      console.error("[attendant] falha ao buscar intent", intentError);
      return errorResponse("ERRO_INTERNO", 500);
    }

    if (!intent || !METODOS_ATENDENTE.includes(intent.payment_method)) {
      return errorResponse("PAGAMENTO_NAO_ENCONTRADO", 404);
    }

    // ----------------------------------------------------- 2. idempotencia --
    // Toque duplo no "confirmar" ou retry depois de queda de rede: devolve o
    // mesmo pedido liberado, sem pedir a senha de novo.
    if (intent.status === "paid") {
      const { data: order } = await db
        .from("orders")
        .select("download_token, download_expires_at")
        .eq("id", intent.order_id)
        .single();

      return json({
        ok: true, status: "paid", alreadyConfirmed: true,
        orderId: intent.order_id,
        downloadToken: order?.download_token ?? null,
        downloadExpiresAt: order?.download_expires_at ?? null,
      });
    }

    if (intent.status !== "pending") {
      return json({ ok: false, status: intent.status, error: "PAGAMENTO_ENCERRADO" }, 409);
    }

    if (new Date(intent.expires_at).getTime() < Date.now()) {
      await db.from("payment_intents")
        .update({ status: "expired", failure_reason: "expirado_antes_do_atendente" })
        .eq("id", intent.id)
        .eq("status", "pending");
      return json({ ok: false, status: "expired", error: "PAGAMENTO_EXPIRADO" }, 409);
    }

    // ------------------------------------------- 3. reservar a tentativa --
    // A tentativa conta ANTES de a senha ser conferida, e a reserva e atomica
    // no banco. Contar aqui com SELECT deixaria uma rajada de requisicoes em
    // paralelo passar inteira pelo limite.
    const { data: reserva, error: reservaError } = await db.rpc(
      "attendant_reserve_attempt",
      {
        p_intent_id: intent.id,
        p_max_per_intent: cfg.maxAttemptsPerIntent,
        p_max_global: cfg.maxFailuresGlobal,
        p_window_minutes: cfg.failureWindowMinutes,
      },
    );

    // Sem conseguir reservar, nao da para garantir o limite: recusa.
    if (reservaError || !reserva) {
      console.error("[attendant] falha ao reservar tentativa", reservaError);
      return errorResponse("ERRO_INTERNO", 500);
    }

    if (reserva.blocked) {
      console.warn(`[attendant] bloqueado (${reserva.blocked})`, intent.id);
      await logEvent(db, {
        type: "rate_limited", intentId: intent.id, orderId: intent.order_id,
        payload: { blocked: reserva.blocked, source: "attendant" },
      });
      const code = reserva.blocked === "global" ? "BLOQUEIO_TEMPORARIO" : "TENTATIVAS_EXCEDIDAS";
      return json({ ok: false, status: "pending", error: code }, 429);
    }

    // ------------------------------------------------------ 4. a senha -----
    if (!(await senhaConfere(password, cfg.password))) {
      await logEvent(db, {
        type: "attendant_rejected", intentId: intent.id, orderId: intent.order_id,
        payload: { source: "attendant" },
      });
      return json({ ok: false, status: "pending", error: "SENHA_INCORRETA" }, 401);
    }

    // Senha certa: esta tentativa nao conta contra os limites.
    await db.from("attendant_attempts").update({ succeeded: true }).eq("id", reserva.id);

    // ------------------------------------------------------ 5. liberar -----
    const result = await releaseIntent(db, intent, {
      statusLiberaveis: ["pending"],
      intentFields: {},
      eventType: "attendant_confirmed",
      source: "attendant",
    });

    return json({
      ok: result.status === "paid",
      status: result.status,
      error: result.code,
      orderId: result.orderId,
      downloadToken: result.downloadToken,
      downloadExpiresAt: result.downloadExpiresAt,
      alreadyConfirmed: result.alreadyConfirmed,
    }, result.httpStatus);
  } catch (e) {
    console.error("[attendant] erro inesperado", e);
    return errorResponse("ERRO_INTERNO", 500);
  }
});
