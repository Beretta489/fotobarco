import React, { useEffect } from 'react';
import AppNavigator from './navigation/AppNavigator';
import { initDeeplinkListener } from './utils/deeplink';

export default function App() {
  useEffect(() => {
    // Instalado no boot, e nao na tela de pagamento, de proposito: quando o
    // Android descarta o app durante o InfiniteTap, o retorno chega no momento
    // em que o app reabre -- antes de qualquer tela estar montada. O listener
    // guarda esse resultado ate a tela de pagamento vir busca-lo.
    const subscription = initDeeplinkListener();
    return () => subscription?.remove?.();
  }, []);

  return <AppNavigator />;
}
