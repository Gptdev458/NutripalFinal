/**
 * Orchestrator V3 - Hybrid Multi-Agent Architecture
 * 
 * Flow: User Message → IntentAgent → ReasoningAgent → ChatAgent → Response
 * 
 * Key differences from V2:
 * - IntentAgent still classifies intent (fast, cheap gpt-4o-mini)
 * - ReasoningAgent replaces PlannerAgent + IntentRouter
 * - ReasoningAgent uses tools that wrap specialized agents
 * - ChatAgent still handles final response formatting
 * - PCC pattern preserved via proposal tools
 */ import { IntentAgent } from './agents/intent-agent.ts';
import { ChatAgent } from './agents/chat-agent.ts';
import { ReasoningAgent } from './agents/reasoning-agent.ts';
import { RecipeAgent } from './agents/recipe-agent.ts';
import { createAdminClient } from '../_shared/supabase-client.ts';
import { DbService } from './services/db-service.ts';
import { PersistenceService } from './services/persistence-service.ts';
import { SessionService } from './services/session-service.ts';
import { ToolExecutor } from './services/tool-executor.ts';
class ThoughtLogger {
  steps = [];
  log(step) {
    console.log(`[ThoughtLogger] ${step}`);
    this.steps.push(step);
  }
  getSteps() {
    return this.steps;
  }
}
/**
 * Main Orchestrator V3 for the Chat Handler.
 * Uses hybrid multi-agent architecture:
 * - IntentAgent: Fast classification (gpt-4o-mini)
 * - ReasoningAgent: Tool orchestration and reasoning (gpt-4o)
 * - ChatAgent: Response formatting with personality (gpt-4o-mini)
 */ export async function orchestrateV3(userId, message, sessionId, chatHistory = [], timezone = 'UTC', onStep) {
  const supabase = createAdminClient();
  const db = new DbService(supabase);
  const persistence = new PersistenceService(supabase);
  const sessionService = new SessionService(supabase);
  // Load session state
  const session = await sessionService.getSession(userId, sessionId);
  const context = {
    userId,
    sessionId,
    supabase,
    timezone,
    session
  };
  const startTime = Date.now();
  const thoughts = new ThoughtLogger();
  const reportStep = (step) => {
    thoughts.log(step);
    if (onStep) onStep(step);
  };
  const agentsInvolved = [];
  let response = {
    status: 'success',
    message: '',
    response_type: 'unknown',
    steps: []
  };
  try {
    const lowerMessage = message.trim().toLowerCase();
    // =========================================================
    // STEP 0: Static Fast-Paths (Synchronous)
    // =========================================================
    // 0.1 Quick Thanks/Closing
    const thanksKeywords = [
      'thanks',
      'thank you',
      'thx',
      'cheers',
      'awesome',
      'great'
    ];
    if (thanksKeywords.includes(lowerMessage) && lowerMessage.length < 15) {
      console.log('[OrchestratorV3] Static fast-path: thanks');
      return {
        status: 'success',
        message: "You're very welcome! Let me know if there's anything else I can help with. 😊",
        response_type: 'chat_response',
        steps: [
          'Closing recognized'
        ]
      };
    }
    // 0.2 Quick Confirmation Buttons (from UI)
    // If message starts with "Confirm " or is exactly "Log it", "Save it", etc.
    const isButtonConfirm = lowerMessage.startsWith('confirm') || lowerMessage.startsWith('yes, ') || lowerMessage.startsWith('log ') || lowerMessage.startsWith('save ') || [
      'yes',
      'log it',
      'save it',
      'correct',
      'yep',
      'yeah',
      'yes, save',
      'yes, log',
      'confirm save',
      'looks good'
    ].includes(lowerMessage) || lowerMessage.includes('portion:') || lowerMessage.includes('name:');
    if (isButtonConfirm && session.pending_action) {
      console.log(`[OrchestratorV3] Static fast-path: button confirm (Action: ${session.pending_action.type})`);
      reportStep('Processing your confirmation...');
      // Extract choice and portion if present (e.g. "Confirm log portion:1.5 servings")
      const portionMatch = message.match(/portion:([\w\s.]+)/i);
      const choiceMatch = message.match(/Confirm\s+(\w+)/i);
      const nameMatch = message.match(/name:([\w\s.!@#$%^&*()-]+)/i);
      if (choiceMatch) {
        session.pending_action.data.choice = choiceMatch[1].toLowerCase();
      }
      if (portionMatch) {
        session.pending_action.data.portion = portionMatch[1].trim();
      }
      if (nameMatch) {
        session.pending_action.data.customName = nameMatch[1].trim();
        console.log(`[OrchestratorV3] Extracted custom name: "${session.pending_action.data.customName}"`);
      }
      const confirmResult = await handlePendingConfirmation(session.pending_action, userId, sessionService, db, context, message);
      confirmResult.steps = thoughts.getSteps();
      return confirmResult;
    }
    const isButtonCancel = [
      'cancel',
      'stop',
      'no, cancel',
      'decline',
      'no',
      'forget it'
    ].includes(lowerMessage) || lowerMessage.startsWith('cancel');
    if (isButtonCancel && session.pending_action) {
      console.log('[OrchestratorV3] Static fast-path: button cancel');
      await sessionService.clearPendingAction(userId);
      return {
        status: 'success',
        message: 'Action cancelled. ❌',
        response_type: 'action_cancelled',
        steps: [
          'Cancellation recognized'
        ]
      };
    }
    // =========================================================
    // STEP 1: Recipe Heuristic (Speed for long texts)
    // =========================================================
    const seemsLikeRecipe = message.length > 200 || message.includes('\n') && message.split('\n').length > 3 || message.toLowerCase().includes('recipe') && message.length > 50;
    if (seemsLikeRecipe) {
      const consumptionKeywords = [
        'ate',
        'had',
        'log',
        'consumption',
        'portion',
        'serving',
        'having'
      ];
      const hasConsumption = consumptionKeywords.some((k) => lowerMessage.includes(k));
      if (!hasConsumption) {
        console.log('[OrchestratorV3] Recipe heuristic triggered (Direct Route)');
        reportStep('Analyzing recipe...');
        const toolExecutor = new ToolExecutor({
          userId,
          supabase,
          timezone,
          sessionId
        });
        const parseResult = await toolExecutor.execute('parse_recipe_text', {
          recipe_text: message
        });
        if (parseResult.proposal_type === 'recipe_save' && parseResult.flowState) {
          await sessionService.savePendingAction(userId, {
            type: parseResult.proposal_type,
            data: parseResult
          });
          response.response_type = 'confirmation_recipe_save';
          const fs = parseResult.flowState;
          response.data = {
            isMatch: parseResult.response_type === 'pending_duplicate_confirm',
            existingRecipeName: fs.existingRecipeName,
            parsed: {
              recipe_name: fs.parsed.recipe_name,
              servings: fs.parsed.servings,
              nutrition_data: fs.batchNutrition,
              ingredients: fs.ingredientsWithNutrition?.map((ing) => ({
                name: ing.name,
                amount: ing.amount || ing.quantity || '',
                unit: ing.unit || '',
                calories: ing.nutrition?.calories || 0
              })) || []
            },
            preview: message.substring(0, 100) + '...'
          };
          const chatAgent = new ChatAgent();
          response.message = await chatAgent.execute({
            userMessage: message,
            intent: 'save_recipe',
            data: {
              proposal: parseResult,
              toolsUsed: [
                'parse_recipe_text'
              ]
            },
            history: chatHistory
          }, context);
          response.steps = thoughts.getSteps();
          return response;
        }
      }
    }
    // =========================================================
    // STEP 2: IntentAgent - Classification (The Router)
    // =========================================================
    reportStep('Analyzing intent...');
    const intentAgent = new IntentAgent();
    const intentResult = await intentAgent.execute({
      message: message.length > 2000 ? message.substring(0, 2000) + "... [Truncated]" : message,
      history: chatHistory
    }, context);
    agentsInvolved.push('intent');
    console.log('[OrchestratorV3] Intent:', intentResult.intent, `(Confidence: ${intentResult.confidence || 'N/A'})`);
    // =========================================================
    // STEP 3: Intent Switchboard (The Hub)
    // =========================================================
    const toolExecutor = new ToolExecutor({
      userId,
      supabase,
      timezone,
      sessionId
    });
    const intent = intentResult.intent;
    switch (intent) {
      case 'greet':
        console.log('[OrchestratorV3] Branch: greet');
        reportStep('Saying hello!');
        const chatAgentGreet = new ChatAgent();
        response.message = await chatAgentGreet.execute({
          userMessage: message,
          intent: 'greet',
          data: {
            reasoning: 'Greeting user'
          },
          history: chatHistory
        }, context);
        response.response_type = 'chat_response';
        return {
          ...response,
          steps: thoughts.getSteps()
        };
      case 'confirm':
        if (session.pending_action) {
          console.log('[OrchestratorV3] Branch: confirm (Direct Route)');
          reportStep('Confirmed! Processing...');
          const confirmResult = await handlePendingConfirmation(session.pending_action, userId, sessionService, db, context, message);
          confirmResult.steps = thoughts.getSteps();
          return confirmResult;
        }
        break; // Fallback to reasoning if no pending action
      case 'decline':
      case 'cancel':
        console.log('[OrchestratorV3] Branch: cancel');
        reportStep('Cancelling...');
        await sessionService.clearPendingAction(userId);
        return {
          status: 'success',
          message: 'No problem! I\'ve cancelled that. What else can I help with?',
          response_type: 'action_cancelled',
          steps: thoughts.getSteps()
        };
      case 'log_food':
      case 'query_nutrition':
        // Simple logging or query can often bypass reasoning if entities are clear
        // But for now, we'll let reasoning handle it to maintain the tool orchestration
        // UNLESS it's a very simple one-item log.
        if (intentResult.food_items?.length === 1 && !message.includes(' recipes') && !message.includes(' yesterday')) {
          const food = intentResult.food_items[0];
          const portion = intentResult.portions?.[0] || '1 serving';
          // PRIORITIZE SAVED RECIPES (Fulfills request to clarify logging source)
          console.log(`[OrchestratorV3] Checking for saved recipes matching "${food}"...`);
          const recipeAgentForLog = new RecipeAgent();
          const findResultForLog = await recipeAgentForLog.execute({
            type: 'find',
            name: food
          }, context);
          if (findResultForLog.type === 'found') {
            console.log(`[OrchestratorV3] Found saved recipe match for "${food}" during log_food intent`);
            const recipe = findResultForLog.recipe;
            const fs = {
              step: 'pending_duplicate_confirm',
              parsed: {
                recipe_name: recipe.recipe_name,
                servings: recipe.servings,
                ingredients: recipe.recipe_ingredients?.map((ing) => ({
                  name: ing.ingredient_name,
                  quantity: ing.quantity,
                  unit: ing.unit
                })) || []
              },
              batchNutrition: recipe.nutrition_data,
              existingRecipeId: recipe.id,
              existingRecipeName: recipe.recipe_name
            };
            await sessionService.savePendingAction(userId, {
              type: 'recipe_save',
              data: {
                flowState: fs,
                response_type: 'pending_duplicate_confirm',
                pending: true,
                portion
              }
            });
            response.response_type = 'confirmation_recipe_save';
            response.data = {
              isMatch: true,
              existingRecipeName: recipe.recipe_name,
              parsed: {
                ...fs.parsed,
                nutrition_data: fs.batchNutrition,
                ingredients: recipe.recipe_ingredients?.map((ing) => ({
                  name: ing.ingredient_name,
                  amount: ing.quantity,
                  unit: ing.unit,
                  calories: ing.nutrition_data?.calories || 0
                })) || []
              }
            };
            const chatAgentLogMatch = new ChatAgent();
            response.message = `I found your saved recipe for "**${recipe.recipe_name}**"! Would you like to use it for this log?`;
            return {
              ...response,
              steps: thoughts.getSteps()
            };
          }
          console.log('[OrchestratorV3] Branch: simple_log_food');
          reportStep('Looking up nutrition...');
          const nutritionData = await toolExecutor.execute('lookup_nutrition', {
            food,
            portion,
            calories: intentResult.calories,
            macros: intentResult.macros
          });
          const proposal = await toolExecutor.execute('propose_food_log', {
            food_name: nutritionData.food_name,
            portion: nutritionData.portion,
            calories: nutritionData.calories,
            protein_g: nutritionData.protein_g,
            carbs_g: nutritionData.carbs_g,
            fat_total_g: nutritionData.fat_g
          });
          await sessionService.savePendingAction(userId, {
            type: 'food_log',
            data: proposal.data
          });
          const chatAgentLog = new ChatAgent();
          response.message = await chatAgentLog.execute({
            userMessage: message,
            intent: 'log_food',
            data: {
              proposal,
              toolsUsed: [
                'lookup_nutrition'
              ]
            },
            history: chatHistory
          }, context);
          response.response_type = 'confirmation_food_log';
          response.data = {
            nutrition: [
              proposal.data
            ],
            proposal
          };
          return {
            ...response,
            steps: thoughts.getSteps()
          };
        }
      case 'log_recipe':
        // Shortcut: If intent is log_recipe and message is large or context exists
        if (message.length > 500 || intentResult.recipe_text) {
          console.log('[OrchestratorV3] Branch: log_recipe_shortcut (parse)');
          reportStep('Parsing recipe...');
          const recipeText = intentResult.recipe_text || message;
          const parseResult = await toolExecutor.execute('parse_recipe_text', {
            recipe_text: recipeText
          });
          if (parseResult.proposal_type === 'recipe_save' && parseResult.flowState) {
            await sessionService.savePendingAction(userId, {
              type: 'recipe_save',
              data: parseResult
            });
            const isMatch = parseResult.response_type === 'pending_duplicate_confirm';
            response.response_type = 'confirmation_recipe_save';
            const fs = parseResult.flowState;
            response.data = {
              isMatch,
              existingRecipeName: fs.existingRecipeName,
              parsed: {
                recipe_name: fs.parsed.recipe_name,
                servings: fs.parsed.servings,
                nutrition_data: fs.batchNutrition,
                ingredients: fs.ingredientsWithNutrition?.map((ing) => ({
                  name: ing.name,
                  amount: ing.amount || ing.quantity || '',
                  unit: ing.unit || '',
                  calories: ing.nutrition?.calories || 0
                })) || []
              }
            };
            const chatAgentRecipe = new ChatAgent();
            response.message = await chatAgentRecipe.execute({
              userMessage: message,
              intent: 'log_recipe',
              data: {
                proposal: parseResult,
                toolsUsed: [
                  'parse_recipe_text'
                ]
              },
              history: chatHistory
            }, context);
            return {
              ...response,
              steps: thoughts.getSteps()
            };
          }
        } else {
          // Simple search by name
          const recipeName = intentResult.food_items?.[0] || message;
          console.log('[OrchestratorV3] Branch: log_recipe_shortcut (search)');

          // Clean the query to remove "log", "my", "track" prefix if falling back to message
          let query = recipeName;
          if (query === message) {
            query = query.replace(/^(log|track|have|had|ate|record)\s+(my\s+)?/i, '').trim();
          }

          reportStep(`Searching for "${query}" in your recipes...`);
          const recipeAgent = new RecipeAgent();
          const findResult = await recipeAgent.execute({
            type: 'find',
            name: query
          }, context);
          if (findResult.type === 'found') {
            // We found it! Trigger the same "Duplicate Found" modal so user can choose log/update/new
            // This fulfills: "If we have the recipe saved we need to ask user what he wants, showing the modal to log, update, or do the edited log"
            // Convert saved recipe back to a pseudo-parsed format for the flowState
            const recipe = findResult.recipe;
            const fs = {
              step: 'pending_duplicate_confirm',
              parsed: {
                recipe_name: recipe.recipe_name,
                servings: recipe.servings,
                ingredients: recipe.recipe_ingredients?.map((ing) => ({
                  name: ing.ingredient_name,
                  quantity: ing.quantity,
                  unit: ing.unit
                })) || []
              },
              batchNutrition: recipe.nutrition_data,
              existingRecipeId: recipe.id,
              existingRecipeName: recipe.recipe_name
            };
            await sessionService.savePendingAction(userId, {
              type: 'recipe_save',
              data: {
                flowState: fs,
                response_type: 'pending_duplicate_confirm',
                pending: true
              }
            });
            response.response_type = 'confirmation_recipe_save';
            response.data = {
              isMatch: true,
              existingRecipeName: recipe.recipe_name,
              parsed: {
                ...fs.parsed,
                nutrition_data: fs.batchNutrition,
                ingredients: recipe.recipe_ingredients?.map((ing) => ({
                  name: ing.ingredient_name,
                  amount: ing.quantity,
                  unit: ing.unit,
                  calories: ing.nutrition_data?.calories || 0
                })) || []
              }
            };
            const chatAgentFound = new ChatAgent();
            response.message = `I found your recipe for "**${recipe.recipe_name}**"! What would you like to do?`;
            // Ensure we tell the UI what recipe this is
            return {
              ...response,
              steps: thoughts.getSteps()
            };
          } else {
            // Not found? fallback to reasoning for nutrition estimate or new parse
            console.log('[OrchestratorV3] Recipe not found by name, falling back to Reasoning');
          }
        }
        break;
      case 'save_recipe':
        console.log('[OrchestratorV3] Branch: save_recipe');
        reportStep('Parsing recipe...');
        const saveRecipeText = intentResult.recipe_text || message;
        const saveParseResult = await toolExecutor.execute('parse_recipe_text', {
          recipe_text: saveRecipeText
        });
        if (saveParseResult.proposal_type === 'recipe_save' && saveParseResult.flowState) {
          await sessionService.savePendingAction(userId, {
            type: 'recipe_save',
            data: saveParseResult
          });
          const isMatch = saveParseResult.response_type === 'pending_duplicate_confirm';
          response.response_type = 'confirmation_recipe_save';
          const fs = saveParseResult.flowState;
          response.data = {
            isMatch,
            existingRecipeName: fs.existingRecipeName,
            parsed: {
              recipe_name: fs.parsed.recipe_name,
              servings: fs.parsed.servings,
              nutrition_data: fs.batchNutrition,
              ingredients: fs.ingredientsWithNutrition?.map((ing) => ({
                name: ing.name,
                amount: ing.amount || ing.quantity || '',
                unit: ing.unit || '',
                calories: ing.nutrition?.calories || 0
              })) || []
            }
          };
          const chatAgentSaveRecipe = new ChatAgent();
          response.message = await chatAgentSaveRecipe.execute({
            userMessage: message,
            intent: 'save_recipe',
            data: {
              proposal: saveParseResult,
              toolsUsed: [
                'parse_recipe_text'
              ]
            },
            history: chatHistory
          }, context);
          return {
            ...response,
            steps: thoughts.getSteps()
          };
        }
        break;
    }
    // =========================================================
    // STEP 4: ReasoningAgent - Fallback (Complex cases)
    // =========================================================
    console.log('[OrchestratorV3] Fallback to ReasoningAgent');
    reportStep('Thinking about how to help...');
    const reasoningAgent = new ReasoningAgent();
    const reasoningResult = await reasoningAgent.execute({
      message: message.length > 2000 ? message.substring(0, 2000) + "... [Truncated]" : message,
      intent: {
        type: intentResult.intent,
        confidence: intentResult.confidence,
        entities: intentResult.entities
      },
      chatHistory
    }, context);
    agentsInvolved.push('reasoning');
    agentsInvolved.push(...reasoningResult.toolsUsed);
    // Log specific tool actions as thoughts
    if (reasoningResult.toolsUsed.includes('lookup_nutrition')) reportStep('Looking up nutrition info...');
    if (reasoningResult.toolsUsed.includes('estimate_nutrition')) reportStep('Estimating nutritional values...');
    if (reasoningResult.toolsUsed.includes('parse_recipe_text')) reportStep('Parsing recipe details...');
    if (reasoningResult.toolsUsed.includes('get_user_goals')) reportStep('Checking your nutrition goals...');
    if (reasoningResult.toolsUsed.includes('propose_food_log')) reportStep('Preparing a log entry for you...');
    // Handle proposals (PCC pattern)
    if (reasoningResult.proposal) {
      await sessionService.savePendingAction(userId, {
        type: reasoningResult.proposal.type,
        data: reasoningResult.proposal.data
      });
      response.response_type = `confirmation_${reasoningResult.proposal.type}`;
    }
    // =========================================================
    // STEP 5: ChatAgent - Final Formatting
    // =========================================================
    reportStep('Formatting response...');
    const chatAgent = new ChatAgent();
    response.message = await chatAgent.execute({
      userMessage: message,
      intent: intentResult.intent,
      data: {
        reasoning: reasoningResult.reasoning,
        proposal: reasoningResult.proposal,
        toolsUsed: reasoningResult.toolsUsed,
        data: reasoningResult.data
      },
      history: chatHistory
    }, context);
    agentsInvolved.push('chat');
    // Finalize Response data
    response.data = {
      ...reasoningResult.data,
      proposal: reasoningResult.proposal
    };
    // Map proposal data to specific keys for frontend
    if (reasoningResult.proposal) {
      const p = reasoningResult.proposal;
      if (p.type === 'food_log') {
        response.data.nutrition = [
          p.data
        ];
        response.response_type = 'confirmation_food_log';
      } else if (p.type === 'recipe_log') {
        response.data.nutrition = [
          {
            food_name: p.data.recipe_name,
            calories: p.data.calories,
            protein_g: p.data.protein_g,
            carbs_g: p.data.carbs_g,
            fat_total_g: p.data.fat_total_g,
            serving_size: `${p.data.servings} serving(s)`
          }
        ];
        response.response_type = 'confirmation_food_log';
      } else if (p.type === 'recipe_save' && p.data?.flowState) {
        const fs = p.data.flowState;
        response.data.parsed = {
          recipe_name: fs.parsed.recipe_name,
          servings: fs.parsed.servings,
          nutrition_data: fs.batchNutrition,
          ingredients: fs.ingredientsWithNutrition?.map((ing) => ({
            name: ing.name || ing.ingredient_name,
            amount: ing.amount || ing.quantity || '',
            unit: ing.unit || '',
            calories: ing.nutrition?.calories || ing.nutrition_data?.calories || 0
          })) || fs.parsed.ingredients?.map((ing) => ({
            name: ing.name,
            amount: ing.quantity || '',
            unit: ing.unit || '',
            calories: 0 // Placeholder if nutrition calculation failed but ingredients are there
          })) || []
        };
        response.response_type = 'confirmation_recipe_save';
      } else if (p.type === 'goal_update') {
        response.response_type = 'confirmation_goal_update';
      }
    }
    // Update session context
    await sessionService.updateContext(userId, {
      intent: intentResult.intent,
      agent: 'reasoning',
      responseType: response.response_type
    });
    // Extraction for Context Preservation (Phase 2.2)
    const foodEntities = extractFoodEntities(intentResult, reasoningResult.data);
    const topic = classifyTopic(intentResult.intent);
    if (foodEntities.length > 0 || topic) {
      await sessionService.updateBuffer(userId, {
        recentFoods: foodEntities,
        lastTopic: topic
      });
    }
    response.steps = thoughts.getSteps();
    persistence.logExecution(userId, sessionId, 'reasoning', agentsInvolved, startTime, response, message);
    return response;
  } catch (error) {
    console.error('[OrchestratorV3] Fatal Error:', error);
    return {
      status: 'error',
      message: `I encountered an unexpected error. Please try again. (${error.message})`,
      response_type: 'fatal_error'
    };
  }
}
/**
 * Handle confirmation of pending actions (food log, recipe log, goal update)
 */ async function handlePendingConfirmation(pendingAction, userId, sessionService, db, context, message) {
  const { type, data } = pendingAction;
  const lowerMessage = message.trim().toLowerCase();
  try {
    switch (type) {
      case 'food_log':
        await db.logFoodItems(userId, [
          {
            food_name: data.food_name,
            portion: data.portion,
            calories: data.calories,
            protein_g: data.protein_g,
            carbs_g: data.carbs_g,
            fat_total_g: data.fat_total_g || data.fat_g,
            fiber_g: data.fiber_g,
            sugar_g: data.sugar_g,
            sodium_mg: data.sodium_mg,
            fat_saturated_g: data.fat_saturated_g,
            cholesterol_mg: data.cholesterol_mg,
            potassium_mg: data.potassium_mg,
            log_time: new Date().toISOString()
          }
        ]);
        await sessionService.clearPendingAction(userId);
        return {
          status: 'success',
          message: `✅ Logged ${data.food_name} (${data.calories} cal)! Great choice! 🎉`,
          response_type: 'food_logged',
          data: {
            food_logged: data
          }
        };
      case 'recipe_log':
        await db.logFoodItems(userId, [
          {
            food_name: data.recipe_name,
            portion: `${data.servings} serving(s)`,
            calories: data.calories,
            protein_g: data.protein_g,
            carbs_g: data.carbs_g,
            fat_total_g: data.fat_total_g || data.fat_g,
            fiber_g: data.fiber_g,
            sugar_g: data.sugar_g,
            sodium_mg: data.sodium_mg,
            log_time: new Date().toISOString(),
            recipe_id: data.recipe_id
          }
        ]);
        await sessionService.clearPendingAction(userId);
        return {
          status: 'success',
          message: `✅ Logged ${data.servings} serving(s) of ${data.recipe_name}! 🍽️`,
          response_type: 'recipe_logged',
          data: {
            recipe_logged: data
          }
        };
      case 'goal_update':
        await db.updateUserGoal(userId, data.nutrient, data.target_value, data.unit);
        await sessionService.clearPendingAction(userId);
        return {
          status: 'success',
          message: `✅ Updated your ${data.nutrient} goal to ${data.target_value}${data.unit}! 🎯`,
          response_type: 'goal_updated',
          data: {
            goal_updated: data
          }
        };
      case 'recipe_save':
        // Delegate to RecipeAgent for robust handling
        const recipeAgent = new RecipeAgent();
        const dataAny = data;
        const fs = dataAny.flowState;
        if (dataAny.customName) {
          if (fs?.parsed) fs.parsed.recipe_name = dataAny.customName;
          else if (dataAny.parsed) dataAny.parsed.recipe_name = dataAny.customName;
        }
        const choice = dataAny.choice || (lowerMessage.includes('log') ? 'log' : lowerMessage.includes('update') ? 'update' : lowerMessage.includes('new') ? 'new' : undefined);
        const optimizationData = fs ? {
          batchNutrition: fs.batchNutrition,
          ingredientsWithNutrition: fs.ingredientsWithNutrition
        } : {};
        const action = choice ? {
          type: 'handle_duplicate',
          flowState: fs,
          choice: choice,
          ...optimizationData
        } : {
          type: 'save',
          parsed: fs?.parsed || data.parsed,
          mode: 'commit',
          ...optimizationData
        };
        const saveResult = await recipeAgent.execute(action, context);
        await sessionService.clearPendingAction(userId);
        if (saveResult.type === 'error') {
          throw new Error(saveResult.error || 'Unknown error saving recipe');
        } else if (saveResult.type === 'updated') {
          const portion = data.portion;
          if (portion) {
            const recipe = saveResult.recipe;
            const servings = parseFloat(portion) || 1;
            const scale = servings / (recipe.servings || 1);
            await db.logFoodItems(userId, [
              {
                food_name: recipe.recipe_name,
                portion: portion,
                calories: Math.round((recipe.nutrition_data?.calories || 0) * scale),
                protein_g: (recipe.nutrition_data?.protein_g || 0) * scale,
                carbs_g: (recipe.nutrition_data?.carbs_g || 0) * scale,
                fat_total_g: (recipe.nutrition_data?.fat_total_g || 0) * scale,
                fiber_g: (recipe.nutrition_data?.fiber_g || 0) * scale,
                sugar_g: (recipe.nutrition_data?.sugar_g || 0) * scale,
                sodium_mg: (recipe.nutrition_data?.sodium_mg || 0) * scale,
                log_time: new Date().toISOString(),
                recipe_id: recipe.id
              }
            ]);
            return {
              status: 'success',
              message: `✅ Updated and logged ${portion} of "${recipe.recipe_name}"! 🍽️`,
              response_type: 'recipe_logged',
              data: {
                recipe_logged: recipe
              }
            };
          }
          return {
            status: 'success',
            message: `✅ Updated recipe "${saveResult.recipe.recipe_name}"! 📖`,
            response_type: 'recipe_saved',
            data: {
              recipe: saveResult.recipe
            }
          };
        } else if (saveResult.type === 'found' && saveResult.skipSave) {
          // This is the "Log Existing" choice
          // We need to log it now
          const recipe = saveResult.recipe;
          const portion = data.portion || `1 serving`;
          // Simple scaling for logging
          const servings = parseFloat(portion) || 1;
          const scale = servings / (recipe.servings || 1);
          await db.logFoodItems(userId, [
            {
              food_name: recipe.recipe_name,
              portion: portion,
              calories: Math.round((recipe.nutrition_data?.calories || 0) * scale),
              protein_g: (recipe.nutrition_data?.protein_g || 0) * scale,
              carbs_g: (recipe.nutrition_data?.carbs_g || 0) * scale,
              fat_total_g: (recipe.nutrition_data?.fat_total_g || 0) * scale,
              fiber_g: (recipe.nutrition_data?.fiber_g || 0) * scale,
              sugar_g: (recipe.nutrition_data?.sugar_g || 0) * scale,
              sodium_mg: (recipe.nutrition_data?.sodium_mg || 0) * scale,
              log_time: new Date().toISOString(),
              recipe_id: recipe.id
            }
          ]);
          return {
            status: 'success',
            message: `✅ Logged ${portion} of "${recipe.recipe_name}"! 🍽️`,
            response_type: 'recipe_logged',
            data: {
              recipe_logged: recipe
            }
          };
        }
        return {
          status: 'success',
          message: `✅ Saved recipe "${saveResult.recipe?.recipe_name || 'your recipe'}"! You can now log it any time. 📖`,
          response_type: 'recipe_saved',
          data: {
            recipe: saveResult.recipe
          }
        };
      default:
        await sessionService.clearPendingAction(userId);
        return {
          status: 'success',
          message: 'Done! ✅',
          response_type: 'action_confirmed'
        };
    }
  } catch (error) {
    console.error('[OrchestratorV3] Confirmation error:', error);
    return {
      status: 'error',
      message: `Failed to save: ${error.message}. Please try again.`,
      response_type: 'confirmation_failed'
    };
  }
}
/**
 * Extract food entity names from intent result and gathered data.
 * Phase 2.2: These are stored in the buffer for context preservation.
 */ function extractFoodEntities(intentResult, gatheredData) {
  const foods = [];
  // Extract from intent entities
  if (intentResult.food_items && Array.isArray(intentResult.food_items)) {
    foods.push(...intentResult.food_items);
  }
  if (intentResult.entities && Array.isArray(intentResult.entities)) {
    // Entities might contain food names
    foods.push(...intentResult.entities.filter((e) => ![
      'today',
      'yesterday',
      'tomorrow',
      'morning',
      'evening',
      'lunch',
      'dinner',
      'breakfast'
    ].includes(e.toLowerCase())));
  }
  // Extract from nutrition lookup results
  if (gatheredData?.lookup_nutrition?.food_name) {
    foods.push(gatheredData.lookup_nutrition.food_name);
  }
  if (gatheredData?.propose_food_log?.data?.food_name) {
    foods.push(gatheredData.propose_food_log.data.food_name);
  }
  // Deduplicate and clean
  return [
    ...new Set(foods.filter((f) => f && f.length > 0))
  ];
}
/**
 * Classify the topic of conversation based on intent.
 * Phase 2.2: Used to track conversation context.
 */ function classifyTopic(intent) {
  if ([
    'log_food',
    'query_nutrition',
    'dietary_advice'
  ].includes(intent)) {
    return 'food';
  }
  if ([
    'log_recipe',
    'save_recipe'
  ].includes(intent)) {
    return 'recipe';
  }
  if ([
    'query_goals',
    'update_goals',
    'suggest_goals'
  ].includes(intent)) {
    return 'goals';
  }
  if ([
    'off_topic',
    'clarify'
  ].includes(intent)) {
    return 'general';
  }
  return undefined;
}
// Export default for easy switching between versions
export { orchestrateV3 as orchestrate };
