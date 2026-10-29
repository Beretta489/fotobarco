// =============================================================================
// whatsapp-resend -- o admin manda de novo as fotos de um pedido pago
// =============================================================================
// O envio automatico acontece na liberacao (releaseIntent). Esta function cobre
// o que deu errado depois: n8n fora do ar, N8N_WEBHOOK_URL ainda nao
// cadastrado na hora da venda, cliente que apagou a conversa.
//
// Exige admin logado (mesma regra da payment-recover): com a anon key, que e
// publica, qualquer um mandaria mensagens repetidas para os clientes.
//
// Entrada: { orderId, force? }
//   force = true reenvia mesmo um pedido ja marcado como 'sent'.
// Saida:   { ok, status: 'sent' | 'failed' | 'skipped' | 'busy', error? }
// =============================================================================

import { config, corsHeaders, errorResponse, json } from "../_shared/config.ts";
import { serviceClient } from "../_shared/db.ts";
import { dispatchOrderPhotos } from "../_shared/whatsapp.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-9a-f][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("METODO_NAO_PERMITIDO", 405);

  const db = serviceClient();

  try {
    const token = (req.headers.get("Authorization") ?? "")
      .replace(/^Bearer\s+/i, "")
      .trim();
    if (!token) return errorResponse("NAO_AUTORIZADO", 401);

    const { data: { user }, error: authError } = await db.auth.getUser(token);
    if (authError || !user || user.role !== "authenticated") {
      return errorResponse("NAO_AUTORIZADO", 401);
    }

    const adminEmail = config.app.adminEmail;
    if (adminEmail && user.email?.toLowerCase() !== adminEmail.toLowerCase()) {
      return errorResponse("NAO_AUTORIZADO", 403);
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return errorResponse("PAYLOAD_INVALIDO");

    const orderId = String(body.orderId ?? "");
    if (!UUID_RE.test(orderId)) return errorResponse("ORDER_ID_INVALIDO");

    const result = await dispatchOrderPhotos(db, orderId, {
      event: "order.resend",
      force: body.force === true,
    });

    console.log(`[resend] ${user.email ?? user.id} reenviou ${orderId}: ${result.status}`);

    // 'busy' = pedido nao pago, ja enviado (sem force) ou outro envio em curso.
    return json({ ok: result.status === "sent", ...result }, result.status === "busy" ? 409 : 200);
  } catch (e) {
    console.error("[resend] erro inesperado", e);
    return errorResponse("ERRO_INTERNO", 500);
  }
});
