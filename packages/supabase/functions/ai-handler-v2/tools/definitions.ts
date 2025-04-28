// Tool definitions for OpenAI function calling
// Export the availableTools array and any related types

// Import OpenAI types if needed
// import type { OpenAI } from "openai";

export const availableTools = [
    {
        type: 'function',
        function: {
            name: 'logGenericFoodItem',
            description: `Logs a single, simple food item to the user's diary. Use this ONLY for clearly simple or standard/pre-packaged items (e.g., 'banana', 'protein bar', 'apple juice').
- If the user mentions multiple foods (e.g., 'log a banana and an apple'), call this tool separately for each food.
- If the food is ambiguous (e.g., 'sandwich', 'wrap'), ask the user to clarify ingredients or type unless they specify it's standard/pre-made.
- DO NOT use for dishes that typically require multiple ingredients (like 'fried rice', 'soup', 'salad', 'pasta', 'smoothie') unless the user provides context indicating it's standard/pre-made or explicitly tells you to log it as a generic item after clarification.
- Validate that the food_description is not empty or nonsensical.
- Confirm with the user what was logged and provide a friendly follow-up.
- If the user clarifies with ingredients, log the food as a single item with all specified ingredients (e.g., 'sandwich with one piece of bread and one piece of ham').
Examples:
  - 'log a banana' → logGenericFoodItem('banana')
  - 'log a sandwich' → ask for clarification unless user says 'pre-made sandwich' or provides ingredients.
  - 'log a sandwich' + user: 'one piece of bread, one piece of ham' → logGenericFoodItem('sandwich with one piece of bread and one piece of ham')
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
            description: `Analyzes the ingredients of a recipe to estimate nutrition. Use this tool when:
1) The user provides a list of ingredients for a dish.
2) The user mentions making a dish themselves (e.g., 'my homemade soup').
3) The user confirms they want to analyze a dish that typically requires multiple ingredients.
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
    }
]; 