import { createAdminClient } from '../../_shared/supabase-client.ts';
import { createOpenAIClient } from '../../_shared/openai-client.ts';
import { NutritionAgent, scaleNutrition } from './nutrition-agent.ts';
import { calculateBatchSize, parseBatchSizeResponse } from '../utils/batch-calculator.ts';
import { detectServingType, generateServingsPrompt, parseServingsResponse } from '../utils/serving-detector.ts';
import { formatGrams } from '../utils/portion-parser.ts';
export class RecipeAgent {
  name = 'recipe';
  async execute(action, context) {
    try {
      const { userId, supabase: contextSupabase } = context;
      const supabase = contextSupabase || createAdminClient();
      if (action.type === 'interactive') {
        const session = context.session;
        if (!session) throw new Error('[RecipeAgent] Session required for interactive mode');
        const flowState = session.buffer?.flowState;
        // 1. No active flow? Treat as new Parse intent
        if (!flowState) {
          console.log('[RecipeAgent] Interactive: Starting new flow with parse');
          return this.execute({
            type: 'parse',
            text: action.message
          }, context);
        }
        // 2. Resume Flow based on Step
        console.log(`[RecipeAgent] Interactive: Resuming step ${flowState.step}`);
        if (flowState.step === 'pending_batch_confirm') {
          return this.execute({
            type: 'confirm_batch',
            flowState,
            userResponse: action.message
          }, context);
        }
        if (flowState.step === 'pending_servings_confirm') {
          return this.execute({
            type: 'confirm_servings',
            flowState,
            userResponse: action.message
          }, context);
        }
        if (flowState.step === 'pending_duplicate_confirm') {
          // Map message to choice (update/new/log) if possible, or use explicit Planner extraction if available
          // For now simple keyword matching
          const text = action.message.toLowerCase();
          let choice = 'log' // default safety
            ;
          if (text.includes('update')) choice = 'update';
          else if (text.includes('save') || text.includes('new')) choice = 'new';
          else if (text.includes('log')) choice = 'log';
          return this.execute({
            type: 'handle_duplicate',
            flowState,
            choice
          }, context);
        }
        // Default fallback for unknown steps
        console.warn(`[RecipeAgent] Unknown step ${flowState.step} in interactive mode. Defaulting to message.`);
        return {
          type: 'error',
          error: `I'm not sure what step we're on (${flowState.step}). Let's start over?`,
          flowState
        };
      }
      if (action.type === 'find') {
        const name = action.name.trim();
        const fingerprint = action.fingerprint;
        console.log(`[RecipeAgent] Searching for recipe: "${name}" (Fingerprint provided: ${!!fingerprint})`);
        // 1. Try fingerprint match first if provided (Exact identical ingredients)
        if (fingerprint) {
          const { data, error } = await supabase.from('user_recipes').select('*, recipe_ingredients(*)').eq('user_id', userId).eq('ingredient_fingerprint', fingerprint).order('updated_at', {
            ascending: false
          }).limit(1).maybeSingle();
          if (error) {
            console.error('[RecipeAgent] Error finding recipe by fingerprint:', error);
          } else if (data) {
            console.log(`[RecipeAgent] Found exact fingerprint match: "${data.recipe_name}"`);
            return {
              type: 'found',
              recipe: data
            };
          }
        }
        // 2. Try exact name match (Case-insensitive)
        const { data: exactName, error: exactError } = await supabase.from('user_recipes').select('*, recipe_ingredients(*)').eq('user_id', userId).ilike('recipe_name', name).maybeSingle();
        if (exactName) {
          console.log(`[RecipeAgent] Found exact name match: "${exactName.recipe_name}"`);
          return {
            type: 'found',
            recipe: exactName
          };
        }
        // 3. Try substring match (Name check)
        const { data: substringMatch, error } = await supabase.from('user_recipes').select('*, recipe_ingredients(*)').eq('user_id', userId).ilike('recipe_name', `%${name}%`).limit(1).maybeSingle();
        if (substringMatch) {
          console.log(`[RecipeAgent] Found substring name match: "${substringMatch.recipe_name}"`);
          return {
            type: 'found',
            recipe: substringMatch
          };
        }
        // 4. word-level intersection matching
        const words = name.split(/\s+/).filter((w) => w.length > 2 && ![
          'with',
          'and',
          'the',
          'for',
          'from'
        ].includes(w.toLowerCase()));
        if (words.length > 0) {
          let query = supabase.from('user_recipes').select('*, recipe_ingredients(*)').eq('user_id', userId);
          // Build a query where at least most words match or use word intersection
          // Simple implementation: all significant words must be present
          for (const word of words) {
            query = query.ilike('recipe_name', `%${word}%`);
          }
          const { data: fuzzyData, error: fuzzyError } = await query.limit(1).maybeSingle();
          if (fuzzyError) {
            console.error('[RecipeAgent] Error in fuzzy recipe find:', fuzzyError);
          } else if (fuzzyData) {
            console.log(`[RecipeAgent] Found fuzzy name match (multi-word): "${fuzzyData.recipe_name}"`);
            return {
              type: 'found',
              recipe: fuzzyData
            };
          }
        }
        return {
          type: 'not_found'
        };
      }
      if (action.type === 'parse') {
        // Step 1: Parse the recipe text with GPT
        const openai = createOpenAIClient();
        const response = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content: `Extract recipe details from the provided text. Return a JSON object:
{
  "recipe_name": "string",
  "servings": number,
  "total_batch_size": "string (optional)",
  "serving_size": "string (optional)",
  "ingredients": [ { "name": "string", "quantity": number, "unit": "string" } ],
  "instructions": "string"
}
- Use provided name exactly if given.
- Default servings to 1.
- Extract batch/serving sizes if mentioned.
- ONLY include "instructions" if they were explicitly provided in the text. DO NOT infer or create them yourself. If missing, return an empty string.
- If not a recipe, return what you can find.`
            },
            {
              role: "user",
              content: action.text
            }
          ],
          response_format: {
            type: "json_object"
          }
        });
        const content = response.choices[0].message.content;
        if (!content) throw new Error('Failed to parse recipe');
        const parsed = JSON.parse(content);
        // Edge case: Zero ingredients parsed
        if (!parsed.ingredients || parsed.ingredients.length === 0) {
          return {
            type: 'error',
            error: "I couldn't parse any ingredients from your recipe. Could you list them clearly, perhaps one ingredient per line with quantities? For example:\n• 2 cups flour\n• 1 egg\n• 100g butter"
          };
        }
        // 0. Calculate Fingerprint for fast matching
        parsed.fingerprint = RecipeAgent.calculateFingerprint(parsed.ingredients);
        // 1. EARLY DUPLICATE CHECK
        const findResult = await this.execute({
          type: 'find',
          name: parsed.recipe_name,
          fingerprint: parsed.fingerprint
        }, context);
        const existingRecipe = findResult.type === 'found' ? findResult.recipe : null;
        if (existingRecipe) {
          const isExactMatch = existingRecipe.ingredient_fingerprint === parsed.fingerprint;
          console.log(`[RecipeAgent] Found existing recipe: "${existingRecipe.recipe_name}" (Exact match: ${isExactMatch})`);
          const batchResult = calculateBatchSize(parsed.ingredients);
          parsed.total_batch_grams = batchResult.totalGrams;
          const flowState = {
            step: 'pending_duplicate_confirm',
            parsed,
            batchSizeGrams: batchResult.totalGrams,
            suggestedServings: 1,
            existingRecipeId: existingRecipe.id,
            existingRecipeName: existingRecipe.recipe_name
          };
          const existingCalories = existingRecipe.nutrition_data?.calories || 'unknown';
          const matchMsg = isExactMatch ? `I found an exact match for this recipe: "**${existingRecipe.recipe_name}**".` : `You already have a recipe called "**${existingRecipe.recipe_name}**" with similar ingredients.`;
          return {
            type: 'needs_confirmation',
            flowState,
            prompt: `${matchMsg}\n\n` + `What would you like to do?\n` + `• **Log existing** - Use your saved version and log consumption\n` + `• **Update** - Update the saved recipe with these new details\n` + `• **Save new** - Keep both versions\n\n` + `*If logging, how much did you have? (e.g. 1 serving, 2 cups)*`,
            response_type: 'pending_duplicate_confirm',
            proposal_type: 'recipe_save',
            pending: true,
            data: {
              flowState,
              recipe_name: parsed.recipe_name,
              ingredients: parsed.ingredients
            }
          };
        }
        // Step 2: Calculate everything upfront (Batch, Servings, Nutrition)
        // Step 2: Calculate everything upfront (Batch, Servings, Nutrition)
        const batchResult = calculateBatchSize(parsed.ingredients);
        const servingResult = detectServingType(parsed.ingredients, parsed.recipe_name, action.text);
        parsed.total_batch_grams = batchResult.totalGrams;
        // PREFER parsed servings if greater than 1 (meaning it was explicitly found in text)
        if (!parsed.servings || parsed.servings <= 1) {
          parsed.servings = servingResult.suggestedServings;
        }
        // Step 3: Calculate Nutrition immediately for a "One-Shot" experience
        const { batchNutrition, ingredientsWithNutrition, warnings } = await this.calculateNutrition(parsed, context);
        // Step 4: Build Flow State
        const flowState = {
          step: 'ready_to_save',
          parsed,
          batchSizeGrams: batchResult.totalGrams,
          suggestedServings: parsed.servings,
          batchNutrition,
          ingredientsWithNutrition
        };
        // Calculate per-serving nutrition for response
        const servings = parsed.servings || 1;
        const perServingNutrition = scaleNutrition(batchNutrition, 1 / servings);
        perServingNutrition.food_name = parsed.recipe_name;
        const perServingCalories = Math.round(perServingNutrition.calories);
        const warningText = warnings.length > 0 ? `\n\n⚠️ **Validation Notes:**\n• ${warnings.join('\n• ')}` : '';
        // Step 5: Return final proposal immediately
        return {
          type: 'needs_confirmation',
          prompt: `I've calculated the nutrition for "${parsed.recipe_name}" (${parsed.ingredients.length} ingredients).\n\n` + `It makes about **${servings} serving(s)** (total ${formatGrams(batchResult.totalGrams)}).\n` + `Each serving is **${perServingCalories} kcal**.${warningText}\n\nReady to save?`,
          response_type: 'ready_to_save',
          data: {
            flowState,
            nutrition: [
              perServingNutrition
            ],
            validation: {
              warnings,
              passed: warnings.length === 0,
              errors: []
            }
          },
          proposal_type: 'recipe_save',
          pending: true
        };
      }
      if (action.type === 'confirm_batch') {
        const { flowState, userResponse } = action;
        const batchResponse = parseBatchSizeResponse(userResponse);
        // Update flow state with confirmed batch size
        if (batchResponse.confirmed) {
          flowState.confirmedBatchSize = formatGrams(flowState.batchSizeGrams);
        } else if (batchResponse.grams) {
          flowState.batchSizeGrams = batchResponse.grams;
          flowState.confirmedBatchSize = batchResponse.correctedSize;
        } else if (batchResponse.ml) {
          // ML correction - use as-is
          flowState.confirmedBatchSize = batchResponse.correctedSize;
        } else {
          // User said no but didn't provide correction - ask again
          return {
            type: 'needs_confirmation',
            flowState,
            prompt: `I need to know the total size of this recipe to calculate servings correctly. How much does this recipe make in total? (e.g., "about 2 liters" or "1.5kg")`
          };
        }
        // Move to servings confirmation
        flowState.step = 'pending_servings_confirm';
        const detectionResult = detectServingType(flowState.parsed.ingredients, flowState.parsed.recipe_name);
        const servingPrompt = generateServingsPrompt(detectionResult);
        // Add large batch warning if applicable
        const isLargeBatch = detectionResult.suggestedServings > 10;
        const prefix = isLargeBatch ? `⚠️ **This seems like a large batch (${detectionResult.suggestedServings} servings).** ` : '';
        return {
          type: 'needs_confirmation',
          flowState,
          prompt: prefix + servingPrompt
        };
      }
      if (action.type === 'confirm_servings') {
        const { flowState, userResponse } = action;
        const { userId, supabase: contextSupabase } = context;
        const supabase = contextSupabase || createAdminClient();
        const servingsResponse = parseServingsResponse(userResponse);
        if (servingsResponse.confirmed) {
          // Use suggested servings
          flowState.confirmedServings = flowState.suggestedServings;
        } else if (servingsResponse.servings) {
          flowState.confirmedServings = servingsResponse.servings;
        } else {
          // Need to ask again
          return {
            type: 'needs_confirmation',
            flowState,
            prompt: `How many servings does this recipe make? Please enter a number.`
          };
        }
        // Calculate nutrition but DON'T save yet
        flowState.parsed.servings = flowState.confirmedServings;
        // Now calculate nutrition
        const { batchNutrition, ingredientsWithNutrition, warnings } = await this.calculateNutrition(flowState.parsed, context);
        flowState.batchNutrition = batchNutrition;
        flowState.ingredientsWithNutrition = ingredientsWithNutrition;
        // Calculate per-serving nutrition for response
        const servings = flowState.confirmedServings || 1;
        const perServingNutrition = scaleNutrition(batchNutrition, 1 / servings);
        perServingNutrition.food_name = flowState.parsed.recipe_name;
        const perServingCalories = Math.round(perServingNutrition.calories);
        // Check for duplicate recipe before showing final save prompt
        const { data: existing } = await supabase.from('user_recipes').select('id, recipe_name').eq('user_id', userId).ilike('recipe_name', flowState.parsed.recipe_name).maybeSingle();
        // Duplicate check
        if (existing) {
          // Duplicate found - ask user what to do
          flowState.step = 'pending_duplicate_confirm';
          flowState.existingRecipeId = existing.id;
          flowState.existingRecipeName = existing.recipe_name;
          console.log(`[RecipeAgent] Found existing recipe: "${existing.recipe_name}" (${existing.id})`);
          const warningText = warnings.length > 0 ? `\n\n⚠️ **Validation Notes:**\n• ${warnings.join('\n• ')}` : '';
          return {
            type: 'needs_confirmation',
            flowState,
            prompt: `You already have a recipe called "${existing.recipe_name}".\n\n` + `This new recipe has ${batchNutrition.calories || 0} calories total (${perServingCalories} per serving).${warningText}\n\n` + `Would you like to **update** the existing recipe or **save as new**?`,
            response_type: 'pending_duplicate_confirm',
            data: {
              nutrition: [
                perServingNutrition
              ],
              validation: {
                warnings,
                passed: warnings.length === 0,
                errors: []
              }
            },
            proposal_type: 'recipe_save',
            pending: true
          };
        }
        // No duplicate - proceed to save confirmation
        flowState.step = 'ready_to_save';
        const isLargeBatch = servings > 10;
        const prefix = isLargeBatch ? `⚠️ **Confirming ${servings} servings.** ` : '';
        const warningText = warnings.length > 0 ? `\n\n⚠️ **Validation Notes:**\n• ${warnings.join('\n• ')}` : '';
        return {
          type: 'needs_confirmation',
          flowState,
          prompt: prefix + `I've calculated the nutrition for "${flowState.parsed.recipe_name}". It has ${batchNutrition.calories || 0} calories total (${perServingCalories} per serving).${warningText}\n\nReady to save?`,
          response_type: 'ready_to_save',
          data: {
            nutrition: [
              perServingNutrition
            ],
            validation: {
              warnings,
              passed: warnings.length === 0,
              errors: []
            }
          },
          proposal_type: 'recipe_save',
          pending: true
        };
      }
      if (action.type === 'handle_duplicate') {
        const { flowState, choice } = action;
        const { userId, supabase: contextSupabase } = context;
        const supabase = contextSupabase || createAdminClient();
        if (choice === 'log') {
          // User wants to just log the existing recipe, fetch it
          const { data: existingRecipe } = await supabase.from('user_recipes').select('*, recipe_ingredients(*)').eq('id', flowState.existingRecipeId).single();
          if (!existingRecipe) {
            return {
              type: 'error',
              error: 'Could not find the existing recipe to log.'
            };
          }
          return {
            type: 'found',
            recipe: existingRecipe,
            skipSave: true // Signal to IntentRouter to log, not save
          };
        }
        if (choice === 'update') {
          // Need to calculate nutrition first if not done yet
          if (!flowState.batchNutrition) {
            const { batchNutrition, ingredientsWithNutrition } = await this.calculateNutrition(flowState.parsed, context);
            flowState.batchNutrition = batchNutrition;
            flowState.ingredientsWithNutrition = ingredientsWithNutrition;
          }
          // Update existing recipe
          const updateResult = await this.updateRecipeInDb(flowState.existingRecipeId, flowState.parsed, flowState.batchNutrition, flowState.ingredientsWithNutrition, userId, supabase);
          return {
            type: 'updated',
            recipe: updateResult
          };
        }
        // choice === 'new': Save as new recipe
        // Need to calculate nutrition first if not done yet
        if (!flowState.batchNutrition) {
          const { batchNutrition, ingredientsWithNutrition, warnings } = await this.calculateNutrition(flowState.parsed, context);
          flowState.batchNutrition = batchNutrition;
          flowState.ingredientsWithNutrition = ingredientsWithNutrition;
        }
        // Add suffix to avoid name collision
        flowState.parsed.recipe_name = `${flowState.parsed.recipe_name} (new)`;
        const savedRecipe = await this.saveRecipeToDb(flowState.parsed, flowState.batchNutrition, flowState.ingredientsWithNutrition, userId, supabase);
        return {
          type: 'saved',
          recipe: savedRecipe
        };
      }
      if (action.type === 'save') {
        // Direct save (legacy path or for recipes that don't need confirmation)
        const { parsed, mode = 'commit' } = action;
        // Check for existing recipe with same or similar name
        if (mode === 'commit') {
          const { data: existing } = await supabase.from('user_recipes').select('id, recipe_name').eq('user_id', userId).ilike('recipe_name', parsed.recipe_name).maybeSingle();
          if (existing) {
            console.log(`[RecipeAgent] Found existing recipe with similar name: "${existing.recipe_name}"`);
            // For now, we'll allow saving with a note. In future, we can add an update flow.
          }
        }
        let { batchNutrition, ingredientsWithNutrition } = action;
        if (!batchNutrition || !ingredientsWithNutrition) {
          const calcResult = await this.calculateNutrition(parsed, context);
          batchNutrition = calcResult.batchNutrition;
          ingredientsWithNutrition = calcResult.ingredientsWithNutrition;
        }
        const savedRecipe = await this.saveRecipeToDb(parsed, batchNutrition, ingredientsWithNutrition, userId, supabase);
        return {
          type: 'saved',
          recipe: savedRecipe
        };
      }
    } catch (error) {
      console.error('[RecipeAgent] Fatal Error:', error);
      return {
        type: 'error',
        error: error.message
      };
    }
  }
  /**
   * Calculate nutrition for all ingredients in a recipe
   */ async calculateNutrition(parsed, context) {
    const ingredientNames = parsed.ingredients.map((ing) => ing.name);
    const ingredientPortions = parsed.ingredients.map((ing) => `${ing.quantity} ${ing.unit}`);
    let batchNutrition = {};
    let ingredientsWithNutrition = [];
    let warnings = [];
    try {
      const nutritionAgent = new NutritionAgent();
      const nutritionResults = await nutritionAgent.execute({
        items: ingredientNames,
        portions: ingredientPortions
      }, context);
      // 4. Validate ingredients (Early Warning)
      const likelyCaloric = /protein|oil|butter|fat|carb|flour|bread|meat|chicken|beef|egg|milk|cheese|rice|pasta|sugar|honey|syrup|avocado|nut|almond|peanut|snack|cookie|cake|chip|potato|corn|bean|lentil|salmon|tuna|steak|pork|bacon|yogurt/i;
      parsed.ingredients.forEach((ing, i) => {
        const nut = nutritionResults[i];
        if (nut) {
          ingredientsWithNutrition.push({
            ...ing,
            nutrition: nut
          });
          // Early validation: check for ghost calories
          if (nut.calories === 0 && likelyCaloric.test(ing.name)) {
            warnings.push(`Ingredient \"${ing.name}\" returned 0 calories, which seems incorrect.`);
          }
          Object.keys(nut).forEach((key) => {
            if (typeof nut[key] === 'number') {
              batchNutrition[key] = (batchNutrition[key] || 0) + nut[key];
            }
          });
        } else {
          warnings.push(`I couldn't find nutrition data for \"${ing.name}\".`);
          ingredientsWithNutrition.push({
            ...ing,
            nutrition: null
          });
        }
      });
      // Round totals
      Object.keys(batchNutrition).forEach((key) => {
        if (typeof batchNutrition[key] === 'number') {
          batchNutrition[key] = Math.round(batchNutrition[key] * 10) / 10;
        }
      });
    } catch (err) {
      console.error('[RecipeAgent] Error calculating recipe nutrition:', err);
    }
    // Ensure food_name is set for downstream logging
    batchNutrition.food_name = parsed.recipe_name;
    return {
      batchNutrition,
      ingredientsWithNutrition,
      warnings
    };
  }
  /**
   * Save recipe to database
   */ async saveRecipeToDb(parsed, batchNutrition, ingredientsWithNutrition, userId, supabase) {
    const { data: recipe, error: recipeError } = await supabase.from('user_recipes').insert({
      user_id: userId,
      recipe_name: parsed.recipe_name,
      servings: parsed.servings,
      total_batch_size: parsed.total_batch_size,
      total_batch_grams: parsed.total_batch_grams,
      serving_size: parsed.serving_size,
      instructions: parsed.instructions,
      nutrition_data: batchNutrition,
      per_serving_nutrition: scaleNutrition(batchNutrition, 1 / (parsed.servings || 1)),
      ingredient_fingerprint: parsed.fingerprint || RecipeAgent.calculateFingerprint(parsed.ingredients)
    }).select().single();
    if (recipeError) throw recipeError;
    const ingredients = ingredientsWithNutrition.map((ing) => ({
      recipe_id: recipe.id,
      ingredient_name: ing.name,
      quantity: ing.quantity,
      unit: ing.unit,
      nutrition_data: ing.nutrition
    }));
    const { error: ingError } = await supabase.from('recipe_ingredients').insert(ingredients);
    if (ingError) throw ingError;
    return recipe;
  }
  /**
   * Update existing recipe in database
   */ async updateRecipeInDb(recipeId, parsed, batchNutrition, ingredientsWithNutrition, userId, supabase) {
    // Update the recipe
    const { data: recipe, error: recipeError } = await supabase.from('user_recipes').update({
      recipe_name: parsed.recipe_name,
      servings: parsed.servings,
      total_batch_size: parsed.total_batch_size,
      total_batch_grams: parsed.total_batch_grams,
      serving_size: parsed.serving_size,
      instructions: parsed.instructions,
      nutrition_data: batchNutrition,
      per_serving_nutrition: scaleNutrition(batchNutrition, 1 / (parsed.servings || 1)),
      ingredient_fingerprint: parsed.fingerprint || RecipeAgent.calculateFingerprint(parsed.ingredients)
    }).eq('id', recipeId).eq('user_id', userId) // Safety check
      .select().single();
    if (recipeError) throw recipeError;
    // Delete old ingredients and insert new ones
    await supabase.from('recipe_ingredients').delete().eq('recipe_id', recipeId);
    const ingredients = ingredientsWithNutrition.map((ing) => ({
      recipe_id: recipeId,
      ingredient_name: ing.name,
      quantity: ing.quantity,
      unit: ing.unit,
      nutrition_data: ing.nutrition
    }));
    const { error: ingError } = await supabase.from('recipe_ingredients').insert(ingredients);
    if (ingError) throw ingError;
    console.log(`[RecipeAgent] Updated recipe: ${recipe.recipe_name} (${recipeId})`);
    return recipe;
  }
  /**
   * Calculate a normalized fingerprint for the recipe based on sorted ingredient names.
   */ static calculateFingerprint(ingredients) {
    const stopWords = [
      'of',
      'a',
      'an',
      'the',
      'large',
      'small',
      'medium',
      'fresh',
      'dried',
      'ground',
      'chopped',
      'sliced',
      'diced',
      'clove',
      'cloves',
      'and',
      'with',
      'optional',
      'raw',
      'cooked',
      'cup',
      'cups',
      'tbsp',
      'tsp',
      'gram',
      'grams',
      'oz',
      'ounce',
      'scoop',
      'scoops',
      'whole',
      'piece',
      'pieces',
      'ml',
      'l',
      'liter',
      'liters',
      'bottle',
      'bottles',
      'can',
      'cans',
      'rolled',
      'steel',
      'cut',
      'instant',
      'baby',
      'leaves',
      'powder',
      'protein', // Often "Whey Protein" -> "Whey", "Pea Protein" -> "Pea" which is better for matching
      'isolate',
      'shake',
      'mix'
    ];
    // Helper for stemming (simple plural stripper)
    const singularize = (word) => {
      if (word.endsWith('es') && word.length > 3) return word.slice(0, -2); // box->box (approx), tomatoes->tomato (approx)
      if (word.endsWith('s') && !word.endsWith('ss') && word.length > 3) return word.slice(0, -1);
      return word;
    };
    return ingredients.map((ing) => {
      // Normalize name: lowercase, remove special chars AND NUMBERS, remove stop words
      // Replace numbers with space to split effectively
      let n = ing.name.trim().toLowerCase().replace(/[^a-z ]/g, ' ');
      // Remove stop words from the name itself
      const parts = n.split(/\s+/).filter((p) => !stopWords.includes(p) && p.length > 1).map((p) => singularize(p));
      return parts.join(' ');
    }).filter((n) => n.length > 0).sort().join(',');
  }
}
// Legacy exports
export async function findSavedRecipe(userId, name) {
  const agent = new RecipeAgent();
  const result = await agent.execute({
    type: 'find',
    name
  }, {
    userId,
    supabase: createAdminClient()
  });
  return result?.recipe || null;
}
export async function parseRecipeText(text) {
  const agent = new RecipeAgent();
  return agent.execute({
    type: 'parse',
    text
  }, {});
}
export async function saveRecipe(userId, parsed) {
  const agent = new RecipeAgent();
  const result = await agent.execute({
    type: 'save',
    parsed
  }, {
    userId,
    supabase: createAdminClient()
  });
  return result?.recipe || result;
}
