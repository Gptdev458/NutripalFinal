import React, { useState, useCallback } from 'react';
import { ScrollView, StyleSheet, View, Alert } from 'react-native';
import {
  List,
  Divider,
  ActivityIndicator,
  Text,
} from 'react-native-paper';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import useSafeTheme from '../hooks/useSafeTheme';

const SettingsScreen = ({ navigation }) => {
  const theme = useSafeTheme();
  const { user, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = useCallback(async () => {
    setSigningOut(true);
    try {
      const { error } = await signOut();
      if (error) {
        Alert.alert('Sign Out Error', error.message);
      }
    } catch (error) {
      Alert.alert('Sign Out Error', 'An unexpected error occurred.');
      console.error('Sign Out error:', error);
    } finally {
      setSigningOut(false);
    }
  }, [signOut]);

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.header}>
        <Text variant="headlineMedium" style={[styles.title, { color: theme.colors.primary }]}>Settings</Text>
        <Text variant="bodyLarge" style={[styles.subtitle, { color: theme.colors.textSecondary }]}>Manage your account and preferences</Text>
      </View>

      <List.Section style={styles.section}>
        <List.Subheader style={[styles.sectionTitle, { color: theme.colors.primary }]}>Profile & Goals</List.Subheader>
        <List.Item
          title="Edit Your Profile"
          description="Update age, weight, height, etc."
          left={props => <List.Icon {...props} icon="account-edit-outline" color={theme.colors.primary} />}
          onPress={() => navigation.navigate('Profile')}
          style={styles.listItem}
          titleStyle={[styles.listItemTitle, { color: theme.colors.text }]}
          descriptionStyle={{ color: theme.colors.textSecondary }}
        />
        <List.Item
          title="Set Nutrient Goals"
          description="Choose which nutrients to track"
          left={props => <List.Icon {...props} icon="target" color={theme.colors.primary} />}
          onPress={() => navigation.navigate('GoalSettings')}
          style={styles.listItem}
          titleStyle={[styles.listItemTitle, { color: theme.colors.text }]}
          descriptionStyle={{ color: theme.colors.textSecondary }}
        />
        <List.Item
          title="View Log History"
          description="Review past food logs by date"
          left={props => <List.Icon {...props} icon="history" color={theme.colors.primary} />}
          onPress={() => navigation.navigate('History')}
          style={styles.listItem}
          titleStyle={[styles.listItemTitle, { color: theme.colors.text }]}
          descriptionStyle={{ color: theme.colors.textSecondary }}
        />
      </List.Section>

      <Divider style={styles.divider} />

      <List.Section style={styles.section}>
        <List.Subheader style={[styles.sectionTitle, { color: theme.colors.primary }]}>Account</List.Subheader>
        {user && (
          <Text style={[styles.emailText, { color: theme.colors.textSecondary }]}>
            Signed in as: {user.email}
          </Text>
        )}
        <List.Item
          title="Sign Out"
          left={props => <List.Icon {...props} icon="logout" color={theme.colors.error} />}
          onPress={handleSignOut}
          disabled={signingOut}
          style={styles.listItem}
          titleStyle={{ color: theme.colors.error }}
          right={props => signingOut ? <ActivityIndicator {...props} animating={true} color={theme.colors.error} /> : null}
        />
      </List.Section>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    marginBottom: 10,
  },
  title: {
  },
  subtitle: {
    marginTop: 4,
  },
  section: {
    marginTop: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    paddingHorizontal: 16,
  },
  listItem: {
    paddingHorizontal: 16,
  },
  listItemTitle: {
    fontSize: 16,
  },
  emailText: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    fontSize: 14,
  },
  divider: {
    height: 1,
  },
});

export default SettingsScreen; 