import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import DashboardScreen from '../screens/DashboardScreen';
import LogScreen from '../screens/LogScreen';
import { Colors } from '../constants/colors'; // Import Colors for styling consistency if needed

const Stack = createNativeStackNavigator();

const DashboardStackNavigator = () => {
  return (
    <Stack.Navigator
      initialRouteName="DashboardMain"
      screenOptions={{
        headerShown: true, // Stack navigator header is shown by default
        headerStyle: { backgroundColor: Colors.background }, // Example styling
        headerTintColor: Colors.primary,
        headerTitleStyle: { fontWeight: 'bold' },
        headerBackTitleVisible: false, // Hide "Back" text on iOS
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
      {/* Add other screens related to the Dashboard flow here if needed */}
    </Stack.Navigator>
  );
};

export default DashboardStackNavigator; 