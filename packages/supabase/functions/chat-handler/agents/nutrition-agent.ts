import { lookupNutrition } from '../../nutrition-lookup/index.ts'
import { createAdminClient } from '../../_shared/supabase-client.ts'
import { createOpenAIClient } from '../../_shared/openai-client.ts'
import { NutritionData, Agent, AgentContext } from '../../_shared/types.ts'
import { normalizeFoodName, retry } from '../../_shared/utils.ts'

export async function getScalingMultiplier(userPortion: string, servingSize: string | undefined): Promise<number> {
  if (!servingSize) return 1

  // 1. Rule-based scaling for common units
  const userParsed = parseUnitAndAmount(userPortion)
  const officialParsed = parseUnitAndAmount(servingSize)

  if (userParsed && officialParsed && userParsed.unit === officialParsed.unit) {
    const multiplier = userParsed.amount / officialParsed.amount
    if (!isNaN(multiplier) && multiplier > 0) {
      console.log(`[NutritionAgent] Rule-based scaling: ${userPortion} / ${servingSize} = ${multiplier}`)
      return multiplier
    }
  }

  // Handle common weight-based scaling (g, oz, lb)
  if (userParsed && officialParsed) {
    const userGrams = convertToGrams(userParsed.amount, userParsed.unit)
    const officialGrams = convertToGrams(officialParsed.amount, officialParsed.unit)
    
    if (userGrams && officialGrams) {
      const multiplier = userGrams / officialGrams
      console.log(`[NutritionAgent] Weight-based scaling: ${userGrams}g / ${officialGrams}g = ${multiplier}`)
      return multiplier
    }
  }

  // 2. Fallback to LLM for ambiguous descriptions
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
  return isNaN(multiplier) ? 1 : multiplier
}

function parseUnitAndAmount(str: string): { amount: number, unit: string } | null {
  const match = str.toLowerCase().match(/^([\d\/\.]+)\s*(.*)$/);
  if (!match) return null;
  
  let amountStr = match[1];
  let amount: number;
  
  if (amountStr.includes('/')) {
    const [num, den] = amountStr.split('/').map(parseFloat);
    amount = num / den;
  } else {
    amount = parseFloat(amountStr);
  }
  
  return { amount, unit: match[2].trim().replace(/s$/, '') }; // Simple plural removal
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
      } else {
        // 2. Lookup from APIs with retry
        console.log(`[NutritionAgent] Cache miss for ${itemName}, calling APIs`)
        try {
          const lookupResult = await retry(() => lookupNutrition(itemName))

          if (lookupResult.status === 'success' && lookupResult.nutrition_data) {
            nutrition = lookupResult.nutrition_data as NutritionData
            
            // 3. Save to Cache with both original and normalized search term
            await supabase.from('food_products').insert({
              product_name: lookupResult.product_name,
              search_term: normalizedSearch,
              nutrition_data: nutrition,
              source: lookupResult.source,
              brand: lookupResult.brand
            })
          }
        } catch (e) {
          console.error(`[NutritionAgent] API failure for ${itemName}:`, e)
        }
      }

      if (nutrition) {
        // 4. Portion scaling
        const multiplier = await getScalingMultiplier(userPortion, nutrition.serving_size)
        console.log(`[NutritionAgent] Scaling ${itemName} by ${multiplier} (user: ${userPortion}, official: ${nutrition.serving_size})`)
        const scaledNutrition = scaleNutrition(nutrition, multiplier)
        results.push(scaledNutrition)
      }
    }

    return results
  }
}

// Keep legacy export for now
export async function getNutritionForItems(items: string[], portions: string[]): Promise<NutritionData[]> {
  const agent = new NutritionAgent()
  return agent.execute({ items, portions }, { supabase: createAdminClient() } as any)
}
