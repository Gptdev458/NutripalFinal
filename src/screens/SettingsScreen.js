import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Button,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';

const SettingsScreen = () => {
  const navigation = useNavigation();
  const { signOut, user } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    Alert.alert(
      "Sign Out",
      "Are you sure you want to sign out?",
      [
        {
          text: "Cancel",
          style: "cancel"
        },
        { 
          text: "Sign Out", 
          onPress: async () => {
            try {
              setSigningOut(true);
              await signOut();
            } catch (error) {
              Alert.alert("Error", "Failed to sign out. Please try again.");
              console.error("Sign out error:", error);
              setSigningOut(false);
            }
          },
          style: "destructive"
        }
      ]
    );
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.subtitle}>Manage your account and preferences</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Nutrition</Text>
        <TouchableOpacity 
          style={styles.menuItem}
          onPress={() => navigation.navigate('GoalSettings')}
        >
          <Text style={styles.menuItemText}>Set Nutrient Goals</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        {user && (
          <Text style={styles.emailText}>
            Signed in as: {user.email}
          </Text>
        )}
        
        {signingOut ? (
          <View style={[styles.menuItem, styles.signOutButton]}>
            <ActivityIndicator size="small" color="#FFFFFF" />
          </View>
        ) : (
          <TouchableOpacity 
            style={[styles.menuItem, styles.signOutButton]}
            onPress={handleSignOut}
          >
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 16,
  },
  header: {
    marginBottom: 24,
    paddingVertical: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
  },
  section: {
    marginBottom: 24,
    borderRadius: 12,
    backgroundColor: '#f9f9f9',
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#333',
  },
  menuItem: {
    backgroundColor: '#fff',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#eee',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  menuItemText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  emailText: {
    fontSize: 15,
    color: '#666',
    marginBottom: 16,
  },
  signOutButton: {
    borderColor: '#ffdddd',
    backgroundColor: '#fff8f8',
  },
  signOutText: {
    color: '#d9534f',
    fontSize: 16,
    fontWeight: '500',
  }
});

export default SettingsScreen; 