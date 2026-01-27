import { lookupNutrition } from '../../nutrition-lookup/index.ts'
import { createAdminClient } from '../../_shared/supabase-client.ts'
import { createOpenAIClient } from '../../_shared/openai-client.ts'
import { NutritionData } from '../../_shared/types.ts'

async function getScalingMultiplier(userPortion: string, servingSize: string | undefined): Promise<number> {
  if (!servingSize) return 1

  const openai = createOpenAIClient()
  const prompt = `
User portion: "${userPortion}"
Official serving size: "${servingSize}"

Based on the above, calculate the numerical multiplier to convert the nutrition data from the official serving size to the user's portion.
Return ONLY the numerical multiplier (e.g., 1.5, 0.5, 2). If unsure, return 1.
`

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini", // Use mini for speed/cost
    messages: [{ role: "user", content: prompt }],
    max_tokens: 10,
  })

  const content = response.choices[0].message.content?.trim()
  const multiplier = parseFloat(content || '1')
  return isNaN(multiplier) ? 1 : multiplier
}

function scaleNutrition(data: NutritionData, multiplier: number): NutritionData {
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

export async function getNutritionForItems(items: string[], portions: string[]): Promise<NutritionData[]> {
  const results: NutritionData[] = []
  const supabase = createAdminClient()

  for (let i = 0; i < items.length; i++) {
    const itemName = items[i]
    const userPortion = portions[i] || '1 serving'

    // 1. Check Cache
    const { data: cached } = await supabase
      .from('food_products')
      .select('nutrition_data, product_name')
      .ilike('search_term', itemName)
      .limit(1)
      .maybeSingle()

    let nutrition: NutritionData | null = null

    if (cached) {
      console.log(`[NutritionAgent] Cache hit for ${itemName}`)
      nutrition = cached.nutrition_data as NutritionData
    } else {
      // 2. Lookup from APIs
      console.log(`[NutritionAgent] Cache miss for ${itemName}, calling APIs`)
      const lookupResult = await lookupNutrition(itemName)

      if (lookupResult.status === 'success' && lookupResult.nutrition_data) {
        nutrition = lookupResult.nutrition_data as NutritionData
        
        // 3. Save to Cache
        await supabase.from('food_products').insert({
          product_name: lookupResult.product_name,
          search_term: itemName,
          nutrition_data: nutrition,
          source: lookupResult.source,
          brand: lookupResult.brand
        })
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
