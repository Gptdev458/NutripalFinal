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

const SignUpScreen = ({ navigation }) => {
  const theme = useSafeTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const { signUp } = useAuth();

  const handleSignUp = async () => {
    setLoading(true);
    setError(null);
    setSuccess(false);
    try {
      const { error: signUpError } = await signUp(email, password);
      if (signUpError) {
        setError(signUpError.message);
      } else {
        setSuccess(true);
      }
    } catch (err) {
      setError(err.message || 'An unexpected error occurred.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const navigateToLogin = () => {
    navigation.navigate('Login');
  };

  const safeAreaStyle = [styles.safeArea, { backgroundColor: theme.colors.background }];
  const contentStyle = [styles.content, { backgroundColor: theme.colors.surface }];
  const titleStyle = [styles.title, { color: theme.colors.primary }];
  const subtitleStyle = [styles.subtitle, { color: theme.colors.textSecondary }];
  const loginPromptStyle = [styles.loginPrompt, { color: theme.colors.textSecondary }];
  const loginLinkStyle = [styles.loginLink, { color: theme.colors.primary }];
  const successTextStyle = [styles.successText, { color: theme.colors.success }];

  return (
    <SafeAreaView style={safeAreaStyle}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.container}
      >
        <Surface style={contentStyle}>
          <Text variant="headlineMedium" style={titleStyle}>Create Account</Text>
          <Text variant="titleMedium" style={subtitleStyle}>Join NutriPal</Text>

          <HelperText type="error" visible={!!error} style={styles.errorText}>
            {error}
          </HelperText>

          {success ? (
            <View style={styles.successContainer}>
              <PaperText style={successTextStyle}>
                Sign up successful! Please check your email for confirmation instructions.
              </PaperText>
              <PaperButton
                mode="outlined"
                onPress={navigateToLogin}
                style={styles.button}
              >
                Back to Login
              </PaperButton>
            </View>
          ) : (
            <>
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
                  onPress={handleSignUp}
                  disabled={loading}
                  style={styles.button}
                  labelStyle={styles.buttonLabel}
                >
                  Sign Up
                </PaperButton>
              )}

              <View style={styles.loginContainer}>
                <PaperText style={loginPromptStyle}>Already have an account? </PaperText>
                <TouchableOpacity onPress={navigateToLogin} disabled={loading}>
                  <PaperText style={loginLinkStyle}>Login</PaperText>
                </TouchableOpacity>
              </View>
            </>
          )}
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
  loginContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 25,
  },
  loginPrompt: {
    fontSize: 15,
  },
  loginLink: {
    fontWeight: 'bold',
    fontSize: 15,
  },
  successContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  successText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
});

export default SignUpScreen; 