import { supabase } from './supabase';

export const sessionsService = {
  async getAll() {
    const { data, error } = await supabase
      .from('sessions')
      .select('*, groups(count)')
      .order('scheduled_at', { ascending: true });
    if (error) throw error;
    return data;
  },

  async getActive() {
    const now = new Date();
    const { data, error } = await supabase
      .from('sessions')
      .select('*, groups(*)')
      .eq('active', true)
      .order('scheduled_at', { ascending: true });
    if (error) throw error;
    return data;
  },

  async create(name, scheduledAt) {
    const { data, error } = await supabase
      .from('sessions')
      .insert({ name, scheduled_at: scheduledAt, active: true })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deactivate(id) {
    const { error } = await supabase
      .from('sessions')
      .update({ active: false })
      .eq('id', id);
    if (error) throw error;
  },

  async getGroupsBySession(sessionId) {
    const { data, error } = await supabase
      .from('groups')
      .select('*, photos(id, url)')
      .eq('session_id', sessionId)
      .order('name', { ascending: true });
    if (error) throw error;
    return data;
  },

  async createGroup(sessionId, name, telegramGroupId = null) {
    const { data, error } = await supabase
      .from('groups')
      .insert({ session_id: sessionId, name, telegram_group_id: telegramGroupId })
      .select()
      .single();
    if (error) throw error;
    return data;
  },
};