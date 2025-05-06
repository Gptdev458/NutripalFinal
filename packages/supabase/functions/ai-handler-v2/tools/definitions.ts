// Tool definitions for OpenAI function calling
// Export the availableTools array and any related types

// Import OpenAI types if needed
// import type { OpenAI } from "openai";

export const availableTools = [
    {
        type: 'function',
        function: {
            name: 'logGenericFoodItem',
            description: `Logs a single food item or simple combination to the user's diary. Use this for:
- Simple or standard items (e.g., 'banana', 'protein bar', 'apple juice')
- Basic combinations with few ingredients (e.g., 'sandwich with turkey and lettuce', 'toast with butter')
- If the user mentions multiple separate foods (e.g., 'log a banana and an apple'), call this tool separately for each food.
- If the food is completely ambiguous (e.g., just 'meal' or 'dish'), ask the user to clarify.
- Use this tool for simple sandwiches, wraps, or basic meals when ingredients are already provided.
- ONLY use analyzeRecipeIngredients for complex dishes with many ingredients or when nutrition analysis is explicitly requested.
Examples:
  - 'log a banana' → logGenericFoodItem('banana')
  - 'log a sandwich with turkey, lettuce and tomato' → logGenericFoodItem('sandwich with turkey, lettuce and tomato')
  - 'log a chicken salad' → ask for clarification first, then if user says "lettuce, chicken, dressing", use logGenericFoodItem
`,
            parameters: {
                type: 'object',
                properties: {
                    food_description: {
                        type: 'string',
                        description: `A clear description of the food, including quantity if provided. E.g., 'a bowl of oatmeal with berries', '2 slices of toast with peanut butter'. Must not be empty or ambiguous.`
                    }
                },
                required: ['food_description']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'findSavedRecipeByName',
            description: `Searches the user's saved recipes by name or keywords. Use this FIRST whenever the user asks to log a specific named item (e.g., 'log my morning smoothie', 'add the chili recipe', 'log post workout shake').
- If multiple matches are found, prompt the user to clarify which one they meant (show up to 5 options).
- If no matches are found, suggest the user provide ingredients or clarify.
- Handle empty or vague queries gracefully.
- **Context Handling:** If this tool finds a single recipe match, the system will prompt the user for confirmation. If the user confirms, the handler will automatically call 'logExistingSavedRecipe' using the correct details.
Examples:
  - 'log my chili' → findSavedRecipeByName('chili')
  - 'log smoothie' → findSavedRecipeByName('smoothie')
`,
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: `The name or keywords to search for in the user's saved recipes. E.g., 'morning smoothie', 'chili', 'post workout shake'. Must not be empty.`
                    }
                },
                required: ['query']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'analyzeRecipeIngredients',
            description: `Analyzes the ingredients of a recipe to estimate nutrition. Use this tool ONLY when:
1) The user explicitly asks for nutritional analysis of a recipe or dish.
2) The user provides a list of ingredients for a complex dish (more than 4-5 ingredients).
3) The user mentions making a complex dish themselves (e.g., 'my homemade lasagna', 'soup I made').
- Do NOT use this for simple food combinations like basic sandwiches, toast with toppings, or similar items that should be logged with logGenericFoodItem.
- The ingredients_list should be a comma-separated or newline-separated list of ingredients.
- Validate that both recipe_name and ingredients_list are present and parseable.
- Summarize the analysis and offer next steps (save, log, etc.).
- **Context Handling:** After presenting the analysis, the system will prompt the user about saving/logging. If the user confirms, the handler will automatically call 'saveAndLogRecipe' or 'logOnlyAnalyzedRecipe' using the correct analysis data.
Examples:
  - 'analyze my soup: 1L broth, 2 carrots, 1 potato' → analyzeRecipeIngredients('soup', '1L broth, 2 carrots, 1 potato')
`,
            parameters: {
                type: 'object',
                properties: {
                    recipe_name: {
                        type: 'string',
                        description: `The name the user gives the recipe, or a suggested name like 'Custom Recipe' if not provided. Must not be empty.`
                    },
                    ingredients_list: {
                        type: 'string',
                        description: `A full, comma- or newline-separated list of ingredients. E.g., '1 tbsp olive oil, 1 onion chopped, 2 eggs'. Must not be empty.`
                    }
                },
                required: ['recipe_name', 'ingredients_list']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'clarifyDishType',
            description: `Use this function ONLY when the user mentions a general dish name that usually requires multiple ingredients (e.g., 'fried rice', 'soup', 'salad', 'pasta', 'curry') and does NOT provide ingredients or specify if it's homemade/standard/pre-packaged, and a search for a saved recipe with that name is unlikely to succeed or has already failed.
- This tool asks the user for clarification in a friendly, conversational way.
- Do NOT use for items like 'smoothie' or 'shake' initially; try findSavedRecipeByName first for those.
Examples of ambiguous dishes: 'sandwich', 'wrap', 'casserole', 'stir fry', 'bake'.
`,
            parameters: {
                type: 'object',
                properties: {
                    dish_name: {
                        type: 'string',
                        description: `The ambiguous dish name mentioned by the user (e.g., 'fried rice', 'vegetable soup', 'sandwich'). Must not be empty.`,
                    },
                },
                required: ['dish_name'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'logExistingSavedRecipe',
            description: `Logs a specific saved recipe identified by its ID to the user's food diary. **Important:** This tool is normally called automatically by the system handler after the user confirms logging a recipe found by 'findSavedRecipeByName'. You should generally not need to call this tool directly unless specifically instructed or in complex recovery scenarios.`,
            parameters: {
                type: 'object',
                properties: {
                    recipe_id: {
                        type: 'string',
                        description: `The unique identifier (UUID) of the user's saved recipe. Must not be empty.`
                    },
                    recipe_name: {
                        type: 'string',
                        description: `The name of the saved recipe being logged, used for confirmation messages. Must not be empty.`
                    }
                },
                required: ['recipe_id', 'recipe_name']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'answerGeneralQuestion',
            description: `Provides information or answers general health, nutrition, or app usage questions not related to logging specific foods or recipes.
- Use for queries like 'how much protein should I eat?', 'is avocado healthy?', 'how do I set goals?'.
- Avoid giving medical advice or making diagnoses; clarify the scope in your answer.
- Provide helpful, conversational, and friendly answers.
Examples:
  - 'how much protein should I eat?' → answerGeneralQuestion('how much protein should I eat?')
  - 'is avocado healthy?' → answerGeneralQuestion('is avocado healthy?')
`,
            parameters: {
                type: 'object',
                properties: {
                    question: {
                        type: 'string',
                        description: `The user's question. Must not be empty or unrelated to nutrition, health, or app usage.`
                    }
                },
                required: ['question']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'saveLoggedFoodAsRecipe',
            description: `Saves a simple logged food as a recipe for future use. Use this when the user asks to save a just-logged food as a recipe, or requests to save a simple food as a recipe without providing ingredients. Do not use for complex dishes with multiple ingredients (use analyzeRecipeIngredients instead). Validate that food_name and nutrition_data are present and nutrition_data includes at least calories, protein_g, fat_total_g, and carbs_g.`,
            parameters: {
                type: 'object',
                properties: {
                    food_name: {
                        type: 'string',
                        description: `The name of the food to save as a recipe. Must not be empty.`
                    },
                    nutrition_data: {
                        type: 'object',
                        description: `Nutrition data for the food. Must include at least calories, protein_g, fat_total_g, and carbs_g.`,
                        properties: {
                            calories: { type: 'number', description: 'Calories (kcal)' },
                            protein_g: { type: 'number', description: 'Protein (g)' },
                            fat_total_g: { type: 'number', description: 'Total fat (g)' },
                            carbs_g: { type: 'number', description: 'Carbohydrates (g)' },
                            // Optionally include other nutrients
                        },
                        required: ['calories', 'protein_g', 'fat_total_g', 'carbs_g']
                    }
                },
                required: ['food_name', 'nutrition_data']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'logPremadeFood',
            description: `Logs a pre-made food item with specific nutrition information to the user's diary.
- Use ONLY when the user provides nutrition information from a package or label (e.g., "log a Whole Foods 365 Homestyle Waffle which has 100 calories").
- Appropriate for store-bought items with nutrition labels (packaged foods, restaurant items with published nutrition).
- The user MUST have provided or confirmed the food name and at least the calorie content.
- Do NOT ask for confirmation after the user has already provided the nutrition details clearly.
- If the user doesn't provide enough information, ask specific questions about missing details.
- Confirm the entry has been logged once successful.
Examples:
  - "Log a Whole Foods 365 Homestyle Waffle with 100 calories" → logPremadeFood('Whole Foods 365 Homestyle Waffle', 100, {...})
  - "I had a Clif Bar with 250 calories, 9g protein, 5g fat, 44g carbs" → logPremadeFood('Clif Bar', 250, {protein_g: 9, fat_total_g: 5, carbs_g: 44})
`,
            parameters: {
                type: 'object',
                properties: {
                    food_name: {
                        type: 'string',
                        description: `The name of the pre-made food item (e.g., 'Whole Foods 365 Homestyle Waffle', 'Quaker Oatmeal Packet', 'Clif Bar'). Must not be empty.`
                    },
                    calories: {
                        type: 'number',
                        description: `The calorie content of the food item. Must not be empty.`
                    },
                    nutrition_data: {
                        type: 'object',
                        description: `Additional nutrition data for the food item. Include any values provided by the user.`,
                        properties: {
                            protein_g: { type: 'number', description: 'Protein (g)' },
                            fat_total_g: { type: 'number', description: 'Total fat (g)' },
                            carbs_g: { type: 'number', description: 'Carbohydrates (g)' },
                            fiber_g: { type: 'number', description: 'Fiber (g)' },
                            sugar_g: { type: 'number', description: 'Sugar (g)' },
                            sodium_mg: { type: 'number', description: 'Sodium (mg)' },
                            cholesterol_mg: { type: 'number', description: 'Cholesterol (mg)' },
                            fat_saturated_g: { type: 'number', description: 'Saturated fat (g)' },
                            potassium_mg: { type: 'number', description: 'Potassium (mg)' },
                            omega_3_g: { type: 'number', description: 'Omega-3 fatty acids (g)' },
                            omega_6_g: { type: 'number', description: 'Omega-6 fatty acids (g)' },
                            fiber_soluble_g: { type: 'number', description: 'Soluble fiber (g)' }
                        }
                    },
                    servings: {
                        type: 'number',
                        description: `Number of servings consumed. Defaults to 1 if not specified.`
                    }
                },
                required: ['food_name', 'calories']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'lookupPremadeFood',
            description: `Looks up nutrition information for brand-name or pre-packaged foods from a database.
- ALWAYS try this tool FIRST when the user mentions a branded/packaged food WITHOUT providing nutrition details
- Appropriate for commercial products (e.g., "Clif Bar", "Cheerios", "Chobani Yogurt")
- DO NOT ask the user for nutrition info if the product is likely in a standard database
- Use this BEFORE asking the user to provide nutrition information for branded products
Examples:
  - "I had a Clif Bar Chocolate Chip" → lookupPremadeFood("Clif Bar Chocolate Chip")
  - "I ate Cheerios for breakfast" → lookupPremadeFood("Cheerios")
  - "Ate a Snickers bar" → lookupPremadeFood("Snickers bar")`,
            parameters: {
                type: 'object',
                properties: {
                    food_name: {
                        type: 'string',
                        description: `The specific name of the food product including brand, flavor, variety if mentioned (e.g., "Clif Bar Chocolate Chip", "Chobani Strawberry Greek Yogurt")`
                    }
                },
                required: ['food_name']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'deleteLoggedFood',
            description: `Deletes a logged food entry. Use when the user asks to delete a specific food log (by ID or description) or to delete their most recent log if no ID is provided. Confirm with the user before deleting if the request is ambiguous.`,
            parameters: {
                type: 'object',
                properties: {
                    log_id: {
                        type: 'string',
                        description: 'The unique identifier of the food log to delete. If not provided, delete the most recent log.'
                    },
                    food_name: {
                        type: 'string',
                        description: 'The name/description of the food to delete (optional, for disambiguation).'
                    }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'listLoggedFoods',
            description: `Lists foods logged for today or a specified date. Use when the user asks to see what they have logged, review their diary, or check their calories for a day.`,
            parameters: {
                type: 'object',
                properties: {
                    date: {
                        type: 'string',
                        description: 'The date to list logs for (YYYY-MM-DD). If not provided, use today.'
                    }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'undoLastAction',
            description: `Undoes the last logging action for the user. Use when the user asks to undo, cancel, or revert their last log. This is typically an alias for deleting the most recent food log.`,
            parameters: {
                type: 'object',
                properties: {},
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'updateUserGoal',
            description: `Sets or updates a user goal for a nutrient (e.g., 'track my sugar and set limit to 80g'). Use when the user asks to track a new nutrient, change a goal, or set a limit for a nutrient.`,
            parameters: {
                type: 'object',
                properties: {
                    nutrient: {
                        type: 'string',
                        description: 'The nutrient to track or update (e.g., "sugar", "protein", "calories"). Must not be empty.'
                    },
                    target_value: {
                        type: 'number',
                        description: 'The target value or limit for the nutrient (e.g., 80 for 80g). Must not be empty.'
                    },
                    unit: {
                        type: 'string',
                        description: 'The unit for the target value (e.g., "g", "mg", "kcal"). Optional.'
                    }
                },
                required: ['nutrient', 'target_value']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'findRecipesByNutrition',
            description: 'Finds recipes by nutritional properties, like calories, protein, fat, etc.',
            parameters: {
                type: 'object',
                properties: {
                    nutrient: {
                        type: 'string',
                        description: 'Nutrient to search by (e.g., \'calories\', \'protein\', \'fat\', etc.)'
                    },
                    min_value: {
                        type: 'number',
                        description: 'Minimum value for the nutrient (optional)'
                    },
                    max_value: {
                        type: 'number',
                        description: 'Maximum value for the nutrient (optional)'
                    }
                },
                required: ['nutrient']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'createRecipeVariation',
            description: 'Creates a variation of an existing recipe by applying modifications',
            parameters: {
                type: 'object',
                properties: {
                    base_recipe_id: {
                        type: 'string',
                        description: 'ID of the base recipe to modify (optional if base_recipe_name is provided)'
                    },
                    base_recipe_name: {
                        type: 'string',
                        description: 'Name of the base recipe to modify (optional if base_recipe_id is provided)'
                    },
                    modifications: {
                        type: 'string',
                        description: 'Description of modifications to make (e.g., \'add protein powder\', \'replace milk with almond milk\')'
                    }
                },
                required: ['modifications']
            }
        }
    }
]; 