import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  RefreshControl,
  View,
  FlatList,
  Alert, // Import Alert for error handling in quick log
  TouchableOpacity, // Import TouchableOpacity
  ScrollView, // Import ScrollView for the main container
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
import useSafeTheme from '../hooks/useSafeTheme'; // Import useSafeTheme

// Define the formatDate helper function here
const formatDate = (date) => {
  if (!date) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const DashboardScreen = ({ navigation }) => {
  const theme = useSafeTheme(); // Use the hook
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
            protein: todaysTotals.protein || 0,
            carbohydrates: todaysTotals.carbohydrates || 0,
            fat: todaysTotals.total_fat || 0,
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
    let progressBarColor = theme.colors.primary;
    if (item.current > item.target && item.target > 0) {
        progressBarColor = theme.colors.warning;
    }

    return (
      <Card style={[styles.cardVertical, { backgroundColor: theme.colors.surface }]}>
        <Card.Content>
          <Text variant="titleMedium" style={[styles.cardTitleVertical, { color: theme.colors.text }]}>{item.name}</Text>
          <ProgressBar progress={progress} color={progressBarColor} style={styles.progressBarVertical} />
          <View style={styles.progressTextContainerVertical}>
            <Text variant="bodySmall" style={[styles.progressTextVertical, { color: theme.colors.textSecondary }]}>{`${currentRounded} / ${targetRounded} ${item.unit}`}</Text>
            <Text variant="bodySmall" style={[styles.progressPercentageText, { color: theme.colors.textSecondary }]}>{`${progressPercentage}%`}</Text>
          </View>
        </Card.Content>
      </Card>
    );
  };

  const renderHeaderItem = (item) => (
      <View style={styles.sectionHeader}>
          <Text variant="titleLarge" style={[styles.sectionTitle, { color: theme.colors.primary }]}>{item.title}</Text>
      </View>
  );

   const renderNoGoalsMessage = () => (
       <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>No goals set yet.</Text>
          <Button
             mode="outlined"
             onPress={() => navHook.navigate('SettingsTab', { screen: 'GoalSettings' })}
             icon="target"
             style={styles.actionButton}
          >
             Set Goals
          </Button>
       </View>
   );

    const renderNoLogsMessage = () => (
        <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>No food logged today.</Text>
            <Button
               mode="outlined"
               onPress={() => navHook.navigate('Chat')}
               icon="message-plus-outline"
               style={styles.actionButton}
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
        description={`Cals: ${Math.round(item.calories)} | P: ${Math.round(item.protein)}g | C: ${Math.round(item.carbohydrates)}g | F: ${Math.round(item.fat)}g`}
        left={props => <List.Icon {...props} icon="notebook-outline" color={theme.colors.primary} />}
        right={props => <List.Icon {...props} icon="chevron-right" color={theme.colors.textSecondary} />}
        style={[styles.summaryItem, { backgroundColor: theme.colors.surface }]}
        titleStyle={[styles.summaryTitle, { color: theme.colors.text }]}
        descriptionStyle={[styles.summaryDescription, { color: theme.colors.textSecondary }]}
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
      <View style={[styles.centered, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator animating={true} size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Loading Dashboard...</Text>
      </View>
    );
  }

  // --- Main Render using FlatList ---
  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary}/>}
      contentContainerStyle={styles.contentContainer}
    >
      {dashboardData.map((item, index) => (
        <View key={item.key || `${item.type}-${index}`}>
            {renderDashboardItem({ item })}
            {item.type === 'header' && index > 0 && index < dashboardData.length -1 && <Divider style={styles.divider} />}
        </View>
      ))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
     paddingVertical: 16, // Add vertical padding to the content
     paddingHorizontal: 8, // Add horizontal padding
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
    borderRadius: 6, // Apply requested border radius
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
  actionButton: { // Renamed from setGoalsButton for generic use
    marginTop: 16, // Use theme.spacing.md?
    // Colors handled by theme for outlined button
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
  summaryItem: {
    marginVertical: 8,
    marginHorizontal: 8,
    borderRadius: 12, // Use theme.roundness?
    elevation: 2, // Use theme.elevation?
  },
  summaryTitle: {
    // fontSize: 16, // Handled by List.Item or theme variant
    // fontWeight: '600', // Handled by List.Item or theme variant
    // color: theme.colors.text, // Applied inline
  },
  summaryDescription: {
    // fontSize: 14, // Handled by List.Item or theme variant
    // color: theme.colors.textSecondary, // Applied inline
  },
  divider: {
      marginVertical: 8, // Add some space around dividers
      marginHorizontal: 16,
  },
});

export default DashboardScreen; 