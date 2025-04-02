import React, { useContext, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, ActivityIndicator, Text } from 'react-native';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@env';
import AuthContext, { AuthProvider, useAuth } from './src/context/AuthContext';
import { testEnvVars } from './src/lib/envTest';
import { PaperProvider } from 'react-native-paper';
import theme from './src/theme/index.js';
import { verifySupabaseConnection } from './src/lib/supabaseClient';

// Direct check for environment variables
console.log('App.js - Direct environment check:');
console.log('SUPABASE_URL available:', Boolean(SUPABASE_URL));
console.log('SUPABASE_ANON_KEY available:', Boolean(SUPABASE_ANON_KEY));

// Import the actual navigators
import AuthNavigator from './src/navigation/AuthNavigator';
import AppNavigator from './src/navigation/AppNavigator';

// Main app component that decides which navigator to show
const AppContent = () => {
  const { user, loading } = useAuth();

  useEffect(() => {
    // Test environment variables
    const envVars = testEnvVars();
    console.log('App.js - Environment variables test result:', envVars);
  }, []);

  useEffect(() => {
    const checkSupabase = async () => {
      const isConnected = await verifySupabaseConnection();
      if (!isConnected) {
        console.error('Failed to establish Supabase connection');
        // Optionally show an alert to the user
      }
    };
    
    checkSupabase();
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
    <AuthProvider>
      <PaperProvider theme={theme}>
        <AppContent />
      </PaperProvider>
      <StatusBar style="auto" />
    </AuthProvider>
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
