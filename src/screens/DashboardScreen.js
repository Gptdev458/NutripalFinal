import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  RefreshControl,
  View,
  FlatList,
  Alert, // Import Alert for error handling in quick log
  TouchableOpacity, // Import TouchableOpacity
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
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Colors } from '../constants/colors';
import { quickLogRecipe, fetchRecipeDetails, fetchUserGoals, fetchFoodLogsByDateRange } from '../utils/logUtils';

// Define the formatDate helper function here
const formatDate = (date) => {
  if (!date) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const DashboardScreen = ({ navigation }) => {
  const { user } = useAuth();
  const [dashboardData, setDashboardData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [todayDateString, setTodayDateString] = useState(formatDate(new Date())); // Store today's date string

  // Use navigation hook in case navigation prop is not passed down correctly
  const navHook = useNavigation();

  const fetchDashboardData = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    const todayStr = formatDate(new Date());
    setTodayDateString(todayStr); // Store today's date string

    try {
      const [goalsResponse, logsResponse] = await Promise.all([
        fetchUserGoals(user.id),
        fetchFoodLogsByDateRange(user.id, todayStr, todayStr)
      ]);

      if (goalsResponse.error) throw new Error(`Goals fetch failed: ${goalsResponse.error.message}`);
      if (logsResponse.error) throw new Error(`Logs fetch failed: ${logsResponse.error.message}`);

      const userGoals = goalsResponse.data || [];
      const todaysLog = logsResponse.data || [];

      prepareDashboardData(userGoals, todaysLog);

    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setError('Failed to load dashboard data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      console.log('Dashboard focused, fetching data...');
      fetchDashboardData();
    }, [fetchDashboardData])
  );

  const prepareDashboardData = (goals, logs) => {
    let data = [];
    let todaysTotals = {};

    // Calculate totals from logs for relevant nutrients (e.g., calories)
    logs.forEach(log => {
        Object.keys(log).forEach(key => {
            if (typeof log[key] === 'number') {
                todaysTotals[key] = (todaysTotals[key] || 0) + log[key];
            }
        });
    });


    // Goals Section
    data.push({ type: 'header', title: 'Nutrition Goals' });
    if (goals.length > 0) {
      goals.forEach(goal => {
        const nutrientDetail = getNutrientDetails(goal.nutrient);
        if (nutrientDetail) {
          data.push({
            type: 'goal',
            key: goal.nutrient,
            name: nutrientDetail.name,
            target: goal.target_value,
            unit: nutrientDetail.unit,
            current: todaysTotals[goal.nutrient] || 0,
          });
        }
      });
    } else {
      data.push({ type: 'noGoalsMessage' });
    }

    // Today's Log Section Header
    data.push({ type: 'header', title: "Today's Log" });

    // Replace detailed logs with a summary item or no logs message
    if (logs.length > 0) {
        data.push({
            type: 'logSummary',
            count: logs.length,
            calories: todaysTotals.calories || 0,
            // Pass other totals if needed for summary
        });
    } else {
        data.push({ type: 'noLogsMessage' });
    }


    setDashboardData(data);
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchDashboardData();
  }, [fetchDashboardData]);

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
             onPress={() => navHook.navigate('SettingsTab', { screen: 'GoalSettings' })}
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
               onPress={() => navHook.navigate('Chat')}
               icon="message-plus-outline"
               style={styles.setGoalsButton}
            >
               Log Food via Chat
            </Button>
        </View>
    );

  // NEW function to render the log summary item
  const renderLogSummaryItem = (item) => (
    <TouchableOpacity
       onPress={() => navigation.navigate('LogScreen', { date: todayDateString })}
    >
      <List.Item
        title={`Today's Log (${item.count} items)`}
        description={`Total Calories: ${Math.round(item.calories)} kcal`}
        left={props => <List.Icon {...props} icon="notebook-outline" color={Colors.accent} />}
        right={props => <List.Icon {...props} icon="chevron-right" />}
        style={styles.summaryItem}
        titleStyle={styles.summaryTitle}
        descriptionStyle={styles.summaryDescription}
      />
    </TouchableOpacity>
  );

  const renderQuickLogRecipeItem = (item) => (
    <Button
      key={item.id}
      mode="outlined" // Or "contained" based on desired appearance
      onPress={() => handleQuickLogRecipe(item)}
      style={styles.quickLogButton}
      labelStyle={styles.quickLogButtonText} // Apply the updated style here
      disabled={item.logging}
      loading={item.logging}
      icon="plus"
      compact // Makes the button slightly smaller vertically
      // Use children prop for more control if labelStyle doesn't work reliably
      // children={<Text style={styles.quickLogButtonText} numberOfLines={0}>{item.recipe_name}</Text>}
    >
      {/* The text here is handled by Button's internal label */}
      {item.recipe_name}
    </Button>
  );

  // --- Main renderItem function for the FlatList ---
  const renderDashboardItem = ({ item }) => {
    switch (item.type) {
      case 'header':
        return renderHeaderItem(item);
      case 'goal':
        return renderGoalItem(item);
      case 'logSummary':
          return renderLogSummaryItem(item);
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

  // EmptyListComponent might not be needed anymore if sections handle their own empty states
  const EmptyListComponent = () => {
      // Only show if still loading initially or a major error occurred preventing sections
      if (loading || error) {
          return null; // Loading/Error handled elsewhere or in header
      }
      // Optional: Message if absolutely nothing is available (no goals, no logs, no recipes)
      if (dashboardData.length === 0) {
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
      data={dashboardData}
      renderItem={renderDashboardItem}
      keyExtractor={(item, index) => `${item.type}-${item.key || item.title || index}`}
      ListHeaderComponent={ListHeader}
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
    marginVertical: 4, // Reduced vertical margin slightly
    // Ensure no fixed height that could prevent wrapping
    height: 'auto', // Allow height to adjust to content
    minHeight: 40, // Ensure a minimum touchable area
    justifyContent: 'center', // Center content vertically
    paddingVertical: 6, // Adjust padding as needed
  },
  quickLogButtonText: {
    fontSize: 15,
    fontWeight: '500', // Adjusted weight slightly
    textAlign: 'center', // Center text within the button
    flexShrink: 1, // Allow text to shrink if absolutely necessary (should wrap first)
    numberOfLines: 0, // Allow text to wrap onto multiple lines
  },
  listContentContainer: {
    paddingBottom: 20, // Add padding at the bottom
  },
  summaryItem: { // Style for the new summary item
    backgroundColor: Colors.surface,
    borderRadius: 8,
    marginHorizontal: 5, // Match card style if needed
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    paddingVertical: 10, // Add padding
  },
  summaryTitle: {
    fontWeight: 'bold',
    fontSize: 16,
    color: Colors.text,
  },
  summaryDescription: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
});

export default DashboardScreen; 