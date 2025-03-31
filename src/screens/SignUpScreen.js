import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
// Import Paper components and SafeAreaView
import {
  TextInput as PaperTextInput,
  Button as PaperButton,
  Text as PaperText,
  Title,
  Subheading,
  HelperText,
  ActivityIndicator,
  Surface,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { Colors } from '../constants/colors';

const SignUpScreen = ({ navigation }) => {
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.container}
      >
        <Surface style={styles.content}>
          <Title style={styles.title}>Create Account</Title>
          <Subheading style={styles.subtitle}>Join NutriPal</Subheading>

          <HelperText type="error" visible={!!error} style={styles.errorText}>
            {error}
          </HelperText>

          {success ? (
            <View style={styles.successContainer}>
              <PaperText style={styles.successText}>
                Sign up successful! Please check your email for confirmation instructions.
              </PaperText>
              <PaperButton
                mode="outlined"
                onPress={navigateToLogin}
                style={styles.button}
                color={Colors.accent}
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
                <ActivityIndicator animating={true} color={Colors.accent} size="large" style={styles.loader} />
              ) : (
                <PaperButton
                  mode="contained"
                  onPress={handleSignUp}
                  disabled={loading}
                  style={styles.button}
                  labelStyle={styles.buttonLabel}
                  color={Colors.accent}
                >
                  Sign Up
                </PaperButton>
              )}

              <View style={styles.loginContainer}>
                <PaperText style={styles.loginPrompt}>Already have an account? </PaperText>
                <TouchableOpacity onPress={navigateToLogin} disabled={loading}>
                  <PaperText style={styles.loginLink}>Login</PaperText>
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
    backgroundColor: Colors.background,
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
    backgroundColor: Colors.background,
  },
  title: {
    textAlign: 'center',
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 8,
    color: Colors.primary,
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: 25,
    color: Colors.grey,
  },
  errorText: {
    marginBottom: 10,
    textAlign: 'center',
    fontSize: 14,
    color: Colors.error,
  },
  input: {
    marginBottom: 15,
    backgroundColor: Colors.background,
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
    color: Colors.grey,
    fontSize: 15,
  },
  loginLink: {
    color: Colors.accent,
    fontWeight: 'bold',
    fontSize: 15,
  },
  successContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  successText: {
    color: Colors.success,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
});

export default SignUpScreen; 