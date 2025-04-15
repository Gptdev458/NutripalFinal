import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import DashboardScreen from '../screens/DashboardScreen';
import LogScreen from '../screens/LogScreen';
import AnalyticsScreen from '../screens/AnalyticsScreen';
// import { Colors } from '../constants/colors'; // Remove old Colors import

const Stack = createNativeStackNavigator();

// Define hex colors matching the theme
const HEADER_BACKGROUND = '#FFFFFF'; // Corresponds to theme.colors.surface or background
const HEADER_TINT_COLOR = '#4CAF50'; // Corresponds to theme.colors.primary

const DashboardStackNavigator = () => {
  return (
    <Stack.Navigator
      initialRouteName="DashboardMain"
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: HEADER_BACKGROUND }, // Use defined hex color
        headerTintColor: HEADER_TINT_COLOR, // Use defined hex color
        headerTitleStyle: { fontWeight: 'bold' }, // Keep or adjust as needed
        headerBackTitleVisible: false,
      }}
    >
      <Stack.Screen
        name="DashboardMain"
        component={DashboardScreen}
        options={{
          title: 'Dashboard',
           headerShown: false // Often hide the header for the root screen in a tab
        }}
      />
      <Stack.Screen
        name="LogScreen"
        component={LogScreen}
        options={({ route }) => ({
          // Title could be dynamic based on date, but 'Daily Log' is fine
          title: 'Daily Log',
        })}
      />
      <Stack.Screen
        name="AnalyticsScreen"
        component={AnalyticsScreen}
        options={{
          title: 'Nutrition Analytics',
        }}
      />
      {/* Add other screens related to the Dashboard flow here if needed */}
    </Stack.Navigator>
  );
};

export default DashboardStackNavigator; 