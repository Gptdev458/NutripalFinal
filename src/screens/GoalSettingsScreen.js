import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  Alert,
} from 'react-native';
import {
  Switch as PaperSwitch,
  TextInput as PaperTextInput,
  Button as PaperButton,
  ActivityIndicator,
  Text as PaperText,
  Title,
  HelperText,
  Subheading,
  Surface,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { MASTER_NUTRIENT_LIST, getNutrientDetails } from '../constants/nutrients';
import { Colors } from '../constants/colors';

const GoalSettingsScreen = ({ navigation }) => {
  const [trackedNutrients, setTrackedNutrients] = useState({});
  const [targetValues, setTargetValues] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const { user } = useAuth();

  const fetchGoals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!user) throw new Error("User not authenticated");

      const { data, error: fetchError } = await supabase
        .from('user_goals')
        .select('nutrient, target_value')
        .eq('user_id', user.id);

      if (fetchError) throw fetchError;

      const tracked = {};
      const targets = {};
      if (data) {
        data.forEach(goal => {
          tracked[goal.nutrient] = true;
          targets[goal.nutrient] = goal.target_value?.toString() || '';
        });
      }
      setTrackedNutrients(tracked);
      setTargetValues(targets);
    } catch (err) {
      setError('Error fetching goals: ' + err.message);
      console.error('Error fetching goals:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  const toggleNutrient = (nutrientKey) => {
    setTrackedNutrients(prev => ({
      ...prev,
      [nutrientKey]: !prev[nutrientKey],
    }));
    if (trackedNutrients[nutrientKey]) {
      setTargetValues(prev => {
        const newTargets = { ...prev };
        delete newTargets[nutrientKey];
        return newTargets;
      });
    }
  };

  const updateTargetValue = (nutrientKey, value) => {
    if (/^\d*\.?\d*$/.test(value)) {
      setTargetValues(prev => ({
        ...prev,
        [nutrientKey]: value,
      }));
    }
  };

  const handleSaveGoals = async () => {
    if (!user) return;
    setSaving(true);
    setError(null);

    const goalsToUpsert = MASTER_NUTRIENT_LIST.filter(
      item => trackedNutrients[item.key]
    ).map(item => {
      const targetValue = parseFloat(targetValues[item.key]);
      if (isNaN(targetValue) || targetValue <= 0) {
        throw new Error(`Invalid target value for ${item.name}. Please enter a positive number.`);
      }
      return {
        user_id: user.id,
        nutrient: item.key,
        target_value: targetValue,
        unit: item.unit,
      };
    });

    const nutrientsToDelete = MASTER_NUTRIENT_LIST.filter(
        item => !trackedNutrients[item.key]
    ).map(item => item.key);

    try {
       if (nutrientsToDelete.length > 0) {
         const { error: deleteError } = await supabase
           .from('user_goals')
           .delete()
           .eq('user_id', user.id)
           .in('nutrient', nutrientsToDelete);

         if (deleteError) throw deleteError;
       }

       if (goalsToUpsert.length > 0) {
           const { error: upsertError } = await supabase
             .from('user_goals')
             .upsert(goalsToUpsert, { onConflict: 'user_id, nutrient' });

           if (upsertError) throw upsertError;
       }

      Alert.alert('Success', 'Nutrient goals saved successfully!');
      navigation.goBack();

    } catch (err) {
      setError('Error saving goals: ' + err.message);
      console.error('Error saving goals:', err);
      Alert.alert('Error', 'Failed to save goals: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator animating={true} color={Colors.accent} size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.container}
      >
          <FlatList
              data={MASTER_NUTRIENT_LIST}
              keyExtractor={(item) => item.key}
              renderItem={({ item }) => (
                  <Surface style={styles.nutrientRowSurface} elevation={1}>
                    <View style={styles.nutrientInfo}>
                      <PaperSwitch
                        value={!!trackedNutrients[item.key]}
                        onValueChange={() => toggleNutrient(item.key)}
                        color={Colors.accent}
                      />
                      <PaperText style={styles.nutrientName}>
                        {item.name} ({item.unit})
                      </PaperText>
                    </View>

                    {trackedNutrients[item.key] && (
                      <PaperTextInput
                        style={styles.input}
                        value={targetValues[item.key] || ''}
                        onChangeText={(text) => updateTargetValue(item.key, text)}
                        placeholder={`Target (${item.unit})`}
                        keyboardType="numeric"
                        mode="outlined"
                        dense
                      />
                    )}
                  </Surface>
              )}
              ListHeaderComponent={
                  <View style={styles.listHeader}>
                     <Subheading style={styles.listHeaderTitle}>Select Nutrients to Track</Subheading>
                      {error && <HelperText type="error" visible={!!error}>{error}</HelperText>}
                  </View>
              }
              ListFooterComponent={
                  <View style={styles.footer}>
                    <PaperButton
                      mode="contained"
                      onPress={handleSaveGoals}
                      disabled={saving || loading}
                      loading={saving}
                      style={styles.saveButton}
                      labelStyle={styles.saveButtonLabel}
                      color={Colors.accent}
                    >
                      {saving ? "Saving..." : "Save Goals"}
                    </PaperButton>
                  </View>
              }
              contentContainerStyle={styles.listContentContainer}
          />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.lightGrey,
  },
  container: {
      flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  listContentContainer: {
      paddingBottom: 20,
  },
  listHeader: {
      padding: 16,
      backgroundColor: Colors.background,
      borderBottomWidth: 1,
      borderBottomColor: Colors.lightGrey,
  },
  listHeaderTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: Colors.primary,
  },
  nutrientRowSurface: {
      padding: 16,
      marginHorizontal: 8,
      marginVertical: 4,
      borderRadius: 8,
      backgroundColor: Colors.background,
  },
  nutrientInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  nutrientName: {
    marginLeft: 12,
    fontSize: 16,
    flexShrink: 1,
    color: Colors.primary,
  },
  input: {
    backgroundColor: Colors.background,
    marginTop: 8,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.lightGrey,
    backgroundColor: Colors.background,
  },
  saveButton: {
     paddingVertical: 8,
  },
  saveButtonLabel: {
      fontSize: 16,
      fontWeight: 'bold',
  }
});

export default GoalSettingsScreen; 