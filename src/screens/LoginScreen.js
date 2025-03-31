import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
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

const LoginScreen = ({ navigation }) => {
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.container}
      >
        <Surface style={styles.content}>
          <Title style={styles.title}>NutriPal</Title>
          <Subheading style={styles.subtitle}>Your AI Nutrition Assistant</Subheading>
          
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
            <ActivityIndicator animating={true} color={Colors.accent} size="large" style={styles.loader} />
          ) : (
            <PaperButton
              mode="contained"
              onPress={handleLogin}
              disabled={loading}
              style={styles.button}
              labelStyle={styles.buttonLabel}
              color={Colors.accent}
            >
              Login
            </PaperButton>
          )}
          
          <View style={styles.signupContainer}>
            <PaperText style={styles.signupPrompt}>Don't have an account? </PaperText>
            <TouchableOpacity onPress={navigateToSignUp} disabled={loading}>
              <PaperText style={styles.signupLink}>Sign Up</PaperText>
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
  signupContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 25,
  },
  signupPrompt: {
    color: Colors.grey,
    fontSize: 15,
  },
  signupLink: {
    color: Colors.accent,
    fontWeight: 'bold',
    fontSize: 15,
  },
});

export default LoginScreen; 