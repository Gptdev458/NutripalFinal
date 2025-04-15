import { createClient } from '@supabase/supabase-js';
// import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@env'; // REMOVED @env import
import AsyncStorage from '@react-native-async-storage/async-storage';
import 'react-native-url-polyfill/auto';

let supabase = null; // Client will be initialized later

/**
 * Initializes the Supabase client.
 * Must be called once during app startup.
 * @param {string} supabaseUrl The Supabase project URL.
 * @param {string} supabaseAnonKey The Supabase anon key.
 */
export const initializeSupabase = (supabaseUrl, supabaseAnonKey) => {
  if (supabase) {
    console.warn('Supabase client already initialized.');
    return supabase;
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('CRITICAL: initializeSupabase called with missing URL or Key.');
    // Decide how to handle this - maybe throw error or return null?
    // Throwing error might be safer to prevent unexpected behavior.
    throw new Error('initializeSupabase requires a valid URL and Key.');
  }

  console.log('Initializing Supabase client in supabaseClient.js...');
  supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    }
  });
  console.log('Supabase client instance created.');
  return supabase;
};

/**
 * Returns the initialized Supabase client instance.
 * Throws error if initializeSupabase hasn't been called.
 */
export const getSupabaseClient = () => {
  if (!supabase) {
    throw new Error('Supabase client has not been initialized. Call initializeSupabase first.');
  }
  return supabase;
};

// Update verification method to use the initialized client via getter
export const verifySupabaseConnection = async () => {
  try {
    const client = getSupabaseClient(); // Get the initialized client
    const { error } = await client.auth.getSession();
    if (error) {
      console.error('Supabase connection test failed:', error.message);
      return false;
    }
    console.log('Supabase connection verified successfully.');
    return true;
  } catch (err) {
    console.error('Supabase connection test error:', err);
    return false;
  }
}; 