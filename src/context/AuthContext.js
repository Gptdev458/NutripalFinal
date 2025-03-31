import React, { createContext, useState, useEffect, useContext } from 'react';
import { Alert } from 'react-native';
import { supabase } from '../lib/supabaseClient';

// Create the auth context
const AuthContext = createContext({
  user: null,
  session: null,
  loading: true,
  error: null,
  signIn: async () => {},
  signUp: async () => {},
  signOut: async () => {},
});

// Custom hook to use the auth context
export const useAuth = () => useContext(AuthContext);

// Provider component that wraps the app and provides auth context
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Fetch the initial session when the component mounts
    const fetchInitialSession = async () => {
      try {
        // Verify Supabase client is initialized properly
        if (!supabase || !supabase.auth) {
          throw new Error('Supabase client is not properly initialized. Check environment variables.');
        }

        const { data } = await supabase.auth.getSession();
        setSession(data.session);
        setUser(data.session?.user || null);
      } catch (error) {
        console.error('Error fetching initial session:', error.message);
        setError(error.message);
        
        // Display error to user
        Alert.alert(
          'Authentication Error',
          'Failed to initialize authentication. Please restart the app or contact support if the issue persists.',
          [{ text: 'OK' }]
        );
      } finally {
        setLoading(false);
      }
    };

    fetchInitialSession();

    try {
      // Subscribe to auth state changes
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        (_event, session) => {
          setSession(session);
          setUser(session?.user || null);
        }
      );

      // Cleanup: unsubscribe on unmount
      return () => {
        subscription.unsubscribe();
      };
    } catch (error) {
      console.error('Error setting up auth subscription:', error.message);
      setError(error.message);
    }
  }, []);

  // Sign in with email and password
  const signIn = async (email, password) => {
    try {
      setLoading(true);
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('Error signing in:', error.message);
      return { data: null, error };
    } finally {
      setLoading(false);
    }
  };

  // Sign up with email and password
  const signUp = async (email, password) => {
    try {
      setLoading(true);
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('Error signing up:', error.message);
      return { data: null, error };
    } finally {
      setLoading(false);
    }
  };

  // Sign out
  const signOut = async () => {
    try {
      // Add debug logs
      console.log('Starting sign out process...');
      console.log('Supabase client status:', !!supabase?.auth);
      
      // Check if supabase is properly initialized
      if (!supabase?.auth) {
        throw new Error('Supabase client is not properly initialized');
      }

      const { error } = await supabase.auth.signOut();
      console.log('Sign out response:', { error });

      if (error) {
        throw error;
      }

      // Clear session and user state
      setSession(null);
      setUser(null);
      return { error: null };

    } catch (error) {
      console.error('Detailed sign out error:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      return { error };
    }
  };

  // Value object that will be passed to consumers of this context
  const value = {
    user,
    session,
    loading,
    error,
    signIn,
    signUp,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthContext; 