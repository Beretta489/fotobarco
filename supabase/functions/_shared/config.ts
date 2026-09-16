// =============================================================================
// CONFIGURACAO E SEGREDOS -- roda SOMENTE no servidor (Supabase Edge Function)
// =============================================================================
// REGRA DE OURO: nada neste arquivo pode ser importado pelo app React Native.
// Tudo que entra no bundle do Expo (app.config.js -> extra) e publico: basta
// descompactar o APK para ler. Por isso credencial de pagamento vive aqui, como
// secret da Edge Function, e nunca em process.env do app.
//
// ┌──────────────────────── COMO CONFIGURAR OS SEGREDOS ─────────────────────┐
// │ Pelo CLI (recomendado):                                                  │
// │   supabase secrets set INFINITEPAY_HANDLE=seu_infinitetag                │
// │   supabase secrets set INFINITEPAY_DOC_NUMBER=00000000000000             │
// │   supabase secrets set APP_DEEPLINK_SCHEME=fotobarco                     │
// │                                                                          │
// │ Ou pelo painel: Supabase > Project Settings > Edge Functions > Secrets    │
// │                                                                          │
// │ SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY ja sao injetados automaticamente │
// │ pela plataforma -- nao precisa cadastrar, nao coloque no .env do repo.    │
// └──────────────────────────────────────────────────────────────────────────┘
// =============================================================================

/** Le um secret obrigatorio. Falha no boot da function, nao no meio da venda. */
function required(name: string): string {
  const value = Deno.env.get(name);
  if (!value || value.trim() === "") {
    throw new Error(
      `SECRET_AUSENTE: ${name}. Cadastre com: supabase secrets set ${name}=<valor>`,
    );
  }
  return value.trim();
}

function optional(name: string, fallback: string): string {
  return Deno.env.get(name)?.trim() || fallback;
}

export const config = {
  // --- injetados pela plataforma Supabase (nao cadastrar manualmente) -------
  supabaseUrl: required("SUPABASE_URL"),

  // Chave que ignora RLS. Se ela vazar, o banco inteiro vaza.
  // Nunca logar, nunca devolver em resposta HTTP, nunca commitar.
  serviceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),

  infinitepay: {
    // ┌──────────────────────────────────────────────────────────────────────┐
    // │ >>> PREENCHER: dados que a InfinitePay fornece <<<                   │
    // └──────────────────────────────────────────────────────────────────────┘

    // Seu InfiniteTag -- o @ da conta InfinitePay que vai RECEBER o dinheiro.
    // Onde achar: app InfinitePay > Perfil > InfiniteTag (ex.: "jangalanchashow").
    // Informe sem o "@".
    handle: required("INFINITEPAY_HANDLE"),

    // CNPJ (ou CPF) do recebedor, somente digitos, sem ponto/barra/traco.
    // Usado no deeplink e conferido no retorno, para garantir que a venda caiu
    // na conta certa -- e nao na conta de outra pessoa.
    docNumber: required("INFINITEPAY_DOC_NUMBER"),

    // Identificador do SEU app, combinado com a InfinitePay. Aparece no
    // relatorio deles como origem da venda. Texto livre sem espacos.
    appClientReferrer: optional("INFINITEPAY_APP_REFERRER", "FotoBarco"),

    // Endpoint de conferencia server-side da transacao.
    // >>> CONFIRMAR COM A INFINITEPAY (parcerias@cloudwalk.io) <<<
    // Este e o endpoint publicado para o Checkout; confirme se vale igual para
    // InfiniteTap e se ha URL/campos especificos para Tap antes de ir a
    // producao. Enquanto nao confirmar, veja REQUIRE_PROVIDER_CHECK abaixo.
    paymentCheckUrl: optional(
      "INFINITEPAY_PAYMENT_CHECK_URL",
      "https://api.checkout.infinitepay.io/payment_check",
    ),

    // Trava de seguranca. Com 'true' (padrao e recomendado), um pagamento SO e
    // confirmado se a InfinitePay responder que existe e bate o valor.
    //
    // Colocar 'false' faz o sistema aceitar o retorno do deeplink como prova de
    // pagamento -- e o deeplink pode ser forjado por qualquer app do aparelho.
    // Use 'false' apenas em teste, nunca com dinheiro real.
    requireProviderCheck:
      optional("INFINITEPAY_REQUIRE_PROVIDER_CHECK", "true") === "true",
  },

  app: {
    // Scheme do deeplink de retorno. Precisa bater EXATAMENTE com o "scheme"
    // declarado em app.config.js, senao o InfinitePay nao consegue voltar.
    deeplinkScheme: optional("APP_DEEPLINK_SCHEME", "fotobarco"),
  },

  // Validade do intent. Passou disso, o cliente refaz o pagamento.
  // Curto de proposito: reduz a janela para reapresentar um deeplink antigo.
  intentTtlMinutes: Number(optional("PAYMENT_INTENT_TTL_MINUTES", "15")),

  // Teto de tentativas de confirmacao por intent. Barra forca bruta em cima do
  // endpoint de confirmacao (tentar varios nsu ate acertar um valido).
  maxConfirmAttempts: Number(optional("PAYMENT_MAX_CONFIRM_ATTEMPTS", "10")),
};

// =============================================================================
// CORS
// =============================================================================
// O app nativo nao envia Origin, entao "*" aqui nao expoe nada por si so -- a
// autorizacao real vem do header Authorization (anon key) + validacoes da
// function. Se um dia existir versao web, troque por uma lista fixa de origens.
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Resposta JSON padronizada. */
export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Erro para o cliente.
 *
 * `code` e um rotulo estavel que o app traduz para o usuario. A mensagem
 * detalhada fica no log do servidor e em payment_events -- devolver stack trace
 * ou texto cru do provedor ajudaria um atacante a mapear o sistema.
 */
export function errorResponse(code: string, status = 400): Response {
  return json({ ok: false, error: code }, status);
}
