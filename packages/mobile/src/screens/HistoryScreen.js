import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Platform, FlatList, TouchableOpacity, Modal, ScrollView } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Text,
  Title,
  Subheading,
  List,
  Card,
  ProgressBar,
  Divider,
  Caption,
  IconButton,
  Portal,
  Dialog,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAuth } from '../context/AuthContext';
import { fetchFoodLogsByDateRange, fetchUserGoals } from '../utils/logUtils';
import { getNutrientDetails, MASTER_NUTRIENT_LIST } from '../constants/nutrients';
import useSafeTheme from '../hooks/useSafeTheme';

// Helper function to format Date to 'YYYY-MM-DD'
const formatDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Helper function to check if a date is today or in the future
const isTodayOrFuture = (date) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Normalize today to the start of the day
  const compareDate = new Date(date);
  compareDate.setHours(0, 0, 0, 0); // Normalize the comparison date
  return compareDate >= today;
};

const HistoryScreen = ({ navigation }) => {
  const theme = useSafeTheme();
  const { user } = useAuth();
  const [selectedDate, setSelectedDate] = useState(new Date()); // Initialize to today
  const [historicalLog, setHistoricalLog] = useState([]);
  const [historicalGoals, setHistoricalGoals] = useState([]); // Store fetched goals
  const [historicalTotals, setHistoricalTotals] = useState({}); // Store calculated totals for the day
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Add state for the modal
  const [isHistoryModalVisible, setIsHistoryModalVisible] = useState(false);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState(null);

  // Fetch data when selectedDate or user changes
  const fetchHistoryData = useCallback(async () => {
    if (!user) {
        setIsLoading(false);
        return;
    }

    setIsLoading(true);
    setError(null);
    setHistoricalLog([]); // Clear previous logs
    setHistoricalGoals([]); // Clear previous goals
    setHistoricalTotals({}); // Clear previous totals

    try {
      const dateString = formatDate(selectedDate);

      // Fetch logs for the selected date and user goals concurrently
      const [logsResponse, goalsResponse] = await Promise.all([
        fetchFoodLogsByDateRange(user.id, dateString, dateString),
        fetchUserGoals(user.id), // Fetch current goals for comparison
      ]);

      // Handle errors
      if (logsResponse.error) throw new Error(`Logs fetch failed: ${logsResponse.error.message}`);
      if (goalsResponse.error) throw new Error(`Goals fetch failed: ${goalsResponse.error.message}`);

      const logsData = logsResponse.data || [];
      const goalsData = goalsResponse.data || [];

      setHistoricalLog(logsData);
      setHistoricalGoals(goalsData);

      // Calculate totals for nutrients that have goals
      const totals = {};
      goalsData.forEach(goal => {
        let currentIntake = 0;
        logsData.forEach(log => {
          const logValue = log[goal.nutrient];
          if (typeof logValue === 'number' && !isNaN(logValue)) {
            currentIntake += logValue;
          }
        });
        totals[goal.nutrient] = currentIntake;
      });
      setHistoricalTotals(totals);

    } catch (err) {
      console.error('Error fetching history data:', err);
      setError('Failed to load history data: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  }, [user, selectedDate]);

  useEffect(() => {
    fetchHistoryData();
  }, [fetchHistoryData]); // Depend on the memoized fetch function

  // --- Date Picker Handler ---
  const onDateChange = (event, newDate) => {
    const currentDate = newDate || selectedDate;
    setShowDatePicker(Platform.OS === 'ios');
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (currentDate <= today) {
        setSelectedDate(currentDate);
    } else {
        console.log("Cannot select future dates");
    }
  };

  // Function to handle changing the date via arrows
  const handleDateArrowChange = (daysToAdd) => {
    setSelectedDate(prevDate => {
      const newDate = new Date(prevDate);
      newDate.setDate(newDate.getDate() + daysToAdd);

      // Prevent navigating to future dates with arrows as well
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      if (newDate > today && daysToAdd > 0) {
          return prevDate; // Return original date if trying to go past today
      }

      return newDate;
    });
    // The useEffect watching selectedDate will trigger fetchHistoryData
  };

  // --- Render Functions ---

  const renderSummaryItem = (goal) => {
     const nutrientDetails = getNutrientDetails(goal.nutrient);
     const name = nutrientDetails?.name || goal.nutrient;
     const unit = nutrientDetails?.unit || goal.unit || '';
     const target = goal.target_value || 0;
     const current = historicalTotals[goal.nutrient] || 0;
     const progress = target > 0 ? Math.min(current / target, 1) : 0;
     const progressPercentage = (progress * 100).toFixed(0);
     let progressBarColor = theme.colors.primary;
     if (current > target && target > 0) {
         progressBarColor = theme.colors.warning;
     }

     return (
         <Card key={goal.id} style={[styles.summaryCard, { backgroundColor: theme.colors.surface }]} elevation={1}>
             <Card.Content>
                 <Text variant="titleMedium" style={[styles.summaryCardTitle, { color: theme.colors.text }]}>{name}</Text>
                 <ProgressBar progress={progress} color={progressBarColor} style={styles.progressBar} />
                 <View style={styles.progressTextContainer}>
                     <Text variant="bodySmall" style={[styles.progressText, { color: theme.colors.textSecondary }]}>{`${current.toFixed(0)} / ${target.toFixed(0)} ${unit}`}</Text>
                     <Text variant="bodySmall" style={[styles.progressPercentageText, { color: theme.colors.textSecondary }]}>{`${progressPercentage}%`}</Text>
                 </View>
             </Card.Content>
         </Card>
     );
  };

  // Function to handle pressing a history log item
  const handleHistoryItemPress = (item) => {
      setSelectedHistoryItem(item);
      setIsHistoryModalVisible(true);
  };

  // Function to close the history modal
  const handleCloseHistoryModal = () => {
      setIsHistoryModalVisible(false);
      setSelectedHistoryItem(null);
  };

  const renderLogListItem = ({ item }) => {
    const timestamp = new Date(item.timestamp);
    const timeString = timestamp.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    const primaryNutrient = item.calories ? `${Math.round(item.calories)} kcal` : '';

    return (
      <TouchableOpacity onPress={() => handleHistoryItemPress(item)}>
        <List.Item
          title={item.food_name || 'Unnamed Item'}
          description={`${timeString}${primaryNutrient ? ` - ${primaryNutrient}` : ''}`}
          titleStyle={[styles.logItemTitle, { color: theme.colors.text }]}
          descriptionStyle={[styles.logItemDescription, { color: theme.colors.textSecondary }]}
          style={styles.logItem}
          left={props => <List.Icon {...props} icon="food-variant" color={theme.colors.primary} />}
          right={props => <List.Icon {...props} icon="chevron-right" color={theme.colors.textSecondary} />}
        />
      </TouchableOpacity>
    );
  };

  const renderEmptyListComponent = () => (
    <View style={styles.emptyContainer}>
        <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>No logs found for this date.</Text>
    </View>
);

  // --- Loading and Error States using Theme --- 

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator animating={true} color={theme.colors.primary} size="large" />
      </SafeAreaView>
    );
  }

  // --- Modal using Theme --- 
  const renderHistoryModal = () => (
      <Portal>
        <Dialog 
            visible={isHistoryModalVisible} 
            onDismiss={handleCloseHistoryModal}
            style={{ borderRadius: 8 }}
        >
            <Dialog.Title style={{ color: theme.colors.primary }}>Log Details</Dialog.Title>
            <Dialog.Content>
                {selectedHistoryItem && (
                    <ScrollView>
                        <Text variant="titleMedium" style={{ color: theme.colors.text, marginBottom: 8 }}>{selectedHistoryItem.food_name || 'Unnamed Item'}</Text>
                        <Text variant="bodySmall" style={{ color: theme.colors.textSecondary, marginBottom: 16 }}>Logged at: {new Date(selectedHistoryItem.timestamp).toLocaleString()}</Text>
                        <Divider style={{ marginBottom: 16 }}/>

                        {/* Iterate through tracked goals and display if present in the log item */}
                        {historicalGoals.map(goal => {
                            const nutrientKey = goal.nutrient;
                            const value = selectedHistoryItem[nutrientKey];

                            // Check if this tracked nutrient exists and has a valid number value in the specific log item
                            if (value !== null && value !== undefined && typeof value === 'number') {
                                const nutrientDetails = getNutrientDetails(nutrientKey);
                                const displayValue = value.toFixed(1);
                                const displayName = nutrientDetails?.name || nutrientKey;
                                const displayUnit = nutrientDetails?.unit || '';

                                return (
                                    <View key={nutrientKey} style={styles.nutrientRow}>
                                        <Text style={{ color: theme.colors.text }}>{displayName}:</Text>
                                        <Text style={{ color: theme.colors.textSecondary }}>{`${displayValue} ${displayUnit}`}</Text>
                                    </View>
                                );
                            }
                            return null; // Don't render if the tracked nutrient isn't in this specific log
                        })}
                    </ScrollView>
                )}
            </Dialog.Content>
            <Dialog.Actions>
                <Button onPress={handleCloseHistoryModal}>Close</Button>
            </Dialog.Actions>
        </Dialog>
      </Portal>
  );

  // --- Main Render using Theme --- 

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }]}>
        <View style={styles.dateHeader}>
          <IconButton
            icon="chevron-left"
            size={28}
            onPress={() => handleDateArrowChange(-1)}
            iconColor={theme.colors.primary}
          />
          <Button
            icon="calendar"
            mode="outlined"
            onPress={() => setShowDatePicker(true)}
            style={styles.dateButton}
            labelStyle={styles.dateButtonLabel}
            contentStyle={styles.dateButtonContent}
          >
            {selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </Button>
          <IconButton
            icon="chevron-right"
            size={28}
            onPress={() => handleDateArrowChange(1)}
            disabled={isTodayOrFuture(selectedDate)}
            iconColor={isTodayOrFuture(selectedDate) ? theme.colors.disabled : theme.colors.primary}
          />
        </View>

        {showDatePicker && (
          <DateTimePicker
            value={selectedDate}
            mode="date"
            display="default"
            onChange={onDateChange}
            maximumDate={new Date()}
          />
        )}

        {error && <Text style={[styles.errorText, { color: theme.colors.error }]}>{error}</Text>}

        <ScrollView style={styles.scrollView}>
            <View style={styles.sectionContainer}>
                <Text variant="titleLarge" style={[styles.sectionTitle, { color: theme.colors.primary }]}>Daily Summary</Text>
                {historicalGoals.length > 0 ? (
                    historicalGoals.map(renderSummaryItem)
                ) : (
                    <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>No goals set for comparison.</Text>
                )}
            </View>

            <Divider style={styles.divider} />

            <View style={styles.sectionContainer}>
                <Text variant="titleLarge" style={[styles.sectionTitle, { color: theme.colors.primary }]}>Logged Items</Text>
                {historicalLog.length > 0 ? (
                    <FlatList
                        data={historicalLog}
                        renderItem={renderLogListItem}
                        keyExtractor={(item) => item.id.toString()}
                        scrollEnabled={false}
                    />
                ) : (
                    <View style={styles.emptyContainer}>
                        <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>No logs found for this date.</Text>
                    </View>
                )}
            </View>
        </ScrollView>

        {renderHistoryModal()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  dateButton: {
    borderRadius: 20,
  },
  dateButtonLabel: {
    fontSize: 16,
  },
  dateButtonContent: {
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  errorText: {
    margin: 16,
    textAlign: 'center',
  },
  scrollView: {
    flex: 1,
  },
  sectionContainer: {
      padding: 16,
  },
  sectionTitle: {
      marginBottom: 12,
  },
  summaryCard: {
    marginBottom: 12,
    borderRadius: 6,
  },
  summaryCardTitle: {
    marginBottom: 8,
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
    marginBottom: 4,
  },
  progressTextContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  progressText: {
  },
  progressPercentageText: {
  },
  logItem: {
      borderBottomWidth: 1,
      borderBottomColor: '#eee',
  },
  logItemTitle: {
  },
  logItemDescription: {
  },
  emptyContainer: {
    paddingVertical: 30,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
  },
  divider: {
      height: 1,
      marginVertical: 8,
  },
  nutrientRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 4,
  },
});

export default HistoryScreen; 