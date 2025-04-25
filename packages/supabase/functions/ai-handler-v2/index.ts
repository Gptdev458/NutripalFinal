// Main request handler for AI function
// Import from tools/definitions, tools/execution, utils/pendingAction, utils/history
import { availableTools } from './tools/definitions.ts';
import * as toolExec from './tools/execution.ts';
import { setPendingAction, getPendingAction, clearPendingAction } from './utils/pendingAction.ts';
import { fetchConversationHistory } from './utils/history.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { OpenAI } from 'openai';

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type HandlerResponse = {
  status: 'success' | 'error' | 'clarification';
  message: string;
  response_type: string;
  [key: string]: any;
};

const AI_PERSONA = `You are NutriPal, an encouraging, knowledgeable, and friendly AI nutrition coach. Be supportive, conversational, and concise in your responses. Help users log foods, analyze recipes, and answer nutrition questions. Use the available tools to take actions as needed. Always confirm actions with the user when appropriate, and encourage healthy habits. If you need clarification, ask clear and friendly questions. Never provide medical advice. End each successful interaction with a brief, positive follow-up like 'Anything else today?' or 'Keep up the great work!'`;

Deno.serve(async (req: Request) => {
  // --- Initialize outside try block ---
  let userId: string;
  let supabaseClient: any;
  let responseData: HandlerResponse = {
    status: 'error',
    message: 'Failed to process the request.',
    response_type: 'error_unknown'
  };
  let userMessageForStorage: string | null = null;
  let requestHandled = false;
  const MAX_HISTORY_MESSAGES = 8;

  try {
    // --- 1. Initialization & Request Parsing ---
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: CORS_HEADERS });
    }
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ status: 'error', message: 'Unauthorized' }), { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
    try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
        if (!supabaseUrl || !supabaseAnonKey) throw new Error('Missing Supabase ENV variables');
        supabaseClient = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } });
    } catch (error) {
        console.error('Critical Error: Initializing Supabase client failed:', error);
        return new Response( JSON.stringify({ status: 'error', message: 'Server configuration issue.' }), { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } } );
    }
    try {
        const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
        if (userError) throw userError;
        if (!user) throw new Error('User not found for the provided token.');
        userId = user.id;
        console.log(`Authenticated user: ${userId}`);
    } catch (error) {
        console.error('Authentication error:', error);
        return new Response( JSON.stringify({ status: 'error', message: 'Authentication failed.' }), { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
    }
    let message: string | undefined;
    let context: any;
    let action: string | undefined;
    let conversation_history: any[] = [];
    let pending_action: any = null;
    try {
        const requestData = await req.json();
        message = requestData?.message;
        action = requestData?.action;
        context = requestData?.context;
        conversation_history = Array.isArray(requestData?.conversation_history) ? requestData.conversation_history : [];
        pending_action = context?.pending_action;
        if (!pending_action) {
            pending_action = await getPendingAction(userId, supabaseClient);
            if (pending_action) {
                console.log('Restored pending_action from DB:', pending_action);
            }
        }
        userMessageForStorage = message ?? null;
        const previousContext = context?.awaiting_clarification_for ? ` (User was asked to clarify: ${context.awaiting_clarification_for})` : '';
        if (!message && typeof action !== 'string' && !pending_action) {
             throw new Error('Request must include a message, action, or pending_action.');
        }
        console.log(`Request received - Message: "${message}", Action: ${action}, Pending Action Type: ${pending_action?.type}, Previous Context: ${previousContext}`);
    } catch (error) {
        console.error('Error parsing request body:', error);
        return new Response( JSON.stringify({ status: 'error', message: `Invalid request: ${error.message}`, response_type: 'error_request' }), { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } } );
    }
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) {
        console.error("Critical Error: OPENAI_API_KEY missing");
        return new Response( JSON.stringify({ status: 'error', message: 'AI service configuration error.', response_type: 'error_config' }), { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } } );
    }
    const openai = new OpenAI({ apiKey: openaiApiKey });

    // --- 2. Handle Pre-OpenAI Actions (Confirmations, Direct Actions) ---
    // Example: handle pending_action, direct tool calls, etc.
    if (pending_action?.type === 'log_analyzed_recipe' && pending_action.analysis && message) {
      const userResponse = message.toLowerCase();
      if (/(save and log|save it|yes|confirm|sounds good|do it)/i.test(userResponse)) {
        responseData = await toolExec.saveAndLogRecipe(pending_action.analysis, userId, supabaseClient);
        if (responseData.status === 'success') responseData.response_type = 'recipe_saved_logged';
        else responseData.response_type = responseData.response_type || 'error_database';
      } else if (/(just log|log only|don't save|only log)/i.test(userResponse)) {
        responseData = await toolExec.logOnlyAnalyzedRecipe(pending_action.analysis, userId, supabaseClient);
        if (responseData.status === 'success') responseData.response_type = 'recipe_logged_only';
        else responseData.response_type = responseData.response_type || 'error_database';
      } else {
        responseData = {
          status: 'clarification',
          message: 'Okay, I won\'t log or save the recipe. Let me know if you\'d like to do something else!',
          response_type: 'action_cancelled'
        };
      }
      await clearPendingAction(userId, supabaseClient);
      requestHandled = true;
    }
    // --- Handle saved recipe confirmation with strict validation ---
    else if (pending_action?.type === 'confirm_log_saved_recipe' && message) {
      const normalizedMessage = message.toLowerCase();
      // Only match if the message includes the recipe name (strict)
      const matchesPendingRecipe =
        (pending_action.recipe_name && normalizedMessage.includes(pending_action.recipe_name.toLowerCase()));
      if (matchesPendingRecipe) {
        responseData = await toolExec.executeLogExistingSavedRecipe(
          pending_action.recipe_id,
          pending_action.recipe_name,
          userId,
          supabaseClient
        );
        await clearPendingAction(userId, supabaseClient);
        requestHandled = true;
      } else {
        responseData = {
          status: 'clarification',
          message: `Please specify which recipe you'd like to log by name (e.g., 'log Breakfast Smoothie'). This prevents logging the wrong recipe by accident.`,
          response_type: 'clarification_needed'
        };
        await clearPendingAction(userId, supabaseClient);
        requestHandled = true;
      }
    }
    // ... (Add more pre-OpenAI action handlers as needed) ...

    // --- 3. Fetch Conversation History ---
    let history: any[] = [];
    if (!requestHandled) {
      history = await fetchConversationHistory(userId, supabaseClient, MAX_HISTORY_MESSAGES);
    }

    // --- 4. Compose OpenAI Messages ---
    if (!requestHandled) {
      const messages = [
        { role: 'system', content: AI_PERSONA },
        ...history,
        ...(message ? [{ role: 'user', content: message }] : [])
      ];

      // --- 5. Call OpenAI ---
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages,
        tools: availableTools,
        tool_choice: 'auto',
        temperature: 0.7
      });
      const aiMessage = completion.choices[0].message;
      // --- Tool Call Handling ---
      if (aiMessage.tool_calls && aiMessage.tool_calls.length > 0) {
        // For now, only handle the first tool call (single function call per turn)
        const toolCall = aiMessage.tool_calls[0];
        const toolName = toolCall.function?.name;
        let toolArgs: any = {};
        try {
          toolArgs = JSON.parse(toolCall.function?.arguments || '{}');
        } catch (err) {
          responseData = {
            status: 'error',
            message: 'Could not parse tool arguments.',
            response_type: 'error_tool_args',
            ai_message: aiMessage
          };
          return new Response(JSON.stringify(responseData), {
            status: 200,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
          });
        }
        // Map tool name to execution function
        let toolResult;
        try {
          switch (toolName) {
            case 'logGenericFoodItem':
              toolResult = await toolExec.executeLogGenericFoodItem(toolArgs.food_description, userId, supabaseClient, openai);
              break;
            case 'logExistingSavedRecipe':
              toolResult = await toolExec.executeLogExistingSavedRecipe(toolArgs.recipe_id, toolArgs.recipe_name, userId, supabaseClient);
              break;
            case 'analyzeRecipeIngredients':
              toolResult = await toolExec.executeAnalyzeRecipeIngredients(toolArgs.recipe_name, toolArgs.ingredients_list, userId, supabaseClient, openai);
              break;
            case 'answerGeneralQuestion':
              toolResult = await toolExec.executeAnswerGeneralQuestion(toolArgs.question, userId, supabaseClient, openai);
              break;
            case 'listLoggedFoods':
              toolResult = await toolExec.executeListLoggedFoods(toolArgs.date, userId, supabaseClient);
              break;
            case 'undoLastAction':
              toolResult = await toolExec.executeUndoLastAction(userId, supabaseClient);
              break;
            case 'updateUserGoal':
              toolResult = await toolExec.executeUpdateUserGoal(toolArgs.nutrient, toolArgs.target_value, toolArgs.unit, userId, supabaseClient);
              break;
            case 'saveLoggedFoodAsRecipe':
              toolResult = await toolExec.executeSaveLoggedFoodAsRecipe(toolArgs.food_name, toolArgs.nutrition_data, userId, supabaseClient);
              break;
            case 'deleteLoggedFood':
              toolResult = await toolExec.executeDeleteLoggedFood(toolArgs.log_id, toolArgs.food_name, userId, supabaseClient);
              break;
            case 'findSavedRecipeByName':
              toolResult = await toolExec.executeFindSavedRecipeByName(toolArgs.query, userId, supabaseClient);
              // If exactly one match, attempt to log it immediately and confirm
              if (toolResult.status === 'success' && toolResult.found === true && toolResult.count === 1 && toolResult.matches && toolResult.matches.length === 1) {
                const recipe = toolResult.matches[0];
                console.log(`Found unique recipe: ${recipe.recipe_name} (ID: ${recipe.id}). Attempting to log.`);
                const logResult = await toolExec.executeLogExistingSavedRecipe(recipe.id, recipe.recipe_name, userId, supabaseClient);

                // Check if logging succeeded or failed
                if (logResult.status === 'success') {
                  console.log(`Successfully logged recipe ID: ${recipe.id}`);
                  // Merge successful log result into toolResult for confirmation
                  toolResult = {
                    ...toolResult, // Keep original find results (like 'matches')
                    ...logResult, // Add log results (like nutrition)
                    message: `Great! I've logged your ${recipe.recipe_name} for today. ${logResult.message || ''}`, // Overwrite message
                    response_type: 'saved_recipe_logged', // Set specific response type
                    logged_recipe_id: recipe.id,
                    logged_recipe_name: recipe.recipe_name
                  };
                } else {
                  console.error(`Failed to log recipe ID: ${recipe.id}. Reason: ${logResult.message}`);
                  // Merge failed log result, ensuring error status and message are prioritized
                  toolResult = {
                    ...toolResult, // Keep original find results
                    ...logResult, // Add log error details
                    status: 'error', // Ensure status is error
                    message: `Sorry, I found '${recipe.recipe_name}' but couldn't log it right now. ${logResult.message || 'Please try again later.'}`, // Overwrite message with error info
                    response_type: 'error_logging_recipe' // Set specific error type
                  };
                }
                // Clear any pending action since we attempted to handle it
                await clearPendingAction(userId, supabaseClient);
              }
              break;
            case 'clarifyDishType':
              // This tool is for conversational clarification only
              toolResult = {
                status: 'success',
                message: `Could you clarify what you meant by "${toolArgs.dish_name}"? For example, what ingredients were in it, or was it a standard/pre-made version? This helps me log it accurately for you!`,
                response_type: 'clarification_needed',
                clarification_for: toolArgs.dish_name
              };
              break;
            default:
              toolResult = {
                status: 'error',
                message: `Unknown tool: ${toolName}`,
                response_type: 'error_unknown_tool',
                ai_message: aiMessage
              };
          }
        } catch (err) {
          toolResult = {
            status: 'error',
            message: `Tool execution failed: ${err instanceof Error ? err.message : String(err)}`,
            response_type: 'error_tool_execution',
            ai_message: aiMessage
          };
        }
        responseData = toolResult;

        // --- Generate Conversational Response UNLESS immediate log happened --- 
        // Check if the recipe was just logged directly within the tool handler
        const recipeJustLogged = responseData.response_type === 'saved_recipe_logged';

        if (!recipeJustLogged) {
          // --- Always generate a conversational AI message for user-facing response ---
          let summary = '';
          if (toolResult.status === 'success') {
            if (toolName === 'listLoggedFoods' && toolResult.logs && Array.isArray(toolResult.logs)) {
              const foods = toolResult.logs.map((log: any) => log.food_name).filter(Boolean).join(', ');
              summary += `Today's food log: ${foods || 'No foods logged yet.'}`;
            } else if (toolName === 'findSavedRecipeByName' && toolResult.matches && Array.isArray(toolResult.matches)) {
              if (toolResult.matches.length === 0) {
                summary += 'No saved recipes found.';
              } else if (toolResult.matches.length === 1) {
                // This case should technically not be hit if it was logged, but handle defensively
                summary += `One saved recipe found: ${toolResult.matches[0].recipe_name}.`;
              } else {
                const names = toolResult.matches.map((r: any) => r.recipe_name).join(', ');
                summary += `Multiple saved recipes found: ${names}.`;
              }
            } else if (toolName === 'undoLastAction' && toolResult.undone_log) {
              summary += `Last log undone: ${toolResult.undone_log.food_name || 'Unknown item'}.`;
            } else if (toolName === 'updateUserGoal' && toolResult.updated_goal) {
              summary += `User goal updated: ${JSON.stringify(toolResult.updated_goal)}.`;
            } else if (toolName === 'saveLoggedFoodAsRecipe' && toolResult.saved_recipe) {
              summary += `Food saved as recipe: ${toolResult.saved_recipe.recipe_name}.`;
            } else if (toolName === 'deleteLoggedFood' && toolResult.deleted_log_id) {
              summary += `Log deleted: ${toolResult.deleted_log_id}.`;
            } else if (toolName === 'logGenericFoodItem' && toolResult.logged_food_name) {
              summary += `Food logged: ${toolResult.logged_food_name}.`;
            } else if (toolName === 'logExistingSavedRecipe' && toolResult.logged_recipe_name) {
              summary += `Saved recipe logged: ${toolResult.logged_recipe_name}.`;
            } else if (toolName === 'analyzeRecipeIngredients' && toolResult.analysis) {
              summary += `Recipe analyzed: ${JSON.stringify(toolResult.analysis)}.`;
            } else if (toolName === 'answerGeneralQuestion' && toolResult.answer) {
              summary += `General answer: ${toolResult.answer}`;
            } else {
              // Default summary if specific case not handled (shouldn't happen often)
              summary += JSON.stringify(toolResult);
            }
          } else {
            summary += `There was an error: ${toolResult.message}`;
          }

          let conversationalPrompt = '';
          if (toolName && toolResult.response_type === 'error_unknown_tool') {
            conversationalPrompt = `You tried to use a tool called '${toolName}', but it is not available. Please respond conversationally, help the user, and suggest what they can do next.`;
          } else if (toolName === 'listLoggedFoods') {
            conversationalPrompt = `The user asked what they ate today. Here is their food log for today: ${summary} Please summarize this in a friendly, conversational way, mentioning the foods and encouraging the user. If the log is empty, encourage the user to start logging their meals.`;
          } else if (toolName === 'findSavedRecipeByName') {
            conversationalPrompt = `The user asked to find a saved recipe. Here are the results: ${summary} Please respond conversationally, confirming the result, and guide the user on what to do next (e.g., log the recipe, clarify, or try again).`;
          } else {
            conversationalPrompt = `You are NutriPal, an encouraging, knowledgeable, and friendly AI nutrition coach. The user said: '${message}'. Here is the structured result: ${summary} Please respond conversationally, confirming the action, mentioning nutrition details if available, and encouraging the user. Be concise, friendly, and supportive. End with a brief positive follow-up like 'Anything else today?' or 'Keep up the great work!'`;
          }

          const convCompletion = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
              { role: 'system', content: AI_PERSONA },
              { role: 'user', content: conversationalPrompt }
            ],
            temperature: 0.7
          });
          const convMessage = convCompletion.choices[0].message.content || '';
          // Only overwrite if we generated a new conversational message
          responseData.message = convMessage;
        } // End of if (!recipeJustLogged)
      } else {
        responseData = {
          status: 'success',
          message: aiMessage.content || '',
          response_type: 'ai_response',
          ai_message: aiMessage
        };
      }
    }

    // --- 6. Store Conversation (optional, if you have a storeConversation helper) ---
    // await storeConversation(userId, userMessageForStorage, responseData, supabaseClient);

    // --- 7. Return Response ---
    return new Response(JSON.stringify(responseData), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ status: 'error', message: `Unexpected error: ${error.message}` }), { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  }
}); 