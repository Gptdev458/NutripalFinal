import { serve } from "https://deno.land/std/http/server.ts";

// Define CORS headers
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*", // Allow requests from any origin
  "Access-Control-Allow-Methods": "POST, OPTIONS", // Allow POST and OPTIONS methods
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", // Allowed headers
};

// Define expected input profile data structure
interface ProfileData {
  age?: number;
  weight_kg?: number;
  height_cm?: number;
  sex?: 'male' | 'female' | 'other';
  activity_level?: 'sedentary' | 'lightly_active' | 'moderately_active' | 'very_active' | 'extra_active';
  health_goal?: 'weight_loss' | 'weight_gain' | 'maintenance';
}

// --- Calculation Logic ---

// Mifflin-St Jeor BMR Calculation
function calculateBMR(profile: Required<ProfileData>): number {
  let bmr: number;
  const { weight_kg, height_cm, age, sex } = profile;

  if (sex === 'male') {
    bmr = (10 * weight_kg) + (6.25 * height_cm) - (5 * age) + 5;
  } else if (sex === 'female') {
    bmr = (10 * weight_kg) + (6.25 * height_cm) - (5 * age) - 161;
  } else {
    // Use average or female as default for 'other'
    bmr = (10 * weight_kg) + (6.25 * height_cm) - (5 * age) - 78; // Average-ish
  }
  return Math.round(bmr);
}

// Get Activity Factor Multiplier
function getActivityFactor(level: Required<ProfileData>['activity_level']): number {
  switch (level) {
    case 'sedentary': return 1.2;
    case 'lightly_active': return 1.375;
    case 'moderately_active': return 1.55;
    case 'very_active': return 1.725;
    case 'extra_active': return 1.9;
    default: return 1.375; // Default to lightly active
  }
}

// Adjust TEE based on Health Goal
function adjustCaloriesForGoal(tee: number, goal: Required<ProfileData>['health_goal']): number {
  switch (goal) {
    case 'weight_loss': return Math.round(tee - 500); // Approx 0.5kg/week loss
    case 'weight_gain': return Math.round(tee + 500); // Approx 0.5kg/week gain
    case 'maintenance': return Math.round(tee);
    default: return Math.round(tee); // Default to maintenance
  }
}

// Calculate Macronutrients and Fiber
function calculateMacrosAndFiber(adjustedCalories: number, weight_kg: number): { protein_g: number; fat_g: number; carbs_g: number; fiber_g: number; fat_saturated_g: number } {
  // Protein: 1.8g per kg body weight
  const protein_g = Math.round(weight_kg * 1.8);
  const proteinCalories = protein_g * 4;

  // Fat: 25% of total adjusted calories
  const fatCalories = adjustedCalories * 0.25;
  const fat_g = Math.round(fatCalories / 9);

  // Guideline: Saturated fat < 10% of total calories
  const saturatedFat_g = Math.round((adjustedCalories * 0.1) / 9);

  // Carbohydrates: Remaining calories
  const carbCalories = adjustedCalories - proteinCalories - fatCalories;
  const carbs_g = Math.round(carbCalories / 4);

  // Guideline: Fiber 14g per 1000 kcal
  const fiber_g = Math.round((adjustedCalories / 1000) * 14);

  return { protein_g, fat_g, carbs_g, fiber_g, fat_saturated_g: saturatedFat_g };
}

// --- General Guideline Logic ---
// Provides standard reference values, slightly adjusted for age/sex where applicable
function getGeneralGuidelines(profile: Required<ProfileData>): Record<string, number> {
    const { age, sex } = profile;
    const guidelines: Record<string, number> = {};

    // Sodium (mg) - General limit < 2300mg
    guidelines.sodium_mg = 2300;

    // Added Sugars (g) - General limit < 50g (often lower recommended ~25-36g)
    guidelines.sugar_added_g = 30; // Using a lower, more health-conscious target

    // Vitamin D (mcg) - 15mcg for adults 19-70, 20mcg for 70+
    guidelines.vitamin_d_mcg = (age > 70) ? 20 : 15;

    // Calcium (mg) - Based on age/sex groups (simplified examples)
    if (age >= 19 && age <= 50) {
        guidelines.calcium_mg = 1000;
    } else if (age > 50 && sex === 'female') {
        guidelines.calcium_mg = 1200;
    } else if (age > 70 && sex === 'male') {
        guidelines.calcium_mg = 1200;
    } else { // Covers younger, or males 51-70 etc. default to 1000/1200
        guidelines.calcium_mg = (age > 50) ? 1200 : 1000; // Simplistic default
    }

    // Iron (mg) - Based on age/sex groups (simplified examples)
    if (age >= 19 && age <= 50) {
        guidelines.iron_mg = (sex === 'female') ? 18 : 8;
    } else { // Covers younger, and 51+
        guidelines.iron_mg = 8; // RDA drops for women post-menopause
    }

    // Add other general guidelines here if needed
    // guidelines.vitamin_c_mg = (sex === 'male') ? 90 : 75;

    return guidelines;
}

// --- Main Handler ---

serve(async (req: Request) => {
  // Handle CORS preflight request
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    // Extract profile data from request body
    const body: { profile: ProfileData } = await req.json();
    const profile = body.profile;

    // --- Input Validation ---
    if (!profile || typeof profile !== 'object') {
      return new Response(JSON.stringify({ error: "Invalid request body: 'profile' object missing." }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const requiredKeys: Array<keyof ProfileData> = ['age', 'weight_kg', 'height_cm', 'sex', 'activity_level', 'health_goal'];
    const missingKeys = requiredKeys.filter(key => !(key in profile) || profile[key] === null || profile[key] === undefined);

    if (missingKeys.length > 0) {
       return new Response(JSON.stringify({ error: `Missing required profile fields: ${missingKeys.join(', ')}` }), {
         status: 400,
         headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
       });
    }

    // Type assertion after validation
    const validatedProfile = profile as Required<ProfileData>;

    // --- Calculations ---
    const bmr = calculateBMR(validatedProfile);
    const activityFactor = getActivityFactor(validatedProfile.activity_level);
    const tee = bmr * activityFactor;
    const adjustedCalories = adjustCaloriesForGoal(tee, validatedProfile.health_goal);
    const macrosAndFiber = calculateMacrosAndFiber(adjustedCalories, validatedProfile.weight_kg);
    const generalGuidelines = getGeneralGuidelines(validatedProfile); // Get general values

    // --- Construct Response ---
    // Combine calculated values and general guidelines
    const recommendations = {
      calories: adjustedCalories,
      protein_g: macrosAndFiber.protein_g,
      fat_total_g: macrosAndFiber.fat_g,
      carbs_g: macrosAndFiber.carbs_g,
      fiber_g: macrosAndFiber.fiber_g,
      fat_saturated_g: macrosAndFiber.fat_saturated_g, // Add calculated sat fat limit
      ...generalGuidelines, // Spread the general guideline values
    };

    console.log("Calculated Recommendations (including general):", recommendations);

    return new Response(JSON.stringify({ recommendations }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error("Error calculating goals:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Internal Server Error" }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
