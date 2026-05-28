import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const SUPABASE_URL = 'https://vofpisizzubbhpidgvoz.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZvZnBpc2l6enViYmhwaWRndm96Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MDg1OTksImV4cCI6MjA5NTM4NDU5OX0.Xa398Tqsq67ByUseDcN6ICw3WKxDpKvwF4tz5__FBlU';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
 