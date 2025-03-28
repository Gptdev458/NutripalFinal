import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StyleSheet } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import ChatScreen from '../screens/ChatScreen';
import RecipeListScreen from '../screens/RecipeListScreen';
import DashboardScreen from '../screens/DashboardScreen';
import SettingsStackNavigator from './SettingsStackNavigator';
import { Colors } from '../constants/colors';

const Tab = createBottomTabNavigator();

// Main app navigator
const AppNavigator = () => {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarActiveTintColor: Colors.accent,
        tabBarInactiveTintColor: Colors.grey,
        tabBarLabelStyle: {
          fontSize: 12,
        },
        tabBarStyle: {
          height: 60,
          paddingBottom: 5,
          paddingTop: 5,
        },
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          if (route.name === 'Dashboard') {
            iconName = focused ? 'view-dashboard' : 'view-dashboard-outline';
          } else if (route.name === 'Chat') {
            iconName = focused ? 'chat' : 'chat-outline';
          } else if (route.name === 'Recipes') {
            iconName = focused ? 'format-list-bulleted-square' : 'format-list-bulleted-square';
          } else if (route.name === 'SettingsTab') {
            iconName = focused ? 'cog' : 'cog-outline';
          }

          return <MaterialCommunityIcons name={iconName} size={size} color={focused ? Colors.accent : Colors.grey} />;
        },
      })}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          title: 'Dashboard',
        }}
      />
      <Tab.Screen
        name="Chat"
        component={ChatScreen}
        options={{
          title: 'Chat',
        }}
      />
      <Tab.Screen
        name="Recipes"
        component={RecipeListScreen}
        options={{
          title: 'Recipes',
        }}
      />
      <Tab.Screen
        name="SettingsTab"
        component={SettingsStackNavigator}
        options={{
          title: 'Settings',
          headerShown: false
        }}
      />
    </Tab.Navigator>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: 'gray',
    textAlign: 'center',
  },
});

export default AppNavigator; 