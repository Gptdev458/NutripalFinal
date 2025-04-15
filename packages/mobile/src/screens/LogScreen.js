import React, { useState, useEffect, useCallback } from 'react';
import { View, FlatList, StyleSheet, ActivityIndicator, Alert, TouchableOpacity, ScrollView } from 'react-native';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { fetchFoodLogsByDateRange, deleteFoodLogEntry, fetchUserGoals } from '../utils/logUtils';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Paragraph, Button as PaperButton, List, Divider, IconButton, Text, Portal, Dialog } from 'react-native-paper';
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

const LogScreen = () => {
  const theme = useSafeTheme();
  const route = useRoute();
  const navigation = useNavigation();
  const { user } = useAuth();

  // Get date from route params or default to today
  const initialDate = route.params?.date ? new Date(route.params.date) : new Date();
  const [currentDate, setCurrentDate] = useState(initialDate);

  const [logEntries, setLogEntries] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [selectedLogItem, setSelectedLogItem] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [userGoals, setUserGoals] = useState([]);

  // Fetch logs and goals for the current date
  const fetchLogsAndGoals = useCallback(async () => {
    if (!user) {
        setIsLoading(false);
        setError('User not authenticated.');
        return;
    }
    if (!currentDate) {
        setIsLoading(false);
        setError('Date not selected.');
        return;
    }

    setIsLoading(true);
    setError(null); // Clear previous errors
    setLogEntries([]); // Clear previous logs
    setUserGoals([]); // Clear previous goals

    try {
      const dateString = formatDate(currentDate);
      // Fetch logs and goals concurrently
      const [logsResponse, goalsResponse] = await Promise.all([
        fetchFoodLogsByDateRange(user.id, dateString, dateString),
        fetchUserGoals(user.id)
      ]);

      if (logsResponse.error) {
        throw new Error(`Failed to load logs: ${logsResponse.error.message}`);
      }
       if (goalsResponse.error) {
           // Don't throw, but log the error and proceed without goals
           console.warn(`Failed to fetch goals: ${goalsResponse.error.message}`);
           setError(prev => prev ? `${prev}\nFailed to load goals.` : 'Failed to load goals.');
       }

      setLogEntries(logsResponse.data || []);
      setUserGoals(goalsResponse.data || []); // Set goals, even if empty

    } catch (err) {
      console.error("Error fetching data:", err);
      setError(err.message); // Use the combined error message
      Alert.alert('Error', err.message);
    } finally {
      setIsLoading(false);
    }
  }, [user, currentDate]);

  // Use useFocusEffect to refetch when the screen comes into focus
  useFocusEffect(
    useCallback(() => {
      console.log('LogScreen focused, fetching data...');
      fetchLogsAndGoals(); // Use the combined fetch function
      navigation.setOptions({ title: `Log for ${formatDate(currentDate)}` });
    }, [fetchLogsAndGoals, navigation, currentDate, theme.colors.primary]) // Dependencies for focus effect
  );

  // Function to handle changing the date
  const handleDateChange = (daysToAdd) => {
    setCurrentDate(prevDate => {
      const newDate = new Date(prevDate);
      newDate.setDate(newDate.getDate() + daysToAdd);
      return newDate;
    });
    // The useEffect watching currentDate will trigger fetchLogs
  };

  // Function to handle pressing a log item
  const handleLogItemPress = (item) => {
    console.log('Item passed to modal:', JSON.stringify(item, null, 2));
    setSelectedLogItem(item);
    setIsModalVisible(true);
  };

  // Function to close the modal
  const handleCloseModal = () => {
    setIsModalVisible(false);
    setSelectedLogItem(null);
    setIsDeleting(false);
  };

  // Function to handle deleting the selected log item
  const handleDeletePress = async () => {
    if (!selectedLogItem || isDeleting) return;

    Alert.alert(
      'Confirm Delete',
      `Are you sure you want to delete "${selectedLogItem.food_name || 'this entry'}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true);
            try {
              const { error: deleteError } = await deleteFoodLogEntry(selectedLogItem.id);

              if (deleteError) {
                throw deleteError;
              }

              setLogEntries(prevEntries => prevEntries.filter(entry => entry.id !== selectedLogItem.id));
              Alert.alert('Success', 'Log entry deleted successfully.');
              handleCloseModal();

            } catch (err) {
              console.error('Error deleting log entry:', err);
              Alert.alert('Error', `Failed to delete log entry: ${err.message}`);
            } finally {
              if (isModalVisible) {
                setIsDeleting(false);
              }
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  // Render individual log item
  const renderLogItem = ({ item }) => {
    const timestamp = new Date(item.timestamp);
    const timeString = timestamp.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    const primaryNutrient = item.calories ? `${Math.round(item.calories)} kcal` : '';

    return (
      <TouchableOpacity onPress={() => handleLogItemPress(item)}>
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

  const renderNutrientDetail = (nutrientKey) => {
    if (!selectedLogItem || selectedLogItem[nutrientKey] === null || selectedLogItem[nutrientKey] === undefined) {
      return null; // Don't render if data is missing
    }
    const nutrientInfo = getNutrientDetails(nutrientKey);
    const value = selectedLogItem[nutrientKey];
    const displayValue = typeof value === 'number' ? value.toFixed(1) : value;
    const displayUnit = nutrientInfo?.unit || '';

    return (
      <View key={nutrientKey} style={styles.nutrientRow}>
        <Text style={[styles.nutrientName, { color: theme.colors.text }]}>{nutrientInfo?.name || nutrientKey}:</Text>
        <Text style={[styles.nutrientValue, { color: theme.colors.textSecondary }]}>{`${displayValue} ${displayUnit}`}</Text>
      </View>
    );
  };

  const renderEmptyListComponent = () => (
    <View style={styles.centered}>
      <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>No food logged on this date.</Text>
    </View>
  );

  const renderLogDetailDialog = () => (
    <Portal>
      <Dialog visible={isModalVisible} onDismiss={handleCloseModal} style={{ borderRadius: 8 }}>
        <Dialog.Title style={{ color: theme.colors.primary }}>
          {selectedLogItem?.food_name || 'Log Details'}
        </Dialog.Title>
        <Dialog.Content>
          <ScrollView>
            {selectedLogItem && (
              <>
                <Text variant="bodySmall" style={{ color: theme.colors.textSecondary, marginBottom: 16 }}>
                  Logged at: {new Date(selectedLogItem.timestamp).toLocaleString()}
                </Text>
                <Divider style={{ marginBottom: 16 }} />
                {/* Iterate through tracked goals and display if present in the log item */}
                {userGoals.length > 0 ? (
                  userGoals.map(goal => renderNutrientDetail(goal.nutrient))
                ) : (
                   // Show all nutrients if no goals are set, or a message?
                   // For now, let's show a message if no goals are tracked.
                   <Text style={{ color: theme.colors.textSecondary, textAlign: 'center' }}>
                       No nutrient goals are currently being tracked. Set goals in Settings to see them here.
                   </Text>
                   // Alternatively, show all nutrients if no goals are set:
                   // MASTER_NUTRIENT_LIST.map(item => renderNutrientDetail(item.key))
                )}
              </>
            )}
          </ScrollView>
        </Dialog.Content>
        <Dialog.Actions style={styles.dialogActions}>
          <PaperButton
            onPress={handleDeletePress}
            disabled={isDeleting}
            loading={isDeleting}
            textColor={theme.colors.error}
            style={styles.deleteButton}
          >
            Delete
          </PaperButton>
          <PaperButton onPress={handleCloseModal} style={styles.closeButton}>Close</PaperButton>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }]}>
      <View style={styles.container}>
        {/* Date Navigation Header */}
        <View style={styles.dateHeader}>
          <IconButton
            icon="chevron-left"
            size={28}
            onPress={() => handleDateChange(-1)}
            iconColor={theme.colors.primary}
          />
          <Text variant="titleLarge" style={[styles.title, { color: theme.colors.primary }]}>
            {currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </Text>
          <IconButton
            icon="chevron-right"
            size={28}
            onPress={() => handleDateChange(1)}
            disabled={isTodayOrFuture(currentDate)}
            iconColor={isTodayOrFuture(currentDate) ? theme.colors.disabled : theme.colors.primary}
          />
        </View>

        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator animating={true} size="large" color={theme.colors.primary} />
            <Text style={[styles.loadingText, { color: theme.colors.textSecondary }]}>Loading logs...</Text>
          </View>
        ) : error ? (
          <View style={styles.centered}>
            <Text style={[styles.errorText, { color: theme.colors.error }]}>{error}</Text>
            <PaperButton mode="contained" onPress={fetchLogsAndGoals}>Retry</PaperButton>
          </View>
        ) : (
          <FlatList
            data={logEntries}
            renderItem={renderLogItem}
            keyExtractor={(item) => `log-${item.id}`}
            ListEmptyComponent={renderEmptyListComponent}
            ItemSeparatorComponent={() => <Divider style={styles.divider} />}
            contentContainerStyle={logEntries.length === 0 ? styles.centered : styles.listContentContainer}
          />
        )}
      </View>

      {renderLogDetailDialog()}
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
  dateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 15,
    paddingHorizontal: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  title: {
    textAlign: 'center',
    flexShrink: 1,
    marginHorizontal: 5,
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
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 10,
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
  },
  listContentContainer: {
    paddingBottom: 20,
  },
  logItem: {
    borderRadius: 8,
    marginVertical: 5,
    elevation: 1,
    paddingVertical: 5,
    marginHorizontal: 16,
  },
  logItemTitle: {
    fontWeight: 'bold',
  },
  logItemDescription: {
  },
  divider: {
    marginHorizontal: 16,
  },
  nutrientRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  nutrientName: {
    fontSize: 16,
    fontWeight: '500',
  },
  nutrientValue: {
  },
  dialogActions: {
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  deleteButton: {
  },
  closeButton: {
  },
});

export default LogScreen; 