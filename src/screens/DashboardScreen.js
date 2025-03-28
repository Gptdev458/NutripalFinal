import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  FlatList
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { getNutrientDetails } from '../constants/nutrients';
import { useFocusEffect } from '@react-navigation/native';

const DashboardScreen = () => {
  const { user } = useAuth();
  const [goals, setGoals] = useState([]);
  const [todayLogs, setTodayLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Wrap fetchDashboardData in useCallback to prevent unnecessary re-creation
  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      if (!user) return;

      // Get today's date range (start and end of day)
      const today = new Date();
      const startOfDay = new Date(today.setHours(0, 0, 0, 0)).toISOString();
      const endOfDay = new Date(today.setHours(23, 59, 59, 999)).toISOString();

      // Fetch user's goals
      const { data: goalsData, error: goalsError } = await supabase
        .from('user_goals')
        .select('*')
        .eq('user_id', user.id);

      if (goalsError) throw goalsError;

      // Fetch today's food logs
      const { data: logsData, error: logsError } = await supabase
        .from('food_log')
        .select('*')
        .eq('user_id', user.id)
        .gte('timestamp', startOfDay)
        .lte('timestamp', endOfDay);

      if (logsError) throw logsError;

      setGoals(goalsData || []);
      setTodayLogs(logsData || []);
    } catch (err) {
      setError('Error fetching dashboard data: ' + err.message);
      console.error('Error fetching dashboard data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]); // Only re-create if user changes

  // Use useFocusEffect to refresh data whenever the screen comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchDashboardData();
      
      // Return a cleanup function (optional)
      return () => {
        // Any cleanup code if needed
      };
    }, [fetchDashboardData])
  );

  // Handle pull-to-refresh
  const onRefresh = () => {
    setRefreshing(true);
    fetchDashboardData();
  };

  // Calculate the current total for a given nutrient
  const calculateNutrientTotal = (nutrientKey) => {
    return todayLogs.reduce((total, log) => {
      // Add to total only if the log has this nutrient value (and it's not null)
      const value = log[nutrientKey];
      return total + (value != null ? parseFloat(value) : 0);
    }, 0);
  };

  // Calculate percentage of goal completed
  const calculatePercentage = (current, target) => {
    if (!target) return 0;
    const percentage = (current / target) * 100;
    return Math.min(percentage, 100); // Cap at 100% for UI purposes
  };

  // Determine color based on percentage with better colors
  const getProgressColor = (percentage) => {
    if (percentage < 30) return '#FF9500'; // Orange for very low
    if (percentage < 60) return '#FFCC00'; // Yellow/orange for medium-low
    if (percentage < 85) return '#34C759'; // Green for good range
    if (percentage < 95) return '#FF9500'; // Orange for approaching limit
    return '#FF3B30'; // Red for over limit
  };

  // Render a single nutrient card
  const renderNutrientCard = (goal) => {
    const nutrientKey = goal.nutrient_key;
    const nutrientDetails = getNutrientDetails(nutrientKey);
    if (!nutrientDetails) return null;

    const targetValue = goal.target_value;
    const currentValue = calculateNutrientTotal(nutrientKey);
    const percentage = calculatePercentage(currentValue, targetValue);
    const progressColor = getProgressColor(percentage);

    return (
      <View style={styles.nutrientCard} key={nutrientKey}>
        <View style={styles.nutrientHeader}>
          <Text style={styles.nutrientName}>{nutrientDetails.name}</Text>
          <Text style={styles.nutrientValues}>
            {currentValue.toFixed(1)} / {targetValue} {nutrientDetails.unit}
          </Text>
        </View>
        
        <View style={styles.progressBarContainer}>
          <View 
            style={[
              styles.progressBar, 
              { width: `${percentage}%`, backgroundColor: progressColor }
            ]} 
          />
        </View>
        
        <Text style={styles.percentageText}>
          {percentage.toFixed(0)}% of daily goal
        </Text>
      </View>
    );
  };

  // Show loading state
  if (loading && !refreshing) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading your nutrition data...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={['#007AFF']}
        />
      }
    >
      <View style={styles.header}>
        <Text style={styles.title}>Today's Nutrition</Text>
        <Text style={styles.subtitle}>
          {new Date().toLocaleDateString('en-US', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          })}
        </Text>
      </View>

      {error && <Text style={styles.errorText}>{error}</Text>}

      {goals.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            You haven't set any nutrient goals yet.
          </Text>
          <Text style={styles.emptySubtext}>
            Go to Settings → Set Nutrient Goals to start tracking your nutrition.
          </Text>
        </View>
      ) : (
        <View style={styles.nutrientsContainer}>
          <Text style={styles.sectionTitle}>
            Tracked Nutrients ({goals.length})
          </Text>
          <Text style={styles.logCount}>
            {todayLogs.length} food items logged today
          </Text>
          
          {goals.map(goal => renderNutrientCard(goal))}
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
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
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    marginBottom: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    marginBottom: 6,
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  errorText: {
    color: 'red',
    padding: 16,
    textAlign: 'center',
  },
  emptyContainer: {
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 60,
    backgroundColor: '#f8f8f8',
    borderRadius: 12,
    marginHorizontal: 16,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 14,
    color: '#555',
  },
  emptySubtext: {
    fontSize: 16,
    color: '#777',
    textAlign: 'center',
    lineHeight: 22,
  },
  nutrientsContainer: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 6,
    color: '#333',
    paddingHorizontal: 16,
  },
  logCount: {
    fontSize: 15,
    color: '#666',
    marginBottom: 20,
    paddingHorizontal: 16,
  },
  nutrientCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  nutrientHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  nutrientName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#333',
  },
  nutrientValues: {
    fontSize: 15,
    fontWeight: '500',
    color: '#555',
  },
  progressBarContainer: {
    height: 14,
    backgroundColor: '#EEE',
    borderRadius: 7,
    overflow: 'hidden',
    marginBottom: 10,
  },
  progressBar: {
    height: '100%',
    borderRadius: 7,
  },
  percentageText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#777',
    textAlign: 'right',
  },
});

export default DashboardScreen; 