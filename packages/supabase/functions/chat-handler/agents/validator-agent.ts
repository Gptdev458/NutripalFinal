import { NutritionData, ValidationResult } from '../../_shared/types.ts'

export function validateNutritionData(items: NutritionData[]): ValidationResult {
  const result: ValidationResult = {
    passed: true,
    warnings: [],
    errors: []
  }

  items.forEach((item, index) => {
    const name = item.food_name || `Item ${index + 1}`

    // 1. Basic Range Checks
    if (item.calories < 0) result.errors.push(`${name}: Calories cannot be negative.`)
    if (item.protein_g < 0) result.errors.push(`${name}: Protein cannot be negative.`)
    if (item.fat_total_g < 0) result.errors.push(`${name}: Fat cannot be negative.`)
    if (item.carbs_g < 0) result.errors.push(`${name}: Carbs cannot be negative.`)

    // 2. Consistency Check (Calories vs Macros)
    // Formula: Cal = P*4 + C*4 + F*9
    const calculatedCals = (item.protein_g || 0) * 4 + (item.carbs_g || 0) * 4 + (item.fat_total_g || 0) * 9
    const diff = Math.abs((item.calories || 0) - calculatedCals)
    
    // Allow for some discrepancy due to fiber or rounding (e.g. 20% or 50 calories)
    if (item.calories > 0 && diff > Math.max(50, item.calories * 0.25)) {
      result.warnings.push(`${name}: Calorie count (${item.calories}) is inconsistent with macros (calculated: ${Math.round(calculatedCals)}).`)
    }

    // 3. Reasonableness Checks
    if (item.calories > 2500) {
      result.warnings.push(`${name}: Unusually high calorie count (${item.calories}) for a single item.`)
    }
    if (item.sodium_mg && item.sodium_mg > 5000) {
      result.warnings.push(`${name}: Very high sodium content (${item.sodium_mg}mg).`)
    }
  })

  if (result.errors.length > 0) {
    result.passed = false
  }

  return result
}
