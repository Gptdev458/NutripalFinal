import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Dimensions } from 'react-native';
import {
    ActivityIndicator,
    Text,
    Title,
    Card,
    Chip,
    ProgressBar,
    Caption,
} from 'react-native-paper';
import { LineChart } from 'react-native-chart-kit';
import { useAuth } from '../context/AuthContext'; // Assuming you need user context
import useSafeTheme from '../hooks/useSafeTheme';
import { fetchUserGoals } from '../utils/logUtils'; // Import fetchUserGoals
import { getNutrientDetails } from '../constants/nutrients'; // Import getNutrientDetails
import { fetchDailyNutrientTotals } from '../utils/analyticsUtils'; // Import the new function
import { Picker } from '@react-native-picker/picker'; // Import Picker

// --- Date Helper Functions --- 
const formatDate = (date) => {
  if (!date) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getPastDate = (daysAgo) => {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return date;
};

// Helper to get short day name from date string (YYYY-MM-DD)
const getDayAbbreviation = (dateString) => {
    const date = new Date(dateString + 'T00:00:00'); // Ensure parsing as local date
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return days[date.getDay()];
};

const screenWidth = Dimensions.get("window").width;

const AnalyticsScreen = () => {
  const theme = useSafeTheme();
  const { user } = useAuth(); // Get user if needed for fetching

  // State variables
  const [loading, setLoading] = useState(true);
  const [loadingGoals, setLoadingGoals] = useState(true); // Specific loading for goals/chips
  const [loadingData, setLoadingData] = useState(false); // Loading for nutrient-specific data
  const [error, setError] = useState(null);
  const [selectedNutrient, setSelectedNutrient] = useState('calories'); // Default selection
  const [trackedNutrientsList, setTrackedNutrientsList] = useState([]); // For selector chips
  const [averageData, setAverageData] = useState(null); // Holds { today: { value, percent }, weeklyAvg: { value, percent }, monthlyAvg: { value, percent } }
  const [chartData, setChartData] = useState(null); // Weekly chart
  const [monthlyChartData, setMonthlyChartData] = useState(null); // Monthly chart
  const [nutrientGoal, setNutrientGoal] = useState(null); // Will hold { target_value, goal_type }
  const [rawDailyTotals, setRawDailyTotals] = useState([]); // Store the fetched daily totals

  // --- Fetch tracked nutrients for the selector --- 
  const loadTrackedNutrients = useCallback(async () => {
    if (!user) {
        setTrackedNutrientsList([]);
        setLoadingGoals(false);
        setLoading(false); // Also stop overall initial load if no user
        return;
    }
    setLoadingGoals(true);
    setError(null); // Clear previous errors
    try {
        const { data: goalsData, error: goalsError } = await fetchUserGoals(user.id);
        if (goalsError) throw goalsError;

        const nutrients = goalsData
            .map(goal => {
                const details = getNutrientDetails(goal.nutrient);
                return details ? { key: details.key, name: details.name, unit: details.unit } : null;
            })
            .filter(Boolean); // Remove nulls if details not found

        setTrackedNutrientsList(nutrients);

        // Ensure default selection exists or pick first
        if (!nutrients.some(n => n.key === selectedNutrient) && nutrients.length > 0) {
            setSelectedNutrient(nutrients[0].key);
        }
        if (nutrients.length === 0) {
             setError("No nutrients are currently being tracked. Please set goals in Settings.");
        }

    } catch (err) {
        console.error("Error fetching tracked nutrients:", err);
        setError(`Failed to load tracked nutrients: ${err.message}`);
        setTrackedNutrientsList([]);
    } finally {
        setLoadingGoals(false);
        setLoading(false); // Stop initial overall loading here
    }
  }, [user, selectedNutrient]); // Rerun if user changes

  useEffect(() => {
    loadTrackedNutrients();
  }, [loadTrackedNutrients]); // Load tracked nutrients on mount/user change

  // --- Fetch data when selectedNutrient changes --- 
  useEffect(() => {
    if (!user || !selectedNutrient || trackedNutrientsList.length === 0) {
        setLoadingData(false); // Ensure loading stops if prerequisites aren't met
        return;
    }

    const fetchDataForNutrient = async () => {
        console.log(`Fetching data for: ${selectedNutrient}`);
        setLoadingData(true);
        setError(null); // Clear previous specific errors
        setNutrientGoal(null);
        setRawDailyTotals([]);
        setAverageData(null); // Clear old data
        setChartData(null);
        setMonthlyChartData(null);

        try {
            // 1. Fetch Goal details
            const { data: goalsData, error: goalsError } = await fetchUserGoals(user.id);
            if (goalsError) throw new Error(`Failed to fetch goal details: ${goalsError.message}`);
            
            const goal = goalsData.find(g => g.nutrient === selectedNutrient);
            const currentGoal = { // Store fetched goal details directly for immediate use
                target_value: goal?.target_value || 0,
                goal_type: goal?.goal_type || 'goal'
            };
            console.log("Using goal:", currentGoal);
            setNutrientGoal(currentGoal); // Also update state for potential future use

            // --- Use currentGoal.target_value directly for calculations below --- 
            const targetValue = currentGoal.target_value;

            // 2. Fetch Daily Totals
            const endDate = new Date();
            const startDate = getPastDate(29); // 30 days including today
            const formattedStartDate = formatDate(startDate);
            const formattedEndDate = formatDate(endDate);

            const { data: totalsData, error: totalsError } = await fetchDailyNutrientTotals(
                user.id,
                selectedNutrient,
                formattedStartDate,
                formattedEndDate
            );

            if (totalsError) throw totalsError;

            console.log("Fetched daily totals:", totalsData);
            setRawDailyTotals(totalsData);

            // --- Step 7 (Revised): Calculate Averages --- 
            let calculatedAverages = {
                today: { value: 0, percent: 0 },
                weeklyAvg: { value: 0, percent: 0 },
                monthlyAvg: { value: 0, percent: 0 },
            };

            if (totalsData && totalsData.length > 0) {
                // Today's Total
                const todayTotal = totalsData[totalsData.length - 1].total;
                calculatedAverages.today.value = todayTotal;
                calculatedAverages.today.percent = targetValue > 0 ? (todayTotal / targetValue) * 100 : 0;

                // Weekly Average (Last 7 days)
                const last7Days = totalsData.slice(-7);
                const weeklySum = last7Days.reduce((sum, day) => sum + day.total, 0);
                const weeklyAvg = last7Days.length > 0 ? weeklySum / last7Days.length : 0;
                calculatedAverages.weeklyAvg.value = weeklyAvg;
                calculatedAverages.weeklyAvg.percent = targetValue > 0 ? (weeklyAvg / targetValue) * 100 : 0;

                // Monthly Average (Last 30 days)
                const monthlySum = totalsData.reduce((sum, day) => sum + day.total, 0);
                const monthlyAvg = totalsData.length > 0 ? monthlySum / totalsData.length : 0;
                calculatedAverages.monthlyAvg.value = monthlyAvg;
                calculatedAverages.monthlyAvg.percent = targetValue > 0 ? (monthlyAvg / targetValue) * 100 : 0;
            }
            console.log("Calculated Averages (Revised):", calculatedAverages);
            setAverageData(calculatedAverages);

            // --- Step 10 (Revised): Prepare Chart Data --- 
            let formattedWeeklyChartData = null;
            let formattedMonthlyChartData = null;
            
            if (totalsData && totalsData.length > 0) {
                // Weekly Chart (Last 7 days)
                const last7DaysData = totalsData.slice(-7);
                const weeklyLabels = last7DaysData.map(d => getDayAbbreviation(d.day));
                const weeklyActualData = last7DaysData.map(d => d.total);
                const weeklyGoalData = Array(last7DaysData.length).fill(targetValue);
                formattedWeeklyChartData = {
                    labels: weeklyLabels,
                    datasets: [
                        { data: weeklyActualData, color: (opacity = 1) => theme.colors.primary, strokeWidth: 2 },
                        { data: weeklyGoalData, color: (opacity = 1) => theme.colors.error, strokeWidth: 1, withDots: false }
                    ],
                    legend: ["Actual", "Goal"]
                };

                // Monthly Chart (Last 30 days)
                // Generate simple numeric labels or week labels for monthly chart
                const monthlyLabels = totalsData.map((_, index) => `${index + 1}`); // Simple day number 1-30
                const monthlyActualData = totalsData.map(d => d.total);
                const monthlyGoalData = Array(totalsData.length).fill(targetValue);
                formattedMonthlyChartData = {
                    labels: monthlyLabels,
                    datasets: [
                        { data: monthlyActualData, color: (opacity = 1) => theme.colors.primary, strokeWidth: 2 },
                        { data: monthlyGoalData, color: (opacity = 1) => theme.colors.error, strokeWidth: 1, withDots: false }
                    ],
                    legend: ["Actual", "Goal"] // Optional legend for monthly too
                };
            }
            console.log("Formatted Weekly Chart Data:", formattedWeeklyChartData);
            setChartData(formattedWeeklyChartData);
            console.log("Formatted Monthly Chart Data:", formattedMonthlyChartData);
            setMonthlyChartData(formattedMonthlyChartData); // Set monthly chart data

        } catch (err) {
            console.error(`Error fetching data for ${selectedNutrient}:`, err);
            setError(`Failed to load data: ${err.message}`);
            // Clear potentially partial data
            setNutrientGoal(null);
            setRawDailyTotals([]);
            setAverageData(null);
            setChartData(null);
            setMonthlyChartData(null);
        } finally {
            setLoadingData(false);
        }
    };

    fetchDataForNutrient();

  }, [selectedNutrient, user, trackedNutrientsList]); // Depend on trackedNutrientsList ensure it's loaded first

  // --- Render Logic ---
  if (loading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator animating={true} size="large" color={theme.colors.primary} />
        <Text style={{ marginTop: 10, color: theme.colors.textSecondary }}>Loading Analytics...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.colors.background }]}>
        <Text style={{ color: theme.colors.error }}>Error: {error}</Text>
        {/* Optional: Add a retry button */}
      </View>
    );
  }

  // Helper function to get nutrient unit
  const getSelectedNutrientUnit = () => {
      const nutrient = trackedNutrientsList.find(n => n.key === selectedNutrient);
      return nutrient?.unit || '';
  }
  const getSelectedNutrientName = () => {
      const nutrient = trackedNutrientsList.find(n => n.key === selectedNutrient);
      return nutrient?.name || selectedNutrient;
  }

  // Chart configuration
  const chartConfig = {
      backgroundColor: theme.colors.surface,
      backgroundGradientFrom: theme.colors.surface,
      backgroundGradientTo: theme.colors.surface,
      decimalPlaces: 0,
      color: (opacity = 1) => theme.colors.onSurfaceVariant,
      labelColor: (opacity = 1) => theme.colors.onSurfaceVariant,
      style: {
          // Remove borderRadius from chart config style
      },
      propsForDots: {
          r: "4",
          strokeWidth: "1",
          stroke: theme.colors.primary,
      },
      propsForBackgroundLines: {
          strokeDasharray: "",
          stroke: theme.colors.outlineVariant,
          strokeWidth: StyleSheet.hairlineWidth,
      },
  };

  return (
    <ScrollView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        contentContainerStyle={styles.contentContainer}
    >
      <Title style={[styles.title, { color: theme.colors.primary }]}>Nutrition Averages</Title>

      {/* --- Nutrient Selector (Dropdown) --- */}
      <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <Card.Content>
            <Text style={[styles.sectionLabel, { color: theme.colors.textSecondary }]}>Select Nutrient</Text>
            {loadingGoals ? (
                 <ActivityIndicator animating={true} color={theme.colors.primary} style={{marginVertical: 10}} />
            ) : (
                <View style={[styles.pickerContainer, { borderColor: theme.colors.outline }]}>
                  <Picker
                    selectedValue={selectedNutrient}
                    onValueChange={(itemValue, itemIndex) =>
                      setSelectedNutrient(itemValue)
                    }
                    style={styles.picker}
                    dropdownIconColor={theme.colors.primary}
                  >
                    {trackedNutrientsList.map((nutrient) => (
                      <Picker.Item key={nutrient.key} label={nutrient.name} value={nutrient.key} />
                    ))}
                  </Picker>
                </View>
            )}
            {/* Display error specifically related to goal fetching if it occurred */}
            {!loadingGoals && error && trackedNutrientsList.length === 0 && (
                <Text style={{ color: theme.colors.error, marginTop: 10 }}>{error}</Text>
            )}
        </Card.Content>
      </Card>

      {/* --- Averages & Chart Area (conditionally render based on loadingData) --- */} 
      {loadingData ? (
        <View style={styles.centeredContent}>
            <ActivityIndicator animating={true} size="large" color={theme.colors.primary} />
            <Text style={{ marginTop: 10, color: theme.colors.textSecondary }}>Loading {selectedNutrient} data...</Text>
        </View>
      ) : error ? (
         // Handle errors during data fetch for selected nutrient
         <View style={styles.centeredContent}>
             <Text style={{ color: theme.colors.error }}>Error: {error}</Text>
         </View>
      ) : averageData && nutrientGoal && chartData && monthlyChartData ? ( // Ensure data is loaded before rendering
        <>
          {/* --- Average Cards (Updated Titles) --- */}
          <View style={styles.averagesContainer}>
             {/* Today Card */}
             <Card style={[styles.averageCard, { backgroundColor: theme.colors.surface }]}>
                 <Card.Content style={styles.averageCardContent}>
                    <Text style={styles.averageTitle}>Today</Text>
                    <Text style={styles.averageValue}>
                         {averageData.today.value.toFixed(0)} <Caption>{getSelectedNutrientUnit()}</Caption>
                    </Text>
                    <ProgressBar 
                        progress={averageData.today.percent / 100}
                        color={getColorForPercent(averageData.today.percent, nutrientGoal.goal_type, theme)}
                        style={styles.averageProgressBar} 
                    />
                    <Caption style={styles.averagePercentText}>
                        {averageData.today.percent.toFixed(0)}% of goal
                    </Caption>
                 </Card.Content>
             </Card>
             {/* Weekly Average Card */}
             <Card style={[styles.averageCard, { backgroundColor: theme.colors.surface }]}>
                 <Card.Content style={styles.averageCardContent}>
                     <Text style={styles.averageTitle}>Weekly Avg</Text>
                     <Text style={styles.averageValue}>
                         {averageData.weeklyAvg.value.toFixed(0)} <Caption>{getSelectedNutrientUnit()}</Caption>
                     </Text>
                     <ProgressBar 
                         progress={averageData.weeklyAvg.percent / 100}
                         color={getColorForPercent(averageData.weeklyAvg.percent, nutrientGoal.goal_type, theme)}
                         style={styles.averageProgressBar} 
                     />
                     <Caption style={styles.averagePercentText}>
                         {averageData.weeklyAvg.percent.toFixed(0)}% of goal
                     </Caption>
                 </Card.Content>
             </Card>
             {/* Monthly Average Card */}
             <Card style={[styles.averageCard, { backgroundColor: theme.colors.surface }]}>
                 <Card.Content style={styles.averageCardContent}>
                     <Text style={styles.averageTitle}>Monthly Avg</Text>
                     <Text style={styles.averageValue}>
                         {averageData.monthlyAvg.value.toFixed(0)} <Caption>{getSelectedNutrientUnit()}</Caption>
                     </Text>
                     <ProgressBar 
                         progress={averageData.monthlyAvg.percent / 100}
                         color={getColorForPercent(averageData.monthlyAvg.percent, nutrientGoal.goal_type, theme)}
                         style={styles.averageProgressBar} 
                     />
                     <Caption style={styles.averagePercentText}>
                         {averageData.monthlyAvg.percent.toFixed(0)}% of goal
                     </Caption>
                 </Card.Content>
             </Card>
          </View>

          {/* --- Weekly Chart --- */} 
          <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
            <Card.Content style={styles.chartCardContent}>
                <Text style={styles.chartTitle}>
                    {getSelectedNutrientName()} ({getSelectedNutrientUnit()}) - Last 7 Days
                </Text>
                <LineChart
                    data={chartData}
                    width={screenWidth - 48}
                    height={220}
                    chartConfig={chartConfig}
                    bezier
                    style={styles.chart}
                    yAxisInterval={1}
                />
            </Card.Content>
          </Card>

          {/* --- Monthly Chart --- */} 
          <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
            <Card.Content style={styles.chartCardContent}>
                <Text style={styles.chartTitle}>
                    {getSelectedNutrientName()} ({getSelectedNutrientUnit()}) - Last 30 Days
                </Text>
                <LineChart
                    data={monthlyChartData}
                    width={screenWidth - 48}
                    height={220}
                    chartConfig={chartConfig}
                    bezier
                    style={styles.chart}
                    yAxisInterval={1}
                    formatXLabel={() => ""}
                />
            </Card.Content>
          </Card>
        </>
      ) : (
          // Handle case where data might be missing even if not loading/error
          <View style={styles.centeredContent}>
             <Text style={{ color: theme.colors.textSecondary }}>No data to display for {selectedNutrient}.</Text>
          </View>
      )}

    </ScrollView>
  );
};

// Helper function for progress bar color logic
const getColorForPercent = (percent, goalType, theme) => {
    if (goalType === 'limit' && percent > 100) {
        return theme.colors.error;
    }
    // For goals, or limits under 100%, use primary color
    return theme.colors.primary; 
    // Could add more sophisticated color scaling here if desired
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 15,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    marginBottom: 15,
    marginLeft: 8, // Align with card margins
  },
  card: {
    marginBottom: 20,
    elevation: 1,
    borderRadius: 6,
    marginHorizontal: 8,
  },
  sectionLabel: {
      fontSize: 14,
      marginBottom: 5, // Reduce margin for Picker
      fontWeight: '500',
  },
  pickerContainer: {
    borderWidth: 1,
    borderRadius: 4,
    marginBottom: 10,
    overflow: 'hidden',
  },
  picker: {
    height: 50, 
    width: '100%',
    // backgroundColor: theme.colors.surfaceVariant, // Optional background
    // color: theme.colors.onSurface, // Optional text color
  },
  averagesContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between', // Use space-between for even spacing
      marginBottom: 20,
      marginHorizontal: 0, // No horizontal margin needed if cards handle it
      gap: 10, // Add gap between cards
  },
  averageCard: {
      flex: 1, // Allow cards to take equal space
      elevation: 1,
      borderRadius: 6,
      // No marginHorizontal here, handled by container gap
  },
  averageCardContent: {
      alignItems: 'center', // Center content horizontally
      paddingHorizontal: 8, // Inner padding
      paddingVertical: 12,
  },
  averageTitle: {
      fontSize: 14,
      fontWeight: '600',
      marginBottom: 4,
      // color: theme.colors.textSecondary // Apply theme dynamically if needed
  },
  averageValue: {
      fontSize: 20,
      fontWeight: 'bold',
      marginBottom: 8,
      // color: theme.colors.text // Apply theme dynamically
  },
  averageProgressBar: {
      height: 8,
      width: '100%', // Take full width of card content
      borderRadius: 4,
      marginBottom: 6,
  },
  averagePercentText: {
      fontSize: 12,
      // color: theme.colors.textSecondary // Apply theme dynamically
  },
  centeredContent: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 40,
  },
  chartCardContent: {
      paddingHorizontal: 0,
      overflow: 'hidden',
      borderRadius: 6,
      alignItems: 'center', // Restore centering
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 10, // Add margin back since Card.Content padding removed
    marginBottom: 5,
    textAlign: 'center',
  },
  chart: {
     marginVertical: 0,
  },
  // Add more styles as needed for Chips, Average Cards, Chart
});

export default AnalyticsScreen;
