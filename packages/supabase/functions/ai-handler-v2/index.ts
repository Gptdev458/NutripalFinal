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
- For 'logGenericFoodItem', provide a simple 'food_description' like '1 apple' or 'Whole Foods 365 Homestyle Waffle'. Do *not* embed nutritional details (calories, macros) or lengthy descriptions in the argument itself.
- If the user provides specific details (like brand, flavor, quantity) or full nutrition facts for a food item, trust that information and proceed with logging/analysis using the relevant tool. Avoid asking redundant questions like "is it a standard item?" if details are already provided.
- **No Medical Advice:** Never provide medical advice or diagnoses.
- When displaying nutritional info after logging or analysis, refer to the system message about tracked user goals (if provided) and ONLY list those specific nutrients unless the user explicitly asks for others.

End each successful interaction with a brief, positive follow-up like 'Anything else today?' or 'Keep up the great work!'`;

// Add new pending action type for recipe name confirmation
const pendingActionTypes = [
    'confirm_log_saved_recipe',
    'confirm_save_analyzed_recipe',
    'confirm_recipe_name', // Add this new type
    // ... other existing types
];

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
  let taskAfterClarification: string | null = null;

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

        // --- ADDED: Handle User Clarification Response ---
        if (pending_action?.type === 'awaiting_clarification' && message && supabaseClient) {
            console.log("[AI HANDLER] Handling user clarification response.");
            const userClarification = message;
            const originalRequest = pending_action.original_request as string;

            if (originalRequest) {
                // Store the original request for potential fallback execution
                taskAfterClarification = originalRequest;
                // Construct the composite message for the AI
                const compositeMessage = `User previously asked: "${originalRequest}". AI asked for clarification. User now clarifies: "${userClarification}". Now, please proceed with the original request using this clarification.`;
                console.log("[AI HANDLER] Composite message for AI:", compositeMessage);
                message = compositeMessage; // Overwrite the message variable for the upcoming AI call
                userMessageForStorage = userClarification; // Store only the user's actual clarification

                // Clear the pending action immediately
                console.log("[AI HANDLER] Clearing awaiting_clarification pending action.");
                await clearPendingAction(userId, supabaseClient);
                pending_action = null; // Clear local variable too
                
                // Ensure requestHandled is false so we proceed to call OpenAI
                requestHandled = false; 
            } else {
                console.warn("[AI HANDLER] awaiting_clarification pending action missing original_request.");
                // Clear the bad pending action anyway
                await clearPendingAction(userId, supabaseClient);
                pending_action = null;
            }
        }
        // --- ADDED: Handle User Clarification Response ---

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
    if (pending_action?.type === 'awaiting_serving_size' && pending_action.product && message) {
      console.log(`[AI HANDLER] Processing serving size response: "${message}"`);
      
      const product = pending_action.product;
      const originalQuery = pending_action.original_query || '';
      
      // Parse serving size from message
      let servings = 1; // Default to 1 serving
      const servingMatch = message.match(/\b(\d+(\.\d+)?)\b/);
      if (servingMatch && servingMatch[1]) {
        servings = parseFloat(servingMatch[1]);
        if (servings <= 0 || isNaN(servings)) servings = 1;
        console.log(`[AI HANDLER] Parsed serving size: ${servings}`);
      }
      
      // Get full nutrition data if needed
      try {
        // First check if full nutrition data is in the product already
        if (!product.nutrition_data) {
          // Try to fetch from cache
          const { data: cachedProduct } = await supabaseClient
            .from('food_products')
            .select('*')
            .eq('product_name', product.product_name)
            .single();
          
          if (cachedProduct?.nutrition_data) {
            product.nutrition_data = cachedProduct.nutrition_data;
          }
        }
        
        // Call logPremadeFood with the provided servings
        const logResult = await toolExec.executeLogPremadeFood(
          product.product_name,
          product.calories || 0,
          product.nutrition_data || { calories: product.calories },
          servings,
          userId,
          supabaseClient
        );
        
        // Clear the pending action
        await clearPendingAction(userId, supabaseClient);
        
        // Return the result
        responseData = {
          status: 'success',
          message: `I've logged ${servings} serving(s) of ${product.product_name} for you.`,
          logged_food_name: product.product_name,
          response_type: 'food_logged_with_servings'
        };
        
        requestHandled = true;
      } catch (error) {
        console.error("Error logging food with serving size:", error);
        
        responseData = {
          status: 'error',
          message: `Sorry, I couldn't log ${product.product_name}. ${error instanceof Error ? error.message : 'An error occurred'}`,
          response_type: 'error'
        };
        
        requestHandled = true;
      }
      
      // Clear pending action either way
      await clearPendingAction(userId, supabaseClient);
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
    // --- IMPROVED: Handle initial confirmation/request to log existing saved recipe ---
    else if (pending_action?.type === 'confirm_log_saved_recipe' && message) {
      console.log("[AI HANDLER DEBUG] Entered handler block for pending action: confirm_log_saved_recipe");
      console.log("[DEBUG_SERVINGS_CRITICAL] VERSION 2023-08-15-C: Enhanced serving size handling with explicit parameter passing");
      
      // Log the EXACT structure of pending_action for debugging
      console.log(`[DEBUG_SERVINGS_CRITICAL] PENDING ACTION FULL CONTENT: ${JSON.stringify(pending_action)}`);
      
      const normalizedMessage = message.toLowerCase();
      const recipeId = pending_action.recipe_id as string;
      const recipeName = pending_action.recipe_name as string;
      
      // CRITICAL FIX: Ensure we get the requested_servings directly from pending_action
      // 1. First check if it's already in the pending_action (should be from our fix)
      let servings = 1; // Default fallback
      
      if (pending_action.requested_servings !== undefined) {
        // Explicitly convert to number to avoid type issues
        servings = Number(pending_action.requested_servings);
        console.log(`[DEBUG_SERVINGS_CRITICAL] Found servings in pending_action: ${servings} (${typeof servings})`);
      } else {
        console.log(`[DEBUG_SERVINGS_CRITICAL] WARNING: No requested_servings in pending_action!`);
        
        // 2. Fall back to checking the confirmation message
        const servingMatch = normalizedMessage.match(/\b(\d+(?:\.\d+)?)\b/);
        if (servingMatch && servingMatch[1]) {
          servings = Number(servingMatch[1]);
          console.log(`[DEBUG_SERVINGS_CRITICAL] Extracted serving size from confirmation: ${servings} (${typeof servings})`);
        } else {
          console.log(`[DEBUG_SERVINGS_CRITICAL] No serving size in confirmation message, using default: ${servings}`);
        }
      }
      
      // Ensure servings is a valid number greater than 0
      servings = Math.max(1, Number(servings) || 1);
      console.log(`[DEBUG_SERVINGS_CRITICAL] FINAL servings to log: ${servings} (${typeof servings})`);
      
      // Check if it's a confirmation (yes/ok/confirm) or a specific number
      if (normalizedMessage.match(/^(?:y(?:es)?|ok(?:ay)?|sure|confirm|log|track|do it|yep|yeah|👍|correct|right|sounds good)$/i) || 
          normalizedMessage.match(/^(?:\d+(?:\.\d+)?)$/)) {
        
        try {
          // Clear pending action before executing to avoid race conditions or double logging
          await clearPendingAction(userId, supabaseClient);
          
          // CRITICAL FIX: Explicitly log the final parameters being passed
          console.log(`[DEBUG_SERVINGS_CRITICAL] Calling executeLogExistingSavedRecipe with: recipeId=${recipeId}, recipeName=${recipeName}, servings=${servings}`);
          
          // Log with explicit servings number - CRITICAL: Make sure servings is passed as the 5th parameter
          const result = await toolExec.executeLogExistingSavedRecipe(
            recipeId,
            recipeName,
            userId,
            supabaseClient,
            servings // CRITICAL: This must be passed correctly
          );
          
          if (result.status === 'success') {
            // Explicitly mention the number of servings in the response for user confirmation
            // Use the servings value returned by the function call for consistency
            const resultServings = result.servings || servings;
            const servingsText = resultServings === 1 ? '1 serving' : `${resultServings} servings`;
            const response = `Logged ${servingsText} of '${recipeName}' successfully.`;
            
            console.log(`[DEBUG_SERVINGS_CRITICAL] Final success response: ${response}`);
            
            responseData = {
              status: 'success',
              message: response,
              response_type: 'success',
              response,
              servings: resultServings // Include servings in the response data
            };
            
            return new Response(JSON.stringify(responseData), {
              headers: CORS_HEADERS
            });
          } else {
            responseData = {
              status: 'error',
              message: result.message || "Sorry, there was an error logging your recipe.",
              response_type: 'error'
            };
            
            return new Response(JSON.stringify(responseData), {
              headers: CORS_HEADERS
            });
          }
        } catch (error) {
          console.error("Error logging existing recipe:", error);
          responseData = {
            status: 'error',
            message: `Sorry, I wasn't able to log your recipe due to an error: ${error instanceof Error ? error.message : String(error)}`,
            response_type: 'error'
          };
          
          return new Response(JSON.stringify(responseData), {
            headers: CORS_HEADERS
          });
        }
      } else if (normalizedMessage.match(/^(?:n(?:o)?|nope|cancel|don't|stop|wrong)$/i)) {
        // Handle rejection to log
        await clearPendingAction(userId, supabaseClient);
        responseData = {
          status: 'info',
          message: "No problem, I won't log that recipe. Is there something else I can help you with?"
        };
        
        return new Response(JSON.stringify(responseData), {
          headers: CORS_HEADERS
        });
      } else {
        // Unclear response - ask for clarification
        responseData = {
          status: 'question',
          message: `I'm not sure if you want to log ${recipeName}. Please respond with "yes" to log it, or "no" to cancel.`
        };
        
        return new Response(JSON.stringify(responseData), {
          headers: CORS_HEADERS
        });
      }
    }
    // Add a new handler for recipe name confirmation
    else if (pending_action?.type === 'confirm_recipe_name') {
        console.log('[AI HANDLER DEBUG] Processing confirm_recipe_name');
        const suggestedName = pending_action.suggested_name;
        const ingredients = pending_action.ingredients;
        const nutritionData = pending_action.nutrition_data;
        
        // Check if user confirmed the name
        const isConfirmation = message?.toLowerCase().includes('yes') || 
                               message?.toLowerCase().includes('confirm') || 
                               message?.toLowerCase().includes('good') ||
                               message?.toLowerCase().includes('fine') ||
                               message?.toLowerCase().includes('okay') ||
                               message?.toLowerCase().includes('that works');
                               
        if (isConfirmation) {
            console.log(`[AI HANDLER DEBUG] User confirmed recipe name: ${suggestedName}`);
            
            // Proceed with the confirmed name
            responseData = {
                status: 'clarification',
                message: `Great! I'll use "${suggestedName}" as the recipe name. Would you like to save it now?`,
                response_type: 'recipe_name_confirmed',
                pending_action: {
                    type: 'confirm_save_analyzed_recipe',
                    recipe_name: suggestedName,
                    ingredients: ingredients,
                    nutrition_data: nutritionData
                }
            };
            requestHandled = true;
        } else if (message && message.length > 2) {
            // User provided an alternative name
            const userProvidedName = message.trim();
            console.log(`[AI HANDLER DEBUG] User provided alternative recipe name: ${userProvidedName}`);
            
            responseData = {
                status: 'clarification',
                message: `I'll use "${userProvidedName}" as the recipe name instead. Would you like to save it now?`,
                response_type: 'recipe_name_updated',
                pending_action: {
                    type: 'confirm_save_analyzed_recipe',
                    recipe_name: userProvidedName,
                    ingredients: ingredients,
                    nutrition_data: nutritionData
                }
            };
            requestHandled = true;
        } else {
            // User rejected but didn't provide alternative
            console.log('[AI HANDLER DEBUG] User rejected recipe name without alternative');
            
            responseData = {
                status: 'clarification',
                message: `What would you like to name this recipe instead?`,
                response_type: 'recipe_name_request',
                pending_action: {
                    type: 'confirm_recipe_name',
                    suggested_name: suggestedName, // Keep the original suggestion
                    ingredients: ingredients,
                    nutrition_data: nutritionData
                }
            };
            requestHandled = true;
        }
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
        console.log(`[AI HANDLER] Received ${aiMessage.tool_calls.length} tool call(s) in FINAL response.`);
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
                    case 'logPremadeFood':
                        toolResultPayload = await toolExec.executeLogPremadeFood(
                            toolArgs.food_name, 
                            toolArgs.calories, 
                            toolArgs.nutrition_data, 
                            toolArgs.servings, 
                            userId, 
                            supabaseClient
                        );
                        break;
                    case 'lookupPremadeFood':
                        toolResultPayload = await toolExec.executeLookupPremadeFood(
                            toolArgs.food_name, 
                            userId, 
                            supabaseClient
                        );
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
                    case 'findRecipesByNutrition':
                        toolResultPayload = await toolExec.executeFindRecipesByNutrition(
                            toolArgs.nutrient,
                            toolArgs.min_value,
                            toolArgs.max_value,
                            userId,
                            supabaseClient
                        );
                        break;
                    case 'createRecipeVariation':
                        toolResultPayload = await toolExec.executeCreateRecipeVariation(
                            toolArgs.base_recipe_id || null,
                            toolArgs.base_recipe_name || null,
                            toolArgs.modifications,
                            userId,
                            supabaseClient,
                            openai
                        );
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
            } catch (e) {
                console.warn(`[AI HANDLER] Could not parse JSON content for tool ${toolName}:`, toolResponseMessage.content);
                continue;
            }

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
            // Add debug logging to verify recipe search result payload
            if (toolName === 'findSavedRecipeByName') {
                console.log(`[DEBUG_SERVINGS_CRITICAL] Tool result payload for findSavedRecipeByName: ${JSON.stringify(resultPayload)}`);
            }
            // ---- Handle executeFindSavedRecipeByName (Single Match) ----
            else if (toolName === 'findSavedRecipeByName' && resultPayload?.status === 'success' && resultPayload?.count === 1 && resultPayload?.matches?.[0]) {
                 console.log("[AI HANDLER DEBUG] Intercepting successful findSavedRecipeByName (single match) result BEFORE final AI call.");
                 const recipe = resultPayload.matches[0];
                 
                 // CRITICAL FIX: Include requested_servings from resultPayload in the pending action
                 const requestedServings = resultPayload.requested_servings || 1;
                 console.log(`[DEBUG_SERVINGS_CRITICAL] Found requested_servings in resultPayload: ${requestedServings}`);
                 
                 // Set pending action with the requested_servings
                 const pendingSavedRecipeAction = { 
                     type: 'confirm_log_saved_recipe', 
                     recipe_id: recipe.id, 
                     recipe_name: recipe.recipe_name,
                     requested_servings: Number(requestedServings) // CRITICAL FIX: Copy servings from result payload
                 };
                 await setPendingAction(userId, pendingSavedRecipeAction, supabaseClient);
                 console.log('[AI HANDLER DEBUG] Set pending_action for confirm_log_saved_recipe:', JSON.stringify(pendingSavedRecipeAction));

                 // Format servings text for the message (singular vs plural)
                 const servingsText = requestedServings === 1 ? '1 serving' : `${requestedServings} servings`;
                 
                 // Construct the clarification response directly with servings info
                 responseData = {
                    status: 'clarification',
                    message: `I found your saved recipe '${recipe.recipe_name}'. Log ${servingsText} now?`,
                    response_type: 'confirm_log_saved_recipe',
                    requested_servings: Number(requestedServings) // Include in response for frontend context
                 };
                 requestHandled = true;
                 specialHandlingComplete = true;
                 console.log('[AI HANDLER DEBUG] Returning clarification request for logging found recipe.');
                 primaryToolResultPayload = resultPayload; // Store payload if needed
                 break; // Exit loop
            }
            // ---- Handle lookupPremadeFood (Multiple Matches Found) ----
            else if (toolName === 'lookupPremadeFood' && resultPayload?.status === 'clarification' && resultPayload?.response_type === 'multiple_products_found_clarification') {
                console.log("[AI HANDLER DEBUG] Intercepting lookupPremadeFood (multiple matches) result BEFORE final AI call.");
                // Construct the clarification response directly
                // Format options for better display
                const optionsText = (resultPayload.options || []).map((opt: any, index: number) => 
                    `${index + 1}. ${opt.product_name} (${opt.brand || 'Unknown Brand'}${opt.calories ? `, ${opt.calories} kcal` : ''}`
                ).join('\n');

                // Make sure each option includes all needed data
                const enhancedOptions = (resultPayload.options || []).map(opt => ({
                    ...opt,
                    product_name: opt.product_name || 'Unknown Product',
                    brand: opt.brand || 'Unknown Brand',
                    calories: opt.calories || 0
                }));

                responseData = {
                    status: 'clarification', 
                    message: `${resultPayload.message}\n${optionsText}\nOr provide more details?`,
                    response_type: 'multiple_products_found_clarification',
                    // Include options in context for potential frontend handling
                    context_for_reply: { 
                        original_query: resultPayload.original_query, // Make sure the tool adds this
                        options: enhancedOptions 
                    }
                };
                
                // No pending action needed here - we'll set it when the user responds with a selection
                requestHandled = true;
                specialHandlingComplete = true;
                console.log('[AI HANDLER DEBUG] Returning clarification request for multiple products found.');
                primaryToolResultPayload = resultPayload; // Store payload if needed
                break; // Exit loop
            }
            // Handle lookupPremadeFood (Single Match Found)
            else if (toolName === 'lookupPremadeFood' && resultPayload?.status === 'success' && resultPayload?.response_type === 'product_found') {
                console.log("[AI HANDLER DEBUG] Intercepting successful lookupPremadeFood result BEFORE final AI call.");
                
                // Create a simplified product object for the pending action
                const productInfo = {
                    product_name: resultPayload.product_name,
                    calories: resultPayload.nutrition_data?.calories || 0,
                    nutrition_data: resultPayload.nutrition_data,
                    brand: resultPayload.nutrition_data?.brand || null
                };
                
                // Set pending action to prompt for serving size
                const pendingAction = {
                    type: 'awaiting_serving_size',
                    product: productInfo,
                    original_query: resultPayload.original_query || resultPayload.product_name
                };
                
                await setPendingAction(userId, pendingAction, supabaseClient);
                
                // Prompt for serving size instead of immediately logging
                responseData = {
                    status: 'clarification',
                    message: `Found ${resultPayload.product_name}. How many servings did you have?`,
                    response_type: 'request_serving_size'
                };
                
                requestHandled = true;
                specialHandlingComplete = true;
                console.log('[AI HANDLER DEBUG] Prompting for serving size before logging product.');
                primaryToolResultPayload = resultPayload;
                break; // Exit loop
            }
            // Add other special handling cases here if needed
        }

        // If no special handling intercepted the flow, proceed to call OpenAI again
        if (!specialHandlingComplete) {
            
            // --- Fetch user's tracked nutrients --- START ---
            let trackedNutrients: string[] = [];
            let goalsSystemMessage: string | null = null;
            if (userId && supabaseClient) {
                try {
                    const { data: goalsData, error: goalsError } = await supabaseClient
                        .from('user_goals')
                        .select('nutrient') // Select only the nutrient key
                        .eq('user_id', userId);

                    if (goalsError) {
                        console.error('[AI HANDLER] Error fetching user goals:', goalsError.message);
                        // Don't block the flow, proceed without goal filtering if fetch fails
                    } else if (goalsData && goalsData.length > 0) {
                        trackedNutrients = goalsData.map(goal => goal.nutrient);
                        console.log('[AI HANDLER] Fetched tracked nutrients:', trackedNutrients);
                        // Format for the system message
                        goalsSystemMessage = `System: The user is currently tracking these nutrients: ${trackedNutrients.join(', ')}. When confirming a logged item or presenting nutritional analysis, ONLY list the values for these specific nutrients unless the user explicitly asks for others.`;
                    } else {
                        console.log('[AI HANDLER] No specific nutrient goals found for user.');
                        // No message needed if no goals
                    }
                } catch (e) {
                    console.error('[AI HANDLER] Exception fetching user goals:', e);
                }
            }
            // --- Fetch user's tracked nutrients --- END ---

            // Add tool results and potentially the goals message to the history for the final AI call
            messages.push(...toolResponseMessages); 
            if (goalsSystemMessage) {
                messages.push({ role: 'system', content: goalsSystemMessage });
            }
            
            console.log(`[AI HANDLER] Added ${toolResponseMessages.length} tool response messages ${goalsSystemMessage ? 'AND 1 goals system message' : ''}. Calling OpenAI again for final response...`);
            
            const finalCompletion = await openai.chat.completions.create({
                model: 'gpt-4o',
                messages: messages, // Send the complete history including tool calls and responses
                temperature: 0.7
            });
            const finalAssistantMessage = finalCompletion.choices[0].message;

            if (finalAssistantMessage.tool_calls) {
               // ... handle nested tool calls error ...
            } else {
                // --- ADDED: Fallback Tool Execution After Clarification --- START ---
                let manualToolExecuted = false;
                let manualToolResultPayload: any = null;
                const assistantMessageContent = finalAssistantMessage.content?.toLowerCase() || '';
                const indicatesSuccess = /\b(logged|added|saved|updated|completed)\b/.test(assistantMessageContent);
                
                if (taskAfterClarification && indicatesSuccess) { // Check if we expected an action after clarification AND AI indicates success
                    console.warn("[AI HANDLER] AI indicated success after clarification but provided no tool call. Attempting manual fallback execution.");
                    try {
                        // Attempt to execute the logGenericFoodItem tool manually
                        // We might need more robust logic here to determine *which* tool 
                        // should have been called based on `taskAfterClarification`, 
                        // but for now, assume it was logGenericFoodItem for the waffle case.
                        manualToolResultPayload = await toolExec.executeLogGenericFoodItem(taskAfterClarification, userId, supabaseClient, openai);
                        manualToolExecuted = true;
                        console.log("[AI HANDLER] Manual fallback execution result:", manualToolResultPayload?.status);
                    } catch (fallbackError) {
                        console.error("[AI HANDLER] Error during manual fallback execution:", fallbackError);
                        manualToolResultPayload = { status: 'error', message: 'Logging failed during fallback.', response_type: 'error_fallback_execution' };
                    }
                }
                // --- ADDED: Fallback Tool Execution After Clarification --- END ---

                // --- Handle direct AI response (no tool call) ---
                responseData = {
                    // Use status from manual execution if it happened, otherwise default
                    status: manualToolExecuted ? (manualToolResultPayload?.status || 'error') : 'success',
                    message: finalAssistantMessage.content || '', // Always use the AI's original text response
                    // Use response_type from manual execution if it failed, otherwise default
                    response_type: manualToolExecuted && manualToolResultPayload?.status !== 'success' ? (manualToolResultPayload?.response_type || 'error_fallback_execution') : 'ai_response',
                };
                
                // If manual execution happened and failed, ensure status is error
                if (manualToolExecuted && manualToolResultPayload?.status !== 'success') {
                    responseData.status = 'error';
                    // Optionally prepend error to message? For now, keep AI text.
                    // responseData.message = `[Fallback Error: ${manualToolResultPayload?.message}] ${responseData.message}`;
                }
                
                requestHandled = true;
            }
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
            sender: 'bot',
            message: responseData.message, 
            response_metadata: { response_type: responseData.response_type } // Store response type
        });
      } catch (dbError) {
          console.error("Error storing conversation message:", dbError);
          // Don't fail the whole request, just log the error
      }
    }

    // Check if this is a numeric response to a food disambiguation
    if (context?.response_type === 'multiple_products_found_clarification' && 
        context?.options && 
        Array.isArray(context.options) && 
        context.options.length > 0 && 
        context.original_query) {
      
      // Try to parse a numeric selection from the user message
      const selectionMatch = message?.match(/^[1-9]\d*$/);
      if (selectionMatch) {
        const selectionIndex = parseInt(selectionMatch[0], 10) - 1; // Convert to zero-based index
        
        if (selectionIndex >= 0 && selectionIndex < context.options.length) {
          console.log(`[AI HANDLER] User selected option ${selectionIndex + 1} from disambiguation`);
          
          // Get the selected product from the options
          const selectedProduct = context.options[selectionIndex];
          const originalQuery = context.original_query;
          
          // Cache the selection to avoid repeated disambiguation
          try {
            // Prepare the data for caching the selected product
            const cacheEntry = {
              product_name: selectedProduct.product_name,
              search_term: originalQuery,
              nutrition_data: {
                calories: selectedProduct.calories,
                // We don't have full nutrition data here, but will at least cache calories
              },
              source: 'user_selection',
              brand: selectedProduct.brand,
              confidence_score: 100 // High confidence since user explicitly selected it
            };
            
            // Insert into cache
            await supabaseClient
              .from('food_products')
              .insert(cacheEntry);
            
            console.log(`[AI HANDLER] Cached user selection mapping "${originalQuery}" → "${selectedProduct.product_name}"`);
          } catch (cacheError) {
            console.error(`[AI HANDLER] Error caching user selection:`, cacheError);
          }
          
          // Create a pending action to prompt for serving size
          const pendingAction = {
            type: 'awaiting_serving_size',
            product: selectedProduct,
            original_query: originalQuery
          };
          
          await setPendingAction(userId, pendingAction, supabaseClient);
          
          // Respond asking for serving size
          responseData = {
            status: 'clarification',
            message: `Got it. How many servings of ${selectedProduct.product_name} did you have?`,
            response_type: 'request_serving_size'
          };
          
          requestHandled = true;
          return new Response(JSON.stringify(responseData), {
            headers: CORS_HEADERS
          });
        }
      }
    }
    
    // Handle response to serving size prompt 
    if (pending_action?.type === 'awaiting_serving_size' && pending_action.product && message) {
      console.log(`[AI HANDLER] Processing serving size response: "${message}"`);
      
      const product = pending_action.product;
      const originalQuery = pending_action.original_query || '';
      
      // Parse serving size from message
      let servings = 1; // Default to 1 serving
      const servingMatch = message.match(/\b(\d+(\.\d+)?)\b/);
      if (servingMatch && servingMatch[1]) {
        servings = parseFloat(servingMatch[1]);
        if (servings <= 0 || isNaN(servings)) servings = 1;
        console.log(`[AI HANDLER] Parsed serving size: ${servings}`);
      }
      
      // Get full nutrition data if needed
      try {
        // First check if full nutrition data is in the product already
        if (!product.nutrition_data) {
          // Try to fetch from cache
          const { data: cachedProduct } = await supabaseClient
            .from('food_products')
            .select('*')
            .eq('product_name', product.product_name)
            .single();
          
          if (cachedProduct?.nutrition_data) {
            product.nutrition_data = cachedProduct.nutrition_data;
          }
        }
        
        // Call logPremadeFood with the provided servings
        const logResult = await toolExec.executeLogPremadeFood(
          product.product_name,
          product.calories || 0,
          product.nutrition_data || { calories: product.calories },
          servings,
          userId,
          supabaseClient
        );
        
        // Clear the pending action
        await clearPendingAction(userId, supabaseClient);
        
        // Return the result
        responseData = {
          status: 'success',
          message: `I've logged ${servings} serving(s) of ${product.product_name} for you.`,
          logged_food_name: product.product_name,
          response_type: 'food_logged_with_servings'
        };
        
        requestHandled = true;
      } catch (error) {
        console.error("Error logging food with serving size:", error);
        
        responseData = {
          status: 'error',
          message: `Sorry, I couldn't log ${product.product_name}. ${error instanceof Error ? error.message : 'An error occurred'}`,
          response_type: 'error'
        };
        
        requestHandled = true;
      }
      
      // Clear pending action either way
      await clearPendingAction(userId, supabaseClient);
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