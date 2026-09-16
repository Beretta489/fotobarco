// =============================================================================
// CLIENTE DE PAGAMENTO -- InfiniteTap (cartao) + Checkout (Pix)
// =============================================================================
// Este arquivo roda no tablet. Tudo aqui e publico: qualquer pessoa que baixe o
// APK consegue ler estas linhas e os valores embutidos nelas.
//
// Por isso este arquivo NAO TEM e NAO PODE TER:
//   - chave de API, client secret, token de provedor de pagamento
//   - calculo de quanto cobrar
//   - qualquer caminho que marque um pedido como pago
//
// Ele so: pede a cobranca ao servidor, abre o app da InfinitePay (ou mostra o
// QR do Pix) e repassa o retorno para o servidor conferir.
// =============================================================================

import { Linking } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from './supabase';

const SUPABASE_URL = Constants.expoConfig?.extra?.supabaseUrl;
const SUPABASE_ANON_KEY = Constants.expoConfig?.extra?.supabaseAnonKey;

const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

/**
 * Chama uma Edge Function.
 *
 * A anon key aqui nao e segredo -- e so o cracha que identifica o app para o
 * Supabase. A seguranca real esta dentro da function, que revalida tudo.
 */
async function callFunction(name, payload, { timeoutMs = 20000 } = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const authToken = session?.access_token || SUPABASE_ANON_KEY;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(`${FUNCTIONS_URL}/${name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    const err = new Error('SEM_CONEXAO');
    err.code = 'SEM_CONEXAO';
    err.retry = true;
    throw err;
  }
  clearTimeout(timer);

  const data = await res.json().catch(() => ({}));

  if (!res.ok || data.ok === false) {
    const err = new Error(data.error || `HTTP_${res.status}`);
    err.code = data.error || `HTTP_${res.status}`;
    err.status = res.status;
    err.retry = Boolean(data.retry) || res.status >= 500;
    err.paymentStatus = data.status;
    throw err;
  }

  return data;
}

export const infinitePayService = {
  /**
   * Abre uma cobranca e devolve o que a tela precisa.
   *
   * Cartao -> { deeplink }   Pix -> { checkoutUrl }
   *
   * Repare que NAO existe parametro de valor. O servidor recalcula o preco a
   * partir do catalogo dele -- se um dia alguem adicionar `total` aqui, a
   * protecao contra fraude de preco cai junto.
   */
  async createIntent({
    sessionId,
    groupId,
    packageType,
    photoIds,
    extras = [],
    clientPhone = null,
    paymentMethod = 'credit',
    installments = 1,
  }) {
    return callFunction('payment-intent-create', {
      sessionId,
      groupId,
      packageType,
      photoIds,
      // So id e quantidade. Preco e descartado pelo servidor de qualquer forma.
      extras: extras.map((e) => ({ id: e.id, quantity: e.quantity })),
      clientPhone,
      paymentMethod,
      installments,
    }, { timeoutMs: 30000 });   // Pix cria link no provedor: pode demorar mais
  },

  /**
   * Abre o app da InfinitePay para cobrar no cartao (InfiniteTap).
   *
   * Requer o app "InfinitePay Tap, Conta, Cartão" instalado E logado na conta
   * que vai receber. Em aparelho sem o app, canOpenURL devolve false.
   */
  async openTap(deeplink) {
    const canOpen = await Linking.canOpenURL(deeplink).catch(() => false);
    if (!canOpen) {
      const err = new Error('APP_INFINITEPAY_NAO_INSTALADO');
      err.code = 'APP_INFINITEPAY_NAO_INSTALADO';
      throw err;
    }
    await Linking.openURL(deeplink);
  },

  /**
   * Repassa o retorno do deeplink (cartao) para o servidor conferir.
   *
   * IMPORTANTE: o retorno de sucesso desta funcao e a UNICA coisa que autoriza
   * mostrar as fotos. Nunca libere nada olhando so para os parametros do
   * deeplink -- eles chegam pelo aparelho e podem ser forjados.
   */
  async confirmTap({ orderNsu, transactionNsu, aut, cardBrand, warning }) {
    return callFunction('payment-confirm', {
      orderNsu, transactionNsu, aut, cardBrand, warning,
    });
  },

  /**
   * Pergunta ao servidor se o Pix ja caiu.
   *
   * Quem confirma o Pix e o webhook da InfinitePay; esta chamada so le o
   * resultado. Devolve { status: 'pending' | 'paid' | 'expired' }.
   *
   * `transactionNsu` e opcional e serve para recuperacao manual: quando o
   * webhook nao chega, o operador digita o NSU do comprovante e o servidor
   * confere direto no provedor.
   */
  async checkPixStatus(orderNsu, transactionNsu = null) {
    try {
      return await callFunction(
        'payment-status',
        { orderNsu, ...(transactionNsu ? { transactionNsu } : {}) },
        { timeoutMs: 10000 },
      );
    } catch (e) {
      // Durante o polling, "ainda nao pago" volta como erro. Isso e esperado --
      // a tela so precisa saber que nao acabou.
      if (e.paymentStatus) return { ok: false, status: e.paymentStatus, error: e.code };
      throw e;
    }
  },
};

// =============================================================================
// RETORNO DO DEEPLINK
// =============================================================================

/**
 * Extrai os parametros do deeplink de retorno da InfinitePay.
 *
 * Formato: fotobarco://payment/result?order_id=...&nsu=...&aut=...
 *
 * O objeto devolvido e DADO NAO CONFIAVEL. Serve para saber que o cliente
 * voltou da maquininha e alimentar confirmTap() -- nada alem disso.
 */
export function parseTapResult(url) {
  try {
    const query = String(url).split('?')[1];
    if (!query) return null;

    const params = new URLSearchParams(query);
    const orderNsu = params.get('order_id');
    if (!orderNsu) return null;

    return {
      orderNsu,
      transactionNsu: params.get('nsu') || null,
      aut: params.get('aut') || null,
      cardBrand: params.get('card_brand') || null,
      handle: params.get('handle') || null,
      // Presenca de 'warning' = transacao nao concluida.
      warning: params.get('warning') || null,
    };
  } catch (_) {
    return null;
  }
}

/** true se a URL e o retorno do InfiniteTap. */
export function isTapResultUrl(url) {
  return typeof url === 'string' && url.includes('payment/result');
}

/**
 * Mensagens para o operador do tablet.
 *
 * Traduz o codigo tecnico da Edge Function. Os codigos sao propositalmente
 * genericos do lado do servidor -- detalhe demais numa tela publica ajuda quem
 * esta tentando burlar o fluxo.
 */
export function mensagemDeErro(code) {
  const mapa = {
    APP_INFINITEPAY_NAO_INSTALADO:
      'O app InfinitePay nao esta instalado neste aparelho.',
    SEM_CONEXAO:
      'Sem conexao. Verifique a internet e tente novamente.',
    PAGAMENTO_RECUSADO:
      'Pagamento recusado. Tente outro cartao.',
    PAGAMENTO_NAO_CONFIRMADO:
      'Nao conseguimos confirmar o pagamento. Se o valor foi debitado, chame o responsavel.',
    PAGAMENTO_EXPIRADO:
      'O tempo para pagar expirou. Refaca o pedido.',
    PAGAMENTO_ENCERRADO:
      'Este pagamento ja foi encerrado. Refaca o pedido.',
    PROVEDOR_INDISPONIVEL:
      'A InfinitePay nao respondeu. Aguarde e tente confirmar novamente.',
    VALOR_DIVERGENTE:
      'O valor pago nao confere com o pedido. Chame o responsavel.',
    TRANSACAO_JA_UTILIZADA:
      'Este comprovante ja foi usado em outro pedido.',
    TENTATIVAS_EXCEDIDAS:
      'Muitas tentativas. Refaca o pedido.',
    NAO_FOI_POSSIVEL_CALCULAR_O_VALOR:
      'Nao foi possivel calcular o valor do pedido. Refaca a selecao.',
    FALHA_AO_GERAR_PIX:
      'Nao foi possivel gerar o Pix. Tente novamente ou use cartao.',
    PAGAMENTO_NAO_ENCONTRADO:
      'Pagamento nao encontrado. Refaca o pedido.',
  };
  return mapa[code] || 'Nao foi possivel concluir o pagamento. Tente novamente.';
}
