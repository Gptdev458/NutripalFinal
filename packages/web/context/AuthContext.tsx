'use client'; // This component uses hooks and interacts with browser APIs (via Supabase)

import React, { createContext, useState, useEffect, useContext, ReactNode } from 'react';
// Import the SSR helper for browser clients
import { createBrowserClient } from '@supabase/ssr'; 
// We no longer need the shared client here
// import { getSupabaseClient } from 'shared'; 
import type { AuthSession, AuthUser } from 'shared'; // Still use shared types
import type { SupabaseClient } from '@supabase/supabase-js'; // Import SupabaseClient type

// Define the shape of the context data
interface AuthContextType {
  supabase: SupabaseClient | null; // Expose the client if needed by components
  user: AuthUser | null;
  session: AuthSession | null;
  loading: boolean;
  error: string | null;
  // Add signOut function type
  signOut: () => Promise<{ error: Error | null }>; 
  // Optional: Add signIn/signUp/signOut methods here if needed globally,
  // but often they are better handled in specific page components.
}

// Create the context with a default value
const AuthContext = createContext<AuthContextType>({
  supabase: null,
  user: null,
  session: null,
  loading: true, 
  error: null,
  // Provide a default no-op function matching the type
  signOut: async () => ({ error: new Error('Auth context not initialized') }), 
});

// Custom hook to easily use the auth context
export const useAuth = () => useContext(AuthContext);

// Provider component definition
interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [supabase] = useState(() => { // Create client once using useState initializer
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !supabaseAnonKey) {
          console.error("AuthProvider Error: Missing Supabase ENV variables.");
          // Return null or throw, depending on how you want to handle critical config error
          // throw new Error("Missing Supabase ENV variables for AuthProvider.");
          return null;
      }
      console.log("AuthProvider: Creating Supabase browser client...");
      return createBrowserClient(
          supabaseUrl,
          supabaseAnonKey
      );
  });

  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      setError("Authentication service failed to initialize.");
      setLoading(false);
      return;
    }

    let isMounted = true; 

    // Fetch the initial session
    const fetchInitialSession = async () => {
      try {
        // Use the client created above
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        if (isMounted) {
          setSession(data.session);
          setUser(data.session?.user ?? null);
        }
      } catch (err: any) {
        console.error('Error fetching initial session:', err.message);
        if (isMounted) setError('Failed to load user session.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchInitialSession();

    // Subscribe to auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (isMounted) {
          console.log("AuthProvider state changed:", _event, session ? 'Got session' : 'No session');
          setSession(session);
          setUser(session?.user ?? null);
          setLoading(false); 
          setError(null); 
        }
      }
    );

    // Cleanup: unsubscribe on unmount
    return () => {
      isMounted = false;
      if (subscription) {
        console.log("AuthProvider: Unsubscribing from auth state changes.");
        subscription.unsubscribe();
      }
    };
  }, [supabase]); // Add supabase as dependency

  // --- Add signOut function --- 
  const signOut = async () => {
    if (!supabase) {
      const err = new Error('Supabase client not initialized for sign out.');
      console.error(err.message);
      return { error: err };
    }
    console.log("AuthProvider: Calling supabase.auth.signOut...");
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Error during sign out:', error.message);
      setError(`Sign out failed: ${error.message}`); // Update error state
    }
    // Auth listener will handle setting user/session to null
    return { error };
  };
  // --- End signOut function ---

  // Value object passed down through the context
  const value: AuthContextType = {
    supabase, // Provide the client instance via context
    user,
    session,
    loading,
    error,
    signOut, // Include signOut in the context value
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}; 