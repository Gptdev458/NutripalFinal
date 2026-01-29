import { NutritionData, ValidationResult, Agent, AgentContext } from '../../_shared/types.ts'

/**
 * Validator Agent ensures the nutrition data is accurate and consistent
 */
export class ValidatorAgent implements Agent<NutritionData[], ValidationResult> {
  name = 'validator'

  async execute(items: NutritionData[], _context: AgentContext): Promise<ValidationResult> {
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

      // Allow for some discrepancy due to fiber or rounding (e.g. 25% or 50 calories)
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

      // 4. Critical Erroneous Data Checks
      if (item.calories === 0 && (item.protein_g > 0 || item.carbs_g > 0 || item.fat_total_g > 0)) {
        result.errors.push(`${name}: Erroneous data detected - 0 calories reported with non-zero macros.`)
      }

      // Check for items that should definitely not be 0 calories (e.g. protien, oil, butter, sugar)
      const likelyCaloric = /protein|oil|butter|sugar|fat|carb|flour|bread|meat|chicken|beef|egg|milk|cheese/i
      if (item.calories === 0 && likelyCaloric.test(name)) {
        result.errors.push(`${name}: Erroneous data detected - "${name}" should not be 0 calories.`)
      }
    })

    if (result.errors.length > 0) {
      result.passed = false
    }

    return result
  }

  /**
   * Validates a nutritional goal update
   */
  validateGoal(nutrient: string, value: number, unit: string): ValidationResult {
    const result: ValidationResult = {
      passed: true,
      warnings: [],
      errors: []
    }

    if (value < 0) {
      result.errors.push(`${nutrient}: Goal value cannot be negative.`)
    }

    const lowNutrient = nutrient.toLowerCase()

    // Reasonable ranges for daily goals
    if (lowNutrient.includes('calorie') || lowNutrient === 'kcal') {
      if (value < 1000) {
        result.warnings.push(`${value} kcal seems very low for a daily calorie goal.`)
      } else if (value > 5000) {
        result.warnings.push(`${value} kcal seems very high for a daily calorie goal.`)
      }
    } else if (lowNutrient.includes('protein')) {
      if (value < 30) {
        result.warnings.push(`${value}g seems low for a daily protein goal.`)
      } else if (value > 400) {
        result.warnings.push(`${value}g seems very high for a daily protein goal.`)
      }
    } else if (lowNutrient.includes('sodium')) {
      if (value > 5000) {
        result.warnings.push(`${value}mg of sodium is well above recommended daily limits.`)
      }
    } else if (lowNutrient.includes('fiber')) {
      if (value > 100) {
        result.warnings.push(`${value}g of fiber is extremely high.`)
      }
    }

    if (result.errors.length > 0) {
      result.passed = false
    }

    return result
  }
}

// Keep legacy export for now
export function validateNutritionData(items: NutritionData[]): ValidationResult {
  const agent = new ValidatorAgent()
  // Synchronous fallback for legacy code (since ValidatorAgent.execute is async)
  // We'll just run it and hope for the best, or better yet, just keep the old function for now
  const result: ValidationResult = { passed: true, warnings: [], errors: [] }
  items.forEach((item, index) => {
    const name = item.food_name || `Item ${index + 1}`
    if (item.calories < 0) result.errors.push(`${name}: Calories cannot be negative.`)
    if (item.protein_g < 0) result.errors.push(`${name}: Protein cannot be negative.`)
    if (item.fat_total_g < 0) result.errors.push(`${name}: Fat cannot be negative.`)
    if (item.carbs_g < 0) result.errors.push(`${name}: Carbs cannot be negative.`)
    const calculatedCals = (item.protein_g || 0) * 4 + (item.carbs_g || 0) * 4 + (item.fat_total_g || 0) * 9
    const diff = Math.abs((item.calories || 0) - calculatedCals)
    if (item.calories > 0 && diff > Math.max(50, item.calories * 0.25)) {
      result.warnings.push(`${name}: Calorie count (${item.calories}) is inconsistent with macros (calculated: ${Math.round(calculatedCals)}).`)
    }
  })
  if (result.errors.length > 0) result.passed = false
  return result
}
