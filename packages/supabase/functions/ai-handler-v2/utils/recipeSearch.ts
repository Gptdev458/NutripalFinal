// Enhanced recipe search service with fuzzy matching

import { calculateStringSimilarity, expandWithSynonyms, tokenize } from './stringMatcher.ts';

// Threshold for considering a recipe a match (0-100)
const SIMILARITY_THRESHOLD = 60;

// Interface for recipe search results
export interface RecipeSearchResult {
  id: string;
  recipe_name: string;
  description?: string;
  similarity: number;
  [key: string]: any; // Allow for additional properties like nutritional values
}

/**
 * Searches recipes by nutritional properties
 */
export async function findRecipesByNutrition(
  userId: string,
  supabaseClient: any,
  options: {
    nutrient?: string;
    minValue?: number;
    maxValue?: number;
    limit?: number;
  } = {}
): Promise<RecipeSearchResult[]> {
  const { nutrient = 'calories', minValue, maxValue, limit = 10 } = options;
  
  console.log(`[findRecipesByNutrition] Searching for recipes with ${nutrient} between ${minValue || 'min'} and ${maxValue || 'max'}`);
  
  try {
    // Build query
    let query = supabaseClient
      .from('user_recipes')
      .select('id, recipe_name, description, calories, protein_g, fat_total_g, carbs_g')
      .eq('user_id', userId);
    
    // Add nutrient filters
    if (minValue !== undefined) {
      query = query.gte(nutrient, minValue);
    }
    if (maxValue !== undefined) {
      query = query.lte(nutrient, maxValue);
    }
    
    // Execute query
    const { data: recipes, error } = await query.limit(limit);
    
    if (error) {
      console.error('[findRecipesByNutrition] Database error:', error.message);
      return [];
    }
    
    if (!recipes || recipes.length === 0) {
      console.log('[findRecipesByNutrition] No matches found');
      return [];
    }
    
    // Format results with similarity = 100 (exact match)
    const results = recipes.map(recipe => ({
      id: recipe.id,
      recipe_name: recipe.recipe_name,
      description: recipe.description,
      similarity: 100,
      // Include the relevant nutritional value
      [nutrient]: recipe[nutrient]
    }));
    
    return results;
  } catch (error) {
    console.error('[findRecipesByNutrition] Error:', error instanceof Error ? error.message : String(error));
    return [];
  }
}

/**
 * Performs an enhanced search for user recipes using fuzzy matching
 */
export async function findRecipesByFuzzyName(
  query: string,
  userId: string,
  supabaseClient: any,
  options: {
    limit?: number;
    threshold?: number;
  } = {}
): Promise<RecipeSearchResult[]> {
  const { limit = 5, threshold = SIMILARITY_THRESHOLD } = options;
  
  console.log(`[findRecipesByFuzzyName] Searching for "${query}" with threshold ${threshold}`);
  
  if (!query || !userId || !supabaseClient) {
    console.error('[findRecipesByFuzzyName] Missing required parameters');
    return [];
  }
  
  // 1. Perform initial database query with ILIKE to get potential matches
  // This uses Postgres's pattern matching to get a broader set of candidates
  try {
    // Generate search variants by expanding with synonyms
    const expandedTerms = expandWithSynonyms(query);
    
    // Create ILIKE patterns for each expanded term
    const patterns = [
      `%${query}%`, // Original query
      ...expandedTerms.map(term => `%${term}%`) // Expanded terms
    ];
    
    // Create OR conditions for the query
    const orConditions = patterns.map(pattern => `recipe_name.ilike.${pattern}`);
    
    // Fetch potential matches from database
    const { data: recipes, error } = await supabaseClient
      .from('user_recipes')
      .select('id, recipe_name, description')
      .eq('user_id', userId)
      .or(orConditions.join(','))
      .limit(limit * 3); // Get more candidates for scoring
    
    if (error) {
      console.error('[findRecipesByFuzzyName] Database error:', error.message);
      return [];
    }
    
    if (!recipes || recipes.length === 0) {
      console.log('[findRecipesByFuzzyName] No initial matches found');
      return [];
    }
    
    // 2. Score each potential match using our similarity algorithms
    const scoredRecipes: RecipeSearchResult[] = recipes.map(recipe => ({
      ...recipe,
      similarity: calculateRecipeSimilarity(query, recipe.recipe_name, recipe.description)
    }));
    
    // 3. Filter by similarity threshold and sort by score
    const filteredRecipes = scoredRecipes
      .filter(recipe => recipe.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
    
    console.log(`[findRecipesByFuzzyName] Found ${filteredRecipes.length} matches after scoring`);
    
    return filteredRecipes;
  } catch (error) {
    console.error('[findRecipesByFuzzyName] Error:', error instanceof Error ? error.message : String(error));
    return [];
  }
}

/**
 * Calculates similarity score between a query and a recipe
 * Takes into account both recipe name and description
 */
function calculateRecipeSimilarity(
  query: string,
  recipeName: string,
  description?: string
): number {
  // Calculate similarity with recipe name (primary)
  const nameScore = calculateStringSimilarity(query, recipeName);
  
  // Calculate similarity with description (secondary, if available)
  let descriptionScore = 0;
  if (description) {
    // For description, we care about token overlap more than exact matching
    const queryTokens = tokenize(query);
    const descriptionTokens = tokenize(description);
    
    // Check for token presence in description
    const matchingTokens = queryTokens.filter(token => 
      descriptionTokens.some(t => t.includes(token) || token.includes(t))
    );
    
    // Calculate percentage of query tokens found in description
    descriptionScore = queryTokens.length > 0
      ? (matchingTokens.length / queryTokens.length) * 80 // Max 80 for description
      : 0;
  }
  
  // Combine scores, prioritizing name match (80%) over description match (20%)
  return description
    ? Math.round((nameScore * 0.8) + (descriptionScore * 0.2))
    : nameScore;
}

/**
 * Formats the recipe search results into a user-friendly message
 */
export function formatRecipeSearchResults(
  results: RecipeSearchResult[],
  query: string
): string {
  if (!results || results.length === 0) {
    return `No recipes found matching "${query}".`;
  }
  
  if (results.length === 1) {
    return `Found 1 recipe matching "${query}": "${results[0].recipe_name}"`;
  }
  
  const recipeList = results
    .map((recipe, index) => `${index + 1}. "${recipe.recipe_name}"`)
    .join('\n');
  
  return `Found ${results.length} recipes matching "${query}":\n${recipeList}`;
} 