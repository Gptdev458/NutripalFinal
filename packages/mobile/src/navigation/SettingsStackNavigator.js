import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import SettingsScreen from '../screens/SettingsScreen';
import GoalSettingsScreen from '../screens/GoalSettingsScreen';
import HistoryScreen from '../screens/HistoryScreen';
import ProfileScreen from '../screens/ProfileScreen';

const Stack = createNativeStackNavigator();

// Define hex colors matching the theme
const HEADER_BACKGROUND = '#FFFFFF'; // Corresponds to theme.colors.surface or background
const HEADER_TINT_COLOR = '#4CAF50'; // Corresponds to theme.colors.primary

const SettingsStackNavigator = () => {
  return (
    <Stack.Navigator
      initialRouteName="SettingsMain"
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: HEADER_BACKGROUND }, // Use defined hex color
        headerTintColor: HEADER_TINT_COLOR, // Use defined hex color
        headerTitleStyle: { fontWeight: 'bold' }, // Keep or adjust as needed
        headerBackTitleVisible: false, // Hide "Back" text on iOS
      }}
    >
      <Stack.Screen 
        name="SettingsMain" 
        component={SettingsScreen} 
        options={{ 
          title: 'Settings',
          headerShown: false
        }}
      />
      <Stack.Screen 
        name="GoalSettings" 
        component={GoalSettingsScreen} 
        options={{ 
          title: 'Nutrient Goals',
          headerBackTitleVisible: false
        }}
      />
      <Stack.Screen
        name="History"
        component={HistoryScreen}
        options={{
          title: 'Log History',
          headerBackTitleVisible: false
        }}
      />
      <Stack.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: 'Your Profile',
          headerBackTitleVisible: false
        }}
      />
    </Stack.Navigator>
  );
};

export default SettingsStackNavigator; 