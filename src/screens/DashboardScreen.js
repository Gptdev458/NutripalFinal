import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  RefreshControl,
  View,
  FlatList,
  Alert, // Import Alert for error handling in quick log
} from 'react-native';
import {
  ActivityIndicator,
  Card,
  Title,
  Paragraph,
  ProgressBar,
  Button,
  Text,
  Subheading,
  Caption,
  Divider, // Import Divider
  List,    // Import List for log items
} from 'react-native-paper';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { getNutrientDetails, MASTER_NUTRIENT_LIST } from '../constants/nutrients';
import { useFocusEffect } from '@react-navigation/native';
import { Colors } from '../constants/colors';
import { quickLogRecipe, fetchRecipeDetails, fetchUserGoals, fetchFoodLogsByDateRange } from '../utils/logUtils';

const DashboardScreen = ({ navigation }) => {
  const { user } = useAuth();
  const [dashboardSections, setDashboardSections] = useState([]); // New state for combined data
  const [recentRecipes, setRecentRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [loggingRecipeId, setLoggingRecipeId] = useState(null);

  const fetchDashboardData = useCallback(async () => {
    if (!user) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    setError(null);
    if (!refreshing) {
      setLoading(true);
    }

    try {
      // Get today's date in YYYY-MM-DD format
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
      const day = String(today.getDate()).padStart(2, '0');
      const todayDateString = `${year}-${month}-${day}`;

      // Fetch goals, logs for today, and recent recipes concurrently
      const [goalsResponse, logsResponse, recipesResult] = await Promise.all([
        fetchUserGoals(user.id),
        fetchFoodLogsByDateRange(user.id, todayDateString, todayDateString),
        supabase.from('user_recipes').select('id, recipe_name').eq('user_id', user.id).order('created_at', { ascending: false }).limit(3)
      ]);

      // Handle errors from the fetched results
      if (goalsResponse.error) throw new Error(`Goals fetch failed: ${goalsResponse.error.message}`);
      if (logsResponse.error) throw new Error(`Logs fetch failed: ${logsResponse.error.message}`);
      if (recipesResult.error) throw new Error(`Recipes fetch failed: ${recipesResult.error.message}`);

      const rawGoals = goalsResponse.data || [];
      const rawLogs = logsResponse.data || [];

      setRecentRecipes(recipesResult.data || []);

      // --- Process Data for Sections ---
      const sections = [];

      // Add Goals Section Header
      sections.push({ type: 'header', title: "Today's Goals", id: 'goals-header' });

      if (rawGoals.length > 0) {
        const finalProcessedGoals = rawGoals.map(goal => {
          const nutrientDetails = getNutrientDetails(goal.nutrient);
          let currentIntake = 0;
          rawLogs.forEach(log => {
            const logValue = log[goal.nutrient];
            if (typeof logValue === 'number' && !isNaN(logValue)) {
              currentIntake += logValue;
            }
          });
          return {
            type: 'goal', // Add type for renderItem logic
            id: `goal-${goal.id}`, // Unique ID for keyExtractor
            key: goal.nutrient,
            name: nutrientDetails?.name || goal.nutrient,
            unit: nutrientDetails?.unit || goal.unit || '',
            target: goal.target_value || 0,
            current: currentIntake,
          };
        });
        sections.push(...finalProcessedGoals); // Add processed goals to sections
      } else {
         // Add message if no goals are set
         sections.push({ type: 'noGoalsMessage', id: 'no-goals-msg' });
      }

      // Add Logs Section Header
      sections.push({ type: 'header', title: "Today's Log", id: 'logs-header' });

      if (rawLogs.length > 0) {
         // Add log items, assign type and unique ID
         sections.push(...rawLogs.map(log => ({ ...log, type: 'log', id: `log-${log.id}` })));
      } else {
        // Add message if no logs exist for today
        sections.push({ type: 'noLogsMessage', id: 'no-logs-msg' });
      }

      setDashboardSections(sections); // Update state with the new structure

    } catch (err) {
      setError('Error fetching dashboard data: ' + (err.message || 'Unknown error'));
      console.error('Error fetching dashboard data:', err);
      setDashboardSections([]); // Clear sections on error
      setRecentRecipes([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, refreshing]);

  useFocusEffect(
    useCallback(() => {
      console.log('Dashboard focused, fetching data...');
      fetchDashboardData();
    }, [fetchDashboardData])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
  }, []);

  const handleQuickLog = async (recipeId, recipeName) => {
      if (loggingRecipeId) return;
      setLoggingRecipeId(recipeId);
      try {
        const recipeDetails = await fetchRecipeDetails(recipeId);
        if (recipeDetails) {
           const success = await quickLogRecipe(recipeDetails, user);
           if (success) {
               // Trigger refresh after successful log
               setRefreshing(true); // Set refreshing to true to trigger fetchDashboardData
           }
        } else {
            Alert.alert('Error', 'Could not fetch recipe details to log.');
        }
      } catch (err) {
          console.error("Error during quick log process:", err);
          Alert.alert('Error', 'An unexpected error occurred during logging.');
      } finally {
          setLoggingRecipeId(null);
      }
  };

  // --- Render Functions for Different Item Types ---

  const renderGoalItem = (item) => {
    const progress = item.target > 0 ? Math.min(item.current / item.target, 1) : 0;
    const progressPercentage = (progress * 100).toFixed(0);
    const currentRounded = item.current.toFixed(0);
    const targetRounded = item.target.toFixed(0);
    let progressBarColor = Colors.accent;
    if (item.current > item.target && item.target > 0) {
        progressBarColor = Colors.warning;
    }

    return (
      <Card style={styles.cardVertical}>
        <Card.Content>
          <Title style={styles.cardTitleVertical}>{item.name}</Title>
          <ProgressBar progress={progress} color={progressBarColor} style={styles.progressBarVertical} />
          <View style={styles.progressTextContainerVertical}>
            <Text style={styles.progressTextVertical}>{`${currentRounded} / ${targetRounded} ${item.unit}`}</Text>
            <Text style={styles.progressPercentageText}>{`${progressPercentage}%`}</Text>
          </View>
        </Card.Content>
      </Card>
    );
  };

  const renderLogItem = (item) => {
      // Format timestamp
      const timestamp = new Date(item.timestamp);
      const timeString = timestamp.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      // Display primary nutrient (e.g., calories) if available, otherwise just name
      const primaryNutrient = item.calories ? `${Math.round(item.calories)} kcal` : '';

      return (
          <List.Item
             title={item.food_name || 'Unnamed Item'}
             description={`${timeString}${primaryNutrient ? ` - ${primaryNutrient}` : ''}`}
             titleStyle={styles.logItemTitle}
             descriptionStyle={styles.logItemDescription}
             style={styles.logItem}
             left={props => <List.Icon {...props} icon="food-variant" color={Colors.accent} />}
             // Add onPress later if needed for editing/deleting logs
          />
      );
  };

  const renderHeaderItem = (item) => (
      <View style={styles.sectionHeader}>
          <Subheading style={styles.sectionTitle}>{item.title}</Subheading>
      </View>
  );

   const renderNoGoalsMessage = () => (
       <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No goals set yet.</Text>
          <Button
             mode="outlined"
             onPress={() => navigation.navigate('SettingsTab', { screen: 'GoalSettings' })}
             icon="target"
             style={styles.setGoalsButton}
          >
             Set Goals
          </Button>
       </View>
   );

    const renderNoLogsMessage = () => (
        <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No food logged today.</Text>
            <Button
               mode="outlined"
               onPress={() => navigation.navigate('Chat')} // Navigate to Chat screen
               icon="message-plus-outline"
               style={styles.setGoalsButton} // Reuse style or create new one
            >
               Log Food via Chat
            </Button>
        </View>
    );

  // --- Main renderItem function for the FlatList ---
  const renderDashboardItem = ({ item }) => {
    switch (item.type) {
      case 'header':
        return renderHeaderItem(item);
      case 'goal':
        return renderGoalItem(item);
      case 'log':
        return renderLogItem(item);
       case 'noGoalsMessage':
         return renderNoGoalsMessage();
       case 'noLogsMessage':
         return renderNoLogsMessage();
      default:
        return null; // Or a placeholder for unknown types
    }
  };

  // --- Components for Header and Footer ---

  // Simplify ListHeader - only main title/date
  const ListHeader = () => (
      <View style={styles.header}>
        <Title style={styles.title}>Dashboard</Title>
        <Paragraph style={styles.subtitle}>Your daily nutrition summary</Paragraph>
        {/* Display top-level error if fetch fails */}
        {error && <Text style={styles.errorText}>{error}</Text>}
      </View>
  );


  const ListFooter = () => (
    // Keep Quick Log Recipes in the footer
    recentRecipes.length > 0 && (
      <View style={styles.section}>
        <Subheading style={styles.sectionTitle}>Quick Log Recipes</Subheading>
        {recentRecipes.map(recipe => (
          <Button
            key={recipe.id}
            mode="contained-tonal"
            onPress={() => handleQuickLog(recipe.id, recipe.recipe_name)}
            style={styles.quickLogButton}
            labelStyle={styles.quickLogButtonText}
            loading={loggingRecipeId === recipe.id}
            disabled={loggingRecipeId === recipe.id || loggingRecipeId === 'fetching'}
            icon="plus-circle-outline"
          >
            {recipe.recipe_name || 'Unnamed Recipe'}
          </Button>
        ))}
        {/* Add some bottom padding to the footer */}
        <View style={{ height: 20 }} />
      </View>
    )
  );

  // EmptyListComponent might not be needed anymore if sections handle their own empty states
  const EmptyListComponent = () => {
      // Only show if still loading initially or a major error occurred preventing sections
      if (loading || error) {
          return null; // Loading/Error handled elsewhere or in header
      }
      // Optional: Message if absolutely nothing is available (no goals, no logs, no recipes)
      if (dashboardSections.length === 0 && recentRecipes.length === 0) {
          return (
              <View style={styles.emptyListContainer}>
                  <Text style={styles.emptyText}>Dashboard is empty. Set goals or log food!</Text>
              </View>
          );
      }
       return null; // Sections handle their own empty states ("No Goals", "No Logs")
  };


  // Render Loading Indicator
  if (loading && !refreshing) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator animating={true} size="large" color={Colors.accent} />
        <Text style={styles.loadingText}>Loading Dashboard...</Text>
      </View>
    );
  }

  // --- Main Render using FlatList ---
  return (
    <FlatList
      data={dashboardSections} // Use the new combined sections data
      renderItem={renderDashboardItem} // Use the versatile item renderer
      keyExtractor={(item) => item.id} // Use the unique ID assigned to each item
      ListHeaderComponent={ListHeader}
      ListFooterComponent={ListFooter}
      ListEmptyComponent={EmptyListComponent}
      contentContainerStyle={styles.listContentContainer}
      ItemSeparatorComponent={() => <Divider style={styles.logItemDivider} />} // Optional divider between log items
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={[Colors.accent]}
          tintColor={Colors.accent}
        />
      }
    />
  );
};

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: Colors.background,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: Colors.grey,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.primary,
  },
  subtitle: {
     fontSize: 16,
     color: Colors.grey,
     marginTop: 4,
  },
  section: { // Style for the footer section (Quick Log)
     paddingHorizontal: 15,
     paddingVertical: 15,
     marginTop: 10, // Add margin to separate from goals list if goals exist
     borderTopWidth: 1,
     borderTopColor: Colors.lightGrey,
  },
   sectionHeader: { // Style for section headers within the list
      paddingHorizontal: 15,
      paddingTop: 20,
      paddingBottom: 10, // Add padding below header title
   },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.primary,
  },
  cardVertical: { // Goal card styles
    marginBottom: 12,
    marginHorizontal: 15, // Add horizontal margin for spacing from screen edges
    elevation: 2,
    backgroundColor: Colors.background, // Ensure background color
  },
  cardTitleVertical: {
    fontSize: 18, // Slightly larger title
    fontWeight: '600',
    marginBottom: 8,
    color: Colors.primary,
  },
  progressBarVertical: {
    height: 10, // Slightly thicker bar
    borderRadius: 5,
    marginBottom: 8,
  },
  progressTextContainerVertical: {
    flexDirection: 'row',
    justifyContent: 'space-between', // Space out current/total and percentage
    alignItems: 'center',
    marginTop: 4,
  },
  progressTextVertical: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: '500',
  },
  progressPercentageText: {
    fontSize: 14,
    color: Colors.grey,
    fontWeight: '500',
  },
  errorText: {
    color: Colors.error,
    padding: 16,
    textAlign: 'center',
    fontSize: 16,
  },
  emptyContainer: { // Container for "No goals set", "No logs" message
    paddingVertical: 15,
    alignItems: 'center',
    backgroundColor: Colors.surface, // Use surface color
    borderRadius: 8,
    paddingHorizontal: 15,
    marginTop: 10, // Add margin from the section title
    marginHorizontal: 15, // Match card horizontal margin
    marginBottom: 10, // Add margin below empty messages
  },
  setGoalsButton: { // Style for buttons within empty states
    marginTop: 10,
  },
  emptyListContainer: { // Container for the FlatList's overall empty state
    padding: 20,
    alignItems: 'center',
    marginTop: 30, // More margin if the list itself is empty
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 10,
    color: Colors.grey,
  },
  logItem: { // Style for individual log items
    paddingHorizontal: 15,
    paddingVertical: 8, // Adjust vertical padding
    backgroundColor: Colors.background, // Ensure background matches
  },
  logItemTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: Colors.primary,
  },
  logItemDescription: {
    fontSize: 14,
    color: Colors.grey,
  },
  logItemDivider: { // Optional divider between log items
    marginHorizontal: 15, // Indent divider slightly
  },
  quickLogContainer: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  quickLogButton: {
    marginVertical: 6,
    paddingVertical: 4,
  },
  quickLogButtonText: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  listContentContainer: {
    paddingBottom: 20, // Add padding at the bottom
  },
});

export default DashboardScreen; 