import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import {
  TextInput as PaperTextInput,
  Button as PaperButton,
  Text as PaperText,
  Text,
  HelperText,
  ActivityIndicator,
  Surface,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import useSafeTheme from '../hooks/useSafeTheme';

const LoginScreen = ({ navigation }) => {
  const theme = useSafeTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const { signIn } = useAuth();

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Email and password are required');
      return;
    }

    try {
      setError('');
      setLoading(true);
      
      const { error: signInError } = await signIn(email, password);
      
      if (signInError) {
        throw signInError;
      }
    } catch (err) {
      setError(err.message || 'An unexpected error occurred.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const navigateToSignUp = () => {
    navigation.navigate('SignUp');
  };

  const titleStyle = [styles.title, { color: theme.colors.primary }];
  const subtitleStyle = [styles.subtitle, { color: theme.colors.textSecondary }];
  const signupPromptStyle = [styles.signupPrompt, { color: theme.colors.textSecondary }];
  const signupLinkStyle = [styles.signupLink, { color: theme.colors.primary }];
  const safeAreaStyle = [styles.safeArea, { backgroundColor: theme.colors.background }];
  const contentStyle = [styles.content, { backgroundColor: theme.colors.surface }];

  return (
    <SafeAreaView style={safeAreaStyle}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.container}
      >
        <Surface style={contentStyle}>
          <Text variant="headlineMedium" style={titleStyle}>NutriPal</Text>
          <Text variant="titleMedium" style={subtitleStyle}>Your AI Nutrition Assistant</Text>
          
          <HelperText type="error" visible={!!error} style={styles.errorText}>
            {error}
          </HelperText>
          
          <PaperTextInput
            label="Email"
            value={email}
            onChangeText={setEmail}
            mode="outlined"
            style={styles.input}
            autoCapitalize="none"
            keyboardType="email-address"
            editable={!loading}
            left={<PaperTextInput.Icon icon="email" />}
          />
          
          <PaperTextInput
            label="Password"
            value={password}
            onChangeText={setPassword}
            mode="outlined"
            style={styles.input}
            secureTextEntry
            editable={!loading}
            left={<PaperTextInput.Icon icon="lock" />}
          />
          
          {loading ? (
            <ActivityIndicator animating={true} color={theme.colors.primary} size="large" style={styles.loader} />
          ) : (
            <PaperButton
              mode="contained"
              onPress={handleLogin}
              disabled={loading}
              style={styles.button}
              labelStyle={styles.buttonLabel}
            >
              Login
            </PaperButton>
          )}
          
          <View style={styles.signupContainer}>
            <PaperText style={signupPromptStyle}>Don't have an account? </PaperText>
            <TouchableOpacity onPress={navigateToSignUp} disabled={loading}>
              <PaperText style={signupLinkStyle}>Sign Up</PaperText>
            </TouchableOpacity>
          </View>
        </Surface>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
  },
  content: {
    padding: 30,
    marginHorizontal: 20,
    borderRadius: 12,
    elevation: 4,
  },
  title: {
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: 25,
  },
  errorText: {
    marginBottom: 10,
    textAlign: 'center',
    fontSize: 14,
  },
  input: {
    marginBottom: 15,
  },
  button: {
    marginTop: 10,
    paddingVertical: 8,
  },
  buttonLabel: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  loader: {
    marginTop: 20,
    marginBottom: 20,
  },
  signupContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 25,
  },
  signupPrompt: {
    fontSize: 15,
  },
  signupLink: {
    fontWeight: 'bold',
    fontSize: 15,
  },
});

export default LoginScreen; 