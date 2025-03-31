import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  Alert,
  TouchableOpacity,
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
  Banner,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { MASTER_NUTRIENT_LIST, getNutrientDetails } from '../constants/nutrients';
import { Colors } from '../constants/colors';
import { fetchUserProfile, fetchGoalRecommendations } from '../utils/profileUtils';

const GoalSettingsScreen = ({ navigation }) => {
  const [trackedNutrients, setTrackedNutrients] = useState({});
  const [targetValues, setTargetValues] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const { user } = useAuth();

  const [userProfile, setUserProfile] = useState(null);
  const [goalRecommendations, setGoalRecommendations] = useState(null);
  const [isLoadingRecommendations, setIsLoadingRecommendations] = useState(false);
  const [recommendationError, setRecommendationError] = useState(null);

  const [isCalculatingRecs, setIsCalculatingRecs] = useState(false);
  const [calcError, setCalcError] = useState(null);

  const loadInitialData = useCallback(async () => {
    if (!user) {
      setError("User not authenticated");
      setLoading(false);
      setIsLoadingRecommendations(false);
      return;
    }

    setLoading(true);
    setIsLoadingRecommendations(true);
    setError(null);
    setRecommendationError(null);
    setCalcError(null);

    try {
      const [goalsResponse, profileResponse] = await Promise.all([
        supabase
          .from('user_goals')
          .select('nutrient, target_value')
          .eq('user_id', user.id),
        fetchUserProfile(user.id)
      ]);

      if (goalsResponse.error) throw new Error(`Failed to fetch goals: ${goalsResponse.error.message}`);
      const tracked = {};
      const targets = {};
      if (goalsResponse.data) {
        goalsResponse.data.forEach(goal => {
          tracked[goal.nutrient] = true;
          targets[goal.nutrient] = goal.target_value?.toString() || '';
        });
      }
      setTrackedNutrients(tracked);
      setTargetValues(targets);
      setLoading(false);

      if (profileResponse.error) {
        console.error('Profile fetch error during initial load:', profileResponse.error);
        setUserProfile(null);
        setIsLoadingRecommendations(false);
        return;
      }

      const fetchedProfile = profileResponse.data;
      setUserProfile(fetchedProfile);

      if (fetchedProfile && fetchedProfile.age && fetchedProfile.weight_kg && fetchedProfile.height_cm && fetchedProfile.sex) {
         console.log("Profile complete, fetching initial recommendations...");
        const { data: recData, error: recError } = await fetchGoalRecommendations(fetchedProfile);

        if (recError) {
          console.error('Initial Recommendation fetch error:', recError);
          setRecommendationError(`Could not fetch initial recommendations: ${recError.message}`);
          setGoalRecommendations(null);
        } else if (recData && recData.recommendations) {
          console.log("Initial Recommendations received:", recData.recommendations);
          setGoalRecommendations(recData.recommendations);
          setRecommendationError(null);
        } else {
           console.warn('Received invalid initial recommendation data.');
           setRecommendationError('Received invalid initial recommendation data.');
           setGoalRecommendations(null);
        }
      } else {
        console.log("Profile incomplete or not found during initial load:", fetchedProfile);
        setRecommendationError('Please complete your profile in Settings to get personalized recommendations.');
        setGoalRecommendations(null);
      }

    } catch (err) {
      console.error('Error loading initial data:', err);
      setError(`Failed to load data: ${err.message}`);
      setLoading(false);
    } finally {
      setIsLoadingRecommendations(false);
    }
  }, [user]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

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
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setTargetValues(prev => ({
        ...prev,
        [nutrientKey]: value,
      }));
    }
  };

  const handleSaveGoals = async () => {
    if (!user) {
      Alert.alert("Error", "User not authenticated.");
      return;
    }

    setSaving(true);
    setError(null);

    const goalsToSave = Object.keys(trackedNutrients)
      .filter(key => trackedNutrients[key])
      .map(key => {
        const nutrientDetail = getNutrientDetails(key);
        const targetValue = parseFloat(targetValues[key]);

        if (isNaN(targetValue) || targetValue < 0) {
             console.warn(`Invalid target value for ${key}: ${targetValues[key]}. Skipping.`);
             setError(`Invalid target value provided for ${nutrientDetail?.name || key}. Please enter a number.`);
             return null;
         }

        return {
          user_id: user.id,
          nutrient: key,
          target_value: targetValue,
          unit: nutrientDetail ? nutrientDetail.unit : null,
        };
      })
       .filter(goal => goal !== null);

     if (error) {
         setSaving(false);
         Alert.alert("Validation Error", error);
         return;
     }

    if (goalsToSave.length === 0) {
       console.log("No tracked goals to save.");
       Alert.alert("No Goals", "No nutrients are currently selected for tracking.");
       setSaving(false);
       return;
     }

    try {
      const { data, error: upsertError } = await supabase
        .from('user_goals')
        .upsert(goalsToSave, {
          onConflict: 'user_id, nutrient',
        })
        .select();

      if (upsertError) {
        console.error("Supabase upsert error:", upsertError);
        throw upsertError;
      }

      console.log('Goals saved successfully:', data);
      Alert.alert("Success", "Your nutrient goals have been saved.");
      setError(null);
    } catch (err) {
      console.error('Error saving goals:', err);
      setError(`Failed to save goals: ${err.message}`);
      Alert.alert("Error", `Failed to save goals: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleCalculateRecommendations = async () => {
    if (!user) {
      Alert.alert("Error", "You must be logged in to calculate recommendations.");
      return;
    }

    console.log("Calculate button pressed");
    setIsCalculatingRecs(true);
    setCalcError(null);
    setRecommendationError(null);

    try {
      const { data: profileData, error: profileError } = await fetchUserProfile(user.id);

      if (profileError) {
        throw new Error(profileError.message || 'Could not load your profile to get recommendations.');
      }

      if (!profileData || !profileData.age || !profileData.weight_kg || !profileData.height_cm || !profileData.sex) {
        setCalcError('Your profile is incomplete. Please update Age, Weight, Height, and Sex in Settings first.');
        setUserProfile(profileData);
        setGoalRecommendations(null);
        setIsCalculatingRecs(false);
        return;
      }

      setUserProfile(profileData);

      console.log("Profile complete, fetching recommendations via button press...");
      const { data: recData, error: recError } = await fetchGoalRecommendations(profileData);

      if (recError) {
        throw new Error(recError.message || 'Failed to fetch recommendations from the server.');
      }

      if (recData && recData.status === 'success' && recData.recommendations) {
        console.log("Recommendations received via button:", recData.recommendations);
        setGoalRecommendations(recData.recommendations);
        setCalcError(null);
        Alert.alert("Success", "Personalized goal recommendations have been updated!");
      } else {
        console.error('Invalid recommendation data received:', recData);
        throw new Error(recData?.message || 'Received invalid data structure for recommendations.');
      }

    } catch (error) {
      console.error("Error during recommendation calculation:", error);
      setCalcError(`Calculation failed: ${error.message}`);
    } finally {
      setIsCalculatingRecs(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator animating={true} color={Colors.primary} size="large" />
        <PaperText>Loading goals...</PaperText>
      </SafeAreaView>
    );
  }

  const getPlaceholder = (item) => {
    const recommendationValue = goalRecommendations?.[item.key];
    if (typeof recommendationValue === 'number' && recommendationValue !== null) {
      const roundedValue = Math.round(recommendationValue);
      return `e.g., Recommended: ${roundedValue} ${item.unit}`;
    }
    return `Target (${item.unit})`;
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Banner
         visible={!!recommendationError || !!calcError || !!error}
         actions={[
             { label: 'Go to Profile', onPress: () => navigation.navigate('Profile'), condition: () => recommendationError?.includes('profile') || recommendationError?.includes('Profile') || calcError?.includes('profile') || calcError?.includes('Profile') },
             { label: 'Dismiss', onPress: () => { setRecommendationError(null); setCalcError(null); setError(null); } }
         ].filter(action => !action.condition || action.condition()).map(({label, onPress}) => ({label, onPress}))}
          icon={({ size }) => <PaperText>ℹ️</PaperText>}
          style={styles.banner}
      >
         <PaperText style={styles.bannerText}>
          {calcError || error || recommendationError || ""}
         </PaperText>
      </Banner>

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
                        color={Colors.primary}
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
                        placeholder={getPlaceholder(item)}
                        keyboardType="numeric"
                        mode="outlined"
                        dense
                        error={error && error.includes(item.name)}
                      />
                    )}
                  </Surface>
              )}
              ListHeaderComponent={
                  <View style={styles.listHeader}>
                     <Subheading style={styles.listHeaderTitle}>Select Nutrients & Set Goals</Subheading>
                     {error && !calcError && !recommendationError && <HelperText type="error" visible={!!error}>{error}</HelperText>}
                     <PaperButton
                        mode="contained-tonal"
                        onPress={handleCalculateRecommendations}
                        disabled={isCalculatingRecs || isLoadingRecommendations}
                        loading={isCalculatingRecs}
                        icon="calculator"
                        style={styles.calculateButton}
                      >
                          {isCalculatingRecs ? 'Calculating...' : 'Calculate Recommended Goals'}
                      </PaperButton>
                  </View>
              }
              ListFooterComponent={
                  <View style={styles.footer}>
                    <PaperButton
                      mode="contained"
                      onPress={handleSaveGoals}
                      disabled={saving || loading || isCalculatingRecs}
                      loading={saving}
                      style={styles.saveButton}
                      labelStyle={styles.saveButtonLabel}
                      color={Colors.primary}
                    >
                      {saving ? 'Saving...' : 'Save Goals'}
                    </PaperButton>
                    {error && saving && <HelperText type="error" visible={!!error} style={styles.footerError}>{error}</HelperText>}
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
    backgroundColor: Colors.background,
  },
  container: {
      flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
    padding: 20,
  },
  banner: {
     backgroundColor: Colors.surface,
   },
  bannerText: {
     color: Colors.text,
     fontSize: 14,
   },
  listContentContainer: {
      paddingBottom: 20,
  },
  listHeader: {
      padding: 16,
      backgroundColor: Colors.background,
      borderBottomWidth: 1,
      borderBottomColor: Colors.divider,
  },
  listHeaderTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: Colors.text,
      marginBottom: 10,
  },
  calculateButton: {
      marginTop: 15,
  },
  nutrientRowSurface: {
      padding: 16,
      marginHorizontal: 8,
      marginVertical: 4,
      borderRadius: 8,
      backgroundColor: Colors.surface,
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
    color: Colors.text,
  },
  input: {
    backgroundColor: Colors.surface,
    marginTop: 8,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
    backgroundColor: Colors.background,
  },
  saveButton: {
     paddingVertical: 8,
  },
  saveButtonLabel: {
      fontSize: 16,
      fontWeight: 'bold',
  },
  footerError: {
      marginTop: 8,
      textAlign: 'center',
  },
});

export default GoalSettingsScreen; 