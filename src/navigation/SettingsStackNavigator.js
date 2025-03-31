import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import SettingsScreen from '../screens/SettingsScreen';
import GoalSettingsScreen from '../screens/GoalSettingsScreen';
import HistoryScreen from '../screens/HistoryScreen';

const Stack = createNativeStackNavigator();

const SettingsStackNavigator = () => {
  return (
    <Stack.Navigator
      initialRouteName="SettingsMain"
      screenOptions={{
        headerShown: true
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
    </Stack.Navigator>
  );
};

export default SettingsStackNavigator; 