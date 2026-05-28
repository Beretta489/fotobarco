import { supabase } from './supabase';

export const ordersService = {
  async create(sessionId, groupId, photoIds, total, packageType, clientPhone) {
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        session_id: sessionId,
        group_id: groupId,
        total,
        status: 'pending',
        package_type: packageType,
        client_phone: clientPhone,
      })
      .select()
      .single();
    if (orderError) throw orderError;

    const items = photoIds.map((photoId) => ({
      order_id: order.id,
      photo_id: photoId,
    }));
    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(items);
    if (itemsError) throw itemsError;

    return order;
  },

  generatePixPayload(orderId, total) {
    const txId = orderId.replace(/-/g, '').substring(0, 25).toUpperCase();
    return {
      copyPaste: `00020126580014br.gov.bcb.pix0136${txId}5204000053039865406${total.toFixed(2).replace('.', '')}5802BR5913JangalanchaShow6009SAO PAULO62070503***6304ABCD`,
      txId,
    };
  },

  async confirmPayment(orderId) {
    const downloadToken = Math.random().toString(36).substring(2, 18).toUpperCase();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const { data, error } = await supabase
      .from('orders')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        download_token: downloadToken,
        download_expires_at: expiresAt.toISOString(),
      })
      .eq('id', orderId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

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