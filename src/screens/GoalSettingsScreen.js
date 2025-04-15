import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  Alert,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import {
  Switch as PaperSwitch,
  TextInput as PaperTextInput,
  Button as PaperButton,
  ActivityIndicator,
  Text as PaperText,
  HelperText,
  Text,
  Surface,
  Banner,
  Divider,
  RadioButton,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { getSupabaseClient } from '../lib/supabaseClient';
import { MASTER_NUTRIENT_LIST, getNutrientDetails } from '../constants/nutrients';
import { fetchUserProfile, calculateNutritionalGoals, updateUserProfile } from '../utils/profileUtils';
import useSafeTheme from '../hooks/useSafeTheme';

const GoalSettingsScreen = ({ navigation }) => {
  const theme = useSafeTheme();
  const [trackedNutrients, setTrackedNutrients] = useState({});
  const [targetValues, setTargetValues] = useState({});
  const [goalTypes, setGoalTypes] = useState({});
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
      const supabase = getSupabaseClient();
      const [goalsResponse, profileResponse] = await Promise.all([
        supabase
          .from('user_goals')
          .select('nutrient, target_value, goal_type')
          .eq('user_id', user.id),
        fetchUserProfile(user.id)
      ]);

      if (goalsResponse.error) throw new Error(`Failed to fetch goals: ${goalsResponse.error.message}`);
      const tracked = {};
      const targets = {};
      const types = {};
      if (goalsResponse.data) {
        goalsResponse.data.forEach(goal => {
          tracked[goal.nutrient] = true;
          targets[goal.nutrient] = goal.target_value?.toString() || '';
          types[goal.nutrient] = goal.goal_type || 'goal';
        });
      }
      setTrackedNutrients(tracked);
      setTargetValues(targets);
      setGoalTypes(types);

      if (profileResponse.error) {
         console.error('Profile fetch error during initial load:', profileResponse.error);
         setRecommendationError(`Could not load profile: ${profileResponse.error.message}. Please try again.`);
         setUserProfile(null);
      } else if (!profileResponse.data) {
          console.log("No profile found during initial load.");
          setRecommendationError('Please complete your profile to get personalized recommendations.');
          setUserProfile(null);
      } else {
           const fetchedProfile = profileResponse.data;
           setUserProfile(fetchedProfile);
           const requiredKeys = ['age', 'weight_kg', 'height_cm', 'sex', 'activity_level', 'health_goal'];
           const missingKeys = requiredKeys.filter(key => !(key in fetchedProfile) || fetchedProfile[key] === null || fetchedProfile[key] === undefined);
           if (missingKeys.length > 0) {
                console.log(`Profile incomplete for recommendations. Missing: ${missingKeys.join(', ')}`);
                setRecommendationError(`Profile incomplete (${missingKeys.join(', ')} missing). Please update your profile.`);
                setGoalRecommendations(null);
           } else {
               console.log("Profile loaded and appears complete.");
               setRecommendationError(null);
           }
      }

    } catch (err) {
      console.error('Error loading initial data:', err);
      setError(`Failed to load data: ${err.message}`);
    } finally {
      setLoading(false);
      setIsLoadingRecommendations(false);
    }
  }, [user]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  const toggleNutrient = (nutrientKey) => {
    const isCurrentlyTracked = trackedNutrients[nutrientKey];
    setTrackedNutrients(prev => ({
      ...prev,
      [nutrientKey]: !isCurrentlyTracked,
    }));

    if (isCurrentlyTracked) {
      setTargetValues(prev => {
        const newTargets = { ...prev };
        delete newTargets[nutrientKey];
        return newTargets;
      });
      setGoalTypes(prev => {
        const newTypes = { ...prev };
        delete newTypes[nutrientKey];
        return newTypes;
      });
    } else {
      setGoalTypes(prev => ({
          ...prev,
          [nutrientKey]: prev[nutrientKey] || 'goal'
      }));
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
          goal_type: goalTypes[key] || 'goal',
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
      const supabase = getSupabaseClient();
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
    const supabase = getSupabaseClient();

    try {
      console.log("Requesting recommendations with profile:", userProfile);
      const apiResponse = await calculateNutritionalGoals(userProfile);

      if (apiResponse.error) {
        console.error("Calculation API Error:", apiResponse.error);
        setCalcError(`Failed to calculate recommendations: ${apiResponse.error.message}`);
        Alert.alert("Calculation Failed", `Could not get recommendations: ${apiResponse.error.message}`);
      } else if (apiResponse.data && apiResponse.data.recommendations) {
        const recommendations = apiResponse.data.recommendations;
        console.log("Recommendations received:", recommendations);
        setGoalRecommendations(recommendations);
        setCalcError(null);
        Alert.alert("Recommendations Updated", "Recommended values are now shown as placeholders in the input fields.");
      } else {
        console.error("Invalid data structure received from calculation utility:", apiResponse.data);
        setCalcError("Received invalid data from calculation service.");
        Alert.alert("Calculation Error", "Received unexpected data format for recommendations.");
      }

    } catch (err) {
      console.error("Unexpected error during calculation request:", err);
      setCalcError(`An unexpected error occurred: ${err.message}`);
      Alert.alert("Calculation Error", `An unexpected error occurred: ${err.message}`);
    } finally {
      setIsCalculatingRecs(false);
    }
  };

  const getPlaceholder = (item) => {
    if (isLoadingRecommendations) return "Loading recs...";
    const recValue = goalRecommendations?.[item.key];
    if (recValue !== undefined && recValue !== null) {
        const formattedRec = typeof recValue === 'number' ? recValue.toFixed(0) : recValue;
        return `Rec: ${formattedRec} ${item.unit}`;
    }
    if (recommendationError) return "Recs unavailable";
    return `Target ${item.unit}`;
  };

  const navigateToProfile = () => {
    navigation.navigate('SettingsTab', { screen: 'Profile' });
  };

  const renderNutrientItem = ({ item }) => {
    const isTracked = trackedNutrients[item.key];
    const currentTarget = targetValues[item.key] || '';
    const currentType = goalTypes[item.key] || 'goal';
    const placeholder = getPlaceholder(item);

    return (
      <Surface style={[styles.itemSurface, { backgroundColor: theme.colors.elevation.level2 }]} elevation={1}>
        <View style={styles.itemHeader}>
          <PaperText style={{ flex: 1, color: theme.colors.text }} variant="titleMedium">{item.name} ({item.unit})</PaperText>
          <PaperSwitch
            value={isTracked}
            onValueChange={() => toggleNutrient(item.key)}
            color={theme.colors.primary}
          />
        </View>
        {isTracked && (
          <View style={styles.itemBody}>
            <PaperTextInput
              label={`Target ${item.name}`}
              value={currentTarget}
              placeholder={placeholder}
              onChangeText={(value) => updateTargetValue(item.key, value)}
              keyboardType="numeric"
              mode="outlined"
              style={styles.input}
              dense
            />
            <View style={styles.radioButtonContainer}>
              <PaperText variant="labelMedium" style={{ color: theme.colors.textSecondary, marginBottom: 4 }}>Type:</PaperText>
              <RadioButton.Group
                onValueChange={newValue => {
                  setGoalTypes(prev => ({ ...prev, [item.key]: newValue }));
                }}
                value={currentType}
              >
                <View style={styles.radioButtonRow}>
                    <RadioButton.Item label="Goal" value="goal" status={currentType === 'goal' ? 'checked' : 'unchecked'} style={styles.radioButtonItem} labelStyle={styles.radioLabel} />
                    <RadioButton.Item label="Limit" value="limit" status={currentType === 'limit' ? 'checked' : 'unchecked'} style={styles.radioButtonItem} labelStyle={styles.radioLabel} />
                </View>
              </RadioButton.Group>
            </View>
          </View>
        )}
      </Surface>
    );
  };

  const nutrientList = Object.entries(MASTER_NUTRIENT_LIST)
      .map(([key, details]) => ({ key, ...details }))
      .sort((a, b) => a.name.localeCompare(b.name));

  if (loading) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator animating={true} color={theme.colors.primary} size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.flex}
      >
        {(recommendationError || calcError) && (
          <Banner
            visible={true}
            actions={[
              { label: 'Go to Profile', onPress: navigateToProfile, },
              { label: 'Dismiss', onPress: () => { setRecommendationError(null); setCalcError(null); } },
            ]}
            icon="alert-circle-outline"
            style={{ backgroundColor: theme.colors.surfaceVariant }}
          >
            <Text style={{ color: theme.colors.onSurfaceVariant }}> 
              {calcError || recommendationError}
            </Text>
          </Banner>
        )}

        <ScrollView style={styles.scrollView}>
          <View style={styles.headerContainer}>
            <Text variant="headlineSmall" style={[styles.title, { color: theme.colors.primary }]}>Set Nutrient Goals</Text>
            <Text variant="bodyMedium" style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
              Toggle nutrients to track and set your daily targets.
            </Text>
             {error && <Text style={[styles.errorText, { color: theme.colors.error }]}>{error}</Text>}
          </View>

           <Surface style={[styles.recommendationSection, { backgroundColor: theme.colors.surfaceVariant }]} elevation={1}>
              <Text variant="titleMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}>Recommendations</Text>
               {isLoadingRecommendations || isCalculatingRecs ? (
                  <ActivityIndicator color={theme.colors.primary} />
               ) : goalRecommendations ? (
                 <Text style={{ color: theme.colors.onSurfaceVariant }}>Recommendations loaded. Use placeholders in the inputs below.</Text>
               ) : (
                 <Text style={{ color: theme.colors.onSurfaceVariant }}>{recommendationError || calcError || 'Complete your profile to calculate recommendations.'}</Text>
               )}
               <PaperButton
                    mode="contained"
                    onPress={handleCalculateRecommendations}
                    loading={isCalculatingRecs}
                    disabled={isCalculatingRecs || isLoadingRecommendations || saving}
                    icon="calculator"
                    style={styles.calcButton}
               >
                    {goalRecommendations ? 'Recalculate' : 'Calculate'}
               </PaperButton>
           </Surface>

          {nutrientList.map((item, index) => (
            <React.Fragment key={item.key}>
              {renderNutrientItem({ item })}
              {index < nutrientList.length - 1 && <Divider />} 
            </React.Fragment>
          ))}

        </ScrollView>

        <Surface style={[styles.saveArea, { backgroundColor: theme.colors.surface }]} elevation={4}>
          <PaperButton
            mode="contained"
            onPress={handleSaveGoals}
            loading={saving}
            disabled={loading || saving || isCalculatingRecs}
            icon="check-circle-outline"
            style={styles.saveButton}
            labelStyle={styles.saveButtonLabel}
          >
            Save Goals
          </PaperButton>
        </Surface>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
      flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  title: {
    marginBottom: 4,
  },
  subtitle: {
  },
  errorText: {
      marginTop: 8,
  },
  recommendationSection: {
    margin: 16,
    padding: 16,
    borderRadius: 8,
  },
  calcButton: {
    marginTop: 12,
  },
  itemSurface: {
    padding: 12,
    marginVertical: 6,
    borderRadius: 8,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  itemBody: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
  },
  input: {
    marginBottom: 8,
  },
  radioButtonContainer: {
    marginTop: 8,
  },
  radioButtonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    marginLeft: -8,
  },
  radioButtonItem: {
    paddingHorizontal: 0,
    marginHorizontal: 0,
  },
   radioLabel: {
     fontSize: 14,
     marginLeft: -4,
   },
  saveArea: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  saveButton: {
    paddingVertical: 6,
  },
  saveButtonLabel: {
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default GoalSettingsScreen; 