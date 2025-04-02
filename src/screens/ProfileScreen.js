import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {
  TextInput as PaperTextInput,
  Button as PaperButton,
  ActivityIndicator,
  Text,
  Title,
  HelperText,
  Subheading,
  Surface,
} from 'react-native-paper';
import { Picker } from '@react-native-picker/picker'; // Import Picker
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { fetchUserProfile, updateUserProfile } from '../utils/profileUtils';
import { Colors } from '../constants/colors';
import useSafeTheme from '../hooks/useSafeTheme'; // Import useSafeTheme

const ProfileScreen = () => {
  const theme = useSafeTheme(); // Use the hook
  const { user } = useAuth();
  const navigation = useNavigation();

  // State for profile data (using strings for TextInput compatibility)
  const [age, setAge] = useState('');
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [sex, setSex] = useState(''); // Store the selected sex value

  // State for loading and saving
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [validationErrors, setValidationErrors] = useState({});

  // Fetch existing profile data on mount
  const loadProfile = useCallback(async () => {
    if (!user) {
      setError('User not authenticated.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    const { data, error: fetchError } = await fetchUserProfile(user.id);

    if (fetchError) {
      setError('Failed to load profile: ' + fetchError.message);
      console.error('Error fetching profile:', fetchError);
    } else if (data) {
      // Populate state with fetched data, converting numbers to strings
      setAge(data.age?.toString() || '');
      setWeight(data.weight_kg?.toString() || '');
      setHeight(data.height_cm?.toString() || '');
      setSex(data.sex || ''); // Set sex state
    }
    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // Validation function
  const validateInput = () => {
    const errors = {};
    const ageNum = parseInt(age, 10);
    const weightNum = parseFloat(weight);
    const heightNum = parseFloat(height);

    if (age && (isNaN(ageNum) || ageNum <= 0 || ageNum > 120)) {
      errors.age = 'Please enter a valid age (1-120).';
    }
    if (weight && (isNaN(weightNum) || weightNum <= 0 || weightNum > 500)) {
      errors.weight = 'Please enter a valid weight (> 0 kg).';
    }
    if (height && (isNaN(heightNum) || heightNum <= 0 || heightNum > 300)) {
      errors.height = 'Please enter a valid height (> 0 cm).';
    }
     if (!sex) {
       errors.sex = 'Please select your sex.';
     }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0; // Return true if no errors
  };


  // Save handler
  const handleSaveProfile = async () => {
     if (!validateInput()) {
       Alert.alert('Validation Error', 'Please correct the errors before saving.');
       return;
     }

    if (!user) {
      Alert.alert('Error', 'User not authenticated.');
      return;
    }

    setIsSaving(true);
    setError(null);
    setValidationErrors({});

    // Prepare data for saving, converting back to numbers
    const profileData = {
      // Only include fields if they have a value to avoid overwriting with null
      ...(age && { age: parseInt(age, 10) }),
      ...(weight && { weight_kg: parseFloat(weight) }),
      ...(height && { height_cm: parseFloat(height) }),
      ...(sex && { sex: sex }), // Include sex
    };

    // Check if there's actually data to save
    if (Object.keys(profileData).length === 0) {
         Alert.alert('No Changes', 'No profile information provided to save.');
         setIsSaving(false);
         return;
     }

    const { data, error: saveError } = await updateUserProfile(user.id, profileData);

    if (saveError) {
      setError('Failed to save profile: ' + saveError.message);
      console.error('Error saving profile:', saveError);
      Alert.alert('Error', 'Failed to save profile: ' + saveError.message);
    } else {
      Alert.alert('Success', 'Profile saved successfully!');
      // Optionally navigate back or refresh data
      navigation.goBack();
    }

    setIsSaving(false);
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator animating={true} color={theme.colors.primary} size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.container}>
          <Text variant="headlineSmall" style={[styles.title, { color: theme.colors.primary }]}>Your Profile</Text>
          <Text variant="bodyMedium" style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
            This information helps in providing better recommendations.
          </Text>

          {error && <HelperText type="error" visible={!!error} style={styles.mainError}>{error}</HelperText>}

          <PaperTextInput
            label="Age"
            value={age}
            onChangeText={setAge}
            keyboardType="numeric"
            mode="outlined"
            style={[styles.input, { backgroundColor: theme.colors.background }]}
            error={!!validationErrors.age}
          />
           <HelperText type="error" visible={!!validationErrors.age}>
             {validationErrors.age}
           </HelperText>

          <PaperTextInput
            label="Weight (kg)"
            value={weight}
            onChangeText={setWeight}
            keyboardType="numeric"
            mode="outlined"
            style={[styles.input, { backgroundColor: theme.colors.background }]}
             error={!!validationErrors.weight}
          />
            <HelperText type="error" visible={!!validationErrors.weight}>
             {validationErrors.weight}
            </HelperText>

          <PaperTextInput
            label="Height (cm)"
            value={height}
            onChangeText={setHeight}
            keyboardType="numeric"
            mode="outlined"
            style={[styles.input, { backgroundColor: theme.colors.background }]}
            error={!!validationErrors.height}
          />
           <HelperText type="error" visible={!!validationErrors.height}>
             {validationErrors.height}
           </HelperText>

          <Text style={[styles.pickerLabel, { color: theme.colors.textSecondary }]}>Sex</Text>
           <Surface 
             style={[
               styles.pickerSurface, 
               { backgroundColor: theme.colors.surfaceVariant },
               validationErrors.sex ? { borderColor: theme.colors.error } : { borderColor: theme.colors.outline }
             ]} 
             elevation={1}
           >
             <Picker
                selectedValue={sex}
                onValueChange={(itemValue) => setSex(itemValue)}
                style={[styles.picker, { color: theme.colors.onSurfaceVariant }]}
                dropdownIconColor={theme.colors.onSurfaceVariant}
                prompt="Select Sex"
             >
                <Picker.Item label="Select..." value="" enabled={false} style={[styles.pickerPlaceholder, { color: theme.colors.textSecondary }]} />
                <Picker.Item label="Male" value="male" style={{ color: theme.colors.text }}/>
                <Picker.Item label="Female" value="female" style={{ color: theme.colors.text }}/>
                <Picker.Item label="Other" value="other" style={{ color: theme.colors.text }}/>
             </Picker>
            </Surface>
            <HelperText type="error" visible={!!validationErrors.sex}>
             {validationErrors.sex}
           </HelperText>

          <PaperButton
            mode="contained"
            onPress={handleSaveProfile}
            disabled={isSaving}
            loading={isSaving}
            style={styles.saveButton}
            contentStyle={styles.buttonContent}
            labelStyle={styles.buttonLabel}
          >
            {isSaving ? 'Saving...' : 'Save Profile'}
          </PaperButton>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  flex: {
      flex: 1,
  },
  container: {
    flexGrow: 1,
    padding: 20,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    marginBottom: 24,
    textAlign: 'center',
  },
  input: {
    marginBottom: 4,
  },
  pickerLabel: {
    fontSize: 14,
    marginBottom: 4,
    marginLeft: 4,
  },
  pickerSurface: {
    borderWidth: 1,
    borderRadius: 4,
    marginBottom: 4,
  },
  picker: {
      height: 50,
      width: '100%',
  },
  pickerPlaceholder: {
  },
  saveButton: {
    marginTop: 24,
  },
  buttonContent: {
    paddingVertical: 8,
  },
  buttonLabel: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  mainError: {
      marginBottom: 16,
      textAlign: 'center',
  }
});

export default ProfileScreen; 