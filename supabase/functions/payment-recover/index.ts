// =============================================================================
// payment-recover -- liberacao manual de um Pix que o webhook nao confirmou
// =============================================================================
// POR QUE ESTA FUNCTION EXISTE
//
// O payment_check da InfinitePay exige 'transaction_nsu', e esse valor so nasce
// QUANDO o pagamento acontece -- chegando ate nos pelo webhook. Se o webhook se
// perde (internet do barco caiu, provedor atrasou, URL fora do ar), o Pix fica
// 'pending' no nosso banco mesmo tendo sido pago, e o intent expira em 15
// minutos. Resultado: o cliente pagou e nao recebe as fotos.
//
// Aqui o operador informa o NSU que aparece no comprovante do celular do
// cliente, e o servidor pergunta a InfinitePay se aquela transacao existe e se
// o valor bate.
//
// ISTO NAO E UM ATALHO. A liberacao passa pelo MESMO confirmIntent() do fluxo
// normal -- conferencia no provedor, valor igual, anti-replay, teto de
// tentativas e update condicionado ao status. O unico ponto que muda e a JANELA
// DE TEMPO: o fluxo automatico morre em 15 minutos, a recuperacao vale por
// alguns dias (PAYMENT_RECOVERY_WINDOW_DAYS).
//
// POR QUE E UMA FUNCTION SEPARADA, e nao mais um parametro do payment-status:
//   payment-status aceita a anon key, porque quem chama e o tablet no meio da
//   venda -- e a anon key esta dentro do APK, ou seja, e publica. Dar a ela o
//   poder de ignorar a expiracao seria entregar esse poder a qualquer pessoa
//   que baixe o app. Esta function exige um usuario REALMENTE logado no painel.
//
// Entrada: { orderNsu, transactionNsu }
// Saida:   { ok, status, error?, orderId, downloadToken?, downloadExpiresAt? }
// =============================================================================

import { config, corsHeaders, errorResponse, json } from "../_shared/config.ts";
import { serviceClient } from "../_shared/db.ts";
import { confirmIntent } from "../_shared/confirm.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("METODO_NAO_PERMITIDO", 405);

  const db = serviceClient();

  try {
    // ------------------------------------------------ 1. quem esta pedindo --
    // verify_jwt do Supabase so garante que o token e valido -- e a ANON KEY
    // tambem e um token valido. Por isso perguntamos ao Auth quem e o portador:
    // com a anon key nao existe usuario, e getUser devolve erro.
    const token = (req.headers.get("Authorization") ?? "")
      .replace(/^Bearer\s+/i, "")
      .trim();

    if (!token) return errorResponse("NAO_AUTORIZADO", 401);

    const { data: { user }, error: authError } = await db.auth.getUser(token);

    if (authError || !user || user.role !== "authenticated") {
      console.warn("[recover] tentativa sem login valido");
      return errorResponse("NAO_AUTORIZADO", 401);
    }

    // Trava extra, opcional: com ADMIN_EMAIL cadastrado como secret, so aquela
    // conta libera pagamento na mao. Sem o secret, qualquer usuario autenticado
    // do projeto passa -- hoje so existe a conta do admin.
    const adminEmail = config.app.adminEmail;
    if (adminEmail && user.email?.toLowerCase() !== adminEmail.toLowerCase()) {
      console.warn("[recover] usuario logado nao e o admin configurado");
      return errorResponse("NAO_AUTORIZADO", 403);
    }

    // ------------------------------------------------------- 2. parametros --
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return errorResponse("PAYLOAD_INVALIDO");

    const orderNsu = String(body.orderNsu ?? "").trim();
    if (!orderNsu) return errorResponse("ORDER_NSU_AUSENTE");

    const transactionNsu = String(body.transactionNsu ?? "").trim();
    if (!transactionNsu) return errorResponse("NSU_AUSENTE");

    // ------------------------------------------- 3. mesma porta de sempre ---
    const result = await confirmIntent(db, {
      orderNsu,
      transactionNsu,
      source: "recovery",
    });

    console.log(
      `[recover] ${user.email ?? user.id} tentou liberar ${orderNsu}: ${result.status}`,
    );

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
    console.error("[recover] erro inesperado", e);
    return errorResponse("ERRO_INTERNO", 500);
  }
});
