// =============================================================================
// PIX PENDENTE -- leitura para a tela de recuperacao manual
// =============================================================================
// Esta consulta so retorna alguma coisa para quem esta LOGADO no painel: as
// policies payment_intents_select_admin e orders_select_admin liberam SELECT
// apenas para o role 'authenticated'. Com a anon key do tablet a lista volta
// vazia -- de proposito, nao e bug.
//
// Repare que aqui nao existe nada que LIBERE um pedido. Esta camada so enxerga.
// Quem libera e a Edge Function payment-recover, que confere no provedor antes.
// =============================================================================

import { supabase } from './supabase';

export const pendingPaymentsService = {
  /**
   * Pix que ficaram sem confirmacao.
   *
   * Inclui os 'expired' de proposito: o caso classico e justamente esse -- o
   * cliente pagou, o webhook nao chegou, e os 15 minutos do intent venceram
   * enquanto ninguem olhava. Esses sao os que mais precisam de resgate.
   *
   * A janela padrao acompanha PAYMENT_RECOVERY_WINDOW_DAYS do servidor: mostrar
   * pedido mais antigo que isso so geraria tentativa recusada.
   */
  async listarPixPendentes({ dias = 7 } = {}) {
    const desde = new Date(Date.now() - dias * 86400000).toISOString();

    const { data, error } = await supabase
      .from('payment_intents')
      .select(`
        id, order_nsu, amount_cents, status, invoice_slug,
        expires_at, created_at,
        orders ( id, client_phone, status )
      `)
      .eq('payment_method', 'pix')
      .in('status', ['pending', 'expired'])
      .gte('created_at', desde)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    return data ?? [];
  },
};
