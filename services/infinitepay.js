// =============================================================================
// CLIENTE DE PAGAMENTO -- Pix (Checkout) + liberacao pelo atendente
// =============================================================================
// Este arquivo roda no tablet. Tudo aqui e publico: qualquer pessoa que baixe o
// APK consegue ler estas linhas e os valores embutidos nelas.
//
// Por isso este arquivo NAO TEM e NAO PODE TER:
//   - chave de API, client secret, token de provedor de pagamento
//   - a senha do atendente
//   - calculo de quanto cobrar
//   - qualquer caminho que marque um pedido como pago
//
// Ele so: pede a cobranca ao servidor, pergunta se o Pix caiu e repassa a
// senha digitada pelo atendente para o servidor conferir.
// =============================================================================

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
   * Pix -> { checkoutUrl }   credit/debit/cash -> so o valor e o orderNsu
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
    paymentMethod = 'pix',
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
    }, { timeoutMs: 30000 });   // Pix cria link no provedor: pode demorar mais
  },

  /**
   * Libera um pagamento em credito, debito ou dinheiro com a senha do
   * atendente.
   *
   * A senha e conferida SO no servidor. Este app nunca sabe qual e a senha
   * certa -- se soubesse, ela estaria dentro do APK.
   */
  async confirmarAtendente({ orderNsu, password }) {
    return callFunction('payment-attendant-confirm', { orderNsu, password });
  },

  /**
   * Pergunta ao servidor se o Pix ja caiu.
   *
   * Quem confirma o Pix e o webhook da InfinitePay; esta chamada so le o
   * resultado. Devolve { status: 'pending' | 'paid' | 'expired' }.
   *
   * Esta funcao NAO confirma pagamento. Para o caso do webhook nao chegar, a
   * liberacao manual e recuperarPix() -- que exige admin logado.
   */
  async checkPixStatus(orderNsu) {
    try {
      return await callFunction(
        'payment-status',
        { orderNsu },
        { timeoutMs: 10000 },
      );
    } catch (e) {
      // Durante o polling, "ainda nao pago" volta como erro. Isso e esperado --
      // a tela so precisa saber que nao acabou.
      if (e.paymentStatus) return { ok: false, status: e.paymentStatus, error: e.code };
      throw e;
    }
  },

  /**
   * Libera na mao um Pix que o webhook nao confirmou.
   *
   * Uso: o cliente mostra o comprovante no celular dele, o operador digita o
   * NSU da transacao. O servidor pergunta a InfinitePay se aquela transacao
   * existe e se o valor bate -- exatamente como no fluxo automatico. A unica
   * coisa que muda e a janela de tempo aceita.
   *
   * SO FUNCIONA COM ADMIN LOGADO. A function recusa a anon key do tablet: como
   * essa chave esta dentro do APK, aceita-la aqui daria a qualquer pessoa o
   * poder de liberar um pedido vencido.
   */
  async recuperarPix({ orderNsu, transactionNsu }) {
    return callFunction('payment-recover', { orderNsu, transactionNsu });
  },
};

/**
 * Mensagens para o operador do tablet.
 *
 * Traduz o codigo tecnico da Edge Function. Os codigos sao propositalmente
 * genericos do lado do servidor -- detalhe demais numa tela publica ajuda quem
 * esta tentando burlar o fluxo.
 */
export function mensagemDeErro(code) {
  const mapa = {
    SEM_CONEXAO:
      'Sem conexao. Verifique a internet e tente novamente.',
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
      'Nao foi possivel gerar o Pix. Tente novamente ou pague com o atendente.',
    PAGAMENTO_NAO_ENCONTRADO:
      'Pagamento nao encontrado. Refaca o pedido.',

    // --- liberacao pelo atendente (payment-attendant-confirm) ------------
    SENHA_INCORRETA:
      'Senha incorreta.',
    SENHA_AUSENTE:
      'Digite a senha do atendente.',
    BLOQUEIO_TEMPORARIO:
      'Muitas senhas erradas. Aguarde alguns minutos e tente de novo.',
    LIBERACAO_DESATIVADA:
      'Liberacao pelo atendente nao configurada. Chame o responsavel.',

    // --- recuperacao manual do Pix (payment-recover) ---------------------
    NAO_AUTORIZADO:
      'Sessao de admin expirada. Entre de novo no painel para liberar.',
    NSU_AUSENTE:
      'Digite o NSU que aparece no comprovante do cliente.',
  };
  return mapa[code] || 'Nao foi possivel concluir o pagamento. Tente novamente.';
}
