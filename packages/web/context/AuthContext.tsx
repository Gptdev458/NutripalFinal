'use client'; // This component uses hooks and interacts with browser APIs (via Supabase)

import React, { createContext, useState, useEffect, useContext, ReactNode, useMemo, useCallback } from 'react';
// --- Switch back to @supabase/auth-helpers-react for testing ---
import { createBrowserClient } from '@supabase/ssr'; // Use @supabase/ssr
// import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'; // Remove old import
// -----------------------------------------------------------------
import type { AuthSession, AuthUser } from 'shared'; // Remove UserProfile import if not used elsewhere
// Import SupabaseClient and Session types
import type { SupabaseClient, Session } from '@supabase/supabase-js';

// Define the shape of the context data (simplified)
interface AuthContextType {
  supabase: SupabaseClient | null;
  user: AuthUser | null;
  session: AuthSession | null;
  loading: boolean; // Only one loading state
  error: string | null;
  signOut: () => Promise<{ error: Error | null }>;
}

// Create the context with a default value (simplified)
const AuthContext = createContext<AuthContextType>({
  supabase: null,
  user: null,
  session: null,
  loading: true, // Start loading
  error: null,
  signOut: async () => ({ error: new Error('Auth context not initialized') }),
});

// Custom hook to easily use the auth context
export const useAuth = () => useContext(AuthContext);

// Provider component definition
interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true); // Main loading state
  const [error, setError] = useState<string | null>(null);

  // Effect 1: Create Supabase Client
  useEffect(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("AuthProvider Error: Missing Supabase ENV variables.");
      setError("Authentication service configuration missing.");
      setLoading(false);
      return;
    }
    console.log("AuthProvider: Creating Supabase client on mount using @supabase/ssr...");
    const client = createBrowserClient(supabaseUrl, supabaseAnonKey);
    setSupabase(client);
  }, []);

  // Effect 2: Initial Session Check (RESTORED and SIMPLIFIED)
  useEffect(() => {
    if (!supabase) return;
    let isMounted = true;
    console.log("[AuthContext Effect 2] Checking initial session...");
    
    const checkSession = async () => {
      try {
        console.log("[AuthContext Effect 2] Calling getSession()...");
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (!isMounted) return;
        console.log("[AuthContext Effect 2] getSession() completed.", { sessionExists: !!data?.session });
        if (sessionError) throw sessionError;
        
        const initialSession = data?.session ?? null;
        const initialUser = initialSession?.user ?? null;
        setSession(initialSession);
        setUser(initialUser);
        setError(null);
      } catch (err: any) {
        console.error('[AuthContext Effect 2] Error checking initial session:', err.message);
        if (isMounted) setError('Failed to load initial user data.');
        setSession(null);
        setUser(null);
      } finally {
        if (isMounted) {
          console.log("[AuthContext Effect 2] Initial check complete. Setting loading = false.");
          setLoading(false); // Set loading false after check
        }
      }
    };
    checkSession();
    return () => { isMounted = false; };
  }, [supabase]); // Only depends on supabase client

  // Effect 3: Auth State Change Listener (SIMPLIFIED)
  useEffect(() => {
    if (!supabase) return;
    let isMounted = true;
    console.log("[AuthContext Effect 3] Setting up onAuthStateChange listener.");
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event: string, session: Session | null) => {
        if (!isMounted) return;
        console.log(`[AuthContext Effect 3] onAuthStateChange: Event ${_event}. Updating session and user.`);
        setSession(session);
        setUser(session?.user ?? null);
        setError(null);
        // DO NOT fetch profile here anymore
      }
    );

    return () => {
      isMounted = false;
      console.log("[AuthContext Effect 3] Cleanup listener.");
      if (subscription) subscription.unsubscribe();
    };
  }, [supabase]); // Only depends on supabase client

  // signOut function (Keep as is)
  const signOut = useCallback(async () => {
    if (!supabase) {
      const err = new Error('Supabase client not initialized for sign out.');
      console.error(err.message);
      setError(err.message);
      return { error: err };
    }
    console.log("AuthProvider: Calling supabase.auth.signOut...");
    setLoading(true); // Keep loading true during sign out
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      console.error('Error during sign out:', signOutError.message);
      setError(`Sign out failed: ${signOutError.message}`);
    }
    return { error: signOutError };
  }, [supabase]);

  // Value object passed down through the context (Simplified)
  const value = useMemo(() => ({
    supabase,
    user,
    session,
    loading,
    error,
    signOut,
  }), [supabase, user, session, loading, error, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}; 