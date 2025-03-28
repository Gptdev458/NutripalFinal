/**
 * Master list of trackable nutrients with their display names and units
 * Used for goal setting, database columns, and nutrient tracking throughout the app
 */
export const MASTER_NUTRIENT_LIST = [
  // General
  { key: "calories", name: "Calories", unit: "kcal" },
  { key: "water_g", name: "Water", unit: "g" },

  // Macronutrients
  { key: "protein_g", name: "Protein", unit: "g" },
  { key: "fat_total_g", name: "Total Fat", unit: "g" },
  { key: "carbs_g", name: "Carbohydrates", unit: "g" },

  // Fat Subtypes
  { key: "fat_saturated_g", name: "Saturated Fat", unit: "g" },
  { key: "fat_polyunsaturated_g", name: "Polyunsaturated Fat", unit: "g" },
  { key: "fat_monounsaturated_g", name: "Monounsaturated Fat", unit: "g" },
  { key: "fat_trans_g", name: "Trans Fat", unit: "g" },

  // Carb Subtypes
  { key: "fiber_g", name: "Dietary Fiber", unit: "g" },
  { key: "sugar_g", name: "Total Sugars", unit: "g" },
  { key: "sugar_added_g", name: "Added Sugars", unit: "g" },

  // Sterols
  { key: "cholesterol_mg", name: "Cholesterol", unit: "mg" },

  // Minerals
  { key: "sodium_mg", name: "Sodium", unit: "mg" },
  { key: "potassium_mg", name: "Potassium", unit: "mg" },
  { key: "calcium_mg", name: "Calcium", unit: "mg" },
  { key: "iron_mg", name: "Iron", unit: "mg" },
  { key: "magnesium_mg", name: "Magnesium", unit: "mg" },
  { key: "phosphorus_mg", name: "Phosphorus", unit: "mg" },
  { key: "zinc_mg", name: "Zinc", unit: "mg" },
  { key: "copper_mg", name: "Copper", unit: "mg" },
  { key: "manganese_mg", name: "Manganese", unit: "mg" },
  { key: "selenium_mcg", name: "Selenium", unit: "mcg" },

  // Vitamins (Fat-Soluble)
  { key: "vitamin_a_mcg_rae", name: "Vitamin A", unit: "mcg RAE" },
  { key: "vitamin_d_mcg", name: "Vitamin D", unit: "mcg" },
  { key: "vitamin_e_mg", name: "Vitamin E", unit: "mg" },
  { key: "vitamin_k_mcg", name: "Vitamin K", unit: "mcg" },

  // Vitamins (Water-Soluble)
  { key: "vitamin_c_mg", name: "Vitamin C", unit: "mg" },
  { key: "thiamin_mg", name: "Thiamin (B1)", unit: "mg" },
  { key: "riboflavin_mg", name: "Riboflavin (B2)", unit: "mg" },
  { key: "niacin_mg", name: "Niacin (B3)", unit: "mg" },
  { key: "pantothenic_acid_mg", name: "Pantothenic Acid (B5)", unit: "mg" },
  { key: "vitamin_b6_mg", name: "Vitamin B6", unit: "mg" },
  { key: "biotin_mcg", name: "Biotin (B7)", unit: "mcg" },
  { key: "folate_mcg_dfe", name: "Folate (B9)", unit: "mcg DFE" },
  { key: "vitamin_b12_mcg", name: "Vitamin B12", unit: "mcg" },
];

/**
 * Helper function to retrieve a nutrient's details by its key
 * @param {string} key - The unique identifier for the nutrient
 * @returns {Object|null} The nutrient object with key, name, and unit (or null if not found)
 */
export const getNutrientDetails = (key) => {
  return MASTER_NUTRIENT_LIST.find((nutrient) => nutrient.key === key) || null;
}; 