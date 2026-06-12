import { supabase } from './supabase';

export const photosService = {
  async getByGroup(groupId) {
    const { data, error } = await supabase
      .from('photos')
      .select('*')
      .eq('group_id', groupId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data;
  },

  async getBySession(sessionId) {
    const { data, error } = await supabase
      .from('photos')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data;
  },

  async getMiddlePhoto(groupId) {
    const { data, error } = await supabase
      .from('photos')
      .select('url')
      .eq('group_id', groupId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    if (!data || data.length === 0) return null;
    return data[Math.floor(data.length / 2)].url;
  },

  async upload(sessionId, groupId, uri, fileName) {
    const ext = fileName.split('.').pop().toLowerCase();
    const contentType =
      ext === 'png' ? 'image/png' :
      ext === 'heic' || ext === 'heif' ? 'image/heic' :
      'image/jpeg';

    const path = `${sessionId}/${groupId}/${Date.now()}_${fileName}`;

    const response = await fetch(uri);
    const arrayBuffer = await response.arrayBuffer();

    const { error: uploadError } = await supabase.storage
      .from('photos')
      .upload(path, arrayBuffer, { contentType, upsert: false });
    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from('photos')
      .getPublicUrl(path);

    const { data, error } = await supabase
      .from('photos')
      .insert({
        session_id: sessionId,
        group_id: groupId,
        url: publicUrl,
        storage_path: path,
        price: 15.00,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(photoId, storagePath) {
    await supabase.storage.from('photos').remove([storagePath]);
    const { error } = await supabase.from('photos').delete().eq('id', photoId);
    if (error) throw error;
  },
};
