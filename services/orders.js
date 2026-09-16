import { supabase } from './supabase';

// =============================================================================
// ATENCAO -- create() e confirmPayment() foram REMOVIDOS daqui de proposito.
// =============================================================================
// create(sessionId, groupId, photoIds, TOTAL, ...)
//   Inseria o pedido direto do app com o total calculado na tela. Como o app
//   roda com a anon key (publica) e a policy aceitava qualquer valor, dava para
//   criar um pedido de R$ 0,01 e levar todas as fotos.
//   -> Agora o pedido nasce na Edge Function payment-intent-create, que
//      recalcula o preco pelo catalogo do servidor.
//
// confirmPayment(orderId, downloadToken)
//   Marcava status='paid' a partir do app. Quem controla o aparelho liberaria
//   fotos sem pagar. (Na pratica ja falhava: nao existe policy de UPDATE em
//   orders para o anon -- o fluxo nunca funcionou de ponta a ponta.)
//   -> Agora quem confirma e a Edge Function payment-confirm, depois de
//      perguntar a InfinitePay se a transacao existe e o valor bate.
//
// Se precisar criar pedido ou confirmar pagamento, use services/infinitepay.js.
// Nao traga estes metodos de volta.
// =============================================================================

export const ordersService = {
  async getWithPhotos(orderId) {
    const { data, error } = await supabase
      .from('orders')
      .select(`*, order_items(photo_id, photos(url))`)
      .eq('id', orderId)
      .single();
    if (error) throw error;
    return data;
  },

  async getDashboard() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(count)')
      .eq('status', 'paid')
      .gte('paid_at', today.toISOString());
    if (error) throw error;

    const totalRevenue = data.reduce((sum, o) => sum + Number(o.total), 0);
    const totalPhotos = data.reduce((sum, o) => sum + (o.order_items[0]?.count || 0), 0);

    return {
      orders: data,
      totalRevenue,
      totalPhotos,
      totalOrders: data.length,
    };
  },
};
