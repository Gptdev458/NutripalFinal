/**
 * Serving Detector
 * 
 * Determines if a recipe is likely a single-serving or a batch recipe
 * based on ingredient quantities, total weight, and heuristics.
 */ import { calculateBatchSize } from './batch-calculator.ts';
// Thresholds for determining single vs batch
const SINGLE_SERVING_MAX_GRAMS = 600 // A large meal is still a single serving if under 600g
;
const SINGLE_SERVING_MAX_ML = 500 // About 2 cups
;
const TYPICAL_SERVING_GRAMS = 300 // Average serving size for estimation
;
// Keywords that suggest single serving
const SINGLE_SERVING_KEYWORDS = [
  'my breakfast',
  'my lunch',
  'my dinner',
  'my snack',
  'for myself',
  'for me',
  'single serving',
  'one portion',
  'bowl',
  'plate',
  'personal',
  'quick meal'
];
// Keywords that suggest batch/multiple servings
const BATCH_KEYWORDS = [
  'batch',
  'family',
  'meal prep',
  'large pot',
  'serves',
  'portions',
  'freeze',
  'leftovers',
  'big batch',
  'make ahead',
  'for the week',
  'party'
];
/**
 * Detect if a recipe is single-serving or a batch
 */ export function detectServingType(ingredients, recipeName, recipeText) {
  // Calculate batch size first
  const batchResult = calculateBatchSize(ingredients);
  const { totalGrams, totalMl, confidence: batchConfidence } = batchResult;
  // Check for keyword hints in recipe name/text
  const textToSearch = `${recipeName || ''} ${recipeText || ''}`.toLowerCase();
  const hasSingleKeywords = SINGLE_SERVING_KEYWORDS.some((kw)=>textToSearch.includes(kw));
  const hasBatchKeywords = BATCH_KEYWORDS.some((kw)=>textToSearch.includes(kw));
  // Scoring system
  let singleScore = 0;
  let batchScore = 0;
  const reasons = [];
  // Weight-based detection
  if (totalGrams > 0) {
    if (totalGrams <= SINGLE_SERVING_MAX_GRAMS) {
      singleScore += 3;
      reasons.push(`Total weight (${Math.round(totalGrams)}g) is within single-serving range`);
    } else if (totalGrams <= 1000) {
      batchScore += 1;
      reasons.push(`Total weight (${Math.round(totalGrams)}g) suggests 2-3 servings`);
    } else if (totalGrams <= 2000) {
      batchScore += 2;
      reasons.push(`Total weight (${Math.round(totalGrams)}g) suggests 4-6 servings`);
    } else {
      batchScore += 3;
      reasons.push(`Total weight (${Math.round(totalGrams)}g) suggests large batch`);
    }
  }
  // Volume-based detection (for soups, drinks, etc.)
  if (totalMl > 0 && totalGrams === 0) {
    if (totalMl <= SINGLE_SERVING_MAX_ML) {
      singleScore += 2;
      reasons.push(`Volume (${Math.round(totalMl)}ml) suggests single serving`);
    } else if (totalMl <= 1500) {
      batchScore += 1;
      reasons.push(`Volume (${Math.round(totalMl)}ml) suggests 2-4 servings`);
    } else {
      batchScore += 3;
      reasons.push(`Volume (${Math.round(totalMl)}ml) suggests large batch`);
    }
  }
  // Keyword-based detection
  if (hasSingleKeywords && !hasBatchKeywords) {
    singleScore += 2;
    reasons.push('Recipe description suggests single serving');
  }
  if (hasBatchKeywords && !hasSingleKeywords) {
    batchScore += 2;
    reasons.push('Recipe description suggests batch/multiple servings');
  }
  // Ingredient count (more ingredients often means more elaborate = batch)
  if (ingredients.length >= 8) {
    batchScore += 1;
    reasons.push(`Recipe has ${ingredients.length} ingredients, suggesting a batch recipe`);
  } else if (ingredients.length <= 4) {
    singleScore += 1;
    reasons.push(`Simple recipe with ${ingredients.length} ingredients`);
  }
  // Determine result
  const isSingleServing = singleScore > batchScore;
  const suggestedServings = isSingleServing ? 1 : estimateServings(totalGrams, totalMl);
  // Determine confidence
  let confidence;
  const scoreDiff = Math.abs(singleScore - batchScore);
  if (scoreDiff >= 3 && batchConfidence !== 'low') {
    confidence = 'high';
  } else if (scoreDiff >= 2 || batchConfidence === 'medium') {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }
  return {
    isSingleServing,
    suggestedServings,
    reasoning: reasons.join('. '),
    totalSizeGrams: totalGrams,
    confidence
  };
}
/**
 * Estimate number of servings based on total weight/volume
 */ function estimateServings(grams, ml) {
  const effectiveGrams = grams > 0 ? grams : ml // ml as fallback if no weight
  ;
  if (effectiveGrams <= 0) {
    return 4 // Default when we can't calculate
    ;
  }
  // Round to reasonable serving counts
  const rawServings = effectiveGrams / TYPICAL_SERVING_GRAMS;
  if (rawServings <= 1.5) return 1;
  if (rawServings <= 2.5) return 2;
  if (rawServings <= 3.5) return 3;
  if (rawServings <= 5) return 4;
  if (rawServings <= 7) return 6;
  if (rawServings <= 10) return 8;
  return Math.round(rawServings / 2) * 2 // Round to even numbers for larger batches
  ;
}
/**
 * Generate a prompt asking user about servings
 */ export function generateServingsPrompt(result) {
  const { isSingleServing, suggestedServings, totalSizeGrams, confidence } = result;
  const perServingGrams = suggestedServings > 0 ? Math.round(totalSizeGrams / suggestedServings) : totalSizeGrams;
  if (isSingleServing && confidence === 'high') {
    return `This looks like a single-serving recipe (${Math.round(totalSizeGrams)}g total). Is this correct?`;
  }
  if (isSingleServing) {
    return `This looks like it might be a single-serving recipe. Is this one serving, or does it make more?`;
  }
  if (confidence === 'high') {
    return `I estimate this recipe makes about **${suggestedServings} servings** (~${perServingGrams}g per serving, ${Math.round(totalSizeGrams)}g total). Is this correct?`;
  }
  return `How many servings does this recipe make? I'd estimate around ${suggestedServings} (~${perServingGrams}g each), but please let me know.`;
}
/**
 * Parse user's servings response
 */ export function parseServingsResponse(response) {
  const lower = response.toLowerCase().trim();
  // Check for confirmation
  if ([
    'yes',
    'yeah',
    'yep',
    'correct',
    'that\'s right',
    'looks good',
    'ok',
    'okay',
    '1',
    'one'
  ].some((phrase)=>lower === phrase || lower.startsWith(phrase))) {
    return {
      confirmed: true
    };
  }
  // Look for a number
  const numMatch = lower.match(/(\d+)/);
  if (numMatch) {
    return {
      confirmed: false,
      servings: parseInt(numMatch[1])
    };
  }
  // Check for text numbers
  const textNumbers = {
    'one': 1,
    'two': 2,
    'three': 3,
    'four': 4,
    'five': 5,
    'six': 6,
    'seven': 7,
    'eight': 8,
    'nine': 9,
    'ten': 10
  };
  for (const [text, num] of Object.entries(textNumbers)){
    if (lower.includes(text)) {
      return {
        confirmed: false,
        servings: num
      };
    }
  }
  return {
    confirmed: false
  };
}
