import { createClient, SupabaseClient, SupabaseClientOptions } from '@supabase/supabase-js';

// Define a type for the storage adapter that both mobile and web can implement
export interface SupabaseStorageAdapter {
  getItem(key: string): Promise<string | null> | string | null;
  setItem(key: string, value: string): Promise<void> | void;
  removeItem(key: string): Promise<void> | void;
}

let supabase: SupabaseClient | null = null;

/**
 * Initializes the Supabase client with a platform-specific storage adapter.
 * Must be called once during app startup.
 * @param {string} supabaseUrl The Supabase project URL.
 * @param {string} supabaseAnonKey The Supabase anon key.
 * @param {SupabaseStorageAdapter} storageAdapter The adapter for session persistence (e.g., AsyncStorage for mobile, localStorage for web).
 */
export const initializeSupabase = (
  supabaseUrl: string,
  supabaseAnonKey: string,
  storageAdapter: SupabaseStorageAdapter
): SupabaseClient => {
  if (supabase) {
    console.warn('Supabase client already initialized.');
    return supabase;
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('CRITICAL: initializeSupabase called with missing URL or Key.');
    throw new Error('initializeSupabase requires a valid URL and Key.');
  }
   if (!storageAdapter) {
    console.error('CRITICAL: initializeSupabase called without a storageAdapter.');
    throw new Error('initializeSupabase requires a valid storageAdapter.');
  }

  console.log('Initializing Supabase client in shared/src/supabaseClient.ts...');

  const options: SupabaseClientOptions<"public"> = { // Specify 'public' schema or adjust as needed
     global: {
        // You might need fetch polyfill depending on environment, but often not needed
        // headers: { 'x-application-name': 'your-app-name' }, // Example header
     },
     auth: {
        storage: storageAdapter, // Use the provided adapter
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false, // Typically false for non-browser environments like RN
     }
  };


  supabase = createClient(supabaseUrl, supabaseAnonKey, options);
  console.log('Shared Supabase client instance created.');
  return supabase;
};

/**
 * Returns the initialized Supabase client instance.
 * Throws error if initializeSupabase hasn't been called.
 */
export const getSupabaseClient = (): SupabaseClient => {
  if (!supabase) {
    throw new Error('Supabase client has not been initialized. Call initializeSupabase first.');
  }
  return supabase;
};

// Optional: Keep the verification function, it should work fine with the getter
export const verifySupabaseConnection = async (): Promise<boolean> => {
  try {
    const client = getSupabaseClient(); // Get the initialized client
    const { error } = await client.auth.getSession();
    if (error) {
      console.error('Supabase connection test failed:', error.message);
      return false;
    }
    console.log('Supabase connection verified successfully.');
    return true;
  } catch (err: any) {
    console.error('Supabase connection test error:', err.message || err);
    return false;
  }
}; 