import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Alert,
  RefreshControl,
  FlatList,
  TouchableOpacity,
  ScrollView,
  Text,
} from 'react-native';
import {
  ActivityIndicator,
  Button as PaperButton,
  Card,
  Paragraph,
  IconButton,
  Portal,
  Dialog,
  Divider,
  Subheading,
  Text as PaperText,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { useFocusEffect } from '@react-navigation/native';
import { quickLogRecipe, fetchRecipeDetails, fetchUserGoals } from '../utils/logUtils';
import useSafeTheme from '../hooks/useSafeTheme';
import { getNutrientDetails } from '../constants/nutrients';

const RecipeListScreen = () => {
  const theme = useSafeTheme();
  const { user, session } = useAuth();
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [loggingRecipeId, setLoggingRecipeId] = useState(null);
  const [deletingRecipeId, setDeletingRecipeId] = useState(null);

  // State for Modal
  const [isRecipeModalVisible, setIsRecipeModalVisible] = useState(false);
  const [selectedRecipeData, setSelectedRecipeData] = useState(null);
  const [isModalLoading, setIsModalLoading] = useState(false);
  const [modalError, setModalError] = useState(null);
  const [userGoals, setUserGoals] = useState([]);
  const [isLoadingGoals, setIsLoadingGoals] = useState(false);

  // Combined fetch function
  const loadData = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    setIsLoadingGoals(true);
    setError(null);
    try {
      // Fetch recipes and goals concurrently
      const [recipesResponse, goalsResponse] = await Promise.all([
        supabase
          .from('user_recipes')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        fetchUserGoals(user.id)
      ]);

      if (recipesResponse.error) throw new Error(`Recipes fetch failed: ${recipesResponse.error.message}`);
      setRecipes(recipesResponse.data || []);

      if (goalsResponse.error) {
        console.warn('Failed to fetch user goals:', goalsResponse.error.message);
        setUserGoals([]); // Proceed without goals if fetch fails
      } else {
        setUserGoals(goalsResponse.data || []);
      }

    } catch (err) {
      setError('Error fetching data: ' + err.message);
      console.error('Error fetching data:', err);
      setRecipes([]);
      setUserGoals([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setIsLoadingGoals(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      console.log('RecipeListScreen focused, loading data...');
      loadData(); // Use combined fetch function
      return () => {
        console.log('RecipeListScreen unfocused');
      };
    }, [loadData]) // Depend on loadData
  );

  const handleLogRecipe = async (recipeId, recipeName) => {
    if (loggingRecipeId || deletingRecipeId) return;

    setLoggingRecipeId(recipeId);
    try {
      const recipeDetails = await fetchRecipeDetails(recipeId);
      if (recipeDetails) {
        await quickLogRecipe(recipeDetails, user);
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

  const handleDeleteRecipe = (recipeId, recipeName) => {
    if (deletingRecipeId || loggingRecipeId) return;

    Alert.alert(
      "Confirm Delete",
      `Are you sure you want to delete the recipe "${recipeName}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel", onPress: () => console.log("Deletion cancelled") },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => proceedWithDeletion(recipeId),
        },
      ],
      { cancelable: true }
    );
  };

  const proceedWithDeletion = async (recipeId) => {
    if (!session?.access_token) {
        Alert.alert('Error', 'Authentication token not found. Cannot delete recipe.');
        return;
    }
    if (!recipeId) {
        Alert.alert('Error', 'Recipe ID missing. Cannot delete.');
        return;
    }

    setDeletingRecipeId(recipeId);

    try {
        console.log(`Attempting to delete recipe ID: ${recipeId}`);
        const url = `${supabase.supabaseUrl}/functions/v1/recipe-manager`;

        const response = await fetch(url, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ recipe_id: recipeId }),
        });

        console.log('Delete response status:', response.status);

        if (response.ok) {
            console.log(`Recipe ${recipeId} deleted successfully.`);
            setRecipes(currentRecipes => currentRecipes.filter(recipe => recipe.id !== recipeId));
            setIsRecipeModalVisible(false);
        } else {
            let errorData = { message: `HTTP error! Status: ${response.status}` };
            try {
                errorData = await response.json();
            } catch (e) {
                console.log("Could not parse error JSON, using status text.");
            }
            console.error('Failed to delete recipe:', errorData);
            Alert.alert('Deletion Failed', `Could not delete recipe: ${errorData.message || 'Unknown error'}`);
        }
    } catch (error) {
        console.error('Error calling delete function:', error);
        Alert.alert('Error', `An error occurred while trying to delete the recipe: ${error.message}`);
    } finally {
        setDeletingRecipeId(null);
    }
  };

  const handleRefresh = () => {
    if (loggingRecipeId || deletingRecipeId) return;
    setRefreshing(true);
    loadData();
  };

  // Function to open the modal and fetch details
  const handleRecipeItemPress = async (recipe) => {
    if (deletingRecipeId || loggingRecipeId) return;
    setSelectedRecipeData({ ...recipe, ingredients: null }); // Set basic data first
    setIsRecipeModalVisible(true);
    setIsModalLoading(true);
    setModalError(null);

    try {
      const details = await fetchRecipeDetails(recipe.id);
      if (details) {
        // Ensure ingredients are handled (assuming fetchRecipeDetails returns them)
        setSelectedRecipeData(details);
      } else {
        throw new Error('Could not fetch recipe details.');
      }
    } catch (err) {
      console.error('Error fetching recipe details for modal:', err);
      setModalError(`Failed to load details: ${err.message}`);
    } finally {
      setIsModalLoading(false);
    }
  };

  // Function to close the modal
  const handleCloseModal = () => {
    setIsRecipeModalVisible(false);
    setSelectedRecipeData(null);
    setIsModalLoading(false);
    setModalError(null);
    // Reset delete/log state if needed, though handled elsewhere currently
    setLoggingRecipeId(null);
    setDeletingRecipeId(null);
  };

  const renderRecipeItem = ({ item }) => (
    <TouchableOpacity onPress={() => handleRecipeItemPress(item)} disabled={!!deletingRecipeId || !!loggingRecipeId}>
      <Card style={[styles.recipeItem, { backgroundColor: theme.colors.surface }]} elevation={2}>
        <Card.Content style={styles.cardContent}>
          <View style={styles.recipeInfo}>
            <PaperText variant="titleMedium" style={[styles.recipeName, { color: theme.colors.text }]}>{item.recipe_name}</PaperText>
          </View>
          <View style={styles.actionButtons}>
             <IconButton
                icon="chevron-right" // Indicate tappable item
                iconColor={theme.colors.textSecondary}
                size={24}
             />
           </View>
        </Card.Content>
      </Card>
    </TouchableOpacity>
  );

  const renderEmptyListComponent = () => (
    <View style={styles.emptyContainer}>
      <PaperText style={[styles.emptyText, { color: theme.colors.textSecondary }]}>
        You haven't saved any recipes yet.
      </PaperText>
      <PaperText style={[styles.emptySubText, { color: theme.colors.textSecondary }]}>
        You can save recipes from the Chat screen after analyzing them.
      </PaperText>
    </View>
  );

  // Add renderRecipeModal function
  const renderRecipeModal = () => {
    if (!selectedRecipeData) return null;

    // Helper to render nutrient rows based on tracked goals
    const renderTrackedNutrient = (goal) => {
      const nutrientKey = goal.nutrient;
      const value = selectedRecipeData[nutrientKey];

      if (value !== null && value !== undefined && typeof value === 'number') {
        const nutrientDetails = getNutrientDetails(nutrientKey);
        const displayValue = value.toFixed(1);
        const displayName = nutrientDetails?.name || nutrientKey;
        const displayUnit = nutrientDetails?.unit || '';

        return (
          <View key={nutrientKey} style={styles.nutrientRow}>
            <PaperText style={[styles.modalText, { color: theme.colors.text }]}>{displayName}:</PaperText>
            <PaperText style={[styles.modalTextSecondary, { color: theme.colors.textSecondary }]}>{`${displayValue} ${displayUnit}`}</PaperText>
          </View>
        );
      }
      return null;
    };

    const recipeName = selectedRecipeData.recipe_name || 'Recipe Details';
    // Use ingredients field OR description field as fallback
    const ingredients = selectedRecipeData.ingredients || selectedRecipeData.description || 'No ingredients listed.';
    const ingredientsDisplay = typeof ingredients === 'string' ? ingredients : ingredients.join(', '); // Basic display

    return (
      <Portal>
        <Dialog visible={isRecipeModalVisible} onDismiss={handleCloseModal} style={{ borderRadius: 8 }}>
          <Dialog.Title style={{ color: theme.colors.primary }}>{recipeName}</Dialog.Title>
          <Dialog.Content>
            {/* Restore original content logic */}
            {isModalLoading ? (
              <ActivityIndicator animating={true} color={theme.colors.primary} size="small" />
            ) : modalError ? (
              <PaperText style={[styles.errorText, { color: theme.colors.error }]}>{modalError}</PaperText>
            ) : (
              <ScrollView style={styles.modalScrollView}>
                {/* Ingredients Section */}
                <Subheading style={styles.modalSubheading}>Ingredients</Subheading>
                <Paragraph style={[styles.modalTextSecondary, { color: theme.colors.textSecondary, marginBottom: 16 }]}>
                    {ingredientsDisplay}
                </Paragraph>
                <Divider style={{ marginBottom: 16 }} />

                {/* Tracked Nutrition Section */}
                <Subheading style={styles.modalSubheading}>Tracked Nutrition</Subheading>
                {userGoals.length > 0 ? (
                    userGoals.map(renderTrackedNutrient)
                ) : (
                    <Paragraph style={[styles.modalTextSecondary, { color: theme.colors.textSecondary }]}>No nutrition goals set.</Paragraph>
                )}
                 {!userGoals.some(goal => selectedRecipeData[goal.nutrient] !== null && selectedRecipeData[goal.nutrient] !== undefined && typeof selectedRecipeData[goal.nutrient] === 'number') && userGoals.length > 0 &&
                    <Paragraph style={[styles.modalTextSecondary, { color: theme.colors.textSecondary, marginTop: 8 }]}>
                        (No tracked nutrients found in this recipe)
                    </Paragraph>
                 }
              </ScrollView>
            )}
            {/* End original content logic */}
          </Dialog.Content>
          <Dialog.Actions style={styles.dialogActions}>
            <View style={styles.dialogActionsLeft}>
                <PaperButton
                    onPress={() => handleDeleteRecipe(selectedRecipeData.id, recipeName)}
                    disabled={deletingRecipeId === selectedRecipeData.id || loggingRecipeId === selectedRecipeData.id || isModalLoading}
                    loading={deletingRecipeId === selectedRecipeData.id}
                    textColor={theme.colors.error}
                    style={styles.modalActionButton}
                >
                    Delete
                </PaperButton>
            </View>
            <View style={styles.dialogActionsRight}>
                <PaperButton
                    mode="outlined"
                    onPress={handleCloseModal}
                    style={styles.modalActionButton}
                    disabled={deletingRecipeId === selectedRecipeData.id || loggingRecipeId === selectedRecipeData.id}
                >
                    Close
                </PaperButton>
                <PaperButton
                    mode="contained"
                    onPress={() => {
                         handleLogRecipe(selectedRecipeData.id, recipeName);
                         handleCloseModal(); // Optionally close modal after starting log
                    }}
                    disabled={deletingRecipeId === selectedRecipeData.id || loggingRecipeId === selectedRecipeData.id || isModalLoading}
                    loading={loggingRecipeId === selectedRecipeData.id}
                    style={styles.modalActionButton}
                    icon="plus"
                >
                    Log
                </PaperButton>
            </View>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    );
  };

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator animating={true} color={theme.colors.primary} size="large" />
        <PaperText style={[styles.loadingText, { color: theme.colors.textSecondary }]}>Loading Recipes...</PaperText>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.header}>
        <PaperText variant="headlineSmall" style={[styles.title, { color: theme.colors.primary }]}>Your Saved Recipes</PaperText>
        <PaperText variant="bodyMedium" style={[styles.subtitle, { color: theme.colors.textSecondary }]}>Quickly log your frequent meals.</PaperText>
      </View>

      {error && <PaperText style={[styles.errorText, { color: theme.colors.error }]}>{error}</PaperText>}

      <FlatList
        data={recipes}
        renderItem={renderRecipeItem}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContentContainer}
        ListEmptyComponent={renderEmptyListComponent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[theme.colors.primary]}
            tintColor={theme.colors.primary}
          />
        }
      />
      {/* Conditionally render the modal */}
      {isRecipeModalVisible && renderRecipeModal()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  title: {
    marginBottom: 4,
  },
  subtitle: {
  },
  errorText: {
    margin: 16,
    textAlign: 'center',
  },
  loadingText: {
    marginTop: 10,
  },
  listContentContainer: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    flexGrow: 1,
  },
  recipeItem: {
    marginVertical: 6,
    marginHorizontal: 8,
    borderRadius: 6,
  },
  cardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  recipeInfo: {
    flex: 1,
    marginRight: 8,
  },
  recipeName: {
    marginBottom: 4,
  },
  recipeDescription: {
    lineHeight: 18,
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  deleteButton: {
    margin: 0,
  },
  deleteSpinner: {
    marginLeft: 4,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    marginTop: 50,
  },
  emptyText: {
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubText: {
    fontSize: 14,
    textAlign: 'center',
  },
  // Modal Styles
  modalScrollView: {
    maxHeight: 400, // Limit modal content height
  },
  modalSubheading: {
    fontWeight: 'bold',
    marginBottom: 8,
  },
  modalText: {
    fontSize: 15,
  },
  modalTextSecondary: {
    fontSize: 14,
  },
  nutrientRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    marginBottom: 2,
  },
  dialogActions: {
    justifyContent: 'space-between',
    flexDirection: 'row',
    paddingHorizontal: 8, // Add padding
    paddingVertical: 8,
  },
  dialogActionsLeft: {
      flexDirection: 'row',
      alignItems: 'center',
  },
  dialogActionsRight: {
      flexDirection: 'row',
      alignItems: 'center',
  },
  modalActionButton: {
      marginHorizontal: 4, // Space out buttons
  },
});

export default RecipeListScreen; 