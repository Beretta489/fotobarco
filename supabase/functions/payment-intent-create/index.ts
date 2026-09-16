// =============================================================================
// payment-intent-create -- abre uma cobranca (InfiniteTap ou Pix)
// =============================================================================
// O app manda O QUE o cliente escolheu. Nunca QUANTO custa.
//
// Entrada (JSON):
//   {
//     "sessionId":     "uuid",
//     "groupId":       "uuid",
//     "packageType":   "all" | "half" | "single",
//     "photoIds":      ["uuid", ...],
//     "extras":        [{ "id": "coca-lata", "quantity": 2 }],   // opcional
//     "clientPhone":   "84999998888",                            // opcional
//     "paymentMethod": "credit" | "debit" | "pix",
//     "installments":  1
//   }
//
// Saida (cartao):  { ok, intentId, orderId, orderNsu, amountCents, deeplink }
// Saida (pix):     { ok, intentId, orderId, orderNsu, amountCents, checkoutUrl }
//
// Repare que 'total' NAO aparece na entrada. Se um dia aparecer, e bug.
// =============================================================================

import { config, corsHeaders, errorResponse, json } from "../_shared/config.ts";
import { generateOrderNsu, logEvent, serviceClient } from "../_shared/db.ts";
import {
  buildInfiniteTapDeeplink,
  createCheckoutLink,
  maxInstallmentsFor,
} from "../_shared/infinitepay.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-9a-f][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Tetos de payload: evitam que um corpo gigante vire consulta cara no banco.
const MAX_PHOTOS = 500;
const MAX_EXTRAS = 50;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("METODO_NAO_PERMITIDO", 405);

  const db = serviceClient();

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return errorResponse("PAYLOAD_INVALIDO");

    // ---------------------------------------------------------- validacao --
    // Validar formato ANTES de tocar no banco: impede que string arbitraria
    // chegue a uma query como se fosse uuid.
    const sessionId = String(body.sessionId ?? "");
    const groupId = String(body.groupId ?? "");
    if (!UUID_RE.test(sessionId)) return errorResponse("SESSION_ID_INVALIDO");
    if (!UUID_RE.test(groupId)) return errorResponse("GROUP_ID_INVALIDO");

    const packageType = String(body.packageType ?? "");
    if (!["all", "half", "single"].includes(packageType)) {
      return errorResponse("PACOTE_INVALIDO");
    }

    const paymentMethod = String(body.paymentMethod ?? "credit");
    if (!["credit", "debit", "pix"].includes(paymentMethod)) {
      return errorResponse("METODO_PAGAMENTO_INVALIDO");
    }

    const photoIds: string[] = Array.isArray(body.photoIds) ? body.photoIds.map(String) : [];
    if (photoIds.length === 0) return errorResponse("PEDIDO_SEM_FOTOS");
    if (photoIds.length > MAX_PHOTOS) return errorResponse("EXCESSO_DE_FOTOS");
    if (!photoIds.every((id) => UUID_RE.test(id))) return errorResponse("PHOTO_ID_INVALIDO");

    // Duplicata silenciosa inflaria a contagem no pacote 'single'.
    const uniquePhotoIds = [...new Set(photoIds)];
    if (uniquePhotoIds.length !== photoIds.length) return errorResponse("FOTOS_DUPLICADAS");

    const extrasRaw = Array.isArray(body.extras) ? body.extras : [];
    if (extrasRaw.length > MAX_EXTRAS) return errorResponse("EXCESSO_DE_EXTRAS");

    // So id e quantidade atravessam. Qualquer preco que o app tenha mandado
    // junto e descartado aqui, de proposito.
    const extras = extrasRaw.map((e: Record<string, unknown>) => ({
      id: String(e?.id ?? ""),
      quantity: Number(e?.quantity ?? 0),
    }));
    if (extras.some((e) => !e.id || !Number.isInteger(e.quantity) || e.quantity <= 0)) {
      return errorResponse("EXTRA_INVALIDO");
    }

    const clientPhone = body.clientPhone
      ? String(body.clientPhone).replace(/\D/g, "").slice(0, 13)
      : null;

    // ----------------------------------------- preco calculado no servidor --
    // compute_order_amount_cents tambem valida que as fotos existem, pertencem
    // ao grupo e respeitam a regra de quantidade do pacote. Se algo nao bate,
    // levanta excecao e o pedido nem chega a ser criado.
    const { data: amountCents, error: priceError } = await db.rpc(
      "compute_order_amount_cents",
      {
        p_package_type: packageType,
        p_photo_ids: uniquePhotoIds,
        p_group_id: groupId,
        p_extras: extras,
      },
    );

    if (priceError || typeof amountCents !== "number" || amountCents <= 0) {
      console.error("[intent] falha no calculo de preco", priceError);
      await logEvent(db, {
        type: "payment_failed",
        payload: { stage: "pricing", reason: priceError?.message ?? "valor_invalido" },
      });
      // Mensagem generica para fora; o motivo detalhado fica no log. Dizer qual
      // validacao falhou ajudaria a calibrar um ataque.
      return errorResponse("NAO_FOI_POSSIVEL_CALCULAR_O_VALOR", 422);
    }

    // ------------------------------------------------------------ parcelas --
    let installments = Number(body.installments ?? 1);
    if (!Number.isInteger(installments) || installments < 1) installments = 1;

    // Parcela minima de R$ 1,00 (regra da InfinitePay). Corrigir aqui evita
    // mandar o cliente para uma tela que vai recusar.
    const maxInstallments = maxInstallmentsFor(amountCents);
    if (installments > maxInstallments) installments = maxInstallments;

    // Nem debito nem Pix parcelam.
    if (paymentMethod === "debit" || paymentMethod === "pix") installments = 1;

    // ------------------------------------------------------ cria o pedido --
    const { data: order, error: orderError } = await db
      .from("orders")
      .insert({
        session_id: sessionId,
        group_id: groupId,
        package_type: packageType,
        client_phone: clientPhone,
        status: "pending",
        total: amountCents / 100,   // coluna legada em reais, para o dashboard
      })
      .select()
      .single();

    if (orderError || !order) {
      console.error("[intent] falha ao criar pedido", orderError);
      return errorResponse("FALHA_AO_CRIAR_PEDIDO", 500);
    }

    const { error: itemsError } = await db.from("order_items").insert(
      uniquePhotoIds.map((photoId) => ({ order_id: order.id, photo_id: photoId })),
    );
    if (itemsError) {
      console.error("[intent] falha ao gravar itens", itemsError);
      return errorResponse("FALHA_AO_CRIAR_PEDIDO", 500);
    }

    // Extras: o preco gravado vem do catalogo do servidor, nao do app.
    if (extras.length > 0) {
      const { data: catalog } = await db
        .from("extras_pricing")
        .select("id, name, amount_cents")
        .in("id", extras.map((e) => e.id));

      const byId = new Map((catalog ?? []).map((c) => [c.id, c]));
      const rows = extras.flatMap((e) => {
        const item = byId.get(e.id);
        if (!item) return [];
        return [{
          order_id: order.id,
          name: item.name,
          unit_price: item.amount_cents / 100,
          quantity: e.quantity,
          subtotal: (item.amount_cents * e.quantity) / 100,
        }];
      });

      if (rows.length > 0) await db.from("order_extras").insert(rows);
    }

    // ------------------------------------------------------ cria o intent --
    const orderNsu = generateOrderNsu();
    const expiresAt = new Date(Date.now() + config.intentTtlMinutes * 60_000);

    // --- Pix: cria o link de checkout ANTES de gravar o intent -------------
    // Se a InfinitePay recusar, nao queremos um intent orfao apontando para uma
    // cobranca que nunca existiu.
    let checkoutUrl: string | null = null;
    let invoiceSlug: string | null = null;

    if (paymentMethod === "pix") {
      try {
        const link = await createCheckoutLink({
          orderNsu,
          amountCents,
          description: `Fotos Jangalancha Show - pedido ${orderNsu.slice(-8)}`,
          clientPhone,
        });
        checkoutUrl = link.url;
        invoiceSlug = link.slug;
      } catch (e) {
        console.error("[intent] falha ao criar link de checkout", e);
        await logEvent(db, {
          type: "payment_failed",
          orderId: order.id,
          payload: { stage: "checkout_link", detail: String(e).slice(0, 300) },
        });
        return errorResponse("FALHA_AO_GERAR_PIX", 502);
      }
    }

    const { data: intent, error: intentError } = await db
      .from("payment_intents")
      .insert({
        order_id: order.id,
        order_nsu: orderNsu,
        amount_cents: amountCents,
        payment_method: paymentMethod,
        installments,
        status: "pending",
        expires_at: expiresAt.toISOString(),
        checkout_url: checkoutUrl,
        invoice_slug: invoiceSlug,
      })
      .select()
      .single();

    if (intentError || !intent) {
      console.error("[intent] falha ao criar intent", intentError);
      return errorResponse("FALHA_AO_INICIAR_PAGAMENTO", 500);
    }

    await logEvent(db, {
      type: "intent_created",
      intentId: intent.id,
      orderId: order.id,
      payload: {
        amountCents, packageType, paymentMethod, installments,
        photos: uniquePhotoIds.length,
      },
    });

    const base = {
      ok: true,
      intentId: intent.id,
      orderId: order.id,
      orderNsu,
      amountCents,
      expiresAt: expiresAt.toISOString(),
      paymentMethod,
    };

    if (paymentMethod === "pix") {
      // O tablet vira este URL em QR Code; o cliente escaneia com o celular.
      return json({ ...base, checkoutUrl });
    }

    return json({
      ...base,
      installments,
      deeplink: buildInfiniteTapDeeplink({
        amountCents,
        paymentMethod: paymentMethod as "credit" | "debit",
        installments,
        orderNsu,
      }),
    });
  } catch (e) {
    console.error("[intent] erro inesperado", e);
    return errorResponse("ERRO_INTERNO", 500);
  }
});
