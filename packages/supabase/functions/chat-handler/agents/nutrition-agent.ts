import { lookupNutrition } from '../../nutrition-lookup/index.ts'
import { createAdminClient } from '../../_shared/supabase-client.ts'
import { createOpenAIClient } from '../../_shared/openai-client.ts'
import { NutritionData, Agent, AgentContext } from '../../_shared/types.ts'
import { normalizeFoodName, retry } from '../../_shared/utils.ts'

// Fallback nutrition data for common ingredients (per 100g unless specified)
const NUTRITION_FALLBACKS: Record<string, Partial<NutritionData>> = {
  // Oils
  'safflower oil': { calories: 884, protein_g: 0, carbs_g: 0, fat_total_g: 100, serving_size: '100g', food_name: 'safflower oil' },
  'vegetable oil': { calories: 884, protein_g: 0, carbs_g: 0, fat_total_g: 100, serving_size: '100g', food_name: 'vegetable oil' },
  'olive oil': { calories: 884, protein_g: 0, carbs_g: 0, fat_total_g: 100, serving_size: '100g', food_name: 'olive oil' },
  'coconut oil': { calories: 862, protein_g: 0, carbs_g: 0, fat_total_g: 100, serving_size: '100g', food_name: 'coconut oil' },
  'canola oil': { calories: 884, protein_g: 0, carbs_g: 0, fat_total_g: 100, serving_size: '100g', food_name: 'canola oil' },
  'sesame oil': { calories: 884, protein_g: 0, carbs_g: 0, fat_total_g: 100, serving_size: '100g', food_name: 'sesame oil' },
  'avocado oil': { calories: 884, protein_g: 0, carbs_g: 0, fat_total_g: 100, serving_size: '100g', food_name: 'avocado oil' },
  'butter': { calories: 717, protein_g: 0.9, carbs_g: 0.1, fat_total_g: 81, serving_size: '100g', food_name: 'butter' },

  // Broths & Stocks
  'chicken broth': { calories: 15, protein_g: 1, carbs_g: 1, fat_total_g: 0.5, sodium_mg: 800, serving_size: '100g', food_name: 'chicken broth' },
  'beef broth': { calories: 17, protein_g: 2.7, carbs_g: 0.1, fat_total_g: 0.4, sodium_mg: 800, serving_size: '100g', food_name: 'beef broth' },
  'vegetable broth': { calories: 12, protein_g: 0.5, carbs_g: 2, fat_total_g: 0.2, sodium_mg: 600, serving_size: '100g', food_name: 'vegetable broth' },
  'chicken stock': { calories: 15, protein_g: 1, carbs_g: 1, fat_total_g: 0.5, sodium_mg: 800, serving_size: '100g', food_name: 'chicken stock' },
  'beef stock': { calories: 17, protein_g: 2.7, carbs_g: 0.1, fat_total_g: 0.4, sodium_mg: 800, serving_size: '100g', food_name: 'beef stock' },

  // Vegetables
  'fennel': { calories: 31, protein_g: 1.2, carbs_g: 7.3, fat_total_g: 0.2, fiber_g: 3.1, serving_size: '100g', food_name: 'fennel' },
  'fennel bulb': { calories: 31, protein_g: 1.2, carbs_g: 7.3, fat_total_g: 0.2, fiber_g: 3.1, serving_size: '100g', food_name: 'fennel bulb' },
  'garlic': { calories: 149, protein_g: 6.4, carbs_g: 33, fat_total_g: 0.5, serving_size: '100g', food_name: 'garlic' },
  'onion': { calories: 40, protein_g: 1.1, carbs_g: 9.3, fat_total_g: 0.1, serving_size: '100g', food_name: 'onion' },
  'yellow onion': { calories: 40, protein_g: 1.1, carbs_g: 9.3, fat_total_g: 0.1, serving_size: '100g', food_name: 'yellow onion' },
  'red onion': { calories: 40, protein_g: 1.1, carbs_g: 9.3, fat_total_g: 0.1, serving_size: '100g', food_name: 'red onion' },
  'carrot': { calories: 41, protein_g: 0.9, carbs_g: 9.6, fat_total_g: 0.2, fiber_g: 2.8, serving_size: '100g', food_name: 'carrot' },
  'celery': { calories: 16, protein_g: 0.7, carbs_g: 3, fat_total_g: 0.2, fiber_g: 1.6, serving_size: '100g', food_name: 'celery' },
  'tomato': { calories: 18, protein_g: 0.9, carbs_g: 3.9, fat_total_g: 0.2, fiber_g: 1.2, serving_size: '100g', food_name: 'tomato' },
  'potato': { calories: 77, protein_g: 2, carbs_g: 17, fat_total_g: 0.1, fiber_g: 2.2, serving_size: '100g', food_name: 'potato' },
  'sweet potato': { calories: 86, protein_g: 1.6, carbs_g: 20, fat_total_g: 0.1, fiber_g: 3, serving_size: '100g', food_name: 'sweet potato' },
  'broccoli': { calories: 34, protein_g: 2.8, carbs_g: 7, fat_total_g: 0.4, fiber_g: 2.6, serving_size: '100g', food_name: 'broccoli' },
  'spinach': { calories: 23, protein_g: 2.9, carbs_g: 3.6, fat_total_g: 0.4, fiber_g: 2.2, serving_size: '100g', food_name: 'spinach' },
  'lettuce': { calories: 15, protein_g: 1.4, carbs_g: 2.9, fat_total_g: 0.2, fiber_g: 1.3, serving_size: '100g', food_name: 'lettuce' },
  'bell pepper': { calories: 31, protein_g: 1, carbs_g: 6, fat_total_g: 0.3, fiber_g: 2.1, serving_size: '100g', food_name: 'bell pepper' },
  'mushroom': { calories: 22, protein_g: 3.1, carbs_g: 3.3, fat_total_g: 0.3, fiber_g: 1, serving_size: '100g', food_name: 'mushroom' },
  'zucchini': { calories: 17, protein_g: 1.2, carbs_g: 3.1, fat_total_g: 0.3, fiber_g: 1, serving_size: '100g', food_name: 'zucchini' },
  'cucumber': { calories: 15, protein_g: 0.7, carbs_g: 3.6, fat_total_g: 0.1, fiber_g: 0.5, serving_size: '100g', food_name: 'cucumber' },

  // Proteins
  'chicken breast': { calories: 165, protein_g: 31, carbs_g: 0, fat_total_g: 3.6, serving_size: '100g', food_name: 'chicken breast' },
  'chicken thigh': { calories: 209, protein_g: 26, carbs_g: 0, fat_total_g: 11, serving_size: '100g', food_name: 'chicken thigh' },
  'ground beef': { calories: 250, protein_g: 26, carbs_g: 0, fat_total_g: 15, serving_size: '100g', food_name: 'ground beef' },
  'salmon': { calories: 208, protein_g: 20, carbs_g: 0, fat_total_g: 13, serving_size: '100g', food_name: 'salmon' },
  'egg': { calories: 155, protein_g: 13, carbs_g: 1.1, fat_total_g: 11, serving_size: '100g', food_name: 'egg' },
  'tofu': { calories: 76, protein_g: 8, carbs_g: 1.9, fat_total_g: 4.8, serving_size: '100g', food_name: 'tofu' },

  // Dairy
  'milk': { calories: 42, protein_g: 3.4, carbs_g: 5, fat_total_g: 1, serving_size: '100g', food_name: 'milk' },
  'cheese': { calories: 402, protein_g: 25, carbs_g: 1.3, fat_total_g: 33, serving_size: '100g', food_name: 'cheese' },
  'cheddar cheese': { calories: 402, protein_g: 25, carbs_g: 1.3, fat_total_g: 33, serving_size: '100g', food_name: 'cheddar cheese' },
  'parmesan': { calories: 431, protein_g: 38, carbs_g: 4.1, fat_total_g: 29, serving_size: '100g', food_name: 'parmesan' },
  'cream': { calories: 340, protein_g: 2.1, carbs_g: 2.8, fat_total_g: 36, serving_size: '100g', food_name: 'cream' },
  'greek yogurt': { calories: 97, protein_g: 9, carbs_g: 3.6, fat_total_g: 5, serving_size: '100g', food_name: 'greek yogurt' },

  // Grains & Starches
  'rice': { calories: 130, protein_g: 2.7, carbs_g: 28, fat_total_g: 0.3, serving_size: '100g', food_name: 'rice' },
  'white rice': { calories: 130, protein_g: 2.7, carbs_g: 28, fat_total_g: 0.3, serving_size: '100g', food_name: 'white rice' },
  'brown rice': { calories: 111, protein_g: 2.6, carbs_g: 23, fat_total_g: 0.9, fiber_g: 1.8, serving_size: '100g', food_name: 'brown rice' },
  'pasta': { calories: 131, protein_g: 5, carbs_g: 25, fat_total_g: 1.1, serving_size: '100g', food_name: 'pasta' },
  'bread': { calories: 265, protein_g: 9, carbs_g: 49, fat_total_g: 3.2, serving_size: '100g', food_name: 'bread' },
  'flour': { calories: 364, protein_g: 10, carbs_g: 76, fat_total_g: 1, serving_size: '100g', food_name: 'flour' },

  // Condiments & Seasonings
  'salt': { calories: 0, protein_g: 0, carbs_g: 0, fat_total_g: 0, sodium_mg: 38758, serving_size: '100g', food_name: 'salt' },
  'pepper': { calories: 251, protein_g: 10, carbs_g: 64, fat_total_g: 3.3, serving_size: '100g', food_name: 'pepper' },
  'soy sauce': { calories: 53, protein_g: 8, carbs_g: 5, fat_total_g: 0, sodium_mg: 5493, serving_size: '100g', food_name: 'soy sauce' },
  'honey': { calories: 304, protein_g: 0.3, carbs_g: 82, fat_total_g: 0, serving_size: '100g', food_name: 'honey' },
  'sugar': { calories: 387, protein_g: 0, carbs_g: 100, fat_total_g: 0, serving_size: '100g', food_name: 'sugar' },
}

// Modifiers to remove for loose matching
const INGREDIENT_MODIFIERS = [
  'organic', 'fresh', 'frozen', 'canned', 'dried', 'raw', 'cooked',
  'low sodium', 'low-sodium', 'reduced sodium', 'no salt added',
  'low fat', 'low-fat', 'reduced fat', 'fat free', 'fat-free',
  'high oleic', 'extra virgin', 'virgin', 'pure', 'natural',
  'whole', 'chopped', 'diced', 'sliced', 'minced', 'crushed',
  'boneless', 'skinless', 'bone-in', 'skin-on',
  'large', 'medium', 'small', 'mini',
  'ripe', 'unripe', 'mature',
  'unsalted', 'salted', 'roasted', 'toasted',
  'plain', 'flavored', 'sweetened', 'unsweetened',
]

// Track failed lookups for logging
const failedLookups: Map<string, number> = new Map()

/**
 * Find a fallback from NUTRITION_FALLBACKS using loose matching
 */
function findFallbackNutrition(searchTerm: string): NutritionData | null {
  const normalized = searchTerm.toLowerCase().trim()

  // 1. Exact match
  if (NUTRITION_FALLBACKS[normalized]) {
    return NUTRITION_FALLBACKS[normalized] as NutritionData
  }

  // 2. Try after removing modifiers
  let simplified = normalized
  for (const modifier of INGREDIENT_MODIFIERS) {
    simplified = simplified.replace(new RegExp(`\\b${modifier}\\b`, 'gi'), '').trim()
  }
  simplified = simplified.replace(/\s+/g, ' ').trim()

  if (simplified !== normalized && NUTRITION_FALLBACKS[simplified]) {
    console.log(`[NutritionAgent] Fallback match after removing modifiers: "${normalized}" -> "${simplified}"`)
    return NUTRITION_FALLBACKS[simplified] as NutritionData
  }

  // 3. Partial match - check if any fallback key is contained in search term or vice versa
  for (const [key, data] of Object.entries(NUTRITION_FALLBACKS)) {
    // Check if fallback key is contained in the search term
    if (normalized.includes(key)) {
      console.log(`[NutritionAgent] Fallback partial match: "${normalized}" contains "${key}"`)
      return data as NutritionData
    }
    // Check if search term is contained in fallback key
    if (key.includes(simplified) && simplified.length >= 3) {
      console.log(`[NutritionAgent] Fallback partial match: "${key}" contains "${simplified}"`)
      return data as NutritionData
    }
  }

  // 4. Try word-level matching for the core ingredient
  const words = simplified.split(' ')
  for (let i = words.length - 1; i >= 0; i--) {
    const candidate = words.slice(i).join(' ')
    if (NUTRITION_FALLBACKS[candidate]) {
      console.log(`[NutritionAgent] Fallback word match: "${normalized}" -> "${candidate}"`)
      return NUTRITION_FALLBACKS[candidate] as NutritionData
    }
  }

  return null
}

/**
 * Log failed ingredient lookup for analytics
 */
async function logFailedLookup(ingredient: string, reason: string, context?: { supabase: any, userId: string, portion?: string }): Promise<void> {
  const count = (failedLookups.get(ingredient) || 0) + 1
  failedLookups.set(ingredient, count)
  console.warn(`[NutritionAgent] FAILED LOOKUP: "${ingredient}" - ${reason} (attempt ${count})`)

  if (context?.supabase && context?.userId) {
    try {
      await context.supabase.from('analytics_failed_lookups').insert({
        user_id: context.userId,
        query: ingredient,
        portion: context.portion,
        failure_type: 'no_data',
        details: { reason, attempt: count }
      })
    } catch (err) {
      console.error('[NutritionAgent] Error logging analytics:', err)
    }
  }
}

/**
 * Check if nutrition data is valid (has non-zero calories for non-zero-calorie foods)
 */
function isValidNutrition(data: NutritionData | null, itemName: string): boolean {
  if (!data) return false

  // Most foods should have calories - only salt/spices have 0
  const zeroCalorieItems = ['salt', 'water', 'pepper', 'spice', 'herb', 'tea', 'coffee']
  const isZeroCalorieItem = zeroCalorieItems.some(z => itemName.toLowerCase().includes(z))

  if (data.calories === 0 && !isZeroCalorieItem) {
    console.warn(`[NutritionAgent] Warning: 0 calories for "${itemName}" - may be incorrect`)
    return false
  }

  return true
}

export async function getScalingMultiplier(userPortion: string, servingSize: string | undefined, foodName?: string, supabase?: any): Promise<number> {
  if (!servingSize) return 1

  // 1. Rule-based scaling for common units
  const userParsed = parseUnitAndAmount(userPortion)
  const officialParsed = parseUnitAndAmount(servingSize)

  if (userParsed && officialParsed) {
    // Exact unit match
    if (userParsed.unit === officialParsed.unit) {
      const multiplier = userParsed.amount / officialParsed.amount
      if (!isNaN(multiplier) && multiplier > 0) {
        console.log(`[NutritionAgent] Rule-based scaling: ${userPortion} / ${servingSize} = ${multiplier}`)
        return multiplier
      }
    }

    // Handle common weight-based scaling (g, oz, lb)
    const userGrams = convertToGrams(userParsed.amount, userParsed.unit)
    const officialGrams = convertToGrams(officialParsed.amount, officialParsed.unit)

    if (userGrams && officialGrams) {
      const multiplier = userGrams / officialGrams
      console.log(`[NutritionAgent] Weight-based scaling: ${userGrams}g / ${officialGrams}g = ${multiplier}`)
      return multiplier
    }

    // Cross-unit scaling (e.g., cups to ml, tbsp to tsp)
    const userVol = convertToMl(userParsed.amount, userParsed.unit)
    const officialVol = convertToMl(officialParsed.amount, officialParsed.unit)

    if (userVol && officialVol) {
      const multiplier = userVol / officialVol
      console.log(`[NutritionAgent] Volume-based scaling: ${userVol}ml / ${officialVol}ml = ${multiplier}`)
      return multiplier
    }
  }

  // Handle case where servingSize contains weight in parens: "1 cup (240g)" or "1 tbsp (15 ml)"
  if (userParsed && servingSize.includes('(')) {
    const parenMatch = servingSize.match(/\(([^)]+)\)/)
    if (parenMatch) {
      const parenContent = parenMatch[1]
      const parenParsed = parseUnitAndAmount(parenContent)
      if (parenParsed) {
        // Try weight scaling first
        const userGrams = convertToGrams(userParsed.amount, userParsed.unit)
        const parenGrams = convertToGrams(parenParsed.amount, parenParsed.unit)
        if (userGrams && parenGrams) {
          const multiplier = userGrams / parenGrams
          console.log(`[NutritionAgent] Paren-weight scaling: ${userGrams}g / ${parenGrams}g = ${multiplier}`)
          return multiplier
        }

        // Try volume scaling
        const userVol = convertToMl(userParsed.amount, userParsed.unit)
        const parenVol = convertToMl(parenParsed.amount, parenParsed.unit)
        if (userVol && parenVol) {
          const multiplier = userVol / parenVol
          console.log(`[NutritionAgent] Paren-volume scaling: ${userVol}ml / ${parenVol}ml = ${multiplier}`)
          return multiplier
        }
      }
    }
  }

  // 2. Check conversion cache if foodName provided
  if (foodName && supabase) {
    try {
      const normalizedFood = foodName.toLowerCase().trim()
      const { data: cached } = await supabase
        .from('unit_conversions')
        .select('multiplier')
        .eq('food_name', normalizedFood)
        .eq('from_unit', userPortion.toLowerCase().trim())
        .eq('to_unit', servingSize.toLowerCase().trim())
        .limit(1)
        .maybeSingle()

      if (cached) {
        console.log(`[NutritionAgent] Conversion cache hit: ${userPortion} -> ${servingSize} = ${cached.multiplier}`)
        return cached.multiplier
      }
    } catch (err) {
      console.error('[NutritionAgent] Error checking conversion cache:', err)
    }
  }

  // 3. Fallback to LLM for ambiguous descriptions
  console.log(`[NutritionAgent] Falling back to LLM for scaling: "${userPortion}" vs "${servingSize}"`)
  const openai = createOpenAIClient()
  const prompt = `
User portion: "${userPortion}"
Official serving size: "${servingSize}"

Based on the above, calculate the numerical multiplier to convert the nutrition data from the official serving size to the user's portion.
Return ONLY the numerical multiplier (e.g., 1.5, 0.5, 2). If unsure, return 1.
`

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 10,
  })

  const content = response.choices[0].message.content?.trim()
  const multiplier = parseFloat(content || '1')
  const finalMultiplier = isNaN(multiplier) ? 1 : multiplier

  // 4. Save to cache if successful
  if (foodName && supabase && !isNaN(finalMultiplier)) {
    try {
      await supabase.from('unit_conversions').insert({
        food_name: foodName.toLowerCase().trim(),
        from_unit: userPortion.toLowerCase().trim(),
        to_unit: servingSize.toLowerCase().trim(),
        multiplier: finalMultiplier
      })
    } catch (err) {
      console.error('[NutritionAgent] Error saving to conversion cache:', err)
    }
  }

  return finalMultiplier
}

function parseUnitAndAmount(str: string): { amount: number, unit: string } | null {
  const cleaned = str.toLowerCase().trim()

  // Handle cases like "a cup", "an egg", "some milk"
  const wordAmounts: Record<string, number> = {
    'a': 1, 'an': 1, 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
    'half': 0.5, 'quarter': 0.25, 'double': 2, 'triple': 3, 'couple': 2
  }

  const firstWord = cleaned.split(/\s+/)[0]
  if (wordAmounts[firstWord]) {
    const unit = cleaned.substring(firstWord.length).trim().replace(/s$/, '')
    return { amount: wordAmounts[firstWord], unit: unit || 'serving' }
  }

  const match = cleaned.match(/^([\d\/\.\s\-]+)\s*(.*)$/);
  if (!match) return null;

  let amountStr = match[1].trim();
  let amount: number;

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

  return { amount, unit: match[2].trim().replace(/s$/, '') || 'serving' };
}

function convertToGrams(amount: number, unit: string): number | null {
  const units: Record<string, number> = {
    'g': 1,
    'gram': 1,
    'mg': 0.001,
    'milligram': 0.001,
    'kg': 1000,
    'kilogram': 1000,
    'oz': 28.35,
    'ounce': 28.35,
    'lb': 453.59,
    'pound': 453.59,
  }
  return units[unit] ? amount * units[unit] : null
}

function convertToMl(amount: number, unit: string): number | null {
  const units: Record<string, number> = {
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
    'gallon': 3785.41,
  }
  return units[unit] ? amount * units[unit] : null
}

export function scaleNutrition(data: NutritionData, multiplier: number): NutritionData {
  if (multiplier === 1) return data

  const scaled = { ...data }
  const keysToScale: (keyof NutritionData)[] = [
    'calories', 'protein_g', 'fat_total_g', 'carbs_g', 'fiber_g',
    'sugar_g', 'sodium_mg', 'fat_saturated_g', 'cholesterol_mg',
    'potassium_mg', 'fat_trans_g', 'calcium_mg', 'iron_mg', 'sugar_added_g'
  ]

  keysToScale.forEach(key => {
    if (typeof scaled[key] === 'number') {
      // @ts-ignore: key is valid
      scaled[key] = Math.round((scaled[key] as number) * multiplier * 10) / 10
      if (key === 'calories') scaled[key] = Math.round(scaled[key] as number)
    }
  })

  return scaled
}

export class NutritionAgent implements Agent<{ items: string[], portions: string[] }, NutritionData[]> {
  name = 'nutrition'

  async execute(input: { items: string[], portions: string[] }, context: AgentContext): Promise<NutritionData[]> {
    const { items, portions } = input
    const results: NutritionData[] = []
    const supabase = context.supabase || createAdminClient()

    for (let i = 0; i < items.length; i++) {
      const itemName = items[i]
      const userPortion = portions[i] || '1 serving'
      const normalizedSearch = normalizeFoodName(itemName)

      // 1. Check Cache with normalized name
      const { data: cached } = await supabase
        .from('food_products')
        .select('nutrition_data, product_name')
        .ilike('search_term', normalizedSearch)
        .limit(1)
        .maybeSingle()

      let nutrition: NutritionData | null = null

      if (cached) {
        console.log(`[NutritionAgent] Cache hit for ${itemName} (normalized: ${normalizedSearch})`)
        nutrition = cached.nutrition_data as NutritionData

        // Validate cached data
        if (!isValidNutrition(nutrition, itemName)) {
          console.warn(`[NutritionAgent] Cached data for "${itemName}" has 0 calories, trying fallback`)
          const fallback = findFallbackNutrition(itemName)
          if (fallback && isValidNutrition(fallback, itemName)) {
            nutrition = fallback
          }
        }
      } else {
        // 2. Lookup from APIs with retry
        console.log(`[NutritionAgent] Cache miss for ${itemName}, calling APIs`)
        try {
          const lookupResult = await retry(() => lookupNutrition(itemName))

          if (lookupResult.status === 'success' && lookupResult.nutrition_data) {
            nutrition = lookupResult.nutrition_data as NutritionData

            // Validate API result
            if (!isValidNutrition(nutrition, itemName)) {
              console.warn(`[NutritionAgent] API result for "${itemName}" has 0 calories, trying fallback`)
              const fallback = findFallbackNutrition(itemName)
              if (fallback && isValidNutrition(fallback, itemName)) {
                nutrition = fallback
              }
            }

            // 3. Save to Cache with both original and normalized search term
            if (nutrition) {
              await supabase.from('food_products').insert({
                product_name: lookupResult.product_name || itemName,
                search_term: normalizedSearch,
                nutrition_data: nutrition,
                calories: nutrition.calories,
                protein_g: nutrition.protein_g,
                carbs_g: nutrition.carbs_g,
                fat_total_g: nutrition.fat_total_g,
                source: lookupResult.source,
                brand: lookupResult.brand
              })
            }
          } else {
            // API returned no data - try fallback
            console.warn(`[NutritionAgent] API returned no data for "${itemName}"`)
            nutrition = findFallbackNutrition(itemName)

            if (!nutrition) {
              await logFailedLookup(itemName, 'API returned no data and no fallback found', { supabase, userId: context.userId, portion: userPortion })
            }
          }
        } catch (e) {
          console.error(`[NutritionAgent] API failure for ${itemName}:`, e)
          // Try fallback nutrition data
          nutrition = findFallbackNutrition(itemName)

          if (!nutrition) {
            await logFailedLookup(itemName, `API error: ${e instanceof Error ? e.message : 'Unknown error'}`, { supabase, userId: context.userId, portion: userPortion })
          }
        }
      }

      if (nutrition) {
        // 4. Portion scaling
        const multiplier = await getScalingMultiplier(userPortion, nutrition.serving_size, itemName, supabase)
        console.log(`[NutritionAgent] Scaling ${itemName} by ${multiplier} (user: ${userPortion}, official: ${nutrition.serving_size})`)
        const scaledNutrition = scaleNutrition(nutrition, multiplier)
        results.push(scaledNutrition)
      } else {
        // 5. Final fallback: LLM Estimation
        console.log(`[NutritionAgent] No data from API/Cache for "${itemName}", trying LLM estimation`)
        const estimation = await this.estimateNutritionWithLLM(itemName)
        if (estimation) {
          console.log(`[NutritionAgent] LLM Estimation successful for "${itemName}"`)
          const multiplier = await getScalingMultiplier(userPortion, estimation.serving_size, itemName, supabase)
          const scaledNutrition = scaleNutrition(estimation, multiplier)
          results.push(scaledNutrition)
        } else {
          // Log as failed - no nutrition data at all
          await logFailedLookup(itemName, 'No nutrition data available from any source including LLM', { supabase, userId: context.userId, portion: userPortion })
        }
      }
    }

    return results
  }

  private async estimateNutritionWithLLM(itemName: string): Promise<NutritionData | null> {
    try {
      const openai = createOpenAIClient()
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are a nutrition expert. Estimate nutrition data for a given food item. 
            Return ONLY a JSON object matching this interface:
            {
              "food_name": string,
              "calories": number,
              "protein_g": number,
              "carbs_g": number,
              "fat_total_g": number,
              "serving_size": string (e.g. "100g", "1 cup", "1 scoop")
            }
            If you are completely unsure, return null.`
          },
          {
            role: 'user',
            content: `Estimate nutrition for: "${itemName}"`
          }
        ],
        response_format: { type: 'json_object' }
      })

      const content = response.choices[0].message.content
      if (!content) return null

      const parsed = JSON.parse(content)
      if (!parsed.calories && parsed.calories !== 0) return null

      return {
        food_name: parsed.food_name || itemName,
        calories: parsed.calories,
        protein_g: parsed.protein_g || 0,
        carbs_g: parsed.carbs_g || 0,
        fat_total_g: parsed.fat_total_g || 0,
        serving_size: parsed.serving_size || '100g',
        fiber_g: parsed.fiber_g || 0,
        sugar_g: parsed.sugar_g || 0,
        sodium_mg: parsed.sodium_mg || 0
      } as NutritionData
    } catch (e) {
      console.error('[NutritionAgent] LLM estimation failed:', e)
      return null
    }
  }
}

// Keep legacy export for now
export async function getNutritionForItems(items: string[], portions: string[]): Promise<NutritionData[]> {
  const agent = new NutritionAgent()
  return agent.execute({ items, portions }, { supabase: createAdminClient() } as any)
}
