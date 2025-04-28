// Main request handler for AI function
// Import from tools/definitions, tools/execution, utils/pendingAction, utils/history
import { availableTools } from './tools/definitions.ts';
import * as toolExec from './tools/execution.ts';
import { setPendingAction, getPendingAction, clearPendingAction } from './utils/pendingAction.ts';
import { fetchConversationHistory } from './utils/history.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { OpenAI } from 'openai';
import type { User } from '@supabase/supabase-js'; // Add type import
import type { ChatCompletionMessage, ChatCompletionToolMessageParam } from 'openai/resources/chat/completions';

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

const AI_PERSONA = `You are NutriPal, an encouraging, knowledgeable, and friendly AI nutrition coach. Be supportive, conversational, and concise in your responses. Help users log foods, analyze recipes, and answer nutrition questions. Use the available tools to take actions as needed.

**VERY Important Instructions:**
- **Focus ONLY on the CURRENT request:** Prioritize understanding and responding to the user's *most recent* message above all else. 
- **DO NOT REPEAT past information:** Avoid summarizing or mentioning the outcome of the *immediately preceding* successful action in your response to the *current*, unrelated request. For example, if you just updated calories and the user then asks to log food, respond *only* about logging the food, do not mention the calorie update again.
- **Handler Manages Confirmations:** When a tool requires user confirmation (e.g., logging a found/analyzed recipe), the system handler will manage the state. If the user confirms, the handler executes the action. Your role afterwards is simply to provide a brief conversational acknowledgement based on the handler's success/failure result. Do not try to re-execute the action or recall specific data yourself.
- **Clarity over Assumption:** If the user's request is ambiguous, ask clear, friendly clarifying questions. Do not guess or make assumptions, especially about quantities, units, or specific recipes.
- **Tool Use:** Use the available tools precisely as described. Do not call tools with hallucinated arguments.
- **No Medical Advice:** Never provide medical advice or diagnoses.

End each successful interaction with a brief, positive follow-up like 'Anything else today?' or 'Keep up the great work!'`;

// @ts-ignore: Deno Deploy compatibility
Deno.serve(async (req: Request) => {
  // --- Initialize outside try block ---
  let userId: string;
  // Explicitly type supabaseClient
  let supabaseClient: SupabaseClient | null = null;
  let responseData: HandlerResponse = {
    status: 'error',
    message: 'Failed to process the request.',
    response_type: 'error_unknown'
  };
  let userMessageForStorage: string | null = null;
  let requestHandled = false;
  const MAX_HISTORY_MESSAGES = 8;
  let message: string | undefined;
  let context: any;
  let action: string | undefined;
  let conversation_history: any[] = [];
  let pending_action: any = null;
  let chatId: string | null = null;
  let requestData: any = {};

  try {
    // --- 1. Initialization & Request Parsing ---
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: CORS_HEADERS });
    }

    // --- Authentication --- 
    const authHeader = req.headers.get("Authorization");
    console.log('[AI HANDLER] Authorization header:', authHeader);
    if (!authHeader?.startsWith('Bearer ')) { 
        console.error('Auth Error: Missing or invalid Authorization Bearer header.');
        return new Response(JSON.stringify({ status: 'error', message: 'Unauthorized - Invalid Token Format' }), { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
    }
    const jwt = authHeader.split(' ')[1];
    console.log('[AI HANDLER] JWT snippet:', jwt ? jwt.substring(0, 20) + '...' : 'MISSING');

    // --- Supabase Client Initialization --- 
    try {
        // @ts-ignore: Deno Deploy compatibility
        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        // @ts-ignore: Deno Deploy compatibility
        const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
        if (!supabaseUrl || !supabaseAnonKey) throw new Error('Missing Supabase ENV variables');
        supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
          global: { headers: { Authorization: `Bearer ${jwt}` } }
        });
    } catch (error) {
        console.error('Critical Error: Initializing Supabase client failed:', error);
        return new Response( JSON.stringify({ status: 'error', message: 'Server configuration issue.' }), { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } } );
    }

    // --- Get User via Token --- 
    try {
        const { data: { user }, error: userError } = await supabaseClient.auth.getUser(jwt);
        if (userError) {
            console.error('Supabase userError during getUser(jwt):', userError.message);
            const detailedError = userError.message.includes('invalid JWT') ? 'Invalid JWT' : userError.message;
            throw new Error(detailedError);
        }
        if (!user) {
             console.error('Auth Error: User not found for the provided token.');
            throw new Error('User not found for the provided token.');
        }
        userId = user.id;
        console.log(`[AI HANDLER] Authenticated user: ${userId}`);
    } catch (error) {
        console.error('Authentication error in getUser(jwt) block:', error);
        const message = error instanceof Error ? error.message : 'Authentication failed.';
        return new Response( JSON.stringify({ status: 'error', message: `Authentication failed: ${message}` }), { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
    }

    // --- Parse Request Body --- 
    try {
        requestData = await req.json();
        message = requestData?.message;
        action = requestData?.action;
        context = requestData?.context;
        chatId = requestData?.chat_id;
        conversation_history = Array.isArray(requestData?.conversation_history) ? requestData.conversation_history : [];
        
        // PRIORITIZE pending_action from the current request body
        pending_action = requestData?.pending_action ?? null;
        
        // If NOT provided in request, THEN check the database as a fallback
        if (!pending_action && supabaseClient && userId) { 
            pending_action = await getPendingAction(userId, supabaseClient);
            if (pending_action) {
                console.log('[AI HANDLER DEBUG] Restored pending_action from DB:', JSON.stringify(pending_action)); // DEBUG LOG
            } else {
                console.log('[AI HANDLER DEBUG] No pending_action in request or DB.'); // DEBUG LOG
            }
        } else if (pending_action) {
            console.log('[AI HANDLER DEBUG] pending_action received in request body:', JSON.stringify(pending_action)); // DEBUG LOG
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
    
    // --- OpenAI Initialization ---
    let openai: OpenAI;
    try {
      // @ts-ignore: Deno Deploy compatibility
      const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
      if (!openaiApiKey) {
          console.error("Critical Error: OPENAI_API_KEY missing");
          throw new Error('AI service configuration error.');
      }
      openai = new OpenAI({ apiKey: openaiApiKey });
    } catch (error) {
        console.error('Error initializing OpenAI client:', error);
        return new Response( JSON.stringify({ status: 'error', message: error.message || 'AI service configuration error.', response_type: 'error_config' }), { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } } );
    }

    // --- 2. Handle Pre-OpenAI Actions (Confirmations, Direct Actions) ---
    // Make sure supabaseClient is non-null before passing to execution functions
    if (!supabaseClient) { 
        return new Response( JSON.stringify({ status: 'error', message: 'Database client not initialized.', response_type: 'error_server' }), { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } } );
    }
    
    // --- NEW: Handle response providing serving info ---
    if (pending_action?.type === 'awaiting_serving_info' && pending_action.analysis && message) {
        console.log("[AI HANDLER DEBUG] Entered handler block for pending action: awaiting_serving_info");
        // --- FIX: Ensure we work with the full original analysis data ---
        const originalAnalysisData = pending_action.analysis as Record<string, any>; 
        let totalServings: number | null = null;
        let servingSizeDescription: string | null = null; // Optional future use

        // Attempt to parse servings from user message
        const servingMatch = message.match(/\b(\d+(\.\d+)?)\b/); // Simple number parsing
        if (servingMatch && servingMatch[1]) {
            totalServings = parseFloat(servingMatch[1]);
            console.log(`[AI HANDLER DEBUG] Parsed totalServings: ${totalServings}`);
        } else if (message.toLowerCase().includes('skip') || message.toLowerCase().includes('unsure') || message.toLowerCase().includes('i don\'t know')) {
            totalServings = null; // User skipped
            console.log(`[AI HANDLER DEBUG] User skipped providing totalServings.`);
        } else {
             // Could not parse, maybe ask again or default?
             // For now, let's proceed as if skipped and clear the pending action.
             console.warn(`[AI HANDLER DEBUG] Could not parse serving number from message: "${message}". Proceeding without serving info.`);
             totalServings = null;
        }

        // --- FIX: Create the *updated* analysis data object ---
        // Start with the original data, then add/overwrite serving info
        const updatedAnalysisData = {
            ...originalAnalysisData, // Preserve all original fields (name, desc, nutrients)
            recipe_name: originalAnalysisData.recipe_name, 
            total_servings: totalServings,
            serving_size_description: servingSizeDescription
        };
        // -----------------------------------------------------------

        // Now, set up the *next* pending action using the updated data
        // --- FIX: Revert to simpler assignment now that analysis tool guarantees name/desc ---
        const nextPendingAction = {
            type: 'confirm_save_log_analyzed_recipe', 
            analysis: updatedAnalysisData // Pass the complete object which now includes name/desc/servings
        };
        // -------------------------------------------------------------------------------------
        await setPendingAction(userId, nextPendingAction, supabaseClient);
        console.log("[AI HANDLER DEBUG] Set pending_action to confirm_save_log_analyzed_recipe with updated analysis.");

        // Ask the final confirmation question (use recipe name from updated data)
        const recipeNameForPrompt = updatedAnalysisData.recipe_name || 'the recipe';
        const servingText = totalServings ? `(${totalServings} servings)` : '(servings unspecified)';
        responseData = {
            status: 'clarification',
            message: `Got it. Save recipe '${recipeNameForPrompt}' ${servingText}? You can then choose to log 1 serving now. (Options: Yes, Save Only, Cancel)`,
            response_type: 'recipe_save_log_final_confirmation'
        };
        requestHandled = true;
        console.log('[AI HANDLER DEBUG] Exiting awaiting_serving_info handler block. Prompting final confirmation.');
    }
    // --- NEW: Handle the FINAL confirmation for saving/logging analyzed recipe ---
    else if (pending_action?.type === 'confirm_save_log_analyzed_recipe' && pending_action.analysis && message) {
        console.log("[AI HANDLER DEBUG] Entered handler block for pending action: confirm_save_log_analyzed_recipe");
        const normalizedMessage = message.toLowerCase();
        const analysisData = pending_action.analysis as Record<string, any>; // Includes serving info
        const recipeName = analysisData.recipe_name || 'your recipe';

        // --- FIX: Check for "Save Only" BEFORE checking for "Yes/Save" ---
        if (/(save only|just save|don't log)/i.test(normalizedMessage)) {
            console.log("[AI HANDLER DEBUG] User confirmed Save Only.");
            // Call saveAndLogRecipe with logAfterSave = false
            responseData = await toolExec.saveAndLogRecipe(analysisData, userId, supabaseClient, false);
            responseData.response_type = responseData.status === 'success' ? 'recipe_saved_only' : responseData.response_type || 'error_database';
        } 
        // Now check for the broader confirmation
        else if (/(yes|confirm save|save and log|save log|log it|save)/i.test(normalizedMessage)) {
            console.log("[AI HANDLER DEBUG] User confirmed final Save and Log.");
            // Call saveAndLogRecipe with logAfterSave = true
            responseData = await toolExec.saveAndLogRecipe(analysisData, userId, supabaseClient, true);
            responseData.response_type = responseData.status === 'success' ? 'recipe_saved_logged' : responseData.response_type || 'error_database';
        } else { // Assume cancellation
            console.log("[AI HANDLER DEBUG] User cancelled final save/log confirmation based on message:", message);
            responseData = {
                status: 'clarification',
                message: `Okay, the recipe '${recipeName}' was not saved or logged. What else?`,
                response_type: 'action_cancelled'
            };
        }
        await clearPendingAction(userId, supabaseClient);
        requestHandled = true;
        console.log('[AI HANDLER DEBUG] Exiting confirm_save_log_analyzed_recipe handler block.');
    }
    // --- NEW: Handle response providing consumed portion for logging --- 
    else if (pending_action?.type === 'awaiting_log_portion_amount' && pending_action.recipe_id && pending_action.recipe_name && message) {
        console.log("[AI HANDLER DEBUG] Entered handler block for pending action: awaiting_log_portion_amount");
        const recipeId = pending_action.recipe_id as string;
        const recipeName = pending_action.recipe_name as string;
        let consumedServings: number = 1; // Default to 1 if parsing fails

        // Attempt to parse consumed servings (e.g., "1", "0.5", "half")
        const servingMatch = message.match(/\b(\d+(\.\d+)?)\b/); 
        const lowerMessage = message.toLowerCase();
        if (servingMatch && servingMatch[1]) {
            consumedServings = parseFloat(servingMatch[1]);
        } else if (lowerMessage.includes('half') || lowerMessage.includes('1/2')) {
            consumedServings = 0.5;
        } else if (lowerMessage.includes('quarter') || lowerMessage.includes('1/4')) {
            consumedServings = 0.25;
        } else if (lowerMessage.includes('whole') || lowerMessage.includes('all')) {
            // We might not know the total servings here, but user implies all.
            // Let executeLogExistingSavedRecipe handle fetching totalServings and potentially logging 1 if total is unknown.
            // Or, perhaps fetch totalServings here? For now, default to 1 if unsure.
             console.warn(`[AI HANDLER DEBUG] Ambiguous portion '${message}', defaulting to 1 serving.`);
             consumedServings = 1; 
        } else {
             console.warn(`[AI HANDLER DEBUG] Could not parse consumed servings from message: "${message}". Defaulting to 1 serving.`);
             consumedServings = 1;
        }
        console.log(`[AI HANDLER DEBUG] Parsed consumedServings: ${consumedServings}`);

        // Execute the logging with the parsed amount
        console.log(`[AI HANDLER DEBUG] Calling toolExec.executeLogExistingSavedRecipe with ID: ${recipeId}, Name: ${recipeName}, Consumed: ${consumedServings}`);
        responseData = await toolExec.executeLogExistingSavedRecipe(
          recipeId,
          recipeName,
          userId,
          supabaseClient,
          consumedServings // Pass the parsed amount
        );
        responseData.response_type = responseData.status === 'success' ? 'saved_recipe_logged' : responseData.response_type || 'error_logging_recipe';
        
        await clearPendingAction(userId, supabaseClient);
        requestHandled = true;
        console.log('[AI HANDLER DEBUG] Exiting awaiting_log_portion_amount handler block.');

    }
    // --- MODIFIED: Handle initial confirmation/request to log existing saved recipe ---
    else if (pending_action?.type === 'confirm_log_saved_recipe' && message) {
      console.log("[AI HANDLER DEBUG] Entered handler block for pending action: confirm_log_saved_recipe");
      const normalizedMessage = message.toLowerCase();
      const isConfirmed = /\b(yes|confirm|log it|sounds good|do it|ok|okay)\b/i.test(normalizedMessage);
      const recipeId = pending_action.recipe_id as string;
      const recipeName = pending_action.recipe_name as string;

      if (isConfirmed && recipeId && recipeName) {
          // Before executing, check if we need to ask for portion size
          console.log(`[AI HANDLER DEBUG] User confirmed log for recipe ID: ${recipeId}. Checking if portion prompt is needed.`);
          let needsPortionPrompt = false;
          let fetchedTotalServings: number | null = null;
          
          try {
              const { data: recipeDetails, error: fetchError } = await supabaseClient
                  .from('user_recipes')
                  .select('total_servings')
                  .eq('id', recipeId)
                  .eq('user_id', userId)
                  .maybeSingle(); // Use maybeSingle to handle potential null
              
              if (fetchError) {
                  console.warn(`[AI HANDLER DEBUG] Error fetching total_servings for recipe ${recipeId}: ${fetchError.message}. Proceeding with default log.`);
              } else if (recipeDetails && recipeDetails.total_servings && typeof recipeDetails.total_servings === 'number' && recipeDetails.total_servings > 0) {
                  // Only prompt if total_servings is known and potentially > 1 (or just exists)
                  needsPortionPrompt = true;
                  fetchedTotalServings = recipeDetails.total_servings;
                  console.log(`[AI HANDLER DEBUG] Recipe has total_servings: ${fetchedTotalServings}. Portion prompt needed.`);
              } else {
                  console.log(`[AI HANDLER DEBUG] Recipe ${recipeId} has no total_servings or it's invalid. Portion prompt NOT needed.`);
              }
          } catch (e) {
              console.error('[AI HANDLER DEBUG] Exception fetching total_servings:', e);
          }

          if (needsPortionPrompt) {
              // Set pending action to await portion amount
              const nextPendingAction = {
                  type: 'awaiting_log_portion_amount',
                  recipe_id: recipeId,
                  recipe_name: recipeName
              };
              await setPendingAction(userId, nextPendingAction, supabaseClient);
              console.log("[AI HANDLER DEBUG] Set pending_action to awaiting_log_portion_amount.");
              
              // Ask the user for the portion amount
              responseData = {
                  status: 'clarification',
                  message: `Okay, logging '${recipeName}'. How much did you have? (e.g., '1 serving', '0.5', 'half')`,
                  response_type: 'request_log_portion_amount' // New response type for frontend context
              };
              requestHandled = true;
               console.log('[AI HANDLER DEBUG] Prompting user for consumed portion.');
          } else {
              // No need to prompt, log 1 serving (or the whole thing)
              console.log(`[AI HANDLER DEBUG] No portion prompt needed. Calling toolExec.executeLogExistingSavedRecipe directly with default 1 serving.`);
              responseData = await toolExec.executeLogExistingSavedRecipe(
                recipeId,
                recipeName,
                userId,
                supabaseClient,
                1 // Log 1 serving by default if total_servings unknown
              );
              responseData.response_type = responseData.status === 'success' ? 'saved_recipe_logged' : responseData.response_type || 'error_logging_recipe';
              await clearPendingAction(userId, supabaseClient);
              requestHandled = true;
          }
      } else { // User did not confirm the initial log request
        console.log(`[AI HANDLER DEBUG] User response did not confirm initial logging request for recipe '${recipeName}'. Cancelling.`);
        responseData = {
          status: 'clarification',
          message: `Okay, I won't log '${recipeName}' right now. What else can I help with?`,
          response_type: 'action_cancelled'
        };
         await clearPendingAction(userId, supabaseClient);
         requestHandled = true;
      }
      // Note: clearPendingAction is handled within the if/else branches now
      console.log('[AI HANDLER DEBUG] Exiting confirm_log_saved_recipe handler block (New Logic).');
    }
    // ... (Add more pre-OpenAI action handlers as needed) ...

    // --- 3. Fetch Conversation History ---
    let history: any[] = [];
    if (!requestHandled) {
      console.log('[AI HANDLER DEBUG] requestHandled is FALSE. Proceeding to fetch history and call AI.'); // DEBUG LOG
      // Pass chatId extracted earlier
      const chatIdForHistory = chatId;
      if (chatIdForHistory) {
           history = await fetchConversationHistory(userId, chatIdForHistory, supabaseClient, MAX_HISTORY_MESSAGES);
      } else {
           console.warn('[AI HANDLER] Cannot fetch history: chat_id is missing from request data.');
      }
    }

    // --- 4. Compose OpenAI Messages ---
    if (!requestHandled) {
      const messages = [
        { role: 'system', content: AI_PERSONA },
        ...history,
        { role: 'system', content: "Focus ONLY on the following user request. Do NOT refer back to or repeat any information from the immediately preceding turn unless directly asked." },
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
        console.log(`[AI HANDLER] Received ${aiMessage.tool_calls.length} tool call(s).`);
        // Prepare to collect tool results
        const toolResults = [];
        // Store the actual payload of the *first* successful tool call for final response metadata
        let primaryToolResultPayload: any = null; 

        // Add the assistant's message with tool calls to the history
        messages.push(aiMessage);

        // Execute all tool calls in parallel (or sequentially if dependencies exist)
        // Using Promise.all for parallel execution
        const toolExecutionPromises = aiMessage.tool_calls.map(async (toolCall) => {
            const toolName = toolCall.function?.name;
            const toolCallId = toolCall.id;
            let toolArgs: any = {};
            console.log(`[AI HANDLER] Executing tool: ${toolName} (ID: ${toolCallId})`);

            try {
                toolArgs = JSON.parse(toolCall.function?.arguments || '{}');
            } catch (err) {
                console.error(`[AI HANDLER] Error parsing args for ${toolName} (ID: ${toolCallId}):`, err);
                return { 
                    tool_call_id: toolCallId,
                    role: "tool",
                    name: toolName,
                    content: JSON.stringify({ status: 'error', message: 'Could not parse arguments.' })
                };
            }

            let toolResultPayload: any;
            try {
                switch (toolName) {
                    case 'logGenericFoodItem':
                        toolResultPayload = await toolExec.executeLogGenericFoodItem(toolArgs.food_description, userId, supabaseClient, openai);
                        break;
                    case 'logExistingSavedRecipe':
                        toolResultPayload = await toolExec.executeLogExistingSavedRecipe(toolArgs.recipe_id, toolArgs.recipe_name, userId, supabaseClient);
                        break;
                    case 'analyzeRecipeIngredients':
                        toolResultPayload = await toolExec.executeAnalyzeRecipeIngredients(toolArgs.recipe_name, toolArgs.ingredients_list, userId, supabaseClient, openai);
                        break;
                    case 'answerGeneralQuestion':
                        toolResultPayload = await toolExec.executeAnswerGeneralQuestion(toolArgs.question, userId, supabaseClient, openai);
                        break;
                    case 'listLoggedFoods':
                        toolResultPayload = await toolExec.executeListLoggedFoods(toolArgs.date, userId, supabaseClient);
                        break;
                    case 'undoLastAction':
                        toolResultPayload = await toolExec.executeUndoLastAction(userId, supabaseClient);
                        break;
                    case 'updateUserGoal':
                        toolResultPayload = await toolExec.executeUpdateUserGoal(toolArgs.nutrient, toolArgs.target_value, toolArgs.unit, userId, supabaseClient);
                        break;
                    case 'saveLoggedFoodAsRecipe':
                        toolResultPayload = await toolExec.executeSaveLoggedFoodAsRecipe(toolArgs.food_name, toolArgs.nutrition_data, userId, supabaseClient);
                        break;
                    case 'deleteLoggedFood':
                        toolResultPayload = await toolExec.executeDeleteLoggedFood(toolArgs.log_id, toolArgs.food_name, userId, supabaseClient);
                        break;
                    case 'findSavedRecipeByName':
                        toolResultPayload = await toolExec.executeFindSavedRecipeByName(toolArgs.query, userId, supabaseClient);
                         // Special handling for immediate logging removed here - should be handled by the LLM in the next turn based on the result
                        break;
                    case 'clarifyDishType':
                         toolResultPayload = { status: 'success', message: `Could you clarify what you meant by "${toolArgs.dish_name}"?`, response_type: 'clarification_needed', clarification_for: toolArgs.dish_name };
                         break;
                    default:
                         console.error(`[AI HANDLER] Unknown tool name: ${toolName}`);
                         toolResultPayload = { status: 'error', message: `Unknown tool: ${toolName}` };
                }
                console.log(`[AI HANDLER] Tool ${toolName} (ID: ${toolCallId}) executed. Status: ${toolResultPayload?.status}`);
                // Store the first successful tool payload
                if (toolResultPayload?.status === 'success' && !primaryToolResultPayload) {
                    primaryToolResultPayload = toolResultPayload;
                }
            } catch (err) {
                 console.error(`[AI HANDLER] Error executing tool ${toolName} (ID: ${toolCallId}):`, err);
                 toolResultPayload = { status: 'error', message: `Tool execution failed: ${err instanceof Error ? err.message : String(err)}` };
            }

            // Return the tool message object required by OpenAI API
            return {
                tool_call_id: toolCallId,
                role: "tool",
                name: toolName,
                content: JSON.stringify(toolResultPayload || { status: 'error', message: 'Tool returned no result.' }), // Ensure content is always a string
            };
        });

        // Wait for all tool executions to complete
        const toolResponseMessages = await Promise.all(toolExecutionPromises);
        
        // *** MODIFIED TOOL RESULT PROCESSING ***
        let specialHandlingComplete = false;

        // Check for specific tool results BEFORE calling OpenAI again
        for (const toolResponseMessage of toolResponseMessages) {
            const toolName = toolResponseMessage.name;
            let resultPayload: any;
            try {
                resultPayload = JSON.parse(toolResponseMessage.content);
            } catch (e) { continue; }

            // ---- Handle executeAnalyzeRecipeIngredients ----
            if (toolName === 'analyzeRecipeIngredients' && resultPayload?.status === 'success' && resultPayload?.analysis) {
                console.log("[AI HANDLER DEBUG] Intercepting successful analyzeRecipeIngredients result BEFORE final AI call.");
                // --- FIX: Name is needed for the prompt, but the *actual* data is in the pending action set by the tool ---
                const recipeNameForPrompt = resultPayload.analysis?.recipe_name || 'the recipe'; // Get name from filtered data just for prompt
                
                // --- FIX: Remove setPendingAction call here. Tool already set it correctly. ---
                // const pendingRecipeAction = { type: 'awaiting_serving_info', analysis: resultPayload.analysis }; 
                // await setPendingAction(userId, pendingRecipeAction, supabaseClient);
                // console.log('[AI HANDLER DEBUG] Set pending_action for awaiting_serving_info:', JSON.stringify(pendingRecipeAction));
                // --------------------------------------------------------------------------
                
                // Construct the clarification response directly
                responseData = {
                    status: 'clarification', 
                    message: `Okay, I've analyzed '${recipeNameForPrompt}'. Roughly how many servings does this recipe make? You can say 'skip' if unsure.`,
                    response_type: 'awaiting_serving_info',
                    analysis_result: resultPayload.analysis // Send filtered data back for display
                };
                requestHandled = true; // Mark as handled
                specialHandlingComplete = true; // Signal that we are done and should return
                console.log('[AI HANDLER DEBUG] Returning clarification request for servings.');
                primaryToolResultPayload = resultPayload; // Store payload if needed
                break; // Exit the loop, we found our special case
            }
            // ---- Handle executeFindSavedRecipeByName (Single Match) ----
            else if (toolName === 'findSavedRecipeByName' && resultPayload?.status === 'success' && resultPayload?.count === 1 && resultPayload?.matches?.[0]) {
                 console.log("[AI HANDLER DEBUG] Intercepting successful findSavedRecipeByName (single match) result BEFORE final AI call.");
                 const recipe = resultPayload.matches[0];
                 // Set pending action
                 const pendingSavedRecipeAction = { type: 'confirm_log_saved_recipe', recipe_id: recipe.id, recipe_name: recipe.recipe_name };
                 await setPendingAction(userId, pendingSavedRecipeAction, supabaseClient);
                 console.log('[AI HANDLER DEBUG] Set pending_action for confirm_log_saved_recipe:', JSON.stringify(pendingSavedRecipeAction));

                 // Construct the clarification response directly
                 responseData = {
                    status: 'clarification',
                    message: `I found your saved recipe '${recipe.recipe_name}'. Log it now?`,
                    response_type: 'confirm_log_saved_recipe' 
                 };
                 requestHandled = true;
                 specialHandlingComplete = true;
                 console.log('[AI HANDLER DEBUG] Returning clarification request for logging found recipe.');
                 primaryToolResultPayload = resultPayload; // Store payload if needed
                 break; // Exit loop
            }
            // Add other special handling cases here if needed
        }

        // If no special handling intercepted the flow, proceed to call OpenAI again
        if (!specialHandlingComplete) {
            messages.push(...toolResponseMessages); // Add tool results for the final AI call
            console.log(`[AI HANDLER] Added ${toolResponseMessages.length} tool response messages. Calling OpenAI again for final response...`);
            
            const finalCompletion = await openai.chat.completions.create({
                model: 'gpt-4o',
                messages: messages, // Send the complete history including tool calls and responses
                temperature: 0.7
            });
            const finalAssistantMessage = finalCompletion.choices[0].message;

            if (finalAssistantMessage.tool_calls) {
               // ... handle nested tool calls error ...
            } else {
                // Check the status of the primary tool result payload FOUND EARLIER
                if (primaryToolResultPayload && primaryToolResultPayload.status === 'error') {
                     console.warn(`[AI HANDLER] Primary tool execution failed. Status: ${primaryToolResultPayload.status}, Message: ${primaryToolResultPayload.message}`);
                     responseData = {
                         status: 'error',
                         message: primaryToolResultPayload.message || 'An error occurred while processing your request.',
                         response_type: primaryToolResultPayload.response_type || 'error_tool_execution' 
                     };
                } else {
                     // Use final AI message; status/type from primary tool result if available
                     responseData = {
                         status: primaryToolResultPayload?.status || 'success', // Use optional chaining
                         message: finalAssistantMessage.content || 'Action completed.',
                         response_type: primaryToolResultPayload?.response_type || 'ai_response' // Use optional chaining
                     };
                }
            }
            requestHandled = true;
        }
        // *** END MODIFIED PROCESSING ***

      } else {
        // --- Handle direct AI response (no tool call) ---
        responseData = {
          status: 'success',
          message: aiMessage.content || '',
          response_type: 'ai_response',
          ai_message: aiMessage
        };
        requestHandled = true; // Also mark as handled if OpenAI replied directly
      }
    } // End of if (!requestHandled) before OpenAI call

    // --- 6. Store Conversation --- 
    if (userId && supabaseClient && responseData.message) {
      try {
        // Store user message
        if (userMessageForStorage) {
           await supabaseClient.from('chat_messages').insert({ 
              chat_id: chatId || 'unknown',
              user_id: userId, 
              sender: 'user', 
              message: userMessageForStorage 
           });
        }
        // Store AI response
        await supabaseClient.from('chat_messages').insert({ 
            chat_id: chatId || 'unknown',
            user_id: userId, 
            sender: 'ai', 
            message: responseData.message, 
            response_metadata: { response_type: responseData.response_type } // Store response type
        });
      } catch (dbError) {
          console.error("Error storing conversation message:", dbError);
          // Don't fail the whole request, just log the error
      }
    }

    // --- 7. Return Response ---
    return new Response(JSON.stringify(responseData), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error("Unhandled error in AI handler:", error);
    // Ensure a default error response is sent
    const errorMessage = error instanceof Error ? error.message : 'An unexpected server error occurred.';
    const errorResponse = {
       status: 'error',
       message: `Unexpected error: ${errorMessage}`,
       response_type: 'error_server_unexpected'
    };
    return new Response(JSON.stringify(errorResponse), { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  }
// @ts-ignore: Deno Deploy compatibility
});