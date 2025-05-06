// Test file for recipe search functionality

import { calculateStringSimilarity, expandWithSynonyms } from '../utils/stringMatcher.ts';

// Example recipe names to test against
const SAMPLE_RECIPES = [
  { id: '1', recipe_name: 'Breakfast Smoothie', description: 'A healthy smoothie for breakfast with banana, berries, and yogurt' },
  { id: '2', recipe_name: 'Morning Oatmeal', description: 'Hearty oatmeal with nuts and berries' },
  { id: '3', recipe_name: 'Classic Chicken Soup', description: 'Homemade chicken soup with vegetables' },
  { id: '4', recipe_name: 'Banana Bread', description: 'Sweet bread made with ripe bananas' },
  { id: '5', recipe_name: 'Chicken Stir-Fry', description: 'Quick chicken stir-fry with vegetables' },
  { id: '6', recipe_name: 'Summer Salad', description: 'Fresh summer salad with tomatoes and cucumber' }
];

// Mock Supabase client
const mockSupabaseClient = {
  from: () => ({
    select: () => ({
      eq: () => ({
        or: () => ({
          limit: () => ({
            data: SAMPLE_RECIPES,
            error: null
          })
        })
      })
    })
  })
};

/**
 * Simulate findRecipesByFuzzyName function
 */
async function testFuzzySearch(query: string) {
  console.log(`\n----- Testing search for "${query}" -----`);
  
  // Calculate similarity scores
  const scoredRecipes = SAMPLE_RECIPES.map(recipe => {
    const nameScore = calculateStringSimilarity(query, recipe.recipe_name);
    let descScore = 0;
    
    if (recipe.description) {
      const queryTokens = query.toLowerCase().split(' ');
      const descTokens = recipe.description.toLowerCase().split(' ');
      const matchCount = queryTokens.filter(t => descTokens.some(d => d.includes(t))).length;
      descScore = queryTokens.length > 0 ? (matchCount / queryTokens.length) * 60 : 0;
    }
    
    const combinedScore = Math.round((nameScore * 0.8) + (descScore * 0.2));
    
    return {
      ...recipe,
      nameScore,
      descScore,
      combinedScore
    };
  });
  
  // Filter and sort results
  const threshold = 50;
  const results = scoredRecipes
    .filter(r => r.combinedScore >= threshold)
    .sort((a, b) => b.combinedScore - a.combinedScore);
  
  // Display results
  console.log("Results:");
  if (results.length === 0) {
    console.log("  No matches found above threshold.");
  } else {
    results.forEach((r, i) => {
      console.log(`  ${i+1}. "${r.recipe_name}" (Score: ${r.combinedScore}, Name: ${r.nameScore}, Desc: ${r.descScore})`);
    });
  }
  
  // Test synonym expansion
  const synonyms = expandWithSynonyms(query);
  console.log("\nExpanded with synonyms:", synonyms.join(', '));
  
  return results;
}

// Run tests
console.log("========= RECIPE SEARCH TEST =========");

// Test exact match
testFuzzySearch("Breakfast Smoothie");

// Test partial match
testFuzzySearch("Smoothie");

// Test synonym match
testFuzzySearch("Morning Smoothie");

// Test ingredient match 
testFuzzySearch("Banana");

// Test misspelling
testFuzzySearch("Smoothy");

// Test no good match
testFuzzySearch("Pizza");

console.log("\n======= TEST COMPLETE ======="); 