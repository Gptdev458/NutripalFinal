'use client'; // This component uses hooks and interacts with browser APIs (via Supabase)

import React, { createContext, useState, useEffect, useContext, ReactNode, useMemo, useCallback } from 'react';
// --- Revert back to @supabase/ssr ---
import { createBrowserClient } from '@supabase/ssr'; 
// import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'; 
// We no longer need the shared client here
// import { getSupabaseClient } from 'shared'; 
import type { AuthSession, AuthUser } from 'shared'; // Still use shared types
// Import SupabaseClient and Session types
import type { SupabaseClient, Session } from '@supabase/supabase-js';

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

export const AuthProvider = ({ children }: AuthProviderProps) => {
  // Initialize supabase state to null
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Effect to create the Supabase client only on the client-side after mount
  useEffect(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("AuthProvider Error: Missing Supabase ENV variables.");
      setError("Authentication service configuration missing.");
      setLoading(false);
      return;
    }

    console.log("AuthProvider: Creating Supabase browser client (SSR) on mount...");
    const client = createBrowserClient( 
        supabaseUrl!, // Use non-null assertion if check already happened
        supabaseAnonKey! // Use non-null assertion if check already happened
    );
    setSupabase(client);

  }, []);

  // Effect to fetch initial session and listen for auth changes
  // Runs *after* the supabase client is created
  useEffect(() => {
    // Only run if the supabase client is initialized
    if (!supabase) {
      // If supabase is null after the first effect attempted creation, 
      // it might be due to missing ENV vars. Error/loading state handled there.
      // If it's null initially before the first effect runs, do nothing.
      if (!loading && !error) {
         // Set loading to true only if we start attempting auth logic
         setLoading(true);
      }
      return; 
    }

    let isMounted = true; 
    setLoading(true); // Ensure loading is true while we fetch/subscribe

    const fetchInitialSession = async () => {
      try {
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
         // Handled by the auth state change listener potentially setting loading false
         // or explicitly set false after listener setup if needed.
      }
    };

    fetchInitialSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      // Add explicit types for callback parameters
      (_event: string, session: Session | null) => {
        if (isMounted) {
          console.log(`[AuthContext] onAuthStateChange Event: ${_event}`); // Log event type
          // --- ADD DETAILED SESSION LOGGING ---
          if (session) {
              console.log('[AuthContext] New Session Received:', {
                  userId: session.user?.id,
                  accessTokenSnippet: session.access_token?.substring(0, 30) + '...',
                  refreshTokenSnippet: session.refresh_token?.substring(0, 10) + '...',
                  expiresAt: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
                  hasUser: !!session.user
              });
              // Check for manual cookie setting (shouldn't exist)
              if (typeof document !== 'undefined' && document.cookie.includes('base64-')) {
                  console.warn('[AuthContext] Detected base64- prefix in document.cookie AFTER auth state change!');
              }
          } else {
               console.log('[AuthContext] Session Cleared (null).');
          }
          // --- END LOGGING ---
          setSession(session);
          setUser(session?.user ?? null);
          setError(null); // Clear previous errors on successful auth change
          setLoading(false); // Set loading false after state change is processed
        }
      }
    );

    // Cleanup
    return () => {
      isMounted = false;
      if (subscription) {
        console.log("AuthProvider: Unsubscribing from auth state changes.");
        subscription.unsubscribe();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]); // Depend ONLY on supabase client instance

  // --- Add signOut function --- 
  const signOut = useCallback(async () => {
    if (!supabase) {
      const err = new Error('Supabase client not initialized for sign out.');
      console.error(err.message);
      setError(err.message); // Set error state
      return { error: err };
    }
    console.log("AuthProvider: Calling supabase.auth.signOut...");
    setLoading(true); // Indicate loading during sign out
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      console.error('Error during sign out:', signOutError.message);
      setError(`Sign out failed: ${signOutError.message}`);
    } else {
       setError(null); // Clear error on successful sign out
       // Auth listener will set user/session to null and loading to false
    }
    // setLoading(false); // Let the auth listener handle final loading state
    return { error: signOutError };
  }, [supabase]);
  // --- End signOut function ---

  // Value object passed down through the context - Memoized
  const value = useMemo(() => ({
    supabase, // Provide the client instance via context
    user,
    session,
    loading,
    error,
    signOut, // Include signOut in the context value
  }), [supabase, user, session, loading, error, signOut]);

  // Render children immediately, context value will update when ready
  // Optionally add a global loading indicator here if needed
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}; 