/**
 * Tool Definitions for ReasoningAgent
 * 
 * These tools are exposed to the ReasoningAgent via OpenAI function calling.
 * Each tool wraps existing agents and services to enable intelligent orchestration.
 * 
 * Categories:
 * 1. User Context (5 tools) - Profile, goals, progress, history
 * 2. Delegation (3 tools) - Ask specialist agents
 * 3. Nutrition Support (2 tools) - Validation, comparison
 * 4. Recipes Support (2 tools) - Parse, calculate
 * 5. Logging (3 tools) - PCC pattern for food/recipe logging
 * 6. Goals (3 tools) - Goal management
 * 7. Insights Support (1 tool) - Food recommendations
 */ export const toolDefinitions = [
  // =============================================================
  // CATEGORY 1: USER CONTEXT (5 tools)
  // =============================================================
  {
    type: "function",
    function: {
      name: "get_user_profile",
      description: "Retrieves the user's profile including height, weight, age, activity level, dietary preferences, and goal (e.g., 'lose weight', 'maintain', 'gain muscle'). Use this to understand the user's overall health context.",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_user_goals",
      description: "Retrieves the user's nutrition targets including calories, protein, carbs, fat, fiber, sugar, sodium. Returns target values and units.",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_today_progress",
      description: "Gets the user's food log totals for today - what they've already eaten. Returns calories, protein, carbs, fat, etc. consumed today.",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_weekly_summary",
      description: "Gets 7-day summary including daily averages, trends, and goal compliance percentage. Reuses existing dashboard aggregation logic.",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
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
          days: {
            type: "number",
            description: "Number of days of history to retrieve (default 7, max 30)"
          }
        }
      }
    }
  },
  // =============================================================
  // CATEGORY 2: DELEGATION (3 tools) - Ask specialist agents
  // =============================================================
  {
    type: "function",
    function: {
      name: "ask_nutrition_agent",
      description: "Delegate nutrition tasks to the specialist NutritionAgent. Use for food lookups, estimates, and comparisons. Returns enriched response with confidence levels.",
      parameters: {
        type: "object",
        properties: {
          query_type: {
            type: "string",
            enum: ["lookup", "estimate", "compare"],
            description: "Type of nutrition query"
          },
          items: {
            type: "array",
            items: { type: "string" },
            description: "Food items to analyze (e.g., ['apple', 'chicken breast'])"
          },
          portions: {
            type: "array",
            items: { type: "string" },
            description: "Optional portions for each item (e.g., ['1 medium', '4oz'])"
          }
        },
        required: ["query_type", "items"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "ask_recipe_agent",
      description: "Delegate recipe tasks to the specialist RecipeAgent. Use for searching saved recipes and getting recipe details.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["find", "details", "calculate_serving"],
            description: "Action to perform"
          },
          query: {
            type: "string",
            description: "Search query for 'find' action"
          },
          recipe_id: {
            type: "string",
            description: "Recipe ID for 'details' or 'calculate_serving' actions"
          },
          servings: {
            type: "number",
            description: "Number of servings for 'calculate_serving' action"
          }
        },
        required: ["action"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "ask_insight_agent",
      description: "Delegate insight/analysis tasks to the specialist InsightAgent. Use for audits, patterns, and summaries.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["audit", "patterns", "summary"],
            description: "Type of analysis: 'audit' for number verification, 'patterns' for trend analysis, 'summary' for daily report"
          },
          days: {
            type: "number",
            description: "Optional: number of days to analyze (default varies by action)"
          }
        },
        required: ["action"]
      }
    }
  },
  // =============================================================
  // CATEGORY 3: NUTRITION SUPPORT (2 tools)
  // =============================================================
  {
    type: "function",
    function: {
      name: "validate_nutrition",
      description: "Validates if nutrition data is reasonable. Use this to check for obviously wrong values like 0-calorie chicken.",
      parameters: {
        type: "object",
        properties: {
          food_name: {
            type: "string"
          },
          calories: {
            type: "number"
          },
          protein_g: {
            type: "number"
          },
          carbs_g: {
            type: "number"
          },
          fat_g: {
            type: "number"
          }
        },
        required: [
          "food_name",
          "calories"
        ]
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
            items: {
              type: "string"
            },
            description: "Array of food names to compare (e.g., ['chicken breast', 'salmon', 'tofu'])"
          }
        },
        required: [
          "foods"
        ]
      }
    }
  },
  // =============================================================
  // CATEGORY 4: RECIPES SUPPORT (2 tools)
  // =============================================================
  {
    type: "function",
    function: {
      name: "parse_recipe_text",
      description: "Parses recipe text from natural language into structured ingredients list. Use this when user provides recipe details.",
      parameters: {
        type: "object",
        properties: {
          recipe_text: {
            type: "string",
            description: "The recipe text to parse (ingredients and optionally instructions)"
          },
          recipe_name: {
            type: "string",
            description: "Name for the recipe"
          }
        },
        required: [
          "recipe_text"
        ]
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
          recipe_id: {
            type: "string",
            description: "The recipe ID"
          },
          servings: {
            type: "number",
            description: "Number of servings to calculate for (e.g., 0.5 for half serving)"
          }
        },
        required: [
          "recipe_id",
          "servings"
        ]
      }
    }
  },
  // =============================================================
  // CATEGORY 5: LOGGING (3 tools) - PCC Pattern
  // =============================================================
  {
    type: "function",
    function: {
      name: "propose_food_log",
      description: "Proposes logging a food item. The user will see a confirmation card and must approve before it's saved. Returns proposal data for the UI.",
      parameters: {
        type: "object",
        properties: {
          food_name: {
            type: "string",
            description: "Name of the food"
          },
          portion: {
            type: "string",
            description: "Portion size"
          },
          calories: {
            type: "number",
            description: "Calories"
          },
          protein_g: {
            type: "number",
            description: "Protein in grams"
          },
          carbs_g: {
            type: "number",
            description: "Carbs in grams"
          },
          fat_total_g: {
            type: "number",
            description: "Fat in grams"
          },
          sugar_g: {
            type: "number",
            description: "Sugar in grams (optional)"
          },
          fiber_g: {
            type: "number",
            description: "Fiber in grams (optional)"
          },
          sodium_mg: {
            type: "number",
            description: "Sodium in milligrams (optional)"
          },
          fat_saturated_g: {
            type: "number",
            description: "Saturated fat in grams (optional)"
          },
          cholesterol_mg: {
            type: "number",
            description: "Cholesterol in milligrams (optional)"
          },
          potassium_mg: {
            type: "number",
            description: "Potassium in milligrams (optional)"
          }
        },
        required: [
          "food_name",
          "calories",
          "protein_g",
          "carbs_g",
          "fat_total_g"
        ]
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
          recipe_id: {
            type: "string",
            description: "ID of the saved recipe"
          },
          recipe_name: {
            type: "string",
            description: "Name of the recipe"
          },
          servings: {
            type: "number",
            description: "Number of servings to log"
          },
          calories: {
            type: "number",
            description: "Calories for this portion"
          },
          protein_g: {
            type: "number"
          },
          carbs_g: {
            type: "number"
          },
          fat_total_g: {
            type: "number"
          },
          sugar_g: {
            type: "number",
            description: "Sugar in grams"
          },
          fiber_g: {
            type: "number",
            description: "Fiber in grams"
          },
          sodium_mg: {
            type: "number",
            description: "Sodium in milligrams"
          }
        },
        required: [
          "recipe_id",
          "recipe_name",
          "servings",
          "calories"
        ]
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
          proposal_id: {
            type: "string",
            description: "ID of the pending proposal to confirm"
          }
        },
        required: [
          "proposal_id"
        ]
      }
    }
  },
  // =============================================================
  // CATEGORY 6: GOALS (3 tools)
  // =============================================================
  {
    type: "function",
    function: {
      name: "update_user_goal",
      description: "Proposes updating a user's nutrition goal. Returns a confirmation card for user approval.",
      parameters: {
        type: "object",
        properties: {
          nutrient: {
            type: "string",
            description: "The nutrient (calories, protein, carbs, fat, fiber, sugar, sodium)"
          },
          target_value: {
            type: "number",
            description: "The new target value"
          },
          unit: {
            type: "string",
            description: "The unit (kcal for calories, g for macros, mg for sodium)"
          },
          yellow_min: {
            type: "number",
            description: "Optional: The progress threshold for yellow status (0.0 to 1.0, e.g., 0.50)"
          },
          green_min: {
            type: "number",
            description: "Optional: The progress threshold for green status (0.0 to 1.0, e.g., 0.75)"
          },
          red_min: {
            type: "number",
            description: "Optional: The progress threshold for red status (0.0 to 1.0, e.g., 0.90)"
          }
        },
        required: [
          "nutrient",
          "target_value"
        ]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "apply_daily_workout_offset",
      description: "Applies a nutritional offset for today based on a workout. Adds a 'bonus' to daily targets.",
      parameters: {
        type: "object",
        properties: {
          nutrient: {
            type: "string",
            description: "The nutrient to adjust (default: 'calories')"
          },
          adjustment_value: {
            type: "number",
            description: "The amount to add to the target (e.g., 300)"
          },
          notes: {
            type: "string",
            description: "Reason for the adjustment (e.g., 'Intense cardio', 'Strength training')"
          }
        },
        required: [
          "adjustment_value"
        ]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "calculate_recommended_goals",
      description: "Calculates recommended nutrition goals based on user profile (TDEE calculation). Uses height, weight, age, activity level, and goal.",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    }
  },
  // =============================================================
  // CATEGORY 7: INSIGHTS SUPPORT (1 tool)
  // =============================================================
  {
    type: "function",
    function: {
      name: "get_food_recommendations",
      description: "Gets food suggestions based on remaining nutritional needs for the day. Considers what user has already eaten.",
      parameters: {
        type: "object",
        properties: {
          focus: {
            type: "string",
            description: "What to focus on: 'high_protein', 'low_sugar', 'balanced', 'low_calorie'"
          },
          preferences: {
            type: "string",
            description: "Any dietary preferences (e.g., 'vegetarian', 'quick snack', 'meal')"
          }
        }
      }
    }
  }
];
