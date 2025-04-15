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
  DataTable, // Import DataTable
  Icon, // Import Icon
} from 'react-native-paper';
import { useAuth } from '../context/AuthContext';
import { getSupabaseClient } from 'shared';
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

    // Calculate totals from logs
    logs.forEach(log => {
        Object.keys(log).forEach(key => {
            // Aggregate only if the key corresponds to a known nutrient and value is numeric
            if (MASTER_NUTRIENT_LIST.some(n => n.key === key) && typeof log[key] === 'number') {
                todaysTotals[key] = (todaysTotals[key] || 0) + log[key];
            }
        });
    });

    // Goals Section Header
    data.push({ type: 'header', title: 'Nutrition Goals' });

    if (goals.length > 0) {
      // Create a dedicated array for goal items to be potentially used by DataTable
      const goalItems = goals.map(goal => {
        const nutrientDetail = getNutrientDetails(goal.nutrient);
        if (!nutrientDetail) return null; // Skip if nutrient details aren't found

        const currentTotal = todaysTotals[goal.nutrient] || 0;
        const targetValue = goal.target_value || 0;
        let progressPercentage = 0;
        if (targetValue > 0) {
            progressPercentage = (currentTotal / targetValue) * 100;
        }
        // For limits, exceeding 100% is still calculated the same way for display
        // progressPercentage = targetValue > 0 ? (currentTotal / targetValue) * 100 : 0;


        return {
          type: 'goal', // Keep type for potential filtering later if needed
          key: goal.nutrient,
          name: nutrientDetail.name,
          goalType: goal.goal_type || 'goal', // Get goal_type, default to 'goal'
          target: targetValue,
          unit: nutrientDetail.unit,
          current: currentTotal,
          progress: progressPercentage // Store calculated percentage
        };
      }).filter(item => item !== null); // Filter out any null entries

      if (goalItems.length > 0) {
          data.push({ type: 'goalTable', items: goalItems }); // Push one item representing the whole table
      } else {
          data.push({ type: 'noGoalsMessage' });
      }

    } else {
      data.push({ type: 'noGoalsMessage' });
    }

    // Today's Log Section Header
    data.push({ type: 'header', title: "Today's Log" });

    // Log Summary or No Logs Message
    if (logs.length > 0) {
        data.push({
            type: 'logSummary',
            count: logs.length,
            // Include relevant totals in the summary
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
               mode="contained"
               onPress={() => navHook.navigate('LogTab', { screen: 'LogFood' })}
               icon="plus-circle-outline"
               style={styles.actionButton}
            >
               Log Your First Meal
            </Button>
        </View>
    );

  // NEW function to render the log summary item
  const renderLogSummaryItem = (item) => (
    <Card style={[styles.summaryCard, { backgroundColor: theme.colors.surface }]}>
        <Card.Content>
            <Text variant="titleMedium">{item.count} Log Entries Today</Text>
            <Caption>Summary: {item.calories.toFixed(0)} kcal, {item.protein.toFixed(0)}g P, {item.carbohydrates.toFixed(0)}g C, {item.fat.toFixed(0)}g F</Caption>
             <Button
                mode="contained-tonal"
                onPress={() => navHook.navigate('LogScreen')}
                style={{ marginTop: 10 }}
              >
                View Log Details
              </Button>
        </Card.Content>
    </Card>
  );

  // --- Main Render Function for Items ---
  const renderItem = ({ item }) => {
    switch (item.type) {
      case 'header':
        return renderHeaderItem(item);
      case 'goalTable': // Handle the new goalTable type
        return (
          <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
            <Card.Content style={styles.cardContentPadding}>
              <DataTable>
                <DataTable.Header style={[styles.tableHeader, { borderBottomColor: theme.colors.outline }]}>
                  <DataTable.Title style={[styles.tableHeaderCell, { flex: 3.5 }]}><Text style={styles.tableHeaderText}>Name</Text></DataTable.Title>
                  <DataTable.Title style={[styles.tableHeaderCell, { flex: 1.5 }]}><Text style={styles.tableHeaderText}>Type</Text></DataTable.Title>
                  <DataTable.Title style={[styles.tableHeaderCell, { flex: 2.5 }]} numeric><Text style={[styles.tableHeaderText, styles.numericHeaderText]}>Amount</Text></DataTable.Title>
                  <DataTable.Title style={[styles.tableHeaderCell, styles.progressHeaderCell, { flex: 2.5 }]} numeric><Text style={[styles.tableHeaderText, styles.numericHeaderText]}>Progress</Text></DataTable.Title>
                </DataTable.Header>

                {item.items.map((goal) => {
                  const displayPercentage = goal.progress.toFixed(0);
                  // Determine text color based on goal type and progress
                  let percentageColor = theme.colors.textSecondary;
                  const progressValue = goal.progress;
                  if (goal.goalType === 'goal') {
                    if (progressValue >= 50) { percentageColor = theme.colors.primary; }
                  } else if (goal.goalType === 'limit') {
                    if (progressValue > 100) { percentageColor = theme.colors.error; }
                    else if (progressValue >= 50) { percentageColor = theme.colors.primary; }
                  }

                  return (
                    <DataTable.Row key={goal.key} style={[styles.tableRow, { borderBottomColor: theme.colors.outlineVariant }]}>
                      <DataTable.Cell style={[styles.tableCell, { flex: 3.5 }]}><Text style={styles.tableCellText} numberOfLines={2}>{goal.name}</Text></DataTable.Cell>
                      <DataTable.Cell style={[styles.tableCell, { flex: 1.5 }]}><Text style={styles.tableCellMutedText}>{goal.goalType}</Text></DataTable.Cell>
                      <DataTable.Cell style={[styles.tableCell, { flex: 2.5 }]} numeric>
                         <Text style={[styles.tableCellText, styles.numericCellText]}>{`${goal.current.toFixed(0)} / ${goal.target.toFixed(0)} ${goal.unit}`}</Text>
                      </DataTable.Cell>
                      <DataTable.Cell style={[styles.tableCell, styles.progressCell, { flex: 2.5 }]}>
                        <Text style={[styles.progressText, { color: percentageColor }]}>{`${displayPercentage}%`}</Text>
                      </DataTable.Cell>
                    </DataTable.Row>
                  );
                })}
              </DataTable>
            </Card.Content>
          </Card>
        );
      case 'noGoalsMessage':
        return renderNoGoalsMessage();
      case 'logSummary':
        return renderLogSummaryItem(item);
      case 'noLogsMessage':
        return renderNoLogsMessage();
      default:
        return null;
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
      contentContainerStyle={styles.contentContainer}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
    >
      {/* Map over dashboardData */} 
      {dashboardData.map((item, index) => (
          <View key={`${item.type}-${index}`}>{renderItem({ item })}</View>
      ))}

      {/* Updated Analytics Navigation Link */}
      <TouchableOpacity onPress={() => navHook.navigate('AnalyticsScreen')} activeOpacity={0.8}>
          <Card style={[styles.card, styles.analyticsCard, { backgroundColor: theme.colors.surfaceVariant }]}>
            <Card.Content style={styles.analyticsCardContent}>
                 <Icon 
                    source="chart-line" 
                    size={20} 
                    color={theme.colors.primary} 
                 />
                 <Text style={[styles.analyticsCardText, { color: theme.colors.primary }]}>
                     View Nutrition Analytics
                 </Text>
            </Card.Content>
          </Card>
      </TouchableOpacity>

      {/* Optional: Display minor errors */}
      {error && dashboardData.length > 0 && (
          <Text style={{ color: theme.colors.error, textAlign: 'center', padding: 10 }}>{error}</Text>
      )}
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
  card: {
    marginBottom: 15,
    elevation: 1,
    marginHorizontal: 8,
    borderRadius: 6,
  },
  cardContentPadding: {
    paddingHorizontal: 0, // Remove default padding if DataTable manages it
    paddingVertical: 0,   // Remove default padding if DataTable manages it
  },
  summaryCard: {
    marginBottom: 15,
    elevation: 1,
    borderRadius: 6, // Reduce border radius to match goals card
    marginHorizontal: 8, // Match goal card margin
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
  // DataTable Styles Refined
  tableHeader: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    // backgroundColor: theme.colors.surfaceVariant, // Optional subtle background
    paddingHorizontal: 6, // Reduce overall header padding slightly
  },
  tableHeaderCell: {
    paddingHorizontal: 6, // Adjusted horizontal padding
    paddingVertical: 14, // Increased vertical padding
    justifyContent: 'center',
  },
  tableHeaderText: {
      fontWeight: '600',
      fontSize: 13,
      opacity: 0.8,
      textAlign: 'left',
  },
  numericHeaderText: {
      textAlign: 'right',
  },
  tableRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 55,
    paddingHorizontal: 6,
  },
  tableCell: {
    paddingHorizontal: 6, // Adjusted horizontal padding
    justifyContent: 'center', // Keep vertical centering
    paddingVertical: 4, // Add some vertical padding within cell
  },
  tableCellText: {
    fontSize: 13.5, // Slightly adjusted font size
    textAlign: 'left',
  },
  numericCellText: {
    textAlign: 'right',
  },
  tableCellMutedText: {
    fontSize: 13.5, // Slightly adjusted font size
    textTransform: 'capitalize',
    textAlign: 'left',
    opacity: 0.9,
  },
  progressHeaderCell: {
    justifyContent: 'center', // Keep centered
  },
  progressCell: {
    justifyContent: 'center', // Center vertically
    paddingHorizontal: 6,
  },
  progressText: {
     fontSize: 13.5,
     fontWeight: '600',
     textAlign: 'right', // This handles horizontal alignment
  },
  analyticsCard: { // Renamed from analyticsButtonCard
     marginVertical: 10, 
     // Use surfaceVariant or another subtle background
  },
  analyticsCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center', // Center items horizontally
    paddingVertical: 14, // Adjust padding
    paddingHorizontal: 16,
  },
  analyticsCardText: {
    marginLeft: 8, // Space between icon and text
    fontSize: 16,
    fontWeight: '600',
  },
});

export default DashboardScreen; 