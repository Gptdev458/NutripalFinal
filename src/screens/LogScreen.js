import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, Alert, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { fetchFoodLogsByDateRange, deleteFoodLogEntry } from '../utils/logUtils';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Title, Paragraph, Button, List, Divider, IconButton, Subheading, Caption } from 'react-native-paper';
import { Colors } from '../constants/colors';
import { getNutrientDetails, MASTER_NUTRIENT_LIST } from '../constants/nutrients';

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

  // Fetch logs for the current date
  const fetchLogs = useCallback(async () => {
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

    try {
      const dateString = formatDate(currentDate);
      const { data, error: fetchError } = await fetchFoodLogsByDateRange(user.id, dateString, dateString);

      if (fetchError) {
        throw fetchError;
      }

      setLogEntries(data || []);
    } catch (err) {
      console.error("Error fetching log entries:", err);
      setError(`Failed to load logs: ${err.message}`);
      Alert.alert('Error', `Failed to load logs: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [user, currentDate]);

  // Fetch logs when the component mounts or currentDate changes
  useEffect(() => {
    fetchLogs();
    navigation.setOptions({ title: `Log for ${formatDate(currentDate)}` });
  }, [fetchLogs, navigation, currentDate]);

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
          titleStyle={styles.logItemTitle}
          descriptionStyle={styles.logItemDescription}
          style={styles.logItem}
          left={props => <List.Icon {...props} icon="food-variant" color={Colors.accent} />}
          right={props => <List.Icon {...props} icon="chevron-right" />}
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
    return (
      <View key={nutrientKey} style={styles.nutrientRow}>
        <Text style={styles.nutrientName}>{nutrientInfo?.name || nutrientKey}:</Text>
        <Text style={styles.nutrientValue}>
          {typeof value === 'number' ? value.toFixed(1) : value} {nutrientInfo?.unit || ''}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Date Navigation Header */}
        <View style={styles.dateHeader}>
          <IconButton
            icon="chevron-left"
            size={28}
            onPress={() => handleDateChange(-1)}
            color={Colors.primary}
          />
          <Title style={styles.title}>
            {currentDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </Title>
          <IconButton
            icon="chevron-right"
            size={28}
            onPress={() => handleDateChange(1)}
            disabled={isTodayOrFuture(currentDate)} // Disable if date is today or future
            color={isTodayOrFuture(currentDate) ? Colors.disabled : Colors.primary} // Grey out when disabled
          />
        </View>

        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator animating={true} size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>Loading logs...</Text>
          </View>
        ) : error ? (
          <View style={styles.centered}>
            <Text style={styles.errorText}>{error}</Text>
            <Button mode="contained" onPress={fetchLogs}>Retry</Button>
          </View>
        ) : (
          <FlatList
            data={logEntries}
            renderItem={renderLogItem}
            keyExtractor={(item) => `log-${item.id}`}
            ListEmptyComponent={
              <View style={styles.centered}>
                <Text style={styles.emptyText}>No food logged on this date.</Text>
              </View>
            }
            ItemSeparatorComponent={() => <Divider style={styles.divider} />}
            contentContainerStyle={logEntries.length === 0 ? styles.centered : styles.listContentContainer}
          />
        )}
      </View>

      {/* Log Details Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isModalVisible}
        onRequestClose={handleCloseModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView>
              {selectedLogItem && (
                <>
                  <Text style={{ display: 'none' }}>{console.log('Selected item in modal:', JSON.stringify(selectedLogItem, null, 2))}</Text>
                  <Title style={styles.modalTitle}>{selectedLogItem.food_name || 'Log Details'}</Title>
                  <Divider style={styles.modalDivider} />

                  {/* Display Nutrient Details */}
                  {MASTER_NUTRIENT_LIST.map(nutrient => renderNutrientDetail(nutrient.key))}
                   <Divider style={styles.modalDivider} />
                   <Caption style={styles.modalTimestamp}>
                     Logged at: {new Date(selectedLogItem.timestamp).toLocaleString('en-US', {
                       dateStyle: 'medium',
                       timeStyle: 'short',
                     })}
                   </Caption>
                </>
              )}
            </ScrollView>
            <View style={styles.modalButtonContainer}>
              <Button
                mode="outlined"
                onPress={handleDeletePress}
                style={[styles.modalButton, styles.deleteButton]}
                labelStyle={styles.deleteButtonText}
                icon="delete"
                disabled={isDeleting || !selectedLogItem}
                loading={isDeleting}
                color={Colors.error}
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </Button>
              <Button
                mode="contained"
                onPress={handleCloseModal}
                style={[styles.modalButton, styles.closeButton]}
                disabled={isDeleting}
              >
                Close
              </Button>
            </View>
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
    paddingHorizontal: 15, // Keep horizontal padding
    paddingTop: 15, // Add top padding if needed, remove bottom to allow list scroll
    paddingBottom: 0,
  },
  dateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between', // Pushes arrows to edges
    marginBottom: 15,
    paddingHorizontal: 5, // Add some padding around the header
  },
  title: {
    fontSize: 20, // Slightly smaller title to fit arrows
    fontWeight: 'bold',
    textAlign: 'center',
    color: Colors.primary,
    flexShrink: 1, // Allow title to shrink if needed
    marginHorizontal: 5, // Add space between title and arrows
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
    color: Colors.textSecondary,
  },
  errorText: {
    color: Colors.error,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 10,
  },
  emptyText: {
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  listContentContainer: {
    paddingBottom: 20,
  },
  logItem: {
    backgroundColor: Colors.surface,
    borderRadius: 8,
    marginVertical: 5,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    paddingVertical: 5,
  },
  logItemTitle: {
    fontWeight: 'bold',
    color: Colors.text,
  },
  logItemDescription: {
    color: Colors.textSecondary,
  },
  divider: {
    height: 0, // Make divider invisible, use margin on items for spacing
    backgroundColor: 'transparent',
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
    shadowOffset: {
      width: 0,
      height: 2,
    },
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
  modalButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 20,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  modalButton: {
    flex: 1,
    marginHorizontal: 5,
  },
  deleteButton: {
     borderColor: Colors.error,
  },
  deleteButtonText: {
      color: Colors.error,
  },
  closeButton: {
      backgroundColor: Colors.primary,
  },
});

export default LogScreen; 