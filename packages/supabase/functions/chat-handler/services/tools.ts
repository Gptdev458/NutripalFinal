/**
 * Tool Definitions for ReasoningAgent
 * 
 * These tools are exposed to the ReasoningAgent via OpenAI function calling.
 * Each tool wraps existing agents and services to enable intelligent orchestration.
 * 
 * Categories:
 * 1. User Context (5 tools) - Profile, goals, progress, history
 * 2. Nutrition (4 tools) - Wraps NutritionAgent
 * 3. Recipes (4 tools) - Wraps RecipeAgent
 * 4. Logging (3 tools) - PCC pattern for food/recipe logging
 * 5. Goals (2 tools) - Goal management
 * 6. Insights (3 tools) - Wraps InsightAgent
 */

export const toolDefinitions = [
    // =============================================================
    // CATEGORY 1: USER CONTEXT (5 tools)
    // =============================================================
    {
        type: "function",
        function: {
            name: "get_user_profile",
            description: "Retrieves the user's profile including height, weight, age, activity level, dietary preferences, and goal (e.g., 'lose weight', 'maintain', 'gain muscle'). Use this to understand the user's overall health context.",
            parameters: { type: "object", properties: {}, required: [] }
        }
    },
    {
        type: "function",
        function: {
            name: "get_user_goals",
            description: "Retrieves the user's nutrition targets including calories, protein, carbs, fat, fiber, sugar, sodium. Returns target values and units.",
            parameters: { type: "object", properties: {}, required: [] }
        }
    },
    {
        type: "function",
        function: {
            name: "get_today_progress",
            description: "Gets the user's food log totals for today - what they've already eaten. Returns calories, protein, carbs, fat, etc. consumed today.",
            parameters: { type: "object", properties: {}, required: [] }
        }
    },
    {
        type: "function",
        function: {
            name: "get_weekly_summary",
            description: "Gets 7-day summary including daily averages, trends, and goal compliance percentage. Reuses existing dashboard aggregation logic.",
            parameters: { type: "object", properties: {}, required: [] }
        }
    },
    {
        type: "function",
        function: {
            name: "get_food_history",
            description: "Gets detailed food log history for pattern analysis. Useful for understanding eating habits over time.",
            parameters: {
                type: "object",
                properties: {
                    days: { type: "number", description: "Number of days of history to retrieve (default 7, max 30)" }
                }
            }
        }
    },

    // =============================================================
    // CATEGORY 2: NUTRITION (4 tools) - Wraps NutritionAgent
    // =============================================================
    {
        type: "function",
        function: {
            name: "lookup_nutrition",
            description: "Looks up nutrition information for a food item. Use this before proposing to log food. Returns calories, protein, carbs, fat, etc.",
            parameters: {
                type: "object",
                properties: {
                    food: { type: "string", description: "The food to look up (e.g., 'apple', 'chicken breast', 'pizza')" },
                    portion: { type: "string", description: "Optional portion size (e.g., 'medium', '4oz', '1 cup', '2 slices')" },
                    calories: { type: "number", description: "Optional user-provided calories to override lookup value" },
                    macros: {
                        type: "object",
                        description: "Optional user-provided macros",
                        properties: {
                            protein: { type: "number" },
                            carbs: { type: "number" },
                            fat: { type: "number" }
                        }
                    }
                },
                required: ["food"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "estimate_nutrition",
            description: "Estimates nutrition for foods that can't be found in the database. Uses LLM-based estimation with transparency about estimates.",
            parameters: {
                type: "object",
                properties: {
                    description: { type: "string", description: "Description of the food/meal to estimate (e.g., 'homemade chicken stir fry with rice')" },
                    portion: { type: "string", description: "Optional portion size" },
                    calories_hint: { type: "number", description: "User-provided calorie value to help guide the macro estimation" }
                },
                required: ["description"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "validate_nutrition",
            description: "Validates if nutrition data is reasonable. Use this to check for obviously wrong values like 0-calorie chicken.",
            parameters: {
                type: "object",
                properties: {
                    food_name: { type: "string" },
                    calories: { type: "number" },
                    protein_g: { type: "number" },
                    carbs_g: { type: "number" },
                    fat_g: { type: "number" }
                },
                required: ["food_name", "calories"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "compare_foods",
            description: "Compares nutrition of multiple foods side by side. Useful for helping users choose between options.",
            parameters: {
                type: "object",
                properties: {
                    foods: {
                        type: "array",
                        items: { type: "string" },
                        description: "Array of food names to compare (e.g., ['chicken breast', 'salmon', 'tofu'])"
                    }
                },
                required: ["foods"]
            }
        }
    },

    // =============================================================
    // CATEGORY 3: RECIPES (4 tools) - Wraps RecipeAgent
    // =============================================================
    {
        type: "function",
        function: {
            name: "search_saved_recipes",
            description: "Searches the user's saved recipes by name or keyword. Returns matching recipes with their nutrition per serving.",
            parameters: {
                type: "object",
                properties: {
                    query: { type: "string", description: "Recipe name or keywords to search for" }
                },
                required: ["query"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_recipe_details",
            description: "Gets full details of a saved recipe including all ingredients and nutrition breakdown.",
            parameters: {
                type: "object",
                properties: {
                    recipe_id: { type: "string", description: "The ID of the recipe to retrieve" }
                },
                required: ["recipe_id"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "parse_recipe_text",
            description: "Parses recipe text from natural language into structured ingredients list. Use this when user provides recipe details.",
            parameters: {
                type: "object",
                properties: {
                    recipe_text: { type: "string", description: "The recipe text to parse (ingredients and optionally instructions)" },
                    recipe_name: { type: "string", description: "Name for the recipe" }
                },
                required: ["recipe_text"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "calculate_recipe_serving",
            description: "Calculates nutrition for a specific portion/serving of a recipe.",
            parameters: {
                type: "object",
                properties: {
                    recipe_id: { type: "string", description: "The recipe ID" },
                    servings: { type: "number", description: "Number of servings to calculate for (e.g., 0.5 for half serving)" }
                },
                required: ["recipe_id", "servings"]
            }
        }
    },

    // =============================================================
    // CATEGORY 4: LOGGING (3 tools) - PCC Pattern
    // =============================================================
    {
        type: "function",
        function: {
            name: "propose_food_log",
            description: "Proposes logging a food item. The user will see a confirmation card and must approve before it's saved. Returns proposal data for the UI.",
            parameters: {
                type: "object",
                properties: {
                    food_name: { type: "string", description: "Name of the food" },
                    portion: { type: "string", description: "Portion size" },
                    calories: { type: "number", description: "Calories" },
                    protein_g: { type: "number", description: "Protein in grams" },
                    carbs_g: { type: "number", description: "Carbs in grams" },
                    fat_total_g: { type: "number", description: "Fat in grams" },
                    sugar_g: { type: "number", description: "Sugar in grams (optional)" },
                    fiber_g: { type: "number", description: "Fiber in grams (optional)" }
                },
                required: ["food_name", "calories", "protein_g", "carbs_g", "fat_total_g"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "propose_recipe_log",
            description: "Proposes logging a saved recipe. User must confirm before it's saved.",
            parameters: {
                type: "object",
                properties: {
                    recipe_id: { type: "string", description: "ID of the saved recipe" },
                    recipe_name: { type: "string", description: "Name of the recipe" },
                    servings: { type: "number", description: "Number of servings to log" },
                    calories: { type: "number", description: "Calories for this portion" },
                    protein_g: { type: "number" },
                    carbs_g: { type: "number" },
                    fat_total_g: { type: "number" }
                },
                required: ["recipe_id", "recipe_name", "servings", "calories"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "confirm_pending_log",
            description: "Called when user confirms a pending food or recipe log. This tool is typically called by the system when user clicks confirm.",
            parameters: {
                type: "object",
                properties: {
                    proposal_id: { type: "string", description: "ID of the pending proposal to confirm" }
                },
                required: ["proposal_id"]
            }
        }
    },

    // =============================================================
    // CATEGORY 5: GOALS (2 tools)
    // =============================================================
    {
        type: "function",
        function: {
            name: "update_user_goal",
            description: "Proposes updating a user's nutrition goal. Returns a confirmation card for user approval.",
            parameters: {
                type: "object",
                properties: {
                    nutrient: { type: "string", description: "The nutrient (calories, protein, carbs, fat, fiber, sugar, sodium)" },
                    target_value: { type: "number", description: "The new target value" },
                    unit: { type: "string", description: "The unit (kcal for calories, g for macros, mg for sodium)" }
                },
                required: ["nutrient", "target_value"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "calculate_recommended_goals",
            description: "Calculates recommended nutrition goals based on user profile (TDEE calculation). Uses height, weight, age, activity level, and goal.",
            parameters: { type: "object", properties: {}, required: [] }
        }
    },

    // =============================================================
    // CATEGORY 6: INSIGHTS (3 tools) - Wraps InsightAgent
    // =============================================================
    {
        type: "function",
        function: {
            name: "get_food_recommendations",
            description: "Gets food suggestions based on remaining nutritional needs for the day. Considers what user has already eaten.",
            parameters: {
                type: "object",
                properties: {
                    focus: { type: "string", description: "What to focus on: 'high_protein', 'low_sugar', 'balanced', 'low_calorie'" },
                    preferences: { type: "string", description: "Any dietary preferences (e.g., 'vegetarian', 'quick snack', 'meal')" }
                }
            }
        }
    },
    {
        type: "function",
        function: {
            name: "analyze_eating_patterns",
            description: "Analyzes the user's eating patterns over time. Identifies trends, habits, and areas for improvement.",
            parameters: {
                type: "object",
                properties: {
                    days: { type: "number", description: "Number of days to analyze (default 14)" }
                }
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_progress_report",
            description: "Generates a comprehensive progress report including goal adherence, trends, and personalized suggestions.",
            parameters: { type: "object", properties: {}, required: [] }
        }
    }
]

// Type for tool names for type safety
export type ToolName =
    // User Context
    | 'get_user_profile'
    | 'get_user_goals'
    | 'get_today_progress'
    | 'get_weekly_summary'
    | 'get_food_history'
    // Nutrition
    | 'lookup_nutrition'
    | 'estimate_nutrition'
    | 'validate_nutrition'
    | 'compare_foods'
    // Recipes
    | 'search_saved_recipes'
    | 'get_recipe_details'
    | 'parse_recipe_text'
    | 'calculate_recipe_serving'
    // Logging
    | 'propose_food_log'
    | 'propose_recipe_log'
    | 'confirm_pending_log'
    // Goals
    | 'update_user_goal'
    | 'calculate_recommended_goals'
    // Insights
    | 'get_food_recommendations'
    | 'analyze_eating_patterns'
    | 'get_progress_report'
