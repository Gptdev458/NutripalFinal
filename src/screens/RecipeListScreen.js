import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Alert,
  RefreshControl,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import {
  ActivityIndicator,
  Button as PaperButton,
  Card,
  Paragraph,
  Text as PaperText,
  Title,
  Caption,
  IconButton,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { useFocusEffect } from '@react-navigation/native';
import { quickLogRecipe, fetchRecipeDetails } from '../utils/logUtils';
import { Colors } from '../constants/colors';

const RecipeListScreen = () => {
  const { user, session } = useAuth();
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [loggingRecipeId, setLoggingRecipeId] = useState(null);
  const [deletingRecipeId, setDeletingRecipeId] = useState(null);

  // Fetch recipes on component mount
  useEffect(() => {
    fetchRecipes();
  }, []);

  // Fetch user's recipes from Supabase
  const fetchRecipes = useCallback(async () => {
    if (!user) return;

    // Set loading true at the start of fetching
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('user_recipes')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      setRecipes(data || []);
    } catch (err) {
      setError('Error fetching recipes: ' + err.message);
      console.error('Error fetching recipes:', err);
      setRecipes([]); // Clear recipes on error
    } finally {
      setLoading(false);
      setRefreshing(false); // Ensure refreshing is also set to false
    }
  }, [user]);

  // Use useFocusEffect to fetch data when the screen is focused
  useFocusEffect(
    useCallback(() => {
      console.log('RecipeListScreen focused, fetching recipes...');
      fetchRecipes();

      // Optional cleanup function (runs when screen loses focus)
      return () => {
        console.log('RecipeListScreen unfocused');
        // You could cancel ongoing fetches here if needed
      };
    }, [fetchRecipes]) // Dependency: the memoized fetchRecipes function
  );

  // Updated Handle Log Recipe using the utility function
  const handleLogRecipe = async (recipeId, recipeName) => {
    if (loggingRecipeId || deletingRecipeId) return; // Prevent double taps

    setLoggingRecipeId(recipeId); // Indicate logging started
    try {
      // Fetch full recipe details needed for logging
      const recipeDetails = await fetchRecipeDetails(recipeId);
      if (recipeDetails) {
        await quickLogRecipe(recipeDetails, user);
        // Optionally refresh data after successful log
      } else {
        Alert.alert('Error', 'Could not fetch recipe details to log.');
      }
    } catch (err) {
      console.error("Error during quick log process:", err);
      Alert.alert('Error', 'An unexpected error occurred during logging.');
    } finally {
      setLoggingRecipeId(null); // Indicate logging finished
    }
  };

  // 3. Implement Delete Handler Function (with confirmation)
  const handleDeleteRecipe = (recipeId, recipeName) => {
    if (deletingRecipeId || loggingRecipeId) return; // Prevent actions while another is in progress

    Alert.alert(
      "Confirm Delete",
      `Are you sure you want to delete the recipe "${recipeName}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel", onPress: () => console.log("Deletion cancelled") },
        {
          text: "Delete",
          style: "destructive",
          // Call the function that performs the actual deletion
          onPress: () => proceedWithDeletion(recipeId),
        },
      ],
      { cancelable: true }
    );
  };

  // 4. API Call Logic (within helper)
  const proceedWithDeletion = async (recipeId) => {
    if (!session?.access_token) {
        Alert.alert('Error', 'Authentication token not found. Cannot delete recipe.');
        return;
    }
    if (!recipeId) {
        Alert.alert('Error', 'Recipe ID missing. Cannot delete.');
        return;
    }

    setDeletingRecipeId(recipeId); // Show loading state for the specific item

    try {
        console.log(`Attempting to delete recipe ID: ${recipeId}`);
        const url = `${supabase.supabaseUrl}/functions/v1/recipe-manager`; // Ensure this URL is correct

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
            // Success (2xx status code)
            console.log(`Recipe ${recipeId} deleted successfully.`);
            // Update local state
            setRecipes(currentRecipes => currentRecipes.filter(recipe => recipe.id !== recipeId));
            // Optionally show a success toast/message
            // Alert.alert('Success', 'Recipe deleted.'); // Alert might be too intrusive
        } else {
            // Handle error response
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
        setDeletingRecipeId(null); // Clear loading state
    }
  };

  // Handle pull-to-refresh
  const handleRefresh = () => {
    if (loggingRecipeId || deletingRecipeId) return; // Don't refresh during actions
    setRefreshing(true);
    fetchRecipes();
  };

  // Render function using Paper components
  const renderRecipeItem = ({ item }) => (
    <Card style={styles.recipeItem} elevation={2}>
      <Card.Content style={styles.cardContent}>
        <View style={styles.recipeInfo}>
          <Title style={styles.recipeName}>{item.recipe_name}</Title>
          {item.description && (
            <Paragraph style={styles.recipeDescription} numberOfLines={2}>
              {item.description}
            </Paragraph>
          )}
        </View>
        <View style={styles.actionButtons}>
           <PaperButton
             mode="contained"
             onPress={() => handleLogRecipe(item.id, item.recipe_name)}
             style={[styles.actionButton, styles.logButton]}
             labelStyle={styles.logButtonText}
             color={Colors.success}
             icon="plus-circle-outline"
             disabled={loggingRecipeId === item.id || !!deletingRecipeId}
             loading={loggingRecipeId === item.id}
           >
             Log
           </PaperButton>
           <IconButton
                icon="delete-outline"
                color={Colors.error}
                size={24}
                onPress={() => handleDeleteRecipe(item.id, item.recipe_name)}
                disabled={deletingRecipeId === item.id || !!loggingRecipeId}
                style={styles.deleteButton}
            />
            {deletingRecipeId === item.id && (
                <ActivityIndicator size="small" color={Colors.error} style={styles.deleteSpinner} />
            )}
        </View>
      </Card.Content>
    </Card>
  );

  // Show loading indicator while fetching data
  if (loading && !refreshing) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator animating={true} color={Colors.accent} size="large" />
        <PaperText style={styles.loadingText}>Loading Recipes...</PaperText>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Title style={styles.title}>Your Saved Recipes</Title>
        <Caption style={styles.subtitle}>Quickly log your frequent meals.</Caption>
      </View>

      {error && <PaperText style={styles.errorText}>{error}</PaperText>}

      <FlatList
        data={recipes}
        renderItem={renderRecipeItem}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContentContainer}
        ListEmptyComponent={
          !loading && (
            <View style={styles.emptyContainer}>
              <PaperText style={styles.emptyText}>No recipes saved yet.</PaperText>
              <Caption style={styles.emptySubtext}>
                Use the Chat screen to describe a recipe and save it.
              </Caption>
            </View>
          )
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[Colors.accent]}
            tintColor={Colors.accent}
          />
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
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
    paddingTop: 15,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.lightGrey,
    backgroundColor: Colors.background,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.primary,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.grey,
    marginTop: 4,
  },
  listContentContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexGrow: 1,
  },
  recipeItem: {
    marginBottom: 14,
    backgroundColor: Colors.background,
    borderRadius: 8,
  },
  cardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  recipeInfo: {
    flex: 1,
    marginRight: 10,
  },
  recipeName: {
    fontSize: 18,
    fontWeight: '500',
    color: Colors.primary,
    marginBottom: 4,
  },
  recipeDescription: {
    fontSize: 14,
    color: Colors.grey,
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButton: {
      borderRadius: 20,
  },
  logButton: {
    borderRadius: 20,
  },
  logButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  deleteButton: {
      marginLeft: 8,
  },
  deleteSpinner: {
        marginLeft: 8,
  },
  errorText: {
    color: Colors.error,
    padding: 16,
    textAlign: 'center',
    fontSize: 16,
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
    marginHorizontal: 16,
    marginTop: 20,
    backgroundColor: Colors.lightGrey,
    borderRadius: 8,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 12,
    color: Colors.primary,
  },
  emptySubtext: {
    fontSize: 14,
    color: Colors.grey,
    textAlign: 'center',
  },
});

export default RecipeListScreen; 