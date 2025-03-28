import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@env';
import AsyncStorage from '@react-native-async-storage/async-storage';
import 'react-native-url-polyfill/auto';

// Critical check for environment variables
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("CRITICAL: Supabase URL or Anon Key is missing from environment. Check .env load process.");
  throw new Error("Missing Supabase configuration. Environment variables not loaded properly.");
}

// Only initialize the client if environment variables are present
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  }
}); 