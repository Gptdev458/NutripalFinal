/**
 * Tool Executor for ReasoningAgent
 * 
 * Executes tools by delegating to existing agents and services.
 * This bridges the ReasoningAgent's tool calls to our existing functionality.
 */
import { DbService } from './db-service.ts';
import { NutritionAgent } from '../agents/nutrition-agent.ts';
import { RecipeAgent } from '../agents/recipe-agent.ts';
import { InsightAgent } from '../agents/insight-agent.ts';
import { ValidatorAgent } from '../agents/validator-agent.ts';
import { createOpenAIClient } from '../../_shared/openai-client.ts';
import { getStartAndEndOfDay, getDateRange } from '../../_shared/utils.ts';

export class ToolExecutor {
  context: any;
  db: DbService;
  nutritionAgent: NutritionAgent;
  recipeAgent: RecipeAgent;
  insightAgent: InsightAgent;
  validatorAgent: ValidatorAgent;
  agentContext: any;

  constructor(context: any) {
    this.context = context;
    this.db = new DbService(context.supabase);
    this.nutritionAgent = new NutritionAgent();
    this.recipeAgent = new RecipeAgent();
    this.insightAgent = new InsightAgent();
    this.validatorAgent = new ValidatorAgent();
    this.agentContext = {
      userId: context.userId,
      supabase: context.supabase,
      timezone: context.timezone || 'UTC',
      sessionId: context.sessionId
    };
  }

  /**
   * Execute a tool by name with given arguments
   */
  async execute(toolName: string, args: any = {}) {
    console.log(`[ToolExecutor] Executing tool: ${toolName}`, args);
    try {
      switch (toolName) {
        // User Context Tools
        case 'get_user_profile':
          return this.getUserProfile();
        case 'get_user_goals':
          return this.getUserGoals();
        case 'get_today_progress':
          return this.getTodayProgress();
        case 'get_weekly_summary':
          return this.getWeeklySummary();
        case 'get_food_history':
          return this.getFoodHistory(args.days || 7);
        // Nutrition Tools
        case 'lookup_nutrition':
          return this.lookupNutrition(args.food, args.portion, args.calories, args.macros);
        case 'estimate_nutrition':
          return this.estimateNutrition(args.description, args.portion, args.calories_hint, args.tracked_nutrients);
        case 'validate_nutrition':
          return this.validateNutrition(args);
        case 'compare_foods':
          return this.compareFoods(args.foods);
        // Recipe Tools
        case 'search_saved_recipes':
          return this.searchSavedRecipes(args.query);
        case 'get_recipe_details':
          return this.getRecipeDetails(args.recipe_id);
        case 'parse_recipe_text':
          return this.parseRecipeText(args.recipe_text, args.recipe_name);
        case 'calculate_recipe_serving':
          return this.calculateRecipeServing(args.recipe_id, args.servings);
        // Logging Tools
        case 'propose_food_log':
          return this.proposeFoodLog(args);
        case 'propose_recipe_log':
          return this.proposeRecipeLog(args);
        case 'confirm_pending_log':
          return this.confirmPendingLog(args.proposal_id);
        // Goal Tools
        case 'update_user_goal':
          return this.updateUserGoal(args.nutrient, args.target_value, args.unit);
        case 'calculate_recommended_goals':
          return this.calculateRecommendedGoals();
        // Insight Tools
        case 'get_food_recommendations':
          return this.getFoodRecommendations(args.focus, args.preferences);
        case 'analyze_eating_patterns':
          return this.analyzeEatingPatterns(args.days || 14);
        case 'get_progress_report':
          return this.getProgressReport();
        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }
    } catch (error: any) {
      console.error(`[ToolExecutor] Error executing ${toolName}:`, error);
      return {
        error: true,
        message: `Failed to execute ${toolName}: ${error.message}`
      };
    }
  }

  // =============================================================
  // USER CONTEXT TOOLS
  // =============================================================

  async getUserProfile() {
    const { data } = await this.db.getUserProfile(this.context.userId);
    if (!data) {
      return {
        message: "No profile found. User hasn't set up their profile yet."
      };
    }
    return {
      height_cm: data.height_cm || data.height,
      weight_kg: data.weight_kg || data.weight,
      age: data.age,
      gender: data.gender,
      activity_level: data.activity_level,
      goal: data.health_goal || data.goal,
      dietary_preferences: data.dietary_preferences,
      allergies: data.allergies
    };
  }

  async getUserGoals() {
    const goals = await this.db.getUserGoals(this.context.userId);
    if (!goals || goals.length === 0) {
      return {
        message: "No goals set yet. User should set their nutrition targets."
      };
    }
    // Convert array to object for easier reading
    const goalsMap: Record<string, any> = {};
    for (const goal of goals) {
      goalsMap[goal.nutrient] = {
        target: goal.target_value,
        unit: goal.unit || (goal.nutrient === 'calories' ? 'kcal' : 'g')
      };
    }
    return goalsMap;
  }

  async getTodayProgress() {
    const timezone = this.context.timezone || 'UTC';
    const { start, end } = getStartAndEndOfDay(new Date(), timezone);
    const logs = await this.db.getFoodLogs(this.context.userId, start, end);

    // Dynamically accumulate any nutrient found in NUTRIENT_MAP
    const map = this.getMasterNutrientMap();
    const totals: Record<string, number> = {
      calories: 0,
      items_logged: 0
    };

    // Initialize all possible keys
    Object.keys(map).forEach(key => totals[key] = 0);

    if (logs) {
      for (const log of logs) {
        totals.calories += log.calories || 0;
        totals.items_logged++;
        // Accumulate all other keys
        Object.keys(map).forEach(key => {
          if (key === 'fat_total_g') {
            totals[key] += log.fat_total_g || log.fat_g || 0;
          } else {
            totals[key] += (log as any)[key] || 0;
          }
        });
      }
    }

    // Round values
    Object.keys(totals).forEach((key) => {
      totals[key] = Math.round(totals[key] * 10) / 10;
    });
    totals.calories = Math.round(totals.calories);

    return totals;
  }

  async getWeeklySummary() {
    const result: any = await this.insightAgent.execute(undefined, this.agentContext);
    const todayProgress = await this.getTodayProgress();
    return {
      daily_averages: result.patterns ? this.parseWeeklyAverages(result.patterns) : {},
      today_totals: todayProgress,
      goal_progress: result.goal_progress,
      suggestions: result.suggestions,
      compliance_summary: this.calculateCompliance(result.goal_progress)
    };
  }

  private parseWeeklyAverages(patterns: string[]) {
    const averages: Record<string, number> = {};
    for (const pattern of patterns) {
      const match = pattern.match(/Weekly avg (\w+): (\d+)/);
      if (match) {
        averages[match[1]] = parseInt(match[2]);
      }
    }
    return averages;
  }

  private calculateCompliance(progress: Record<string, number>) {
    const values = Object.values(progress);
    if (values.length === 0) return 'No goals to track';
    const avgProgress = values.reduce((a, b) => a + b, 0) / values.length;
    if (avgProgress >= 90 && avgProgress <= 110) return 'On track! 🎯';
    if (avgProgress < 90) return 'Under targets';
    return 'Above targets';
  }

  async getFoodHistory(days: number) {
    const timezone = this.context.timezone || 'UTC';
    const { start, end } = getDateRange(new Date(), Math.min(days, 30), timezone);
    const logs = await this.db.getFoodLogs(this.context.userId, start, end);

    const byDate: Record<string, any[]> = {};
    for (const log of logs || []) {
      const date = new Date(log.log_time).toISOString().split('T')[0];
      if (!byDate[date]) byDate[date] = [];
      byDate[date].push({
        food_name: log.food_name,
        calories: log.calories,
        protein_g: log.protein_g,
        portion: log.portion
      });
    }
    return {
      days_requested: days,
      history: byDate,
      total_items: logs?.length || 0
    };
  }

  // =============================================================
  // NUTRITION TOOLS
  // =============================================================

  async lookupNutrition(food: string, portion: string, calories?: number, macros?: { protein: number, carbs: number, fat: number }) {
    console.log(`[ToolExecutor] lookupNutrition for: ${food}${calories ? ` (${calories} kcal)` : ''}`);
    if (calories !== undefined && macros?.protein !== undefined && macros?.carbs !== undefined && macros?.fat !== undefined) {
      return {
        food_name: food,
        portion: portion || 'standard serving',
        calories,
        protein_g: macros.protein,
        carbs_g: macros.carbs,
        fat_total_g: macros.fat,
        source: 'user_provided',
        ...macros
      };
    }

    const goals = await this.getUserGoals();
    const trackedNutrients = (typeof goals === 'object' && !(goals as any).message) ? Object.keys(goals) : [];

    if (calories !== undefined) {
      return this.estimateNutrition(food, portion, calories, trackedNutrients);
    }

    const estimate: any = await this.estimateNutrition(food, portion, undefined, trackedNutrients);
    if (estimate.error) {
      console.warn(`[ToolExecutor] AI Estimate failed, falling back to database`);
      const items = [food];
      const portions = [portion || '1 serving'];
      const results: any[] = await this.nutritionAgent.execute({ items, portions }, this.agentContext);

      if (results && results.length > 0) {
        const result = results[0];
        const filteredResult: any = {
          food_name: result.food_name || food,
          portion: portion || result.serving_size || 'standard serving',
          calories: Math.round(result.calories || 0),
          source: 'database'
        };

        trackedNutrients.forEach(key => {
          if (result[key] !== undefined && key !== 'calories') {
            filteredResult[key] = typeof result[key] === 'number' ? Math.round(result[key] * 10) / 10 : result[key];
          }
        });

        return filteredResult;
      }
    }
    return estimate;
  }

  private getMasterNutrientMap(): Record<string, { name: string, unit: string }> {
    return {
      protein_g: { name: "Protein", unit: "g" },
      fat_total_g: { name: "Total Fat", unit: "g" },
      carbs_g: { name: "Carbohydrates", unit: "g" },
      hydration_ml: { name: "Water", unit: "ml" },
      fat_saturated_g: { name: "Saturated Fat", unit: "g" },
      fat_poly_g: { name: "Polyunsaturated Fat", unit: "g" },
      fat_mono_g: { name: "Monounsaturated Fat", unit: "g" },
      fat_trans_g: { name: "Trans Fat", unit: "g" },
      omega_3_g: { name: "Omega-3 Fatty Acids", unit: "g" },
      omega_6_g: { name: "Omega-6 Fatty Acids", unit: "g" },
      omega_ratio: { name: "Omega 6:3 Ratio", unit: "" },
      fiber_g: { name: "Dietary Fiber", unit: "g" },
      fiber_soluble_g: { name: "Soluble Fiber", unit: "g" },
      sugar_g: { name: "Total Sugars", unit: "g" },
      sugar_added_g: { name: "Added Sugars", unit: "g" },
      cholesterol_mg: { name: "Cholesterol", unit: "mg" },
      sodium_mg: { name: "Sodium", unit: "mg" },
      potassium_mg: { name: "Potassium", unit: "mg" },
      calcium_mg: { name: "Calcium", unit: "mg" },
      iron_mg: { name: "Iron", unit: "mg" },
      magnesium_mg: { name: "Magnesium", unit: "mg" },
      phosphorus_mg: { name: "Phosphorus", unit: "mg" },
      zinc_mg: { name: "Zinc", unit: "mg" },
      copper_mg: { name: "Copper", unit: "mg" },
      manganese_mg: { name: "Manganese", unit: "mg" },
      selenium_mcg: { name: "Selenium", unit: "mcg" },
      vitamin_a_mcg: { name: "Vitamin A", unit: "mcg" },
      vitamin_c_mg: { name: "Vitamin C", unit: "mg" },
      vitamin_d_mcg: { name: "Vitamin D", unit: "mcg" },
      vitamin_e_mg: { name: "Vitamin E", unit: "mg" },
      vitamin_k_mcg: { name: "Vitamin K", unit: "mcg" },
      thiamin_mg: { name: "Thiamin (B1)", unit: "mg" },
      riboflavin_mg: { name: "Riboflavin (B2)", unit: "mg" },
      niacin_mg: { name: "Niacin (B3)", unit: "mg" },
      pantothenic_acid_mg: { name: "Pantothenic Acid (B5)", unit: "mg" },
      vitamin_b6_mg: { name: "Vitamin B6", unit: "mg" },
      biotin_mcg: { name: "Biotin (B7)", unit: "mcg" },
      folate_mcg: { name: "Folate (B9)", unit: "mcg" },
      vitamin_b12_mcg: { name: "Vitamin B12", unit: "mcg" },
    };
  }

  async estimateNutrition(description: string, portion?: string, calories_hint?: number, trackedNutrients: string[] = []) {
    const openai = createOpenAIClient();
    const map = this.getMasterNutrientMap();

    const hintPrompt = calories_hint ? `\nIMPORTANT: The user has specified that this food has EXACTLY ${calories_hint} kcal. Your goal is to estimate the macros (protein, carbs, fat) that would logically make up these ${calories_hint} calories for this type of food (using 4 kcal/g for protein/carbs and 9 kcal/g for fat). DO NOT deviate from ${calories_hint} kcal unless absolutely necessary for mathematical consistency.` : 'Always provide realistic estimates - never return 0 calories for foods that have calories.';

    const baseKeys = ['protein_g', 'carbs_g', 'fat_total_g'];
    const allToEstimate = Array.from(new Set([...baseKeys, ...trackedNutrients])).filter(k => k !== 'calories');

    const nutrientListPrompt = allToEstimate.map(key => {
      const info = map[key];
      return `- ${key}: number (${info ? `${info.name} in ${info.unit}` : key})`;
    }).join('\n');

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a nutrition estimation expert. Estimate the nutrition for the given food.
Return a JSON object with these fields:
- food_name: string (clean name of the food)
- portion: string (the portion size)
- calories: number
${nutrientListPrompt}

Be reasonable and accurate. Use your knowledge of typical nutrition values. ${hintPrompt}`
        },
        {
          role: 'user',
          content: `Estimate nutrition for: ${portion ? portion + ' of ' : ''}${description}`
        }
      ],
      response_format: {
        type: 'json_object'
      },
      max_tokens: 300
    });
    try {
      const estimate = JSON.parse(response.choices[0].message.content || '{}');
      if (calories_hint !== undefined) estimate.calories = calories_hint;

      if (estimate.fat_g !== undefined && estimate.fat_total_g === undefined) estimate.fat_total_g = estimate.fat_g;
      if (estimate.fiber !== undefined && estimate.fiber_g === undefined) estimate.fiber_g = estimate.fiber;
      if (estimate.sugar !== undefined && estimate.sugar_g === undefined) estimate.sugar_g = estimate.sugar;

      const filtered: any = {
        food_name: estimate.food_name || description,
        portion: estimate.portion || portion || 'serving',
        calories: Math.round(estimate.calories || 0),
        source: 'estimate',
        estimated: true
      };

      trackedNutrients.forEach(key => {
        if (estimate[key] !== undefined && key !== 'calories') {
          filtered[key] = typeof estimate[key] === 'number' ? Math.round(estimate[key] * 10) / 10 : estimate[key];
        }
      });

      return filtered;
    } catch (e) {
      return {
        error: true,
        message: `Could not estimate nutrition for "${description}"`
      };
    }
  }

  async validateNutrition(data: any) {
    const item = {
      food_name: data.food_name,
      calories: data.calories,
      protein_g: data.protein_g || 0,
      carbs_g: data.carbs_g || 0,
      fat_total_g: data.fat_total_g || data.fat_g || 0,
      serving_size: '1 serving'
    };
    const result: any = await this.validatorAgent.execute([item], this.agentContext);
    return {
      valid: result.passed,
      issues: [...result.errors, ...result.warnings],
      suggestion: result.passed ? null : 'Consider using estimate_nutrition for a better estimate or checking the values.'
    };
  }

  async compareFoods(foods: string[]) {
    const comparisons: any[] = await Promise.all(foods.slice(0, 5).map((food) => this.lookupNutrition(food, '1 serving')));
    return {
      foods: comparisons,
      best_protein: this.findBest(comparisons, 'protein_g'),
      lowest_calories: this.findLowest(comparisons, 'calories'),
      comparison_note: this.generateComparisonNote(comparisons)
    };
  }

  private findBest(items: any[], field: string) {
    const best = items.reduce((a, b) => (a[field] || 0) > (b[field] || 0) ? a : b);
    return best.food_name;
  }

  private findLowest(items: any[], field: string) {
    const lowest = items.reduce((a, b) => (a[field] || 9999) < (b[field] || 9999) ? a : b);
    return lowest.food_name;
  }

  private generateComparisonNote(items: any[]) {
    const names = items.map((i) => i.food_name).join(', ');
    return `Compared ${items.length} foods: ${names}`;
  }

  // =============================================================
  // RECIPE TOOLS
  // =============================================================

  async searchSavedRecipes(query: string) {
    const words = query.trim().split(/\s+/).filter((w) => w.length > 1);
    const searchPattern = words.length > 0 ? `%${words.join('%')}%` : `%${query.trim()}%`;
    const { data, error } = await this.context.supabase.from('user_recipes').select('id, recipe_name, nutrition_data, servings').eq('user_id', this.context.userId).ilike('recipe_name', searchPattern).limit(5);
    if (error) throw error;
    if (!data || data.length === 0) {
      return {
        message: `No recipes found matching "${query}"`
      };
    }
    return {
      recipes: data.map((r: any) => ({
        id: r.id,
        name: r.recipe_name,
        servings: r.servings || 1,
        calories_per_serving: r.nutrition_data?.calories ? Math.round(r.nutrition_data.calories / (r.servings || 1)) : 0
      }))
    };
  }

  async getRecipeDetails(recipeId: string) {
    const [{ data: recipe }, ingredients] = await Promise.all([
      this.context.supabase.from('user_recipes').select('id, recipe_name, servings, nutrition_data').eq('id', recipeId).single(),
      this.db.getRecipeIngredients(recipeId)
    ]);
    if (!recipe) {
      return {
        error: true,
        message: 'Recipe not found'
      };
    }
    const nutrition = recipe.nutrition_data || {};
    return {
      id: recipe.id,
      name: recipe.recipe_name,
      servings: recipe.servings || 1,
      nutrition_per_serving: {
        calories: Math.round((nutrition.calories || 0) / (recipe.servings || 1)),
        protein_g: Math.round((nutrition.protein_g || 0) / (recipe.servings || 1) * 10) / 10,
        carbs_g: Math.round((nutrition.carbs_g || 0) / (recipe.servings || 1) * 10) / 10,
        fat_total_g: Math.round((nutrition.fat_total_g || 0) / (recipe.servings || 1) * 10) / 10
      },
      total_batch: {
        calories: nutrition.calories || 0,
        protein_g: nutrition.protein_g || 0,
        carbs_g: nutrition.carbs_g || 0,
        fat_total_g: nutrition.fat_total_g || 0
      },
      ingredients: ingredients
    };
  }

  async parseRecipeText(recipeText: string, recipeName?: string) {
    const result = await this.recipeAgent.execute({
      type: 'parse',
      text: recipeText,
      recipeName
    }, this.agentContext);
    return result;
  }

  async calculateRecipeServing(recipeId: string, servings: number) {
    const details: any = await this.getRecipeDetails(recipeId);
    if (details.error) return details;
    const scale = servings / (details.servings || 1);
    return {
      recipe_name: details.name,
      servings_calculated: servings,
      nutrition: {
        calories: Math.round((details.nutrition_per_serving?.calories || 0) * scale),
        protein_g: Math.round((details.nutrition_per_serving?.protein_g || 0) * scale * 10) / 10,
        carbs_g: Math.round((details.nutrition_per_serving?.carbs_g || 0) * scale * 10) / 10,
        fat_total_g: Math.round((details.nutrition_per_serving?.fat_total_g || 0) * scale * 10) / 10
      }
    };
  }

  // =============================================================
  // LOGGING TOOLS
  // =============================================================

  async proposeFoodLog(data: any) {
    const goals = await this.getUserGoals();
    const trackedKeys = (typeof goals === 'object' && !(goals as any).message) ? Object.keys(goals) : ['calories', 'protein_g', 'carbs_g', 'fat_total_g'];
    const proposalId = `food_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const filteredData: any = {
      food_name: data.food_name,
      portion: data.portion || 'serving',
      calories: Math.round(data.calories)
    };

    trackedKeys.forEach(key => {
      if (data[key] !== undefined && key !== 'calories') {
        filteredData[key] = typeof data[key] === 'number' ? Math.round(data[key] * 10) / 10 : data[key];
      }
    });

    return {
      proposal_type: 'food_log',
      proposal_id: proposalId,
      pending: true,
      data: filteredData,
      message: `Ready to log ${data.food_name} (${Math.round(data.calories)} cal). Please confirm.`
    };
  }

  async proposeRecipeLog(data: any) {
    const goals = await this.getUserGoals();
    const trackedKeys = (typeof goals === 'object' && !(goals as any).message) ? Object.keys(goals) : ['calories', 'protein_g', 'carbs_g', 'fat_total_g'];
    const proposalId = `recipe_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const filteredData: any = {
      recipe_id: data.recipe_id,
      recipe_name: data.recipe_name,
      servings: data.servings,
      calories: Math.round(data.calories)
    };

    trackedKeys.forEach(key => {
      if (data[key] !== undefined && key !== 'calories') {
        filteredData[key] = typeof data[key] === 'number' ? Math.round(data[key] * 10) / 10 : data[key];
      }
    });

    return {
      proposal_type: 'recipe_log',
      proposal_id: proposalId,
      pending: true,
      data: filteredData,
      message: `Ready to log ${data.servings} serving(s) of ${data.recipe_name} (${Math.round(data.calories)} cal). Please confirm.`
    };
  }

  async confirmPendingLog(proposalId: string) {
    return {
      status: 'pending_frontend_confirmation',
      proposal_id: proposalId,
      message: 'Awaiting user confirmation via UI'
    };
  }

  // =============================================================
  // GOAL TOOLS
  // =============================================================

  async updateUserGoal(nutrient: string, targetValue: number, unit?: string) {
    const proposalId = `goal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const nutrientMap: Record<string, string> = {
      'protein': 'protein_g',
      'carbs': 'carbs_g',
      'carbohydrates': 'carbs_g',
      'fat': 'fat_total_g',
      'fiber': 'fiber_g',
      'sugar': 'sugar_g',
      'sodium': 'sodium_mg',
      'fat_g': 'fat_total_g',
      'carb': 'carbs_g'
    };
    const normalizedNutrient = nutrientMap[nutrient.toLowerCase()] || nutrient.toLowerCase();
    const defaultUnit = normalizedNutrient === 'calories' ? 'kcal' : normalizedNutrient === 'sodium_mg' ? 'mg' : 'g';
    return {
      proposal_type: 'goal_update',
      proposal_id: proposalId,
      pending: true,
      data: {
        nutrient: normalizedNutrient,
        target_value: targetValue,
        unit: unit || defaultUnit
      },
      message: `Ready to update ${normalizedNutrient} goal to ${targetValue}${unit || defaultUnit}. Please confirm.`
    };
  }

  async calculateRecommendedGoals() {
    const profile: any = await this.getUserProfile();
    if (profile.message) {
      return {
        error: true,
        message: 'Need profile data to calculate recommended goals'
      };
    }
    let bmr;
    if (profile.gender === 'male') {
      bmr = 10 * profile.weight_kg + 6.25 * profile.height_cm - 5 * profile.age + 5;
    } else {
      bmr = 10 * profile.weight_kg + 6.25 * profile.height_cm - 5 * profile.age - 161;
    }
    const activityMultipliers: Record<string, number> = {
      sedentary: 1.2,
      light: 1.375,
      moderate: 1.55,
      active: 1.725,
      very_active: 1.9
    };
    const tdee = bmr * (activityMultipliers[profile.activity_level] || 1.55);
    let targetCalories = tdee;
    if (profile.goal === 'lose weight') targetCalories = tdee - 500;
    if (profile.goal === 'gain muscle') targetCalories = tdee + 300;
    const proteinPerKg = profile.goal === 'gain muscle' ? 2.0 : 1.6;
    const protein_g = Math.round(profile.weight_kg * proteinPerKg);
    const fat_g = Math.round(targetCalories * 0.25 / 9);
    const carbs_g = Math.round((targetCalories - protein_g * 4 - fat_g * 9) / 4);
    return {
      recommended: {
        calories: Math.round(targetCalories),
        protein_g,
        carbs_g,
        fat_g,
        fiber_g: profile.gender === 'male' ? 38 : 25,
        sugar_g: 50
      },
      calculation_basis: {
        bmr: Math.round(bmr),
        tdee: Math.round(tdee),
        goal: profile.goal,
        activity_level: profile.activity_level
      }
    };
  }

  // =============================================================
  // INSIGHT TOOLS
  // =============================================================

  async getFoodRecommendations(focus?: string, preferences?: string) {
    const progress: any = await this.getTodayProgress();
    const goals = await this.getUserGoals();
    const remaining: Record<string, number> = {};
    if (typeof goals !== 'object' || (goals as any).message) {
      return {
        message: 'Need goals set to provide recommendations'
      };
    }
    for (const [nutrient, goalData] of Object.entries(goals as Record<string, any>)) {
      const consumed = progress[nutrient] || 0;
      remaining[nutrient] = Math.max(0, goalData.target - consumed);
    }
    const openai = createOpenAIClient();
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a nutrition advisor. Suggest 3 foods or meals based on remaining nutritional needs.
Consider the user's focus (${focus || 'balanced'}) and preferences (${preferences || 'none specified'}).
Return JSON with: { suggestions: [{ food: string, reason: string, approximate_nutrition: { calories, protein_g } }] }`
        },
        {
          role: 'user',
          content: `Remaining needs today: ${JSON.stringify(remaining)}`
        }
      ],
      response_format: {
        type: 'json_object'
      },
      max_tokens: 300
    });
    try {
      return JSON.parse(response.choices[0].message.content || '{}');
    } catch {
      return {
        message: 'Could not generate recommendations'
      };
    }
  }

  async analyzeEatingPatterns(days: number) {
    const history = await this.getFoodHistory(days);
    const openai = createOpenAIClient();
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Analyze eating patterns from the food log. Look for:
- Consistent meal times
- Common foods
- Potential gaps (missing meals, low variety)
- Trends (increasing/decreasing calories)
Return JSON with: { patterns: string[], insights: string[], suggestions: string[] }`
        },
        {
          role: 'user',
          content: `Food history: ${JSON.stringify(history)}`
        }
      ],
      response_format: {
        type: 'json_object'
      },
      max_tokens: 400
    });
    try {
      return JSON.parse(response.choices[0].message.content || '{}');
    } catch {
      return {
        message: 'Could not analyze patterns'
      };
    }
  }

  async getProgressReport() {
    const [profile, goals, progress, weekly]: [any, any, any, any] = await Promise.all([
      this.getUserProfile(),
      this.getUserGoals(),
      this.getTodayProgress(),
      this.getWeeklySummary()
    ]);
    return {
      profile_summary: profile.message ? null : {
        goal: profile.goal,
        weight: profile.weight_kg
      },
      goals,
      today: progress,
      weekly_summary: weekly,
      overall_status: weekly.compliance_summary
    };
  }
}
