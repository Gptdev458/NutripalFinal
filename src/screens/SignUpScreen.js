import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Button,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useAuth } from '../context/AuthContext';

const SignUpScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  
  const { signUp } = useAuth();

  const handleSignUp = async () => {
    if (!email || !password) {
      setError('Email and password are required');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    try {
      setError('');
      setSuccess(false);
      setLoading(true);
      
      const { data, error: signUpError } = await signUp(email, password);
      
      if (signUpError) {
        throw signUpError;
      }
      
      setSuccess(true);
    } catch (err) {
      setError(err.message || 'Failed to sign up');
    } finally {
      setLoading(false);
    }
  };

  const navigateToLogin = () => {
    navigation.navigate('Login');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create Account</Text>
      <Text style={styles.subtitle}>Join NutriPal and start tracking your nutrition</Text>
      
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      
      {success ? (
        <View style={styles.successContainer}>
          <Text style={styles.successText}>
            Sign up successful! Please check your email for confirmation instructions.
          </Text>
          <Button title="Back to Login" onPress={navigateToLogin} />
        </View>
      ) : (
        <>
          <TextInput
            style={styles.input}
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            editable={!loading}
          />
          
          <TextInput
            style={styles.input}
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            editable={!loading}
          />
          
          {loading ? (
            <ActivityIndicator size="large" color="#0000ff" style={styles.loader} />
          ) : (
            <Button title="Sign Up" onPress={handleSignUp} disabled={loading} />
          )}
          
          <View style={styles.loginContainer}>
            <Text>Already have an account? </Text>
            <TouchableOpacity onPress={navigateToLogin}>
              <Text style={styles.loginText}>Login</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    color: '#666',
    textAlign: 'center',
    marginBottom: 30,
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    marginBottom: 15,
    paddingHorizontal: 10,
  },
  errorText: {
    color: 'red',
    marginBottom: 15,
    textAlign: 'center',
  },
  successContainer: {
    padding: 20,
    backgroundColor: '#e6f7e6',
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20,
  },
  successText: {
    color: '#2e7d32',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  loader: {
    marginVertical: 20,
  },
  loginContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 20,
  },
  loginText: {
    color: '#0066cc',
    fontWeight: 'bold',
  },
});

export default SignUpScreen; 