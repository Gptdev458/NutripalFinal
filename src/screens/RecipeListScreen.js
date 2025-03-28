import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { useFocusEffect } from '@react-navigation/native';

const RecipeListScreen = () => {
  const { user } = useAuth();
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

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

  // Handle logging a recipe to food log
  const handleLogRecipe = async (recipeId, recipeName) => {
    try {
      setLoading(true);
      
      // First, fetch the recipe with all nutrient data
      const { data: recipeData, error: recipeError } = await supabase
        .from('user_recipes')
        .select('*')
        .eq('id', recipeId)
        .single();
        
      if (recipeError) throw recipeError;
      
      if (!recipeData) {
        throw new Error('Recipe not found');
      }
      
      // Prepare food log entry
      const foodLogEntry = {
        user_id: user.id,
        food_name: recipeName,
        timestamp: new Date().toISOString(),
        source: 'quick_recipe',
        recipe_id: recipeId,
        // Copy all nutrient values from the recipe
        ...Object.fromEntries(
          Object.entries(recipeData)
            .filter(([key]) => !['id', 'user_id', 'recipe_name', 'description', 'created_at'].includes(key))
        ),
        created_at: new Date().toISOString()
      };
      
      // Insert the food log entry
      const { error: logError } = await supabase
        .from('food_log')
        .insert(foodLogEntry);
      
      if (logError) throw logError;
      
      Alert.alert('Success', `Logged "${recipeName}" to your food log.`);
    } catch (error) {
      console.error('Error logging recipe:', error);
      Alert.alert('Error', `Failed to log recipe: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Handle pull-to-refresh
  const handleRefresh = () => {
    setRefreshing(true);
    fetchRecipes();
  };

  // Render each recipe item
  const renderRecipeItem = ({ item }) => (
    <View style={styles.recipeItem}>
      <View style={styles.recipeInfo}>
        <Text style={styles.recipeName}>{item.recipe_name}</Text>
        <Text style={styles.recipeDescription} numberOfLines={2}>
          {item.description || 'No description'}
        </Text>
      </View>
      <TouchableOpacity
        style={styles.logButton}
        onPress={() => handleLogRecipe(item.id, item.recipe_name)}
        disabled={loading}
      >
        <Text style={styles.logButtonText}>Log</Text>
      </TouchableOpacity>
    </View>
  );

  // Show loading indicator while fetching data
  if (loading && !refreshing) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading your recipes...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Your Recipes</Text>
        <Text style={styles.subtitle}>Quickly log your saved recipes</Text>
      </View>

      {error && <Text style={styles.errorText}>{error}</Text>}

      {recipes.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            You don't have any saved recipes yet.
          </Text>
          <Text style={styles.emptySubtext}>
            Use the Chat to log new recipes, and they'll appear here for quick access.
          </Text>
        </View>
      ) : (
        <FlatList
          data={recipes}
          renderItem={renderRecipeItem}
          keyExtractor={item => item.id.toString()}
          contentContainerStyle={styles.recipeList}
          refreshing={refreshing}
          onRefresh={handleRefresh}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
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
    color: '#666',
  },
  header: {
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    marginBottom: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    marginBottom: 6,
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  recipeList: {
    padding: 16,
  },
  recipeItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 18,
    marginBottom: 14,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  recipeInfo: {
    flex: 1,
    marginRight: 10,
  },
  recipeName: {
    fontSize: 18,
    fontWeight: '500',
    flex: 1,
    color: '#333',
  },
  recipeDescription: {
    fontSize: 14,
    color: '#666',
  },
  logButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 24,
    marginLeft: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  logButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 15,
  },
  errorText: {
    color: 'red',
    padding: 16,
    textAlign: 'center',
  },
  emptyContainer: {
    padding: 30,
    backgroundColor: '#f8f8f8',
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 12,
  },
  emptySubtext: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
});

export default RecipeListScreen; 