// =============================================================================
// PROVEDOR PIX -- Efi Bank (antiga Gerencianet), API Pix v2
// =============================================================================
// Documentacao: https://dev.efipay.com.br/docs/api-pix/credenciais
//               https://dev.efipay.com.br/docs/api-pix/cobrancas-imediatas
//               https://dev.efipay.com.br/docs/api-pix/webhooks
//
// COMO O EFI AUTENTICA
//   1. mTLS em TODA chamada (inclusive a do token): o servidor do Efi exige o
//      certificado da aplicacao. As Edge Functions nao leem arquivo do disco,
//      entao o .p12 e convertido para PEM (certificado + chave) e guardado em
//      base64 nos secrets -- ver EFI_SETUP.md, secao 2.
//   2. OAuth2 client_credentials: POST /oauth/token com Basic(client_id:secret).
//      O token vale 3600 s; guardamos em memoria ate ~1 min antes de vencer.
//
// AMBIENTES -- secrets SEPARADOS por ambiente, escolhidos por EFI_ENV:
//
//   EFI_ENV=homologacao  ->  https://pix-h.api.efipay.com.br  + EFI_HOMOLOG_*
//   EFI_ENV=producao     ->  https://pix.api.efipay.com.br    + EFI_PROD_*
//
//   Sufixos de cada ambiente:
//     CLIENT_ID, CLIENT_SECRET, PIX_KEY, CERT_PEM_B64, KEY_PEM_B64,
//     WEBHOOK_SECRET
//
// Cada intent grava o ambiente em que nasceu (provider_env). A conferencia usa
// SEMPRE o ambiente do intent, nao o EFI_ENV do momento: trocar o EFI_ENV com
// cobrancas abertas nao faz o servidor perguntar ao ambiente errado.
//
// NADA disto pode ir para o app. Este arquivo so roda no servidor.
// =============================================================================

import type { ChargeStatus, CreateChargeInput, CreatedCharge, PixProvider } from "./types.ts";

export type EfiEnv = "homologacao" | "producao";

const BASE_URL: Record<EfiEnv, string> = {
  homologacao: "https://pix-h.api.efipay.com.br",
  producao: "https://pix.api.efipay.com.br",
};

const SECRET_PREFIX: Record<EfiEnv, string> = {
  homologacao: "EFI_HOMOLOG_",
  producao: "EFI_PROD_",
};

/** Regra do txid do Pix (BACEN): 26 a 35 caracteres alfanumericos. */
const TXID_RE = /^[a-zA-Z0-9]{26,35}$/;

export function parseEfiEnv(value: string | null | undefined): EfiEnv {
  const v = (value ?? "").trim();
  if (v === "homologacao" || v === "producao") return v;
  throw new Error(`CONFIG_INVALIDA: EFI_ENV="${v}". Use "homologacao" ou "producao".`);
}

// =============================================================================
// SECRETS
// =============================================================================
// Lidos sob demanda, nao no boot: o fluxo do atendente (cartao/dinheiro) usa
// as mesmas functions e nao pode cair porque o Efi ainda nao foi configurado.

function efiSecret(env: EfiEnv, suffix: string): string {
  const name = SECRET_PREFIX[env] + suffix;
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new Error(`SECRET_AUSENTE: ${name}. Cadastre com: supabase secrets set ${name}=<valor>`);
  }
  return value;
}

/** Decodifica um PEM guardado em base64 e confere que e mesmo um PEM. */
function pemSecret(env: EfiEnv, suffix: string): string {
  const name = SECRET_PREFIX[env] + suffix;
  const raw = efiSecret(env, suffix).replace(/\s+/g, "");
  let pem: string;
  try {
    const bin = atob(raw);
    pem = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  } catch {
    throw new Error(`SECRET_INVALIDO: ${name} nao e base64 valido.`);
  }
  // Fica so com os blocos PEM: o openssl pkcs12 costuma deixar linhas
  // "Bag Attributes" antes do certificado, e o parser do runtime pode recusar.
  const blocos = pem.match(/-----BEGIN [A-Z0-9 ]+-----[\s\S]+?-----END [A-Z0-9 ]+-----/g);
  if (!blocos) {
    throw new Error(`SECRET_INVALIDO: ${name} nao contem um PEM (faltou "-----BEGIN").`);
  }
  if (suffix === "KEY_PEM_B64" && blocos.some((b) => b.startsWith("-----BEGIN RSA PRIVATE KEY"))) {
    console.warn(`[efi] ${name} esta em PKCS#1; converta para PKCS#8 (EFI_SETUP.md, secao 2).`);
  }
  return blocos.join("\n") + "\n";
}

/** Segredo que vai no ?hmac= da URL do webhook deste ambiente. */
export function efiWebhookSecret(env: EfiEnv): string {
  return efiSecret(env, "WEBHOOK_SECRET");
}

// =============================================================================
// CLIENTE HTTP COM mTLS + TOKEN
// =============================================================================

// deno-lint-ignore no-explicit-any
type HttpClient = any;

const clients = new Map<EfiEnv, HttpClient>();
const tokens = new Map<EfiEnv, { value: string; expiresAt: number }>();

function httpClient(env: EfiEnv): HttpClient {
  const cached = clients.get(env);
  if (cached) return cached;

  // deno-lint-ignore no-explicit-any
  const create = (Deno as any).createHttpClient;
  if (typeof create !== "function") {
    throw new Error(
      "MTLS_INDISPONIVEL: Deno.createHttpClient nao existe neste runtime -- " +
        "sem ele nao ha como apresentar o certificado ao Efi.",
    );
  }

  // 'cert' e 'key' em PEM. A chave deve estar em PKCS#8 ("BEGIN PRIVATE KEY"):
  // ha relato de que o runtime do Supabase derruba a function com chave
  // PKCS#1 ("BEGIN RSA PRIVATE KEY"). Os comandos de EFI_SETUP.md ja geram
  // PKCS#8.
  const client = create({
    cert: pemSecret(env, "CERT_PEM_B64"),
    key: pemSecret(env, "KEY_PEM_B64"),
  });
  clients.set(env, client);
  return client;
}

export class EfiHttpError extends Error {
  constructor(public status: number, public body: unknown, where: string) {
    // So nome/mensagem do erro do Efi -- nunca o corpo da requisicao.
    // deno-lint-ignore no-explicit-any
    const b = body as any;
    super(`EFI_HTTP_${status} em ${where}: ${b?.nome ?? ""} ${b?.mensagem ?? ""}`.trim());
  }
}

async function rawFetch(
  env: EfiEnv,
  path: string,
  init: { method: string; headers: Record<string, string>; body?: string },
  timeoutMs: number,
): Promise<{ status: number; data: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE_URL[env]}${path}`, {
      ...init,
      signal: controller.signal,
      client: httpClient(env),
    } as RequestInit);
    const text = await res.text();
    let data: unknown = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { mensagem: text.slice(0, 200) }; }
    return { status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

async function accessToken(env: EfiEnv, forceRefresh = false): Promise<string> {
  const cached = tokens.get(env);
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) return cached.value;

  const basic = btoa(`${efiSecret(env, "CLIENT_ID")}:${efiSecret(env, "CLIENT_SECRET")}`);
  const { status, data } = await rawFetch(env, "/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Basic ${basic}` },
    body: JSON.stringify({ grant_type: "client_credentials" }),
  }, 10_000);

  // deno-lint-ignore no-explicit-any
  const d = data as any;
  if (status !== 200 || typeof d?.access_token !== "string") {
    throw new EfiHttpError(status, { nome: d?.error ?? d?.nome, mensagem: d?.error_description ?? d?.mensagem }, "oauth/token");
  }

  const ttlSeconds = typeof d.expires_in === "number" ? d.expires_in : 3600;
  tokens.set(env, {
    value: d.access_token,
    expiresAt: Date.now() + Math.max(60, ttlSeconds - 60) * 1000,
  });
  return d.access_token;
}

/**
 * Chamada autenticada a API Pix. Um 401 descarta o token em cache e tenta uma
 * unica vez de novo (token revogado ou expirado antes da hora).
 */
export async function efiRequest(
  env: EfiEnv,
  method: string,
  path: string,
  body?: unknown,
  opts: { timeoutMs?: number; headers?: Record<string, string> } = {},
): Promise<{ status: number; data: unknown }> {
  const call = async (force: boolean) => {
    const token = await accessToken(env, force);
    return rawFetch(env, path, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(opts.headers ?? {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }, opts.timeoutMs ?? 10_000);
  };

  let res = await call(false);
  if (res.status === 401) res = await call(true);
  return res;
}

// =============================================================================
// DINHEIRO -- o Efi usa string "123.45"; nos, centavos inteiros
// =============================================================================

export function centsToEfi(cents: number): string {
  if (!Number.isInteger(cents) || cents <= 0) throw new Error(`VALOR_INVALIDO: ${cents}`);
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

/** "123.45" -> 12345. Sem float no meio: float em dinheiro arredonda errado. */
export function efiToCents(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value).trim());
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "0").padEnd(2, "0"));
}

// =============================================================================
// PROVEDOR
// =============================================================================

export function efiProvider(env: EfiEnv): PixProvider {
  return {
    name: "efi",
    env,

    /**
     * Cobranca imediata: PUT /v2/cob/:txid (txid definido por nos).
     * A resposta ja traz 'pixCopiaECola'; se um dia nao trouxer, buscamos em
     * GET /v2/loc/:id/qrcode.
     */
    async createCharge(input: CreateChargeInput): Promise<CreatedCharge> {
      if (!TXID_RE.test(input.txid)) throw new Error(`TXID_INVALIDO: ${input.txid.length} caracteres`);

      const { status, data } = await efiRequest(env, "PUT", `/v2/cob/${input.txid}`, {
        calendario: { expiracao: Math.max(60, Math.floor(input.expiresInSeconds)) },
        valor: { original: centsToEfi(input.amountCents) },
        chave: efiSecret(env, "PIX_KEY"),
        solicitacaoPagador: input.description.slice(0, 140),
      }, { timeoutMs: 15_000 });

      if (status !== 200 && status !== 201) throw new EfiHttpError(status, data, "PUT /v2/cob");

      // deno-lint-ignore no-explicit-any
      const cob = data as any;
      let copiaECola: string | null = typeof cob?.pixCopiaECola === "string" ? cob.pixCopiaECola : null;
      const locId = cob?.loc?.id != null ? String(cob.loc.id) : null;

      if (!copiaECola && locId) {
        const qr = await efiRequest(env, "GET", `/v2/loc/${locId}/qrcode`);
        // deno-lint-ignore no-explicit-any
        const q = qr.data as any;
        if (qr.status === 200 && typeof q?.qrcode === "string") copiaECola = q.qrcode;
      }

      if (!copiaECola) throw new Error("EFI_RESPOSTA_SEM_PIX_COPIA_E_COLA");

      // A resposta tem que ser da cobranca que pedimos, com o valor que pedimos.
      if (cob?.txid && cob.txid !== input.txid) throw new Error("EFI_TXID_DIVERGENTE");
      if (efiToCents(cob?.valor?.original) !== input.amountCents) throw new Error("EFI_VALOR_DIVERGENTE_NA_CRIACAO");

      return {
        provider: "efi",
        env,
        copiaECola,
        locId,
        providerStatus: typeof cob?.status === "string" ? cob.status : null,
      };
    },

    /**
     * GET /v2/cob/:txid -- a UNICA prova de pagamento aceita.
     *
     * Pago = status CONCLUIDA e pelo menos um item em 'pix' com endToEndId.
     */
    async checkCharge(txid: string): Promise<ChargeStatus> {
      if (!TXID_RE.test(txid)) {
        return { paid: false, final: true, amountCents: null, paidAmountCents: null, paymentId: null, providerStatus: "TXID_INVALIDO", audit: {} };
      }

      const { status, data } = await efiRequest(env, "GET", `/v2/cob/${txid}`);

      if (status === 404) {
        return { paid: false, final: false, amountCents: null, paidAmountCents: null, paymentId: null, providerStatus: "NAO_ENCONTRADA", audit: { httpStatus: 404 } };
      }
      // Qualquer outro erro e "nao sei", nunca "nao pagou": lanca para o
      // chamador tratar como provedor indisponivel e tentar de novo.
      if (status !== 200) throw new EfiHttpError(status, data, "GET /v2/cob");

      // deno-lint-ignore no-explicit-any
      const cob = data as any;
      // deno-lint-ignore no-explicit-any
      const pix: any[] = Array.isArray(cob?.pix) ? cob.pix : [];
      const pagamento = pix.find((p) => typeof p?.endToEndId === "string" && p.endToEndId);
      const cobStatus = typeof cob?.status === "string" ? cob.status : null;

      if (cob?.txid && cob.txid !== txid) throw new Error("EFI_TXID_DIVERGENTE");

      return {
        paid: cobStatus === "CONCLUIDA" && Boolean(pagamento),
        final: typeof cobStatus === "string" && cobStatus.startsWith("REMOVIDA"),
        amountCents: efiToCents(cob?.valor?.original),
        paidAmountCents: pagamento ? efiToCents(pagamento.valor) : null,
        paymentId: pagamento?.endToEndId ?? null,
        providerStatus: cobStatus,
        // Sem infoPagador / pagador / devedor: CPF e nome do cliente nao
        // precisam morar na trilha de auditoria.
        audit: {
          provider: "efi",
          env,
          status: cobStatus,
          valor: cob?.valor?.original ?? null,
          pix: pix.map((p) => ({
            endToEndId: p?.endToEndId ?? null,
            valor: p?.valor ?? null,
            horario: p?.horario ?? null,
            devolucoes: Array.isArray(p?.devolucoes) ? p.devolucoes.length : 0,
          })),
        },
      };
    },
  };
}

// =============================================================================
// WEBHOOK
// =============================================================================
// O Efi posta { "pix": [ { endToEndId, txid, chave, valor, horario, ... } ] }.
// O corpo e so um AVISO: nada dele e usado para decidir pagamento, apenas os
// txids para saber quais cobrancas consultar.

export function txidsFromWebhook(body: unknown): string[] {
  // deno-lint-ignore no-explicit-any
  const pix = (body as any)?.pix;
  if (!Array.isArray(pix)) return [];
  const txids = pix
    .map((p) => (typeof p?.txid === "string" ? p.txid.trim() : ""))
    .filter((t) => TXID_RE.test(t));
  return [...new Set(txids)].slice(0, 50);
}

/** Compara segredos em tempo constante (hash dos dois lados). */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const x = new Uint8Array(ha);
  const y = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0 && a.length > 0;
}
