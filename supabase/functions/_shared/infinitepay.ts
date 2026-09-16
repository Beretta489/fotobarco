// =============================================================================
// CLIENTE InfinitePay -- InfiniteTap (cartao presencial) + Checkout (Pix)
// =============================================================================
// Dois caminhos de cobranca, um provedor so:
//
//   CARTAO (InfiniteTap): deeplink abre o app InfinitePay, cliente aproxima o
//   cartao no proprio tablet, retorno volta por deeplink.
//
//   PIX (Checkout): cria um link de pagamento; o tablet mostra o QR Code desse
//   link, o cliente escaneia com o celular dele e paga.
//
// REGRA QUE VALE PARA OS DOIS:
//   Nem o retorno do deeplink nem o webhook sao prova de pagamento.
//   - O deeplink chega pelo aparelho do cliente e pode ser forjado por qualquer
//     app instalado.
//   - O webhook da InfinitePay NAO tem assinatura HMAC, entao qualquer um que
//     descubra a URL consegue postar "pago" nela.
//   Os dois servem apenas como AVISO de que algo aconteceu. A unica prova
//   aceita e a resposta de checkTransaction() -- perguntar direto ao provedor.
// =============================================================================

import { config } from "./config.ts";

const CHECKOUT_API = "https://api.checkout.infinitepay.io";

// =============================================================================
// 1. CARTAO -- InfiniteTap por deeplink
// =============================================================================
// infinitepaydash://infinitetap-app
//   ?amount=<CENTAVOS>&payment_method=credit|debit&installments=<1..12>
//   &order_id=<nsu>&result_url=<retorno>&app_client_referrer=<app>
//   &handle=<InfiniteTag>&doc_number=<CNPJ>&af_force_deeplink=true

const INFINITETAP_BASE = "infinitepaydash://infinitetap-app";

export interface DeeplinkParams {
  amountCents: number;
  paymentMethod: "credit" | "debit";
  installments: number;
  orderNsu: string;
}

export function buildInfiniteTapDeeplink(p: DeeplinkParams): string {
  const resultUrl = `${config.app.deeplinkScheme}://payment/result`;

  const params = new URLSearchParams({
    amount: String(p.amountCents),        // SEMPRE centavos: 10000 = R$ 100,00
    payment_method: p.paymentMethod,
    installments: String(p.installments),
    order_id: p.orderNsu,
    result_url: resultUrl,                // URLSearchParams ja faz o encode
    app_client_referrer: config.infinitepay.appClientReferrer,
    handle: config.infinitepay.handle,
    doc_number: config.infinitepay.docNumber,
    af_force_deeplink: "true",            // necessario no iOS
  });

  return `${INFINITETAP_BASE}?${params.toString()}`;
}

/**
 * Regra da InfinitePay: cada parcela precisa valer ao menos R$ 1,00.
 * R$ 100,00 em 12x = R$ 8,33 -> ok. R$ 10,00 em 12x -> recusado.
 */
export function maxInstallmentsFor(amountCents: number): number {
  return Math.max(1, Math.min(12, Math.floor(amountCents / 100)));
}

/** Retorno do deeplink. DADO NAO CONFIAVEL -- so um aviso de que o cliente voltou. */
export interface TapResult {
  order_id?: string;
  nsu?: string;              // uuid da transacao
  aut?: string;              // codigo de autorizacao
  card_brand?: string;
  handle?: string;
  merchant_document?: string;
  warning?: string;          // presente = transacao NAO concluida
}

// =============================================================================
// 2. PIX -- Checkout por link de pagamento
// =============================================================================

export interface CheckoutLinkParams {
  orderNsu: string;
  amountCents: number;
  description: string;
  clientPhone?: string | null;
}

export interface CheckoutLink {
  url: string;               // URL do checkout -> vira QR Code no tablet
  slug: string | null;       // invoice_slug, usado depois no payment_check
  raw: unknown;
}

/**
 * Cria um link de pagamento (Pix) no Checkout da InfinitePay.
 *
 * POST https://api.checkout.infinitepay.io/links
 *
 * Nao ha API key: o 'handle' identifica a conta que recebe. Isso significa que
 * a URL nao e secreta -- mas tambem que ninguem consegue movimentar dinheiro da
 * sua conta por ela, so criar cobrancas EM FAVOR dela.
 */
export async function createCheckoutLink(p: CheckoutLinkParams): Promise<CheckoutLink> {
  const body: Record<string, unknown> = {
    handle: config.infinitepay.handle,

    // 'price' em centavos, igual ao deeplink. Um item unico com o total ja
    // calculado pelo servidor -- o detalhamento (fotos, extras) fica no nosso
    // banco, nao precisa trafegar para o provedor.
    items: [{
      quantity: 1,
      price: p.amountCents,
      description: p.description.slice(0, 200),
    }],

    order_nsu: p.orderNsu,

    // Webhook dinamico: cada cobranca informa onde avisar. Evita depender de
    // configuracao manual no painel e mantem tudo versionado no codigo.
    webhook_url: `${config.supabaseUrl}/functions/v1/payment-webhook`,

    // Para onde o navegador do CLIENTE volta depois de pagar. E so uma tela de
    // "obrigado" -- quem libera as fotos e o tablet, apos confirmar no servidor.
    redirect_url: `${config.app.deeplinkScheme}://payment/pix-done`,
  };

  if (p.clientPhone) {
    // A InfinitePay espera E.164. O telefone chega so com digitos do app.
    body.customer = { phone_number: `+55${p.clientPhone.replace(/^55/, "")}` };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  let res: Response;
  try {
    res = await fetch(`${CHECKOUT_API}/links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`CHECKOUT_HTTP_${res.status}: ${txt.slice(0, 200)}`);
  }

  const data = await res.json().catch(() => ({}));

  // >>> CONFIRMAR: a doc publica nao mostra a resposta do POST /links. Os nomes
  // abaixo cobrem as variacoes provaveis. Rode uma cobranca de teste, veja o
  // JSON real no log da function e fixe os campos certos aqui.
  const url = data.url ?? data.checkout_url ?? data.payment_url ?? data.link;
  const slug = data.slug ?? data.invoice_slug ?? null;

  if (typeof url !== "string" || !url) {
    throw new Error(`CHECKOUT_RESPOSTA_SEM_URL: ${JSON.stringify(data).slice(0, 300)}`);
  }

  return { url, slug: typeof slug === "string" ? slug : null, raw: data };
}

// =============================================================================
// 3. CONFERENCIA -- a unica prova de pagamento aceita
// =============================================================================

export interface ProviderCheck {
  paid: boolean;
  amountCents: number | null;   // valor da COBRANCA (nao o pago com juros)
  paidAmountCents: number | null;
  captureMethod: string | null; // 'pix' | 'credit_card' | 'debit_card'
  installments: number | null;
  raw: unknown;
}

/**
 * POST https://api.checkout.infinitepay.io/payment_check
 *
 * Corpo:    { handle, order_nsu, transaction_nsu, slug }
 * Resposta: { success, paid, amount, paid_amount, installments, capture_method }
 */
export async function checkTransaction(args: {
  orderNsu: string;
  transactionNsu: string;
  slug?: string | null;
}): Promise<ProviderCheck> {
  const body = {
    handle: config.infinitepay.handle,
    order_nsu: args.orderNsu,
    transaction_nsu: args.transactionNsu,
    ...(args.slug ? { slug: args.slug } : {}),
  };

  // Timeout explicito: sem isso uma instabilidade do provedor deixaria o cliente
  // preso na tela de "confirmando" ate o limite da Edge Function.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  let res: Response;
  try {
    res = await fetch(`${config.infinitepay.paymentCheckUrl}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  // Erro de rede/5xx NAO vira "nao pago" -- vira erro, para o app tentar de
  // novo. Tratar indisponibilidade como recusa faria o cliente pagar sem receber.
  if (!res.ok) {
    throw new Error(`PROVIDER_HTTP_${res.status}`);
  }

  const data = await res.json().catch(() => ({}));

  return {
    paid: data.success === true && data.paid === true,

    // 'amount' e o valor cobrado; 'paid_amount' pode vir MAIOR por juros de
    // parcelamento (ex.: amount 1000, paid_amount 1010). A validacao contra o
    // nosso valor usa 'amount' -- comparar com paid_amount recusaria venda
    // legitima parcelada.
    amountCents: typeof data.amount === "number" ? data.amount : null,
    paidAmountCents: typeof data.paid_amount === "number" ? data.paid_amount : null,

    captureMethod: typeof data.capture_method === "string" ? data.capture_method : null,
    installments: typeof data.installments === "number" ? data.installments : null,
    raw: data,
  };
}

// =============================================================================
// 4. WEBHOOK -- formato do que a InfinitePay posta
// =============================================================================
// {
//   "invoice_slug": "abc123",
//   "amount": 1000,
//   "paid_amount": 1010,
//   "installments": 1,
//   "capture_method": "credit_card",
//   "transaction_nsu": "UUID",
//   "order_nsu": "UUID-do-pedido",
//   "receipt_url": "https://...",
//   "items": []
// }
//
// SEM ASSINATURA. Trate como um toque no ombro dizendo "olha esse pedido",
// nunca como a afirmacao de que ele foi pago.
export interface WebhookPayload {
  invoice_slug?: string;
  amount?: number;
  paid_amount?: number;
  installments?: number;
  capture_method?: string;
  transaction_nsu?: string;
  order_nsu?: string;
  receipt_url?: string;
}
