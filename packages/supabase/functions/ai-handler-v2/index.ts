// Main request handler for AI function
// Import from tools/definitions, tools/execution, utils/pendingAction, utils/history
import { availableTools } from './tools/definitions.ts';
import * as toolExec from './tools/execution.ts';
import { setPendingAction, getPendingAction, clearPendingAction } from './utils/pendingAction.ts';
import { fetchConversationHistory } from './utils/history.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { OpenAI } from 'openai';
import type { User } from '@supabase/supabase-js'; // Add type import

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
    
    if (pending_action?.type === 'log_analyzed_recipe' && pending_action.analysis && message) {
        console.log("[AI HANDLER DEBUG] Entered handler block for pending action: log_analyzed_recipe"); // DEBUG LOG
        const normalizedMessage = message.toLowerCase();
        const analysisData = pending_action.analysis as Record<string, any>; // Get analysis data from pending action, assert type

        if (/(save and log|save it|yes save|confirm save)/i.test(normalizedMessage)) {
            console.log("[AI HANDLER DEBUG] Calling toolExec.saveAndLogRecipe with data:", JSON.stringify(analysisData)); // DEBUG LOG
            responseData = await toolExec.saveAndLogRecipe(analysisData, userId, supabaseClient);
            responseData.response_type = responseData.status === 'success' ? 'recipe_saved_logged' : responseData.response_type || 'error_database';
            console.log('[AI HANDLER DEBUG] saveAndLogRecipe responseData:', JSON.stringify(responseData)); // DEBUG LOG
        } else if (/(just log|log only|don't save|only log|yes log)/i.test(normalizedMessage)) {
            console.log("[AI HANDLER DEBUG] Calling toolExec.logOnlyAnalyzedRecipe with data:", JSON.stringify(analysisData)); // DEBUG LOG
            responseData = await toolExec.logOnlyAnalyzedRecipe(analysisData, userId, supabaseClient);
            responseData.response_type = responseData.status === 'success' ? 'recipe_logged_only' : responseData.response_type || 'error_database';
            console.log('[AI HANDLER DEBUG] logOnlyAnalyzedRecipe responseData:', JSON.stringify(responseData)); // DEBUG LOG
        } else {
            console.log("[AI HANDLER DEBUG] User response did not confirm save/log for analyzed recipe. Cancelling action."); // DEBUG LOG
            responseData = {
                status: 'clarification',
                message: `Okay, I won't log or save the analyzed recipe for '${analysisData.recipe_name || 'your recipe'}'. What else?`,
                response_type: 'action_cancelled'
            };
        }
        await clearPendingAction(userId, supabaseClient);
        requestHandled = true;
        console.log('[AI HANDLER DEBUG] Exiting log_analyzed_recipe handler block. requestHandled=true.'); // DEBUG LOG
    }
    // --- Handle saved recipe confirmation with improved logic ---
    else if (pending_action?.type === 'confirm_log_saved_recipe' && message) {
      console.log("[AI HANDLER DEBUG] Entered handler block for pending action: confirm_log_saved_recipe"); // DEBUG LOG
      const normalizedMessage = message.toLowerCase();
      const isConfirmed = /\b(yes|confirm|log it|sounds good|do it|ok|okay)\b/i.test(normalizedMessage);

      if (isConfirmed && pending_action.recipe_id && pending_action.recipe_name) {
        console.log(`[AI HANDLER DEBUG] Calling toolExec.executeLogExistingSavedRecipe with ID: ${pending_action.recipe_id}, Name: ${pending_action.recipe_name}`); // DEBUG LOG
        responseData = await toolExec.executeLogExistingSavedRecipe(
          pending_action.recipe_id as string,
          pending_action.recipe_name as string,
          userId,
          supabaseClient
        );
        responseData.response_type = responseData.status === 'success' ? 'saved_recipe_logged' : responseData.response_type || 'error_logging_recipe';
        console.log('[AI HANDLER DEBUG] executeLogExistingSavedRecipe responseData:', JSON.stringify(responseData)); // DEBUG LOG
      } else {
        console.log(`[AI HANDLER DEBUG] User response did not confirm logging recipe '${pending_action.recipe_name}'. Cancelling.`); // DEBUG LOG
        responseData = {
          status: 'clarification', // Or 'success' depending on desired flow
          message: `Okay, I won't log '${pending_action.recipe_name}' right now. What else can I help with?`,
          response_type: 'action_cancelled'
        };
      }
      await clearPendingAction(userId, supabaseClient);
      requestHandled = true;
      console.log('[AI HANDLER DEBUG] Exiting confirm_log_saved_recipe handler block. requestHandled=true.'); // DEBUG LOG
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
        
        // *** ADD PENDING ACTION LOGIC HERE ***
        // Process results to potentially set pending actions *before* final AI call
        for (const toolResponseMessage of toolResponseMessages) {
            const toolName = toolResponseMessage.name;
            let resultPayload: any;
            try {
                resultPayload = JSON.parse(toolResponseMessage.content);
            } catch (e) {
                console.error(`[AI HANDLER] Failed to parse tool result content for ${toolName}:`, e);
                continue; // Skip if content isn't valid JSON
            }

            // Set pending action for single saved recipe found
            if (toolName === 'findSavedRecipeByName' && resultPayload?.status === 'success' && resultPayload?.count === 1 && resultPayload?.matches?.[0]) {
                const recipe = resultPayload.matches[0];
                const pendingSavedRecipeAction = { type: 'confirm_log_saved_recipe', recipe_id: recipe.id, recipe_name: recipe.recipe_name };
                await setPendingAction(userId, pendingSavedRecipeAction, supabaseClient);
                console.log('[AI HANDLER DEBUG] Set pending_action for confirm_log_saved_recipe:', JSON.stringify(pendingSavedRecipeAction));
                // Add the pending action to the response data? Maybe not needed if handled by next request.
            } 
            // Set pending action for successful recipe analysis 
            // (Redundant if also set within executeAnalyzeRecipeIngredients, but safe to have here as fallback/primary)
            else if (toolName === 'analyzeRecipeIngredients' && resultPayload?.status === 'success' && resultPayload?.full_analysis) {
                const pendingAnalyzedAction = { type: 'log_analyzed_recipe', analysis: resultPayload.full_analysis }; // Use full_analysis if available
                await setPendingAction(userId, pendingAnalyzedAction, supabaseClient);
                console.log('[AI HANDLER DEBUG] Set pending_action for log_analyzed_recipe:', JSON.stringify(pendingAnalyzedAction));
            }
            // Add more checks for other tools that might require pending actions
        }
        // *** END PENDING ACTION LOGIC ***

        // Add all tool response messages to the history
        messages.push(...toolResponseMessages);
        console.log(`[AI HANDLER] Added ${toolResponseMessages.length} tool response messages to history.`);

        // --- Generate Final Conversational Response ---
        console.log("[AI HANDLER] Calling OpenAI again for final conversational response...");
        const finalCompletion = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: messages, // Send the complete history including tool calls and responses
            temperature: 0.7
        });
        const finalAssistantMessage = finalCompletion.choices[0].message;

        // Check for nested tool calls (should be avoided by design, but handle gracefully)
        if (finalAssistantMessage.tool_calls) {
            console.warn("[AI HANDLER] Assistant responded with nested tool calls. Returning error to user.");
            responseData = {
                status: 'error',
                message: 'Sorry, I encountered an issue while processing your request. Please try again.',
                response_type: 'error_nested_tool_call',
            };
        } else {
             // Check the status of the primary tool result payload
             if (primaryToolResultPayload && primaryToolResultPayload.status === 'error') {
                  // If the tool failed, prioritize its error message and status
                  console.warn(`[AI HANDLER] Primary tool execution failed. Status: ${primaryToolResultPayload.status}, Message: ${primaryToolResultPayload.message}`);
                  responseData = {
                      status: 'error',
                      message: primaryToolResultPayload.message || 'An error occurred while processing your request.', // Use tool error message
                      response_type: primaryToolResultPayload.response_type || 'error_tool_execution' // Use tool error type
                  };
             } else {
                  // If tool succeeded or no tool was called that produced a primary result payload,
                  // use the final AI message and the tool's success status/type (or defaults)
                  responseData = {
                      status: primaryToolResultPayload?.status || 'success',
                      message: finalAssistantMessage.content || 'Action completed.',
                      response_type: primaryToolResultPayload?.response_type || 'ai_response', 
                      // tool_result: primaryToolResultPayload 
                  };
             }
        }
        requestHandled = true;

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
    } // End of if (!requestHandled)

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