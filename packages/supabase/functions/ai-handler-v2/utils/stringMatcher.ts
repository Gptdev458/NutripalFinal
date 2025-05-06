// String matching utilities for fuzzy recipe search

/**
 * Calculates Levenshtein distance between two strings
 * Lower value = more similar strings (0 = identical)
 */
export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  // Initialize matrix
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = a[j - 1] === b[i - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculates Jaccard similarity between two strings
 * Higher value = more similar strings (1 = identical)
 */
export function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(' '));
  const setB = new Set(b.toLowerCase().split(' '));
  
  // Calculate intersection size
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  
  // Calculate union size
  const union = new Set([...setA, ...setB]);
  
  // Handle empty sets
  if (union.size === 0) return 0;
  
  return intersection.size / union.size;
}

/**
 * Tokenizes a string into meaningful parts for searching
 */
export function tokenize(input: string): string[] {
  if (!input) return [];
  
  // Lowercase, replace punctuation with spaces
  const cleaned = input.toLowerCase().replace(/[^\w\s]/g, ' ');
  
  // Split on whitespace and filter out empty strings and stopwords
  const tokens = cleaned.split(/\s+/).filter(token => token.length > 0 && !STOPWORDS.has(token));
  
  return tokens;
}

/**
 * Calculates overall similarity score between two strings
 * Uses multiple algorithms and weights them
 * Higher value = more similar (0-100 scale)
 */
export function calculateStringSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  
  // Normalize strings
  const stringA = a.toLowerCase().trim();
  const stringB = b.toLowerCase().trim();
  
  // Check for exact match
  if (stringA === stringB) return 100;
  
  // Calculate Levenshtein similarity (convert distance to similarity)
  const maxLength = Math.max(stringA.length, stringB.length);
  const levenshteinSimilarity = maxLength > 0 
    ? 100 * (1 - levenshteinDistance(stringA, stringB) / maxLength)
    : 0;
  
  // Calculate Jaccard similarity (convert to 0-100 scale)
  const jaccardScore = jaccardSimilarity(stringA, stringB) * 100;
  
  // Calculate token-based scores
  const tokensA = tokenize(stringA);
  const tokensB = tokenize(stringB);
  
  // Check for token containment
  let tokenContainmentScore = 0;
  if (tokensA.length > 0 && tokensB.length > 0) {
    // Check what percentage of tokens from the shorter string are in the longer string
    const [shorterTokens, longerTokens] = tokensA.length <= tokensB.length 
      ? [tokensA, tokensB] 
      : [tokensB, tokensA];
      
    const matchedTokens = shorterTokens.filter(token => 
      longerTokens.some(t => t === token || t.includes(token) || token.includes(t))
    );
    
    tokenContainmentScore = 100 * (matchedTokens.length / shorterTokens.length);
  }
  
  // Weighted average of all scores
  // Prioritize token containment for recipe names
  const combinedScore = (
    (levenshteinSimilarity * 0.3) + 
    (jaccardScore * 0.3) + 
    (tokenContainmentScore * 0.4)
  );
  
  return Math.round(combinedScore);
}

/**
 * Common food term synonyms for better recipe matching
 */
export const FOOD_SYNONYMS: Record<string, string[]> = {
  // Time of day
  'breakfast': ['morning', 'dawn', 'sunrise', 'am'],
  'lunch': ['midday', 'noon', 'afternoon'],
  'dinner': ['evening', 'night', 'supper', 'pm'],
  
  // Common recipe types
  'smoothie': ['shake', 'blend', 'blended', 'drink', 'beverage'],
  'salad': ['slaw', 'greens', 'bowl'],
  'soup': ['broth', 'stew', 'chowder'],
  'sandwich': ['sub', 'hero', 'hoagie', 'wrap'],
  
  // Common ingredients
  'chicken': ['poultry', 'fowl', 'hen'],
  'beef': ['steak', 'meat', 'cow'],
  'fish': ['seafood', 'salmon', 'tuna'],
  
  // Concept mappings
  'drink': ['smoothie', 'shake', 'beverage', 'juice'],
  'breakfast_drink': ['smoothie', 'shake', 'juice'],
  'pasta': ['noodle', 'spaghetti', 'fettuccine', 'macaroni'],
  'rice': ['grain', 'fried rice', 'risotto'],
  'avocado': ['avo', 'guacamole'],
  'vegetable': ['veggie', 'veg', 'plant-based'],
  'workout': ['exercise', 'gym', 'fitness', 'post-workout', 'training'],
  
  // Add more as needed
};

/**
 * Expands a search term with synonyms
 */
export function expandWithSynonyms(term: string): string[] {
  const tokens = tokenize(term);
  const expanded = [...tokens];
  
  // Add synonyms for each token
  tokens.forEach(token => {
    // Check direct synonyms
    for (const [word, synonyms] of Object.entries(FOOD_SYNONYMS)) {
      // Add synonyms if token matches a key
      if (token === word) {
        expanded.push(...synonyms);
      }
      // Add the key if token matches a synonym
      else if (synonyms.includes(token)) {
        expanded.push(word);
      }
    }
  });
  
  // Check for compound terms
  const lowerTerm = term.toLowerCase();
  
  // Breakfast drinks
  if ((lowerTerm.includes('breakfast') || lowerTerm.includes('morning')) && 
      (lowerTerm.includes('drink') || lowerTerm.includes('beverage'))) {
    expanded.push('smoothie', 'shake');
  }
  
  // Workout drinks
  if ((lowerTerm.includes('workout') || lowerTerm.includes('gym') || lowerTerm.includes('exercise')) && 
      (lowerTerm.includes('drink') || lowerTerm.includes('shake'))) {
    expanded.push('protein', 'post workout shake');
  }
  
  // Pasta dishes
  if (lowerTerm.includes('pasta') || lowerTerm.includes('noodle')) {
    expanded.push('spaghetti', 'fettuccine', 'macaroni');
  }
  
  return [...new Set(expanded)]; // Remove duplicates
}

/**
 * Common stop words to exclude from token matching
 */
export const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'else', 'when',
  'at', 'from', 'by', 'for', 'with', 'about', 'against', 'between',
  'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'to', 'of', 'in', 'on', 'my', 'our', 'your', 'their', 'it', 'its',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has',
  'had', 'do', 'does', 'did', 'can', 'could', 'will', 'would', 'should',
  'i', 'you', 'he', 'she', 'we', 'they',
]); 