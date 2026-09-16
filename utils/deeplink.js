// =============================================================================
// CAPTURA DO DEEPLINK DE RETORNO
// =============================================================================
// O InfiniteTap tira o app do ar: o FotoBarco vai para segundo plano, o cliente
// paga no app da InfinitePay, e o resultado volta como um deeplink.
//
// O problema que este arquivo resolve: o retorno pode chegar ANTES da tela que
// vai trata-lo estar pronta para ouvir -- especialmente quando o Android
// descarta o app da memoria e ele e reaberto pelo proprio deeplink.
//
// Por isso o listener e instalado no boot (App.js) e o ultimo resultado fica
// guardado aqui. A tela de pagamento consome quando montar, mesmo que o evento
// tenha acontecido segundos antes.
//
// LEMBRETE DE SEGURANCA: o que passa por aqui e dado nao confiavel. Qualquer
// app do aparelho consegue disparar um deeplink com estes parametros. Isso aqui
// e so um transporte -- quem decide se houve pagamento e o servidor.
// =============================================================================

import { Linking } from 'react-native';
import { isTapResultUrl, parseTapResult } from '../services/infinitepay';

let ultimoResultado = null;
let inscritos = [];
let subscription = null;

function entregar(url) {
  if (!isTapResultUrl(url)) return;

  const resultado = parseTapResult(url);
  if (!resultado) return;

  if (inscritos.length > 0) {
    // Tem alguem ouvindo agora: entrega e nao guarda.
    inscritos.forEach((fn) => {
      try { fn(resultado); } catch (_) {}
    });
  } else {
    // Ninguem ouvindo ainda (app reabrindo). Guarda para a tela consumir.
    ultimoResultado = resultado;
  }
}

/** Instala o listener global. Chamar uma vez, no boot do app. */
export function initDeeplinkListener() {
  if (subscription) return subscription;

  subscription = Linking.addEventListener('url', ({ url }) => entregar(url));

  // Caso o app tenha sido ABERTO pelo deeplink: o evento 'url' nao dispara,
  // o valor so existe aqui.
  Linking.getInitialURL()
    .then((url) => { if (url) entregar(url); })
    .catch(() => {});

  return subscription;
}

/**
 * Inscreve uma tela para receber o retorno do Tap.
 * Devolve a funcao de cancelamento -- chamar no cleanup do useEffect.
 */
export function onTapResult(callback) {
  inscritos.push(callback);

  // Chegou antes desta tela montar? Entrega agora e limpa.
  if (ultimoResultado) {
    const pendente = ultimoResultado;
    ultimoResultado = null;
    setTimeout(() => {
      try { callback(pendente); } catch (_) {}
    }, 0);
  }

  return () => {
    inscritos = inscritos.filter((fn) => fn !== callback);
  };
}

/** Descarta retorno pendente -- usar ao abandonar um pagamento. */
export function limparResultadoPendente() {
  ultimoResultado = null;
}
