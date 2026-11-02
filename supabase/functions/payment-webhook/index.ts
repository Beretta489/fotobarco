// =============================================================================
// payment-webhook -- o Efi avisa que um Pix caiu
// =============================================================================
// ┌─────────────────────── ATENCAO AO FAZER O DEPLOY ───────────────────────┐
// │ Esta function precisa ser PUBLICA -- o Efi nao manda JWT:               │
// │                                                                         │
// │   supabase functions deploy payment-webhook --no-verify-jwt             │
// │                                                                         │
// │ As outras functions NAO levam essa flag.                                │
// └─────────────────────────────────────────────────────────────────────────┘
//
// URL cadastrada em PUT /v2/webhook/:chave (ver EFI_SETUP.md):
//
//      .../functions/v1/payment-webhook?env=<homologacao|producao>&hmac=<segredo>&ignorar=
//
//    Corpo: { "pix": [ { endToEndId, txid, chave, valor, horario, ... } ] }
//
//    O Efi exige mTLS no servidor que recebe o webhook, e o Supabase termina o
//    TLS na infraestrutura dele -- nao ha como conferir o certificado do Efi
//    aqui. Por isso o webhook e cadastrado com 'x-skip-mtls-checking: true' e
//    a seguranca e compensada assim:
//
//      a) segredo na URL (?hmac=), diferente por ambiente, comparado em tempo
//         constante -- sem ele, 401 e nada e processado;
//      b) opcional: IP de origem (EFI_WEBHOOK_ALLOWED_IPS);
//      c) O CORPO NUNCA E PROVA. So os txids sao lidos, e cada um e
//         conferido com GET /v2/cob/:txid antes de qualquer liberacao.
//
//    'ignorar=' no fim impede o Efi de acrescentar "/pix" ao caminho.
//
// Codigos de retorno: 200 encerra a fila de reenvio do provedor. 503 so quando
// um reenvio tem chance de dar certo (provedor/banco indisponivel). 401/403
// para chamadas sem o segredo.
// =============================================================================

import { config, corsHeaders, json } from "../_shared/config.ts";
import { logEvent, serviceClient } from "../_shared/db.ts";
import { confirmIntent } from "../_shared/confirm.ts";
import { efiWebhookSecret, parseEfiEnv, safeEqual, txidsFromWebhook } from "../_shared/pix/efi.ts";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false }, 405);

  const db = serviceClient();

  try {
    const url = new URL(req.url);
    const parsed = await req.json().catch(() => ({}));
    const body = parsed && typeof parsed === "object" ? parsed : {};

    // Qualquer chamada sem env/hmac validos morre com 401 dentro de handleEfi.
    return await handleEfi(db, req, url, body);
  } catch (e) {
    console.error("[webhook] erro inesperado", e);
    return json({ ok: false }, 503);
  }
});

// =============================================================================
// Efi
// =============================================================================

async function handleEfi(
  db: SupabaseClient,
  req: Request,
  url: URL,
  body: unknown,
): Promise<Response> {
  // ------------------------------------------------- 1. de onde veio --------
  let env;
  try {
    env = parseEfiEnv(url.searchParams.get("env"));
  } catch {
    console.warn("[webhook/efi] env ausente ou invalido na URL");
    return json({ ok: false }, 401);
  }

  let esperado: string;
  try {
    esperado = efiWebhookSecret(env);
  } catch (e) {
    // Sem o secret cadastrado, NADA passa (fail-closed). 503 para o Efi
    // reenviar depois que o secret for configurado.
    console.error("[webhook/efi]", String(e));
    return json({ ok: false }, 503);
  }

  const recebido = url.searchParams.get("hmac") ?? "";
  if (!(await safeEqual(recebido, esperado))) {
    // Nao logar o valor recebido: se for um segredo antigo, vazaria no log.
    console.warn("[webhook/efi] segredo da URL nao confere");
    await logEvent(db, { type: "deeplink_returned", payload: { via: "webhook_efi", rejeitado: "hmac", env } });
    return json({ ok: false }, 401);
  }

  const ipsPermitidos = config.pix.efiWebhookAllowedIps;
  if (ipsPermitidos.length > 0) {
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
    if (!ipsPermitidos.includes(ip)) {
      console.warn("[webhook/efi] IP de origem fora da lista", ip);
      await logEvent(db, { type: "deeplink_returned", payload: { via: "webhook_efi", rejeitado: "ip", ip, env } });
      return json({ ok: false }, 403);
    }
  }

  // ----------------------------------------- 2. quais cobrancas olhar -----
  const txids = txidsFromWebhook(body);

  // Pix sem txid (transferencia direta para a chave) ou a notificacao de
  // teste que o Efi manda no cadastro: nada a fazer, 200 encerra.
  if (txids.length === 0) {
    await logEvent(db, { type: "deeplink_returned", payload: { via: "webhook_efi", env, txids: 0 } });
    return json({ ok: true, ignored: true }, 200);
  }

  await logEvent(db, { type: "deeplink_returned", payload: { via: "webhook_efi", env, txids } });

  // ------------------------------------- 3. conferir cada uma no Efi ------
  // confirmIntent consulta GET /v2/cob/:txid e so libera com CONCLUIDA e o
  // valor exato. E idempotente: reenvio do Efi para um pedido ja pago devolve
  // "ja pago" sem liberar de novo nem reenviar as fotos.
  //
  // Em lotes paralelos de 10: o Efi espera resposta em ate 60 s, e cada
  // consulta pode levar ate 10 s. Na pratica chega 1 txid por notificacao.
  const confirmar = async (txid: string) => {
    try {
      const r = await confirmIntent(db, { orderNsu: txid, source: "webhook" });
      return { txid, status: r.status as string, retry: Boolean(r.retry) };
    } catch (e) {
      console.error("[webhook/efi] falha ao confirmar", txid.slice(-8), e);
      return { txid, status: "erro", retry: true };
    }
  };

  const lista: { txid: string; status: string; retry: boolean }[] = [];
  for (let i = 0; i < txids.length; i += 10) {
    lista.push(...await Promise.all(txids.slice(i, i + 10).map(confirmar)));
  }

  const reenviar = lista.some((r) => r.retry);
  const resultados = Object.fromEntries(lista.map((r) => [r.txid.slice(-8), r.status]));

  if (reenviar) return json({ ok: false, error: "TENTAR_DE_NOVO" }, 503);
  return json({ ok: true, resultados }, 200);
}
