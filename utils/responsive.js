// =============================================================================
// ESCALA RESPONSIVA -- o app roda num tablet (quase sempre deitado)
// =============================================================================
// Os tamanhos dos estilos foram pensados para uma tela de celular (~420 x 600
// pontos uteis). Em telas maiores tudo cresce na mesma proporcao -- fontes,
// botoes, cards e espacos -- para ocupar a area disponivel em vez de deixar
// elementos pequenos boiando no meio de muito espaco vazio.
//
// O fator usa o MENOR dos dois eixos: num tablet deitado a altura e o limite
// (crescer pela largura faria o conteudo vazar para baixo da tela).
//
//   celular             -> 1
//   tablet deitado      -> ~1.4
//   tablet em pe        -> 1.5 (teto)
//
// Uso numa tela:
//   const createStyles = (k) => { const z = (n) => Math.round(n * k); ... };
//   const styles = useScaledStyles(createStyles);
// =============================================================================

import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';

const BASE_WIDTH = 420;
const BASE_HEIGHT = 560;
const MAX_SCALE = 1.5;

export function scaleFor(width, height) {
  const k = Math.min(width / BASE_WIDTH, height / BASE_HEIGHT);
  // Arredonda em passos de 0,05: girar ou redimensionar a janela um pouco
  // nao recria todos os estilos a cada pixel.
  return Math.round(Math.max(1, Math.min(MAX_SCALE, k)) * 20) / 20;
}

/** Fator de escala da tela atual (atualiza ao girar o tablet). */
export function useScale() {
  const { width, height } = useWindowDimensions();
  return scaleFor(width, height);
}

/**
 * Estilos da tela: factory(k, largura, altura). Recriados so quando a escala
 * ou o tamanho da janela mudam (girar o tablet, redimensionar no navegador).
 */
export function useScaledStyles(factory) {
  const { width, height } = useWindowDimensions();
  const k = scaleFor(width, height);
  return useMemo(() => factory(k, width, height), [factory, k, width, height]);
}
