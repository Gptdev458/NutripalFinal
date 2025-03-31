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
  IconButton
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAuth } from '../context/AuthContext';
import { fetchFoodLogsByDateRange, fetchUserGoals } from '../utils/logUtils';
import { getNutrientDetails, MASTER_NUTRIENT_LIST } from '../constants/nutrients';
import { Colors } from '../constants/colors';

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
    setShowDatePicker(Platform.OS === 'ios'); // Keep visible on iOS until dismissed
    if (newDate) {
      // Prevent selecting future dates if desired
      const today = new Date();
      today.setHours(23, 59, 59, 999); // End of today
      if (newDate <= today) {
          setSelectedDate(newDate);
      } else {
          // Optionally alert the user they can't select future dates
          console.log("Cannot select future dates");
      }
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
     let progressBarColor = Colors.accent;
     if (current > target && target > 0) {
         progressBarColor = Colors.warning;
     }

     return (
         <Card key={goal.id} style={styles.summaryCard}>
             <Card.Content>
                 <Title style={styles.summaryCardTitle}>{name}</Title>
                 <ProgressBar progress={progress} color={progressBarColor} style={styles.progressBar} />
                 <View style={styles.progressTextContainer}>
                     <Text style={styles.progressText}>{`${current.toFixed(0)} / ${target.toFixed(0)} ${unit}`}</Text>
                     <Text style={styles.progressPercentageText}>{`${progressPercentage}%`}</Text>
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
      // Wrap List.Item in TouchableOpacity
      <TouchableOpacity onPress={() => handleHistoryItemPress(item)}>
        <List.Item
          title={item.food_name || 'Unnamed Item'}
          description={`${timeString}${primaryNutrient ? ` - ${primaryNutrient}` : ''}`}
          titleStyle={styles.logItemTitle}
          descriptionStyle={styles.logItemDescription}
          style={styles.logItem}
          left={props => <List.Icon {...props} icon="food-variant" />}
          // Optionally add a visual indicator like a chevron
          right={props => <List.Icon {...props} icon="chevron-right" />}
        />
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Date Navigation Header */}
        <View style={styles.dateHeader}>
          {/* Previous Day Arrow */}
          <IconButton
            icon="chevron-left"
            size={28}
            onPress={() => handleDateArrowChange(-1)}
            color={Colors.primary}
          />

          {/* Date Picker Trigger Button */}
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

          {/* Next Day Arrow */}
          <IconButton
            icon="chevron-right"
            size={28}
            onPress={() => handleDateArrowChange(1)}
            disabled={isTodayOrFuture(selectedDate)}
            color={isTodayOrFuture(selectedDate) ? Colors.disabled : Colors.primary}
          />
        </View>

        {/* Date Picker Modal */}
        {showDatePicker && (
          <DateTimePicker
            value={selectedDate}
            mode="date"
            display="default" // Or "spinner"
            onChange={onDateChange}
            maximumDate={new Date()} // Prevent selecting future dates
          />
        )}

        {/* Loading State */}
        {isLoading && (
          <View style={styles.centered}>
            <ActivityIndicator animating={true} size="large" color={Colors.accent} />
            <Text style={styles.loadingText}>Loading history...</Text>
          </View>
        )}

        {/* Error State */}
        {!isLoading && error && (
          <View style={styles.centered}>
            <Text style={styles.errorText}>{error}</Text>
            <Button mode="contained" onPress={fetchHistoryData}>Retry</Button>
          </View>
        )}

        {/* Content Area */}
        {!isLoading && !error && (
          <FlatList
            data={historicalLog}
            keyExtractor={(item) => `log-${item.id}`}
            renderItem={renderLogListItem}
            ListHeaderComponent={
                <>
                    {/* Summary Section */}
                    <View style={styles.sectionHeader}>
                        <Subheading style={styles.sectionTitle}>Summary vs Goals</Subheading>
                    </View>
                    {historicalGoals.length > 0 ? (
                        historicalGoals.map(renderSummaryItem)
                    ) : (
                        <Text style={styles.emptyText}>No goals set to compare against.</Text>
                    )}
                    <Divider style={styles.divider} />
                     {/* Log List Section */}
                    <View style={styles.sectionHeader}>
                        <Subheading style={styles.sectionTitle}>Logged Items</Subheading>
                    </View>
                </>
            }
            ListEmptyComponent={
                <Text style={styles.emptyText}>No food logged on this date.</Text>
            }
            ItemSeparatorComponent={() => <Divider style={styles.logItemDivider} />}
            contentContainerStyle={styles.listContentContainer}
          />
        )}
      </View>

      {/* History Item Details Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isHistoryModalVisible}
        onRequestClose={handleCloseHistoryModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView>
              {selectedHistoryItem && (
                <>
                  <Title style={styles.modalTitle}>{selectedHistoryItem.food_name || 'Log Details'}</Title>
                  <Divider style={styles.modalDivider} />

                  {/* Display Nutrient Details */}
                  {MASTER_NUTRIENT_LIST.map(nutrient => {
                    const value = selectedHistoryItem[nutrient.key];
                    // Only display if value exists and is a number or non-empty string
                    if (value !== null && value !== undefined && value !== '') {
                      const details = getNutrientDetails(nutrient.key);
                      return (
                        <View key={nutrient.key} style={styles.nutrientRow}>
                          <Text style={styles.nutrientName}>{details?.name || nutrient.key}:</Text>
                          <Text style={styles.nutrientValue}>
                            {typeof value === 'number' ? Math.round(value * 10) / 10 : value} {details?.unit || ''}
                          </Text>
                        </View>
                      );
                    }
                    return null; // Don't render if nutrient value is missing/null
                  })}
                   <Divider style={styles.modalDivider} />
                   <Caption style={styles.modalTimestamp}>
                     Logged at: {new Date(selectedHistoryItem.timestamp).toLocaleString('en-US', {
                       dateStyle: 'medium',
                       timeStyle: 'short',
                     })}
                   </Caption>
                </>
              )}
            </ScrollView>
            <Button mode="contained" onPress={handleCloseHistoryModal} style={styles.modalCloseButton}>
              Close
            </Button>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    flex: 1,
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
  errorText: {
    color: Colors.error,
    textAlign: 'center',
    marginBottom: 15,
    fontSize: 16,
  },
  dateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 5,
    marginVertical: 10,
  },
  dateButton: {
    flexShrink: 1,
    borderColor: Colors.grey,
    borderWidth: 1,
  },
  dateButtonContent: {
    paddingHorizontal: 8,
  },
  dateButtonLabel: {
    fontSize: 14,
  },
  sectionHeader: {
    paddingHorizontal: 15,
    paddingTop: 20,
    paddingBottom: 10,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.primary,
  },
  summaryCard: {
      marginBottom: 12,
      marginHorizontal: 15,
      elevation: 1,
  },
  summaryCardTitle: {
      fontSize: 16,
      fontWeight: '500',
      marginBottom: 8,
      color: Colors.primary,
  },
  progressBar: {
      height: 8,
      borderRadius: 4,
      marginBottom: 8,
  },
  progressTextContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 4,
  },
  progressText: {
      fontSize: 13,
      color: Colors.primary,
  },
  progressPercentageText: {
      fontSize: 13,
      color: Colors.grey,
  },
  divider: {
      marginVertical: 15,
      marginHorizontal: 15,
  },
  logItem: {
    paddingHorizontal: 15,
    backgroundColor: Colors.background, // Ensure background consistency
  },
  logItemTitle: {
    fontSize: 16,
    color: Colors.primary,
  },
  logItemDescription: {
    fontSize: 14,
    color: Colors.grey,
  },
   logItemDivider: {
      marginHorizontal: 15,
   },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 10,
    color: Colors.grey,
    paddingHorizontal: 15,
  },
  listContentContainer: {
    paddingBottom: 20,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    width: '90%',
    maxHeight: '80%',
    backgroundColor: Colors.background,
    borderRadius: 10,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
    color: Colors.primary,
  },
  modalDivider: {
    marginVertical: 10,
  },
  nutrientRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  nutrientName: {
    fontSize: 16,
    color: Colors.text,
    fontWeight: '500',
  },
  nutrientValue: {
    fontSize: 16,
    color: Colors.textSecondary,
  },
  modalTimestamp: {
      textAlign: 'center',
      marginTop: 10,
      color: Colors.textSecondary,
      fontSize: 13,
  },
  modalCloseButton: {
    marginTop: 20,
    backgroundColor: Colors.primary, // Use primary or accent based on theme intention
  },
});

export default HistoryScreen; 