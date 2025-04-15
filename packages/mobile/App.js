import React, { useContext, useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, ActivityIndicator, Text } from 'react-native';
import Constants from 'expo-constants';
import AuthContext, { AuthProvider, useAuth } from './src/context/AuthContext';
import { PaperProvider } from 'react-native-paper';
import theme from './src/theme/index.js';
import { initializeSupabase, verifySupabaseConnection } from 'shared';
import AsyncStorage from '@react-native-async-storage/async-storage';

// --- Simple Error Boundary Component ---
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error: error };
  }

  componentDidCatch(error, errorInfo) {
    // You can also log the error to an error reporting service
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      // You can render any custom fallback UI
      return (
        <View style={styles.container}>
          <Text style={{ color: 'red', marginBottom: 10 }}>Something went wrong.</Text>
          <Text style={{ color: 'red', marginHorizontal: 20 }}>
            {this.state.error ? this.state.error.toString() : 'Unknown error'}
          </Text>
        </View>
      );
    }

    return this.props.children;
  }
}
// --- End Error Boundary ---

// Get Supabase config - ONLY from Constants now
const SUPABASE_URL = Constants.expoConfig?.extra?.supabaseUrl;
const SUPABASE_ANON_KEY = Constants.expoConfig?.extra?.supabaseAnonKey;

console.log('App.js - Final Config Check (Constants Only):');
console.log('SUPABASE_URL from Constants:', Boolean(SUPABASE_URL));
console.log('SUPABASE_ANON_KEY from Constants:', Boolean(SUPABASE_ANON_KEY));

// Initialize Supabase client immediately
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  initializeSupabase(SUPABASE_URL, SUPABASE_ANON_KEY, AsyncStorage);
  console.log('App.js - Supabase initialized with provided keys from Constants using SHARED client.');
} else {
  console.error('App.js - CRITICAL: Supabase URL or Anon Key is missing from Constants! Cannot initialize Supabase.');
  // Potentially throw error or display specific UI if critical
}

// Import the actual navigators
import AuthNavigator from './src/navigation/AuthNavigator';
import AppNavigator from './src/navigation/AppNavigator';

// Main app component that decides which navigator to show
const AppContent = () => {
  const { user, loading } = useAuth();

  useEffect(() => {
    const checkSupabase = async () => {
      const isConnected = await verifySupabaseConnection();
      if (!isConnected) {
        console.error('Failed to establish Supabase connection (called from AppContent)');
        // Optionally show an alert to the user
      }
    };

    // Check connection only if Supabase was initialized
    if (SUPABASE_URL && SUPABASE_ANON_KEY) {
        checkSupabase();
    }
  }, []);

  // Show loading indicator while checking authentication
  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#0000ff" />
      </View>
    );
  }

  // Return the appropriate navigator based on authentication status
  return (
    <NavigationContainer>
      {user ? <AppNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <PaperProvider theme={theme}>
          <AppContent />
        </PaperProvider>
        <StatusBar style="auto" />
      </AuthProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
