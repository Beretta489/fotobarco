// =============================================================================
// ENTREGA DAS FOTOS -- avisa o n8n, que manda pelo BotConversa no WhatsApp
// =============================================================================
// Chamado por releaseIntent() logo depois que um pedido vira 'paid' (Pix,
// atendente ou recuperacao manual) e pela whatsapp-resend (reenvio do admin).
//
// O n8n recebe UM POST por pedido com o telefone e a lista de URLs das fotos
// que o cliente comprou. Montar e mandar as mensagens e trabalho do fluxo no
// n8n -- aqui so decidimos O QUE vai e PARA QUEM.
//
// Payload enviado (JSON):
//   {
//     "event":        "order.paid" | "order.resend",
//     "orderId":      "uuid",
//     "phone":        "5584999998888",     // E.164 sem o "+"
//     "phoneLocal":   "84999998888",       // como o cliente digitou (DDD+num)
//     "packageType":  "all" | "half" | "single",
//     "amountCents":  10000,
//     "paymentMethod":"pix" | "credit" | "debit" | "cash",
//     "paidAt":       "2026-10-28T15:00:00Z",
//     "session":      "Passeio 10:15",
//     "group":        "Familia 3",
//     "photoCount":   12,
//     "photos":       [{ "id": "uuid", "url": "https://...", "fileName": "foto-01.jpg" }]
//   }
//
// Header X-FotoBarco-Secret = N8N_WEBHOOK_SECRET (se cadastrado). O fluxo no
// n8n deve recusar chamadas sem ele: a URL do webhook, se vazar, deixaria
// qualquer um disparar mensagens em nome da empresa.
//
// REGRA: nada aqui pode derrubar a liberacao. O dinheiro ja entrou e o pedido
// ja esta pago; se o envio falhar, fica 'failed' para o admin reenviar.
// =============================================================================

import { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { config } from "./config.ts";
import { logEvent } from "./db.ts";

export interface DispatchResult {
  status: "sent" | "failed" | "skipped" | "busy";
  error?: string;
}

/**
 * Agenda o envio sem segurar a resposta HTTP. O tablet nao precisa esperar o
 * n8n para mostrar a tela de sucesso -- e o webhook da InfinitePay nao pode
 * estourar o timeout por causa de um terceiro lento.
 */
export function scheduleWhatsappDispatch(db: SupabaseClient, orderId: string): void {
  const task = dispatchOrderPhotos(db, orderId, { event: "order.paid" })
    .catch((e) => console.error("[whatsapp] erro inesperado", orderId, e));

  // deno-lint-ignore no-explicit-any
  const runtime = (globalThis as any).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(task);
}

export async function dispatchOrderPhotos(
  db: SupabaseClient,
  orderId: string,
  opts: { event: "order.paid" | "order.resend"; force?: boolean },
): Promise<DispatchResult> {
  const cfg = config.whatsapp;

  // ------------------------------------------------ 1. pegar o envio para si --
  // Update condicionado: se webhook e polling liberarem juntos, so um encontra
  // o pedido livre. Sem isto o cliente receberia as fotos em dobro.
  //
  // Envio automatico: so pedido que nunca tentou (null).
  // Reenvio do admin:  tambem 'failed'/'skipped' -- e 'sent' com force.
  const liberados = opts.event === "order.paid"
    ? null
    : (opts.force ? ["failed", "skipped", "sent"] : ["failed", "skipped"]);

  let claim = db.from("orders")
    .update({
      whatsapp_status: "sending",
      whatsapp_updated_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .eq("status", "paid");

  claim = liberados
    ? claim.or(`whatsapp_status.is.null,whatsapp_status.in.(${liberados.join(",")})`)
    : claim.is("whatsapp_status", null);

  const { data: order, error: claimError } = await claim
    .select("id, client_phone, package_type, paid_at, whatsapp_attempts, session_id, group_id")
    .maybeSingle();

  if (claimError) {
    console.error("[whatsapp] falha ao reservar envio", orderId, claimError);
    return { status: "failed", error: "ERRO_INTERNO" };
  }
  if (!order) return { status: "busy" };

  const finish = async (status: "sent" | "failed" | "skipped", error?: string) => {
    await db.from("orders").update({
      whatsapp_status: status,
      whatsapp_attempts: (order.whatsapp_attempts ?? 0) + (status === "skipped" ? 0 : 1),
      whatsapp_sent_at: status === "sent" ? new Date().toISOString() : undefined,
      whatsapp_last_error: error ? error.slice(0, 300) : null,
      whatsapp_updated_at: new Date().toISOString(),
    }).eq("id", orderId);

    await logEvent(db, {
      type: status === "sent" ? "whatsapp_dispatched" : "whatsapp_failed",
      orderId,
      payload: { status, error, event: opts.event, phone: order.client_phone },
    });
    return { status, error };
  };

  // ------------------------------------------------------ 2. pre-requisitos --
  const phoneLocal = String(order.client_phone ?? "").replace(/\D/g, "");
  if (phoneLocal.length < 10) return await finish("skipped", "SEM_TELEFONE");

  if (!cfg.webhookUrl) {
    console.warn("[whatsapp] N8N_WEBHOOK_URL nao cadastrado -- envio pulado", orderId);
    return await finish("skipped", "N8N_WEBHOOK_URL_AUSENTE");
  }

  // ----------------------------------------------------- 3. montar o pedido --
  const [{ data: items, error: itemsError }, { data: intent }, { data: session }, { data: group }] =
    await Promise.all([
      db.from("order_items").select("photo_id, photos ( id, url, storage_path, created_at )")
        .eq("order_id", orderId),
      db.from("payment_intents").select("amount_cents, payment_method")
        .eq("order_id", orderId).eq("status", "paid").maybeSingle(),
      db.from("sessions").select("name").eq("id", order.session_id).maybeSingle(),
      db.from("groups").select("name").eq("id", order.group_id).maybeSingle(),
    ]);

  if (itemsError) return await finish("failed", `itens: ${itemsError.message}`);

  // deno-lint-ignore no-explicit-any
  const photos = (items ?? []).map((i: any) => i.photos).filter((p: any) => p?.url)
    // deno-lint-ignore no-explicit-any
    .sort((a: any, b: any) => String(a.created_at).localeCompare(String(b.created_at)))
    // deno-lint-ignore no-explicit-any
    .map((p: any, idx: number) => ({
      id: p.id,
      url: p.url,
      fileName: `foto-${String(idx + 1).padStart(2, "0")}.jpg`,
    }));

  // As fotos sao apagadas pelo bot as 23h. Um reenvio no dia seguinte cai aqui.
  if (photos.length === 0) return await finish("failed", "FOTOS_NAO_ENCONTRADAS");

  const payload = {
    event: opts.event,
    orderId,
    phone: `55${phoneLocal.replace(/^55(?=\d{10,11}$)/, "")}`,
    phoneLocal,
    packageType: order.package_type,
    amountCents: intent?.amount_cents ?? null,
    paymentMethod: intent?.payment_method ?? null,
    paidAt: order.paid_at,
    session: session?.name ?? null,
    group: group?.name ?? null,
    photoCount: photos.length,
    photos,
  };

  // ------------------------------------------------------- 4. chamar o n8n --
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cfg.webhookSecret) headers["X-FotoBarco-Secret"] = cfg.webhookSecret;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
  try {
    const res = await fetch(cfg.webhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return await finish("failed", `n8n HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    await res.body?.cancel();
    return await finish("sent");
  } catch (e) {
    return await finish("failed", `n8n inalcancavel: ${String(e).slice(0, 200)}`);
  } finally {
    clearTimeout(timer);
  }
}
