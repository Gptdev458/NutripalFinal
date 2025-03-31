import React, { useState, useCallback } from 'react';
import { ScrollView, StyleSheet, View, Alert } from 'react-native';
import {
  List,
  Divider,
  Title,
  Subheading,
  ActivityIndicator,
  Text,
  Caption,
} from 'react-native-paper';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { Colors } from '../constants/colors';

const SettingsScreen = ({ navigation }) => {
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
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Title style={styles.title}>Settings</Title>
        <Caption style={styles.subtitle}>Manage your account and preferences</Caption>
      </View>

      <List.Section style={styles.section}>
        <List.Subheader style={styles.sectionTitle}>Nutrition & History</List.Subheader>
        <List.Item
          title="Set Nutrient Goals"
          description="Choose which nutrients to track"
          left={props => <List.Icon {...props} icon="target" color={Colors.accent} />}
          onPress={() => navigation.navigate('GoalSettings')}
          style={styles.listItem}
          titleStyle={styles.listItemTitle}
        />
        <List.Item
          title="View Log History"
          description="Review past food logs by date"
          left={props => <List.Icon {...props} icon="history" color={Colors.accent} />}
          onPress={() => navigation.navigate('History')}
          style={styles.listItem}
          titleStyle={styles.listItemTitle}
        />
      </List.Section>

      <Divider style={styles.divider} />

      <List.Section style={styles.section}>
        <List.Subheader style={styles.sectionTitle}>Account</List.Subheader>
        {user && (
          <Text style={styles.emailText}>
            Signed in as: {user.email}
          </Text>
        )}
        <List.Item
          title="Sign Out"
          left={props => <List.Icon {...props} icon="logout" color={Colors.error} />}
          onPress={handleSignOut}
          disabled={signingOut}
          style={styles.listItem}
          titleStyle={{ color: Colors.error }}
          right={props => signingOut ? <ActivityIndicator {...props} animating={true} color={Colors.error} /> : null}
        />
      </List.Section>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.lightGrey,
    marginBottom: 10,
  },
  title: {
    fontSize: 28,
    color: Colors.primary,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.grey,
    marginTop: 4,
  },
  section: {
    marginTop: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.primary,
    paddingHorizontal: 16,
  },
  listItem: {
    backgroundColor: Colors.background,
    paddingHorizontal: 16,
  },
  listItemTitle: {
    color: Colors.primary,
    fontSize: 16,
  },
  emailText: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    fontSize: 14,
    color: Colors.grey,
  },
  divider: {
    backgroundColor: Colors.lightGrey,
    height: 1,
  },
});

export default SettingsScreen; 