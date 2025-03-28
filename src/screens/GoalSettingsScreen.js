import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  Switch,
  TextInput,
  Button,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { MASTER_NUTRIENT_LIST, getNutrientDetails } from '../constants/nutrients';

const GoalSettingsScreen = ({ navigation }) => {
  // State variables
  const [goals, setGoals] = useState([]);
  const [trackedNutrients, setTrackedNutrients] = useState({});
  const [targetValues, setTargetValues] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  
  const { user } = useAuth();

  // Fetch existing goals on component mount
  useEffect(() => {
    fetchGoals();
  }, []);

  // Fetch user's goals from Supabase
  const fetchGoals = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!user) return;

      const { data, error } = await supabase
        .from('user_goals')
        .select('*')
        .eq('user_id', user.id);

      if (error) throw error;

      // Initialize state from fetched goals
      const tracked = {};
      const targets = {};

      if (data && data.length > 0) {
        data.forEach(goal => {
          tracked[goal.nutrient_key] = true;
          targets[goal.nutrient_key] = goal.target_value.toString();
        });
        setGoals(data);
      }

      setTrackedNutrients(tracked);
      setTargetValues(targets);
    } catch (err) {
      setError('Error fetching goals: ' + err.message);
      console.error('Error fetching goals:', err);
    } finally {
      setLoading(false);
    }
  };

  // Toggle nutrient tracking
  const toggleNutrient = (key) => {
    setTrackedNutrients(prev => ({
      ...prev,
      [key]: !prev[key]
    }));

    // Initialize target value if not already set
    if (!targetValues[key] && !trackedNutrients[key]) {
      setTargetValues(prev => ({
        ...prev,
        [key]: ''
      }));
    }
  };

  // Update target value
  const updateTargetValue = (key, value) => {
    // Only allow numeric values
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setTargetValues(prev => ({
        ...prev,
        [key]: value
      }));
    }
  };

  // Save goals to Supabase using delete-then-insert approach
  const handleSaveGoals = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!user) {
        throw new Error('User not authenticated');
      }

      const userId = user.id;

      // 1. Delete all existing goals for this user
      const { error: deleteError } = await supabase
        .from('user_goals')
        .delete()
        .match({ user_id: userId });

      if (deleteError) throw deleteError;

      // 2. Filter MASTER_NUTRIENT_LIST to get only tracked nutrients
      const trackedNutrientsList = MASTER_NUTRIENT_LIST.filter(
        nutrient => trackedNutrients[nutrient.key]
      );

      // 3. Map to array of new goal objects
      const newGoalsArray = trackedNutrientsList.map(nutrient => ({
        user_id: userId,
        nutrient: nutrient.key,
        target_value: parseFloat(targetValues[nutrient.key] || '0'),
        unit: nutrient.unit,
        created_at: new Date().toISOString()
      }));

      // 4. Insert new goals if there are any
      if (newGoalsArray.length > 0) {
        const { error: insertError } = await supabase
          .from('user_goals')
          .insert(newGoalsArray);

        if (insertError) throw insertError;
      }

      Alert.alert('Success', 'Your nutrient goals have been saved successfully.');
      
      // Refresh goals
      fetchGoals();
    } catch (err) {
      setError('Error saving goals: ' + err.message);
      Alert.alert('Error', err.message);
      console.error('Error saving goals:', err);
    } finally {
      setLoading(false);
    }
  };

  // Render loading state
  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>Loading your goals...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={100}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Nutrient Goal Settings</Text>
        <Text style={styles.subtitle}>
          Select the nutrients you want to track and set your daily target goals.
        </Text>
      </View>

      {error && <Text style={styles.errorText}>{error}</Text>}
      
      <FlatList
        data={MASTER_NUTRIENT_LIST}
        keyExtractor={(item) => item.key}
        renderItem={({ item }) => (
          <View style={styles.nutrientRow}>
            <View style={styles.nutrientInfo}>
              <Switch
                value={!!trackedNutrients[item.key]}
                onValueChange={() => toggleNutrient(item.key)}
                trackColor={{ false: "#767577", true: "#4CAF50" }}
              />
              <Text style={styles.nutrientName}>
                {item.name} ({item.unit})
              </Text>
            </View>
            
            {trackedNutrients[item.key] && (
              <TextInput
                style={styles.input}
                value={targetValues[item.key] || ''}
                onChangeText={(text) => updateTargetValue(item.key, text)}
                placeholder={`Target ${item.unit}`}
                keyboardType="numeric"
              />
            )}
          </View>
        )}
        ListFooterComponent={
          <View style={styles.buttonContainer}>
            <Button
              title={saving ? "Saving..." : "Save Goals"}
              onPress={handleSaveGoals}
              disabled={saving || loading}
              color="#4CAF50"
            />
          </View>
        }
      />
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 16,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 16,
  },
  nutrientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  nutrientInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  nutrientName: {
    marginLeft: 10,
    fontSize: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 4,
    padding: 8,
    width: 100,
    textAlign: 'center',
  },
  errorText: {
    color: 'red',
    marginBottom: 10,
  },
  buttonContainer: {
    marginVertical: 20,
  },
});

export default GoalSettingsScreen; 