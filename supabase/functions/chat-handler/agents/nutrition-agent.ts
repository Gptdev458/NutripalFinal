import { lookupNutrition } from '../../_shared/nutrition-lookup.ts';
import { createAdminClient } from '../../_shared/supabase-client.ts';
import { createOpenAIClient } from '../../_shared/openai-client.ts';
import { normalizeFoodName } from '../../_shared/utils.ts';
// Fallback nutrition data for common ingredients (per 100g unless specified)
const NUTRITION_FALLBACKS = {};
// Modifiers to remove for loose matching
const INGREDIENT_MODIFIERS = [
  'organic',
  'fresh',
  'frozen',
  'canned',
  'dried',
  'raw',
  'cooked',
  'low sodium',
  'low-sodium',
  'reduced sodium',
  'no salt added',
  'low fat',
  'low-fat',
  'reduced fat',
  'fat free',
  'fat-free',
  'high oleic',
  'extra virgin',
  'virgin',
  'pure',
  'natural',
  'whole',
  'chopped',
  'diced',
  'sliced',
  'minced',
  'crushed',
  'boneless',
  'skinless',
  'bone-in',
  'skin-on',
  'large',
  'medium',
  'small',
  'mini',
  'ripe',
  'unripe',
  'mature',
  'unsalted',
  'salted',
  'roasted',
  'toasted',
  'plain',
  'flavored',
  'sweetened',
  'unsweetened'
];
// Track failed lookups for logging
const failedLookups = new Map();
/**
 * Find a fallback from NUTRITION_FALLBACKS using loose matching
 */ function findFallbackNutrition(searchTerm) {
  const normalized = searchTerm.toLowerCase().trim();
  // 1. Exact match
  if (NUTRITION_FALLBACKS[normalized]) {
    return NUTRITION_FALLBACKS[normalized];
  }
  // 2. Try after removing modifiers
  let simplified = normalized;
  for (const modifier of INGREDIENT_MODIFIERS) {
    simplified = simplified.replace(new RegExp(`\\b${modifier}\\b`, 'gi'), '').trim();
  }
  simplified = simplified.replace(/\s+/g, ' ').trim();
  if (simplified !== normalized && NUTRITION_FALLBACKS[simplified]) {
    console.log(`[NutritionAgent] Fallback match after removing modifiers: "${normalized}" -> "${simplified}"`);
    return NUTRITION_FALLBACKS[simplified];
  }
  // 3. Partial match - check if any fallback key is contained in search term or vice versa
  for (const [key, data] of Object.entries(NUTRITION_FALLBACKS)) {
    // Check if fallback key is contained in the search term
    if (normalized.includes(key)) {
      console.log(`[NutritionAgent] Fallback partial match: "${normalized}" contains "${key}"`);
      return data;
    }
    // Check if search term is contained in fallback key
    if (key.includes(simplified) && simplified.length >= 3) {
      console.log(`[NutritionAgent] Fallback partial match: "${key}" contains "${simplified}"`);
      return data;
    }
  }
  // 4. Try word-level matching for the core ingredient
  const words = simplified.split(' ');
  for (let i = words.length - 1; i >= 0; i--) {
    const candidate = words.slice(i).join(' ');
    if (NUTRITION_FALLBACKS[candidate]) {
      console.log(`[NutritionAgent] Fallback word match: "${normalized}" -> "${candidate}"`);
      return NUTRITION_FALLBACKS[candidate];
    }
  }
  return null;
}
/**
 * Log failed ingredient lookup for analytics
 */ async function logFailedLookup(ingredient, reason, context) {
  const count = (failedLookups.get(ingredient) || 0) + 1;
  failedLookups.set(ingredient, count);
  console.warn(`[NutritionAgent] FAILED LOOKUP: "${ingredient}" - ${reason} (attempt ${count})`);
  if (context?.supabase && context?.userId) {
    try {
      await context.supabase.from('analytics_failed_lookups').insert({
        user_id: context.userId,
        query: ingredient,
        portion: context.portion,
        failure_type: 'no_data',
        details: {
          reason,
          attempt: count
        }
      });
    } catch (err) {
      console.error('[NutritionAgent] Error logging analytics:', err);
    }
  }
}
/**
 * Check if nutrition data is valid (has non-zero calories for non-zero-calorie foods)
 */ function isValidNutrition(data, itemName) {
  if (!data) return false;
  // Most foods should have calories - only salt/spices have 0
  const zeroCalorieItems = [
    'salt',
    'water',
    'pepper',
    'spice',
    'herb',
    'tea',
    'coffee'
  ];
  const isZeroCalorieItem = zeroCalorieItems.some((z) => itemName.toLowerCase().includes(z));
  if (data.calories === 0 && !isZeroCalorieItem) {
    console.warn(`[NutritionAgent] Warning: 0 calories for "${itemName}" - may be incorrect`);
    return false;
  }
  return true;
}
export async function getScalingMultiplier(userPortion, servingSize, foodName, supabase) {
  if (!servingSize) return 1;
  // 1. Rule-based scaling for common units
  const userParsed = parseUnitAndAmount(userPortion);
  const officialParsed = parseUnitAndAmount(servingSize);
  if (userParsed && officialParsed) {
    // Exact unit match
    if (userParsed.unit === officialParsed.unit) {
      const multiplier = userParsed.amount / officialParsed.amount;
      if (!isNaN(multiplier) && multiplier > 0) {
        console.log(`[NutritionAgent] Rule-based scaling: ${userPortion} / ${servingSize} = ${multiplier}`);
        return multiplier;
      }
    }
    // Handle common weight-based scaling (g, oz, lb)
    const userGrams = convertToGrams(userParsed.amount, userParsed.unit);
    const officialGrams = convertToGrams(officialParsed.amount, officialParsed.unit);
    if (userGrams && officialGrams) {
      const multiplier = userGrams / officialGrams;
      console.log(`[NutritionAgent] Weight-based scaling: ${userGrams}g / ${officialGrams}g = ${multiplier}`);
      return multiplier;
    }
    // Cross-unit scaling (e.g., cups to ml, tbsp to tsp)
    const userVol = convertToMl(userParsed.amount, userParsed.unit);
    const officialVol = convertToMl(officialParsed.amount, officialParsed.unit);
    if (userVol && officialVol) {
      const multiplier = userVol / officialVol;
      console.log(`[NutritionAgent] Volume-based scaling: ${userVol}ml / ${officialVol}ml = ${multiplier}`);
      return multiplier;
    }
  }
  // Handle case where servingSize contains weight in parens: "1 cup (240g)" or "1 tbsp (15 ml)"
  if (userParsed && servingSize.includes('(')) {
    const parenMatch = servingSize.match(/\(([^)]+)\)/);
    if (parenMatch) {
      const parenContent = parenMatch[1];
      const parenParsed = parseUnitAndAmount(parenContent);
      if (parenParsed) {
        // Try weight scaling first
        const userGrams = convertToGrams(userParsed.amount, userParsed.unit);
        const parenGrams = convertToGrams(parenParsed.amount, parenParsed.unit);
        if (userGrams && parenGrams) {
          const multiplier = userGrams / parenGrams;
          console.log(`[NutritionAgent] Paren-weight scaling: ${userGrams}g / ${parenGrams}g = ${multiplier}`);
          return multiplier;
        }
        // Try volume scaling
        const userVol = convertToMl(userParsed.amount, userParsed.unit);
        const parenVol = convertToMl(parenParsed.amount, parenParsed.unit);
        if (userVol && parenVol) {
          const multiplier = userVol / parenVol;
          console.log(`[NutritionAgent] Paren-volume scaling: ${userVol}ml / ${parenVol}ml = ${multiplier}`);
          return multiplier;
        }
      }
    }
  }
  // 2. Check conversion cache if foodName provided
  if (foodName && supabase) {
    try {
      const normalizedFood = foodName.toLowerCase().trim();
      const { data: cached } = await supabase.from('unit_conversions').select('multiplier').eq('food_name', normalizedFood).eq('from_unit', userPortion.toLowerCase().trim()).eq('to_unit', servingSize.toLowerCase().trim()).limit(1).maybeSingle();
      if (cached) {
        console.log(`[NutritionAgent] Conversion cache hit: ${userPortion} -> ${servingSize} = ${cached.multiplier}`);
        return cached.multiplier;
      }
    } catch (err) {
      console.error('[NutritionAgent] Error checking conversion cache:', err);
    }
  }
  // 3. Fallback to LLM for ambiguous descriptions
  console.log(`[NutritionAgent] Falling back to LLM for scaling: "${userPortion}" vs "${servingSize}"`);
  const openai = createOpenAIClient();
  const prompt = `
User portion: "${userPortion}"
Official serving size: "${servingSize}"

Based on the above, calculate the numerical multiplier to convert the nutrition data from the official serving size to the user's portion.
Return ONLY the numerical multiplier (e.g., 1.5, 0.5, 2). If unsure, return 1.
Example: "1 apple" (approx 180g) vs "100g" -> 1.8
`;
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "user",
        content: prompt
      }
    ],
    max_tokens: 10
  });
  const content = response.choices[0].message.content?.trim();
  // Robustly extract number from content
  const match = content?.match(/[\d\.]+/);
  const multiplier = match ? parseFloat(match[0]) : 1;
  console.log(`[NutritionAgent] LLM Scaling result: raw="${content}" parsed=${multiplier}`);
  const finalMultiplier = isNaN(multiplier) ? 1 : multiplier;
  // 4. Save to cache if successful
  if (foodName && supabase && !isNaN(finalMultiplier)) {
    try {
      await supabase.from('unit_conversions').insert({
        food_name: foodName.toLowerCase().trim(),
        from_unit: userPortion.toLowerCase().trim(),
        to_unit: servingSize.toLowerCase().trim(),
        multiplier: finalMultiplier
      });
    } catch (err) {
      console.error('[NutritionAgent] Error saving to conversion cache:', err);
    }
  }
  return finalMultiplier;
}
function parseUnitAndAmount(str) {
  const cleaned = str.toLowerCase().trim();
  // Handle cases like "a cup", "an egg", "some milk"
  const wordAmounts = {
    'a': 1,
    'an': 1,
    'one': 1,
    'two': 2,
    'three': 3,
    'four': 4,
    'five': 5,
    'half': 0.5,
    'quarter': 0.25,
    'double': 2,
    'triple': 3,
    'couple': 2
  };
  const firstWord = cleaned.split(/\s+/)[0];
  if (wordAmounts[firstWord]) {
    const unit = cleaned.substring(firstWord.length).trim().replace(/s$/, '');
    return {
      amount: wordAmounts[firstWord],
      unit: unit || 'serving'
    };
  }
  const match = cleaned.match(/^([\d\/\.\s\-]+)\s*(.*)$/);
  if (!match) return null;
  let amountStr = match[1].trim();
  let amount;
  // Handle mixed fractions like "1 1/2"
  if (amountStr.includes(' ')) {
    const parts = amountStr.split(' ');
    amount = 0;
    for (const part of parts) {
      if (part.includes('/')) {
        const [num, den] = part.split('/').map(parseFloat);
        amount += num / den;
      } else {
        amount += parseFloat(part);
      }
    }
  } else if (amountStr.includes('/')) {
    const [num, den] = amountStr.split('/').map(parseFloat);
    amount = num / den;
  } else {
    amount = parseFloat(amountStr);
  }
  if (isNaN(amount)) return null;
  return {
    amount,
    unit: match[2].trim().replace(/s$/, '') || 'serving'
  };
}
function convertToGrams(amount, unit) {
  const units = {
    'g': 1,
    'gram': 1,
    'mg': 0.001,
    'milligram': 0.001,
    'kg': 1000,
    'kilogram': 1000,
    'oz': 28.35,
    'ounce': 28.35,
    'lb': 453.59,
    'pound': 453.59
  };
  return units[unit] ? amount * units[unit] : null;
}
function convertToMl(amount, unit) {
  const units = {
    'ml': 1,
    'milliliter': 1,
    'l': 1000,
    'liter': 1000,
    'tsp': 4.92,
    'teaspoon': 4.92,
    'tbsp': 14.78,
    'tablespoon': 14.78,
    'cup': 240,
    'fl oz': 29.57,
    'fluid ounce': 29.57,
    'pt': 473.17,
    'pint': 473.17,
    'qt': 946.35,
    'quart': 946.35,
    'gal': 3785.41,
    'gallon': 3785.41
  };
  return units[unit] ? amount * units[unit] : null;
}
export function scaleNutrition(data, multiplier) {
  const scaled = {
    ...data
  };
  const keysToScale = [
    'calories',
    'protein_g',
    'fat_total_g',
    'carbs_g',
    'fiber_g',
    'sugar_g',
    'sodium_mg',
    'fat_saturated_g',
    'cholesterol_mg',
    'potassium_mg',
    'fat_trans_g',
    'calcium_mg',
    'iron_mg',
    'magnesium_mg',
    'vitamin_a_mcg',
    'vitamin_c_mg',
    'vitamin_d_mcg',
    'sugar_added_g'
  ];

  if (multiplier !== 1) {
    keysToScale.forEach((key) => {
      if (typeof scaled[key] === 'number') {
        // @ts-ignore: key is valid
        scaled[key] = Math.round(scaled[key] * multiplier * 10) / 10;
        if (key === 'calories') scaled[key] = Math.round(scaled[key]);
      }
    });
  }

  // CRITICAL: Fallback for 0-calorie items that have macros (Feature 3 fix)
  if ((scaled.calories === 0 || !scaled.calories) &&
    ((scaled.protein_g || 0) > 0 || (scaled.carbs_g || 0) > 0 || (scaled.fat_total_g || 0) > 0)) {
    const calculatedCals = ((scaled.protein_g || 0) * 4) + ((scaled.carbs_g || 0) * 4) + ((scaled.fat_total_g || 0) * 9);
    if (calculatedCals > 0) {
      console.log(`[NutritionAgent] 0 calories detected with macros for ${scaled.food_name}. Calculating from macros: ${calculatedCals}`);
      scaled.calories = Math.round(calculatedCals);
      // Degrade confidence if we had to calculate calories
      if (scaled.confidence === 'high') scaled.confidence = 'medium';
      if (!scaled.error_sources) scaled.error_sources = [];
      if (!scaled.error_sources.includes('calculated_from_macros')) {
        scaled.error_sources.push('calculated_from_macros');
      }
    }
  }

  return scaled;
}

export interface ConfidenceDetails {
  calories: 'low' | 'medium' | 'high';
  protein_g: 'low' | 'medium' | 'high';
  carbs_g: 'low' | 'medium' | 'high';
  fat_total_g: 'low' | 'medium' | 'high';
  [key: string]: 'low' | 'medium' | 'high' | undefined;
}

export interface EnrichedNutritionResult {
  food_name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_total_g: number;
  fiber_g?: number;
  sugar_g?: number;
  sodium_mg?: number;
  fat_saturated_g?: number;
  cholesterol_mg?: number;
  potassium_mg?: number;
  calcium_mg?: number;
  iron_mg?: number;
  magnesium_mg?: number;
  vitamin_a_mcg?: number;
  vitamin_c_mg?: number;
  vitamin_d_mcg?: number;
  serving_size?: string;
  confidence: 'low' | 'medium' | 'high';
  confidence_details?: ConfidenceDetails;
  error_sources: string[];
}

// Basic allergen keywords for heuristic checking
const ALLERGEN_KEYWORDS: Record<string, string[]> = {
  dairy: ['milk', 'cheese', 'yogurt', 'cream', 'butter', 'whey', 'casein', 'lactose', 'ghee', 'custard', 'ice cream'],
  gluten: ['wheat', 'bread', 'pasta', 'barley', 'rye', 'flour', 'cake', 'biscuit', 'cookie', 'cracker', 'malt', 'seitan'],
  peanut: ['peanut', 'groundnut'],
  treenut: ['almond', 'cashew', 'walnut', 'pecan', 'pistachio', 'hazelnut', 'macadamia', 'pine nut'],
  shellfish: ['shrimp', 'crab', 'lobster', 'prawn', 'mussel', 'clam', 'oyster', 'scallop', 'squid', 'octopus'],
  fish: ['fish', 'salmon', 'tuna', 'cod', 'trout', 'bass', 'snapper', 'sardine', 'anchovy'],
  soy: ['soy', 'tofu', 'edamame', 'tempeh', 'miso', 'natto'],
  egg: ['egg', 'mayonnaise', 'meringue', 'albumin']
};

export class NutritionAgent {
  name = 'nutrition';

  private checkHealthConstraints(foodName: string, constraints: any[]): string[] {
    const flags: string[] = [];
    const normalizedFood = foodName.toLowerCase();

    for (const constraint of constraints) {
      if (!constraint) continue;

      const category = constraint.category.toLowerCase();
      // 1. Direct match (e.g. constraint "strawberry" matches "strawberry jam")
      if (normalizedFood.includes(category)) {
        flags.push(`${constraint.severity === 'critical' ? 'CRITICAL: ' : ''}Contains ${category}`);
        continue;
      }

      // 2. Keyword check for common allergens
      const keywords = ALLERGEN_KEYWORDS[category];
      if (keywords) {
        for (const keyword of keywords) {
          if (normalizedFood.includes(keyword)) {
            flags.push(`${constraint.severity === 'critical' ? 'CRITICAL: ' : ''}May contain ${category} (${keyword})`);
            break;
          }
        }
      }
    }
    return flags;
  }

  private applyMemories(foodName: string, currentPortion: string, memories: any[]): { portion: string, memory?: any } {
    // Only apply memory if portion is vague or default
    const isVague = !currentPortion ||
      currentPortion === '1 serving' ||
      currentPortion === 'serving' ||
      ['a', 'an', 'one'].includes(currentPortion.toLowerCase().split(' ')[0]) && !currentPortion.match(/\d/);

    if (!isVague) return { portion: currentPortion };

    const normalizedFood = foodName.toLowerCase();

    // Look for relevant memories
    // We prioritize "specific" matches over "general" ones logic could be improved
    for (const memory of memories) {
      if (memory.category === 'food' || memory.category === 'preferences') {
        const fact = memory.fact.toLowerCase();
        // Heuristic: Check if memory mentions the food name
        if (fact.includes(normalizedFood) || normalizedFood.includes(fact.split(' ')[0] || '')) {
          // Extract portion from fact (assuming fact is like "I eat 200g of chicken" or just "200g chicken")
          // For now, we trust the fact IS the preference. 
          // Better: "I usually have 200g chicken" -> extract "200g".
          // This is hard with regex alone. 
          // Let's assume the ReasoningAgent stored the memory as "200g" or "always 200g".
          // If the memory contains a number and a unit, we try to use it.
          const match = fact.match(/(\d+(?:\.\d+)?\s*(?:g|oz|ml|cup|tbsp|tsp|slice|piece))/i);
          if (match) {
            console.log(`[NutritionAgent] Applying memory for ${foodName}: ${match[1]}`);
            return { portion: match[1], memory };
          }
        }
      }
    }

    return { portion: currentPortion };
  }

  async execute(input: any, context: any) {
    const { items, portions } = input;
    const supabase = context.supabase || createAdminClient();
    const memories = context.memories || [];
    const healthConstraints = context.healthConstraints || [];

    const results = await Promise.all(items.map(async (itemName: string, i: number) => {
      let userPortion = portions[i] || '1 serving';
      let appliedMemory = null;

      // 0. Feature 6: Apply Memories
      if (memories.length > 0) {
        const memoryResult = this.applyMemories(itemName, userPortion, memories);
        if (memoryResult.memory) {
          userPortion = memoryResult.portion;
          appliedMemory = memoryResult.memory;
          // Mark memory as used (async, fire and forget)
          if (context.db) {
            context.db.markMemoryUsed(appliedMemory.id).catch((e: any) => console.error('Failed to mark memory used', e));
          }
        }
      }

      const normalizedSearch = normalizeFoodName(itemName);

      // 1. Check Cache with normalized name
      const { data: cached } = await supabase
        .from('food_products')
        .select('nutrition_data, product_name')
        .ilike('search_term', normalizedSearch)
        .limit(1)
        .maybeSingle();

      let nutrition: EnrichedNutritionResult | null = null;

      if (cached) {
        console.log(`[NutritionAgent] Cache hit for ${itemName} (normalized: ${normalizedSearch})`);
        nutrition = {
          ...cached.nutrition_data,
          confidence: 'high',
          error_sources: []
        };

        // Validate cached data
        if (!isValidNutrition(nutrition, itemName)) {
          console.warn(`[NutritionAgent] Cached data for "${itemName}" has 0 calories, trying fallback`);
          const fallback = findFallbackNutrition(itemName);
          if (fallback && isValidNutrition(fallback, itemName)) {
            nutrition = {
              ...fallback,
              confidence: 'medium',
              error_sources: ['fallback_used_invalid_cache']
            };
          }
        }
      } else {
        // 2. Lookup from APIs
        console.log(`[NutritionAgent] Cache miss for ${itemName}, calling APIs`);
        try {
          const lookupResult = await lookupNutrition(itemName);
          if (lookupResult.status === 'success' && lookupResult.nutrition_data) {
            nutrition = {
              ...lookupResult.nutrition_data,
              confidence: 'high',
              error_sources: []
            };

            // Validate API result
            if (!isValidNutrition(nutrition, itemName)) {
              console.warn(`[NutritionAgent] API result for "${itemName}" has 0 calories, trying fallback`);
              const fallback = findFallbackNutrition(itemName);
              if (fallback && isValidNutrition(fallback, itemName)) {
                nutrition = {
                  ...fallback,
                  confidence: 'medium',
                  error_sources: ['fallback_used_invalid_api']
                };
              }
            }

            // 3. Save to Cache (without confidence fields to keep schema clean if needed, or include them if flexible)
            if (nutrition) {
              const { confidence, confidence_details, error_sources, ...baseNutrition } = nutrition;
              await supabase.from('food_products').insert({
                product_name: lookupResult.product_name || itemName,
                search_term: normalizedSearch,
                nutrition_data: baseNutrition,
                calories: baseNutrition.calories,
                protein_g: baseNutrition.protein_g,
                carbs_g: baseNutrition.carbs_g,
                fat_total_g: baseNutrition.fat_total_g,
                source: lookupResult.source,
                brand: lookupResult.brand
              });
            }

          } else {
            // API returned no data - try fallback
            const fallback = findFallbackNutrition(itemName);
            if (fallback) {
              nutrition = {
                ...fallback,
                confidence: 'medium',
                error_sources: ['fallback_used_no_api_data']
              };
            } else {
              await logFailedLookup(itemName, 'API returned no data and no fallback found', {
                supabase,
                userId: context.userId,
                portion: userPortion
              });
            }
          }
        } catch (e) {
          console.error(`[NutritionAgent] API failure for ${itemName}:`, e);
          const fallback = findFallbackNutrition(itemName);
          if (fallback) {
            nutrition = {
              ...fallback,
              confidence: 'medium',
              error_sources: ['fallback_used_api_error']
            };
          } else {
            await logFailedLookup(itemName, `API error: ${e instanceof Error ? e.message : 'Unknown error'}`, {
              supabase,
              userId: context.userId,
              portion: userPortion
            });
          }
        }
      }

      if (nutrition) {
        // 4. Portion scaling
        const multiplier = await getScalingMultiplier(userPortion, nutrition.serving_size, itemName, supabase);
        console.log(`[NutritionAgent] Scaling ${itemName} by ${multiplier} (user: ${userPortion}, official: ${nutrition.serving_size})`);

        let scaled = scaleNutrition(nutrition, multiplier);

        // Feature 6: Check Health Constraints
        const healthFlags = this.checkHealthConstraints(itemName, healthConstraints);
        if (healthFlags.length > 0) {
          // @ts-ignore
          scaled.health_flags = healthFlags;
        }
        if (appliedMemory) {
          // @ts-ignore
          scaled.applied_memory = appliedMemory;
        }

        return scaled;
      } else {
        // 5. Final fallback: LLM Estimation
        console.log(`[NutritionAgent] No data from API/Cache for "${itemName}", trying LLM estimation`);
        const estimation = await this.estimateNutritionWithLLM(itemName, userPortion, healthConstraints);

        if (estimation) {
          const multiplier = await getScalingMultiplier(userPortion, estimation.serving_size, itemName, supabase);
          let scaled = scaleNutrition(estimation, multiplier);

          // Feature 6: Check Health Constraints (LLM might have done it, but double check heuristics)
          const healthFlags = this.checkHealthConstraints(itemName, healthConstraints);
          // Merge flags if LLM returned some (not yet implemented in LLM return but good to have)
          // @ts-ignore
          const llmFlags = estimation.health_flags || [];
          // @ts-ignore
          scaled.health_flags = [...new Set([...healthFlags, ...llmFlags])];

          if (appliedMemory) {
            // @ts-ignore
            scaled.applied_memory = appliedMemory;
          }

          return scaled;
        } else {
          await logFailedLookup(itemName, 'No nutrition data available from any source including LLM', {
            supabase,
            userId: context.userId,
            portion: userPortion
          });
          return null;
        }
      }
    }));

    return results.filter((r) => r !== null);
  }

  async estimateNutritionWithLLM(itemName: string, userPortion?: string, healthConstraints?: any[]): Promise<EnrichedNutritionResult | null> {
    try {
      console.log(`[NutritionAgent] Estimating for: "${itemName}" (Portion: ${userPortion || 'N/A'})`);
      const openai = createOpenAIClient();

      let healthPrompt = '';
      if (healthConstraints && healthConstraints.length > 0) {
        healthPrompt = `\n**HEALTH CHECK**: The user has these constraints: ${healthConstraints.map((c: any) => `${c.category} (${c.severity})`).join(', ')}. If this food likely violates them, add a 'health_flags' string array to the response using "Contains [Category]" or "May contain [Category]".`;
      }

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are a nutrition expert. Estimate nutrition data for a given food item.
            
            **CRITICAL RULE: HIERARCHY OF PRECISION**
            You must evaluate the input based on the most precise detail provided. The Hierarchy is:
            1. **Specific Weight** (e.g. "200g", "4oz") -> **HIGHEST PRECISION**.
               - If present by User, 'serving_size' MUST be that weight (e.g. "200g").
               - You MUST NOT return "vague_portion".
               - Confidence should be 'high' or 'medium' for the quantity-dependent nutrients.
               - **Conflict Resolution**: If the input says "1 breast, 200g", the Weight ("200g") overrides the Count ("1 breast").
            2. **Specific Count** (e.g. "2 eggs") -> **MEDIUM PRECISION**.
               - 'serving_size' MUST be the count.
               - You MAY return "estimation_variance", but NOT "vague_portion".
            3. **Generic/Vague** (e.g. "chicken") -> **LOW PRECISION**.
               - 'serving_size' should be "1 standard serving".
               - You MUST return "vague_portion".
            
            
            **Context Handling**:
            - The input might start with '[Context: ...]'. This is background.
            - **Specifics Override Context**: If the user provides a Specific Weight or Count in the new message, it INVALIDATES any vagueness in the Context. Treat the Context as resolved history.
            
            **Corrections**:
            - If the user says "actually" or corrects a number, the NEW number is the truth. Ignore the old one.

            ${healthPrompt}
               
            **Output Format**:
            Return ONLY a JSON object matching this interface:
            {
              "food_name": string,
              "calories": number,
              "protein_g": number,
              "carbs_g": number,
              "fat_total_g": number,
              "fiber_g": number,
              "sugar_g": number,
              "sodium_mg": number,
              "fat_saturated_g": number,
              "cholesterol_mg": number,
              "potassium_mg": number,
              "calcium_mg": number,
              "iron_mg": number,
              "magnesium_mg": number,
              "vitamin_a_mcg": number,
              "vitamin_c_mg": number,
              "vitamin_d_mcg": number,
              "serving_size": string (return the quantity you used, e.g. "200g"),
              "confidence": "low" | "medium" | "high",
              "confidence_details": {
                  "calories": "low" | "medium" | "high",
                  "protein_g": "low" | "medium" | "high",
                  "carbs_g": "low" | "medium" | "high",
                  "fat_total_g": "low" | "medium" | "high"
              },
              "error_sources": string[],
              "health_flags": string[] (OPTIONAL)
            }
            If you are completely unsure, return null.`
          },
          {
            role: 'user',
            content: `Estimate nutrition for: "${itemName}". ${userPortion ? `User portion: "${userPortion}".` : ''}
          
          CRITICAL INSTRUCTION: coverage of the quantity is MANDATORY.
          - If I provided a specific weight (e.g. "200g"), you MUST set 'serving_size' to that exact string.
          - You MUST calculate calories/macros for THAT specific amount.
          - Do NOT return "1 standard serving" if a specific quantity is provided.`
          }
        ],
        response_format: {
          type: 'json_object'
        }
      });

      const content = response.choices[0].message.content;
      console.log('[NutritionAgent] LLM Response:', content);
      if (!content) return null;

      const parsed = JSON.parse(content);
      if (!parsed.calories && parsed.calories !== 0) return null;

      return {
        food_name: parsed.food_name || itemName,
        calories: parsed.calories,
        protein_g: parsed.protein_g || 0,
        carbs_g: parsed.carbs_g || 0,
        fat_total_g: parsed.fat_total_g || 0,
        serving_size: parsed.serving_size || '100g',
        fiber_g: parsed.fiber_g || 0,
        sugar_g: parsed.sugar_g || 0,
        sodium_mg: parsed.sodium_mg || 0,
        fat_saturated_g: parsed.fat_saturated_g || 0,
        cholesterol_mg: parsed.cholesterol_mg || 0,
        potassium_mg: parsed.potassium_mg || 0,
        calcium_mg: parsed.calcium_mg || 0,
        iron_mg: parsed.iron_mg || 0,
        magnesium_mg: parsed.magnesium_mg || 0,
        vitamin_a_mcg: parsed.vitamin_a_mcg || 0,
        vitamin_c_mg: parsed.vitamin_c_mg || 0,
        vitamin_d_mcg: parsed.vitamin_d_mcg || 0,
        confidence: parsed.confidence || 'low',
        confidence_details: parsed.confidence_details || {
          calories: 'low',
          protein_g: 'low',
          carbs_g: 'low',
          fat_total_g: 'low'
        },
        error_sources: parsed.error_sources || ['llm_estimation'],
        // @ts-ignore
        health_flags: parsed.health_flags || []
      };
    } catch (e) {
      console.error('[NutritionAgent] LLM estimation failed:', e);
      return null;
    }
  }
}
// Keep legacy export for now
export async function getNutritionForItems(items, portions) {
  const agent = new NutritionAgent();
  return agent.execute({
    items,
    portions
  }, {
    supabase: createAdminClient()
  });
}
