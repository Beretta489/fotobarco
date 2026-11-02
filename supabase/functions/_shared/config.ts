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
// │   supabase secrets set EFI_ENV=producao                                  │
// │   supabase secrets set ATTENDANT_PASSWORD=<senha do atendente>           │
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

  pix: {
    // Ambiente do Efi: "homologacao" ou "producao". Cada um tem seus proprios
    // secrets (EFI_HOMOLOG_* / EFI_PROD_*) -- ver _shared/pix/efi.ts.
    // Padrao homologacao: esquecer este secret gera Pix de teste (que nenhum
    // banco real aceita), nunca cobranca de verdade na conta errada.
    efiEnv: optional("EFI_ENV", "homologacao").toLowerCase(),

    // Intervalo minimo entre duas consultas ao Efi para o MESMO intent vindas
    // do polling do tablet. O tablet pergunta a cada 3 s; sem este freio cada
    // tablet aberto viraria uma consulta ao banco a cada 3 s.
    // Valor invalido (texto, negativo) cai no padrao: NaN aqui viraria uma
    // data invalida e derrubaria o payment-status inteiro.
    pollMinIntervalSeconds: (() => {
      const n = Number(optional("EFI_POLL_MIN_INTERVAL_SECONDS", "10"));
      return Number.isFinite(n) && n >= 1 ? n : 10;
    })(),

    // OPCIONAL. IPs de origem aceitos no webhook do Efi, separados por virgula
    // (o Efi documenta 34.193.116.226). Vazio = nao confere IP. E so uma
    // camada extra: a protecao real e o segredo na URL + consulta da cobranca.
    efiWebhookAllowedIps: optional("EFI_WEBHOOK_ALLOWED_IPS", "")
      .split(",").map((s) => s.trim()).filter(Boolean),
  },

  app: {
    // OPCIONAL. Se cadastrado, somente esta conta consegue liberar um pagamento
    // na mao pela payment-recover. Sem ele, qualquer usuario autenticado do
    // projeto passa -- hoje so existe a conta do admin, mas cadastrar fecha a
    // porta caso um dia existam outros logins.
    //   supabase secrets set ADMIN_EMAIL=admin@jangalanchashow.com.br
    adminEmail: optional("ADMIN_EMAIL", ""),
  },

  // Validade do intent Pix. Passou disso, o cliente refaz o pagamento.
  intentTtlMinutes: Number(optional("PAYMENT_INTENT_TTL_MINUTES", "15")),

  attendant: {
    // Senha que o atendente digita no tablet para liberar as fotos de um
    // pagamento em credito, debito ou dinheiro.
    //
    // Fica SO aqui, como secret. No app ela estaria dentro do APK, e quem a
    // tivesse liberaria fotos sem pagar. Use 6 caracteres ou mais: o limite
    // de tentativas abaixo segura forca bruta, mas uma senha de 4 digitos tem
    // so 10 mil combinacoes.
    //
    // Vazia = liberacao pelo atendente DESLIGADA (fail-closed): a function
    // recusa tudo em vez de aceitar qualquer senha.
    //
    // >>> TEMPORARIO, SO PARA TESTE <<<
    // Sem o secret, vale "123456". Isto esta no repositorio: qualquer um que
    // leia o codigo sabe a senha. Antes de usar com cliente de verdade,
    // cadastre ATTENDANT_PASSWORD e troque o fallback abaixo de volta para "".
    password: optional("ATTENDANT_PASSWORD", "123456"),

    // O atendente pode demorar a chegar ate o tablet; 15 minutos (o prazo do
    // Pix) seria curto demais aqui.
    intentTtlMinutes: Number(optional("ATTENDANT_INTENT_TTL_MINUTES", "60")),

    // Senhas erradas aceitas por pedido antes de travar.
    maxAttemptsPerIntent: Number(optional("ATTENDANT_MAX_ATTEMPTS", "5")),

    // Teto GLOBAL de senhas erradas na janela abaixo, somando todos os
    // pedidos. Sem ele, criar um pedido novo a cada 5 erros daria tentativas
    // ilimitadas. Efeito colateral aceito: durante um ataque, o atendente
    // tambem fica bloqueado ate a janela passar.
    maxFailuresGlobal: Number(optional("ATTENDANT_MAX_FAILURES_GLOBAL", "20")),
    failureWindowMinutes: Number(optional("ATTENDANT_FAILURE_WINDOW_MINUTES", "15")),
  },

  whatsapp: {
    // URL do Webhook do n8n que recebe o pedido pago e manda as fotos pelo
    // BotConversa. Use a "Production URL" do no Webhook (nao a de teste).
    //   supabase secrets set N8N_WEBHOOK_URL=https://seu-n8n/webhook/fotobarco
    //
    // Vazio = envio DESLIGADO: o pedido e liberado normalmente e fica com
    // whatsapp_status 'skipped', pronto para reenviar pelo whatsapp-resend.
    webhookUrl: optional("N8N_WEBHOOK_URL", ""),

    // Vai no header X-FotoBarco-Secret. O fluxo do n8n confere e recusa o
    // resto -- sem isso, quem descobrir a URL dispara mensagens em nome da
    // empresa.
    //   supabase secrets set N8N_WEBHOOK_SECRET=<texto aleatorio longo>
    webhookSecret: optional("N8N_WEBHOOK_SECRET", ""),

    timeoutMs: Number(optional("N8N_WEBHOOK_TIMEOUT_MS", "15000")),
  },

  // Teto de tentativas da recuperacao manual (payment-recover) por intent.
  maxConfirmAttempts: Number(optional("PAYMENT_MAX_CONFIRM_ATTEMPTS", "10")),

  // Janela da RECUPERACAO MANUAL do Pix (payment-recover), contada a partir da
  // criacao do intent. O fluxo automatico morre em intentTtlMinutes; esta
  // janela e mais longa de proposito, porque a falha que ela resolve (webhook
  // que nao chegou) so e percebida depois -- as vezes no fechamento do caixa.
  //
  // Nao e um furo: a liberacao continua exigindo que o Efi confirme a
  // cobranca e o valor. O que a janela limita e por quanto tempo vale a pena
  // deixar essa porta aberta.
  recoveryWindowDays: Number(optional("PAYMENT_RECOVERY_WINDOW_DAYS", "7")),
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
