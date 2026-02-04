/**
 * Tool Executor for ReasoningAgent
 * 
 * Executes tools by delegating to existing agents and services.
 * This bridges the ReasoningAgent's tool calls to our existing functionality.
 */ import { DbService } from './db-service.ts';
import { NutritionAgent } from '../agents/nutrition-agent.ts';
import { RecipeAgent } from '../agents/recipe-agent.ts';
import { InsightAgent } from '../agents/insight-agent.ts';
import { ValidatorAgent } from '../agents/validator-agent.ts';
import { createOpenAIClient } from '../../_shared/openai-client.ts';
import { getStartAndEndOfDay, getDateRange } from '../../_shared/utils.ts';
export class ToolExecutor {
  context;
  db;
  nutritionAgent;
  recipeAgent;
  insightAgent;
  validatorAgent;
  agentContext;
  constructor(context) {
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
     */ async execute(toolName, args = {}) {
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
          return this.lookupNutrition(args.food, args.portion);
        case 'estimate_nutrition':
          return this.estimateNutrition(args.description, args.portion);
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
    } catch (error) {
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
    const goalsMap = {};
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
    const totals = {
      calories: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
      fiber_g: 0,
      sugar_g: 0,
      sodium_mg: 0,
      items_logged: 0
    };
    if (logs) {
      for (const log of logs) {
        totals.calories += log.calories || 0;
        totals.protein_g += log.protein_g || 0;
        totals.carbs_g += log.carbs_g || 0;
        totals.fat_g += log.fat_total_g || log.fat_g || 0;
        totals.fiber_g += log.fiber_g || 0;
        totals.sugar_g += log.sugar_g || 0;
        totals.sodium_mg += log.sodium_mg || 0;
        totals.items_logged++;
      }
    }
    // Round values
    Object.keys(totals).forEach((key) => {
      if (typeof totals[key] === 'number') {
        totals[key] = Math.round(totals[key]);
      }
    });
    return totals;
  }
  async getWeeklySummary() {
    // Reuse InsightAgent's existing weekly aggregation logic
    const result = await this.insightAgent.execute(undefined, this.agentContext);
    // Extract weekly averages and trends
    const goals = await this.getUserGoals();
    const todayProgress = await this.getTodayProgress();
    return {
      daily_averages: result.patterns ? this.parseWeeklyAverages(result.patterns) : {},
      today_totals: todayProgress,
      goal_progress: result.goal_progress,
      suggestions: result.suggestions,
      compliance_summary: this.calculateCompliance(result.goal_progress)
    };
  }
  parseWeeklyAverages(patterns) {
    // Parse patterns like "Weekly avg calories: 1800kcal"
    const averages = {};
    for (const pattern of patterns) {
      const match = pattern.match(/Weekly avg (\w+): (\d+)/);
      if (match) {
        averages[match[1]] = parseInt(match[2]);
      }
    }
    return averages;
  }
  calculateCompliance(progress) {
    const values = Object.values(progress);
    if (values.length === 0) return 'No goals to track';
    const avgProgress = values.reduce((a, b) => a + b, 0) / values.length;
    if (avgProgress >= 90 && avgProgress <= 110) return 'On track! 🎯';
    if (avgProgress < 90) return 'Under targets';
    return 'Above targets';
  }
  async getFoodHistory(days) {
    const timezone = this.context.timezone || 'UTC';
    const { start, end } = getDateRange(new Date(), Math.min(days, 30), timezone);
    const logs = await this.db.getFoodLogs(this.context.userId, start, end);
    // Group by date
    const byDate = {};
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
  async lookupNutrition(food, portion, calories, macros) {
    console.log(`[ToolExecutor] lookupNutrition for: ${food}${calories ? ` (${calories} kcal)` : ''}`);
    // If user provided EVERYTHING, just return it
    if (calories !== undefined && macros?.protein !== undefined && macros?.carbs !== undefined && macros?.fat !== undefined) {
      return {
        food_name: food,
        portion: portion || 'standard serving',
        calories,
        protein_g: macros.protein,
        carbs_g: macros.carbs,
        fat_g: macros.fat,
        source: 'user_provided'
      };
    }
    // If user provided calories but missing macros, get an estimate with the calorie hint
    if (calories !== undefined) {
      return this.estimateNutrition(food, portion, calories);
    }
    // Otherwise regular flow
    const estimate = await this.estimateNutrition(food, portion);
    if (estimate.error) {
      console.warn(`[ToolExecutor] AI Estimate failed, falling back to database`);
      const items = [
        food
      ];
      const portions = [
        portion || '1 serving'
      ];
      const results = await this.nutritionAgent.execute({
        items,
        portions
      }, this.agentContext);
      if (results && results.length > 0) {
        const result = results[0];
        return {
          food_name: result.food_name || food,
          portion: portion || result.serving_size || 'standard serving',
          calories: Math.round(result.calories || 0),
          protein_g: Math.round((result.protein_g || 0) * 10) / 10,
          carbs_g: Math.round((result.carbs_g || 0) * 10) / 10,
          fat_g: Math.round((result.fat_total_g || 0) * 10) / 10,
          source: 'database',
          // Pass through micros so they are available for logging
          fiber_g: result.fiber_g ? Math.round(result.fiber_g * 10) / 10 : 0,
          sugar_g: result.sugar_g ? Math.round(result.sugar_g * 10) / 10 : 0,
          sodium_mg: result.sodium_mg ? Math.round(result.sodium_mg) : 0,
          fat_saturated_g: result.fat_saturated_g ? Math.round(result.fat_saturated_g * 10) / 10 : 0,
          cholesterol_mg: result.cholesterol_mg ? Math.round(result.cholesterol_mg) : 0,
          potassium_mg: result.potassium_mg ? Math.round(result.potassium_mg) : 0
        };
      }
    }
    return estimate;
  }
  async estimateNutrition(description, portion, calories_hint) {
    const openai = createOpenAIClient();
    const hintPrompt = calories_hint ? `\nIMPORTANT: The user has specified that this food has EXACTLY ${calories_hint} kcal. Your goal is to estimate the macros (protein, carbs, fat) that would logically make up these ${calories_hint} calories for this type of food (using 4 kcal/g for protein/carbs and 9 kcal/g for fat). DO NOT deviate from ${calories_hint} kcal unless absolutely necessary for mathematical consistency.` : 'Always provide realistic estimates - never return 0 calories for foods that have calories.';
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
- protein_g: number
- carbs_g: number
- fat_g: number
- fiber_g: number (optional)
- sugar_g: number (optional)

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
      max_tokens: 200
    });
    try {
      const estimate = JSON.parse(response.choices[0].message.content || '{}');
      // Force the hint if provided and estimate is significantly off
      if (calories_hint !== undefined) {
        estimate.calories = calories_hint;
      }
      return {
        ...estimate,
        source: 'estimate',
        estimated: true
      };
    } catch (e) {
      return {
        error: true,
        message: `Could not estimate nutrition for "${description}"`
      };
    }
  }
  async validateNutrition(data) {
    // Delegate to the robust ValidatorAgent
    // Map the input data to the array format expected by ValidatorAgent
    const item = {
      food_name: data.food_name,
      calories: data.calories,
      protein_g: data.protein_g || 0,
      carbs_g: data.carbs_g || 0,
      fat_total_g: data.fat_g || 0,
      serving_size: '1 serving' // Default if not provided, used for volume sanity checks
    };
    const result = await this.validatorAgent.execute([
      item
    ], this.agentContext);
    return {
      valid: result.passed,
      issues: [
        ...result.errors,
        ...result.warnings
      ],
      suggestion: result.passed ? null : 'Consider using estimate_nutrition for a better estimate or checking the values.'
    };
  }
  async compareFoods(foods) {
    const comparisons = await Promise.all(foods.slice(0, 5).map((food) => this.lookupNutrition(food)));
    return {
      foods: comparisons,
      best_protein: this.findBest(comparisons, 'protein_g'),
      lowest_calories: this.findLowest(comparisons, 'calories'),
      comparison_note: this.generateComparisonNote(comparisons)
    };
  }
  findBest(items, field) {
    const best = items.reduce((a, b) => (a[field] || 0) > (b[field] || 0) ? a : b);
    return best.food_name;
  }
  findLowest(items, field) {
    const lowest = items.reduce((a, b) => (a[field] || 9999) < (b[field] || 9999) ? a : b);
    return lowest.food_name;
  }
  generateComparisonNote(items) {
    const names = items.map((i) => i.food_name).join(', ');
    return `Compared ${items.length} foods: ${names}`;
  }
  // =============================================================
  // RECIPE TOOLS
  // =============================================================
  async searchSavedRecipes(query) {
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
      recipes: data.map((r) => ({
        id: r.id,
        name: r.recipe_name,
        servings: r.servings || 1,
        calories_per_serving: r.nutrition_data?.calories ? Math.round(r.nutrition_data.calories / (r.servings || 1)) : 0
      }))
    };
  }
  async getRecipeDetails(recipeId) {
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
  async parseRecipeText(recipeText, recipeName) {
    // Use RecipeAgent's parsing capability
    // RecipeAction expects { type: 'parse', text: string } format
    const result = await this.recipeAgent.execute({
      type: 'parse',
      text: recipeText
    }, this.agentContext);
    return result;
  }
  async calculateRecipeServing(recipeId, servings) {
    const details = await this.getRecipeDetails(recipeId);
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
  // LOGGING TOOLS (PCC Pattern)
  // =============================================================
  async proposeFoodLog(data) {
    // Generate a proposal ID for the confirmation flow
    const proposalId = `food_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    // Return proposal data for the UI to display
    return {
      proposal_type: 'food_log',
      proposal_id: proposalId,
      pending: true,
      data: {
        food_name: data.food_name,
        portion: data.portion || 'serving',
        calories: Math.round(data.calories),
        protein_g: Math.round(data.protein_g * 10) / 10,
        carbs_g: Math.round(data.carbs_g * 10) / 10,
        fat_total_g: Math.round(data.fat_total_g * 10) / 10,
        sugar_g: data.sugar_g ? Math.round(data.sugar_g * 10) / 10 : undefined,
        fiber_g: data.fiber_g ? Math.round(data.fiber_g * 10) / 10 : undefined,
        sodium_mg: data.sodium_mg ? Math.round(data.sodium_mg) : undefined,
        fat_saturated_g: data.fat_saturated_g ? Math.round(data.fat_saturated_g * 10) / 10 : undefined,
        cholesterol_mg: data.cholesterol_mg ? Math.round(data.cholesterol_mg) : undefined,
        potassium_mg: data.potassium_mg ? Math.round(data.potassium_mg) : undefined
      },
      message: `Ready to log ${data.food_name} (${Math.round(data.calories)} cal). Please confirm.`
    };
  }
  async proposeRecipeLog(data) {
    const proposalId = `recipe_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    return {
      proposal_type: 'recipe_log',
      proposal_id: proposalId,
      pending: true,
      data: {
        recipe_id: data.recipe_id,
        recipe_name: data.recipe_name,
        servings: data.servings,
        calories: Math.round(data.calories),
        protein_g: data.protein_g ? Math.round(data.protein_g * 10) / 10 : undefined,
        carbs_g: data.carbs_g ? Math.round(data.carbs_g * 10) / 10 : undefined,
        fat_total_g: data.fat_total_g ? Math.round(data.fat_total_g * 10) / 10 : undefined,
        fiber_g: data.fiber_g ? Math.round(data.fiber_g * 10) / 10 : undefined,
        sugar_g: data.sugar_g ? Math.round(data.sugar_g * 10) / 10 : undefined,
        sodium_mg: data.sodium_mg ? Math.round(data.sodium_mg) : undefined
      },
      message: `Ready to log ${data.servings} serving(s) of ${data.recipe_name} (${Math.round(data.calories)} cal). Please confirm.`
    };
  }
  async confirmPendingLog(proposalId) {
    // This would typically be called by the frontend when user confirms
    // The actual logging is handled by the frontend's confirmation handler
    return {
      status: 'pending_frontend_confirmation',
      proposal_id: proposalId,
      message: 'Awaiting user confirmation via UI'
    };
  }
  // =============================================================
  // GOAL TOOLS
  // =============================================================
  async updateUserGoal(nutrient, targetValue, unit) {
    const proposalId = `goal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    // Normalize nutrient name to DB column standard
    const nutrientMap = {
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
    const profile = await this.getUserProfile();
    if (profile.message) {
      return {
        error: true,
        message: 'Need profile data to calculate recommended goals'
      };
    }
    // TDEE Calculation (Mifflin-St Jeor)
    let bmr;
    if (profile.gender === 'male') {
      bmr = 10 * profile.weight_kg + 6.25 * profile.height_cm - 5 * profile.age + 5;
    } else {
      bmr = 10 * profile.weight_kg + 6.25 * profile.height_cm - 5 * profile.age - 161;
    }
    const activityMultipliers = {
      sedentary: 1.2,
      light: 1.375,
      moderate: 1.55,
      active: 1.725,
      very_active: 1.9
    };
    const tdee = bmr * (activityMultipliers[profile.activity_level] || 1.55);
    // Adjust for goal
    let targetCalories = tdee;
    if (profile.goal === 'lose weight') targetCalories = tdee - 500;
    if (profile.goal === 'gain muscle') targetCalories = tdee + 300;
    // Calculate macros (balanced approach)
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
  async getFoodRecommendations(focus, preferences) {
    const progress = await this.getTodayProgress();
    const goals = await this.getUserGoals();
    // Calculate remaining needs
    const remaining = {};
    if (typeof goals !== 'object' || goals.message) {
      return {
        message: 'Need goals set to provide recommendations'
      };
    }
    for (const [nutrient, goalData] of Object.entries(goals)) {
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
  async analyzeEatingPatterns(days) {
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
    const [profile, goals, progress, weekly] = await Promise.all([
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
