'use client'; // Chat needs client-side interaction

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext'; // To check user auth status
import { TypingIndicator } from '@/components/LoadingIndicators'; // Import the indicator
import Link from 'next/link';
import ChatDashboardLayout from '@/components/ChatDashboardLayout'; // Import the new layout
import DashboardShell from '@/components/DashboardShell';
import DashboardSummaryTable from '@/components/DashboardSummaryTable';

// Interface for chat messages
interface ChatMessage {
  id: number; // Simple ID for key prop
  sender: 'user' | 'bot' | 'error';
  text: string;
  actions?: Array<{ label: string; payload: string }>; // Optional actions for bot messages
}

// Add type for recipe matches
interface RecipeMatch {
    id: string | number;
    recipe_name: string;
    // Add other potential fields if known
}

// --- Types from Dashboard ---
interface UserGoal {
    nutrient: string;
    target_value: number;
    unit: string;
    goal_type?: string;
}

interface FoodLog {
    id: number;
    timestamp: string;
    food_name?: string | null;
    calories?: number | null;
    [key: string]: unknown;
}

interface DailyTotals {
    [nutrientKey: string]: number;
}

// --- Helper from Dashboard ---
const formatDate = (date: Date): string => {
  return date.toISOString().split('T')[0];
};

// --- Loading Spinner from Dashboard ---
const LoadingSpinner = () => {
  return (
    <div className="flex justify-center items-center py-2">
      <div className="relative w-6 h-6"> {/* Adjusted size for context */ }
        <div className="absolute top-0 left-0 right-0 bottom-0 border-2 border-blue-100 rounded-full"></div>
        <div className="absolute top-0 left-0 right-0 bottom-0 border-2 border-transparent border-t-blue-600 rounded-full animate-spin"></div>
      </div>
    </div>
  );
};

// --- Helper Component for Dashboard Progress Item ---
const GoalProgressItem = ({ nutrient, current, target, unit }: { nutrient: string; current: number; target?: number; unit: string }) => {
    const targetValue = target ?? 0; // Use 0 if target is undefined
    const progress = targetValue > 0 ? Math.min(Math.max((current / targetValue) * 100, 0), 150) : 0; // Cap progress at 150% max display
    const displayPercentage = progress.toFixed(0);
    const progressBarColor = progress > 100 ? 'bg-orange-400' : 'bg-blue-500'; // Change color if over target

    return (
        <div className="p-3 bg-white border border-gray-200 rounded-lg shadow-sm">
            <div className="flex justify-between items-center mb-1">
                <span className="text-sm font-medium text-gray-700 capitalize">{nutrient}</span>
                <span className="text-xs text-gray-500">
                    {current.toFixed(0)}{target !== undefined ? ` / ${targetValue.toFixed(0)}` : ''} {unit}
                </span>
            </div>
            {target !== undefined && ( // Only show progress bar if there's a target
                <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                    <div
                        className={`h-2 rounded-full ${progressBarColor} transition-all duration-300 ease-out`}
                        style={{ width: `${Math.min(progress, 100)}%` }} // Cap visual width at 100%
                    ></div>
                </div>
            )}
              {/* Optional: Add percentage text if needed */}
              {/* {target !== undefined && (
                  <p className="text-right text-xs text-gray-500 mt-0.5">{displayPercentage}% of goal</p>
              )} */}
        </div>
    );
};

// --- Helper Component for Dashboard TABLE ROW (Updated to match dashboard) ---
const DashboardTableRow = ({ nutrient, current, target, unit, goalType }: { nutrient: string; current: number; target?: number; unit: string; goalType?: string }) => {
    const targetValue = target ?? 0;
    let progressText = '-';
    let targetText = targetValue > 0 ? `${targetValue.toFixed(0)} ${unit}` : '-';
    let consumedText = `${current.toFixed(0)} ${unit}`;
    let displayPercentage = '0';
    let rowBgColor = 'bg-white';
    // Handle omega ratio special case
    if (nutrient === 'omega_ratio') {
        // Assume omega_6_g and omega_3_g are available in current and target
        // (In dashboard, these are pulled from dailyTotals)
        // Here, current = omega_6_g, target = omega_3_g
        const omega6Total = current;
        const omega3Total = targetValue;
        const currentRatio = omega3Total > 0 ? (omega6Total / omega3Total) : 0;
        targetText = `${targetValue}:1 Target`;
        consumedText = omega3Total > 0 ? `${currentRatio.toFixed(1)}:1` : '0:0';
        progressText = consumedText;
    } else if (targetValue > 0) {
        const progress = (current / targetValue) * 100;
        displayPercentage = progress.toFixed(0);
        const difference = targetValue - current;
        const differenceText = difference >= 0 ? `(+${difference.toFixed(0)} ${unit})` : `(${difference.toFixed(0)} ${unit})`;
        progressText = `${displayPercentage}% ${differenceText}`;
    }
    // Row background color logic (match dashboard)
    if ((current ?? 0) === 0 && nutrient !== 'omega_ratio') {
        rowBgColor = goalType === 'goal' ? 'bg-red-50' : 'bg-green-50';
    }
    // Format nutrient name
    const formattedNutrient = nutrient.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    return (
        <tr className={`${rowBgColor} hover:bg-gray-100`}>
            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-800">
                {formattedNutrient}
                <span className="text-gray-500 font-normal">{goalType ? ` (${goalType})` : ''}</span>
            </td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{targetText}</td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{consumedText}</td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{progressText}</td>
        </tr>
    );
};

export default function ChatPage() {
  // --- MOVE DEFINITION INSIDE COMPONENT ---
  const MASTER_NUTRIENT_LIST = [
    // General
    { key: "calories", name: "Calories", unit: "kcal" },
    { key: "water_g", name: "Water", unit: "g" },
    // Macronutrients
    { key: "protein_g", name: "Protein", unit: "g" },
    { key: "fat_total_g", name: "Total Fat", unit: "g" },
    { key: "carbs_g", name: "Carbohydrates", unit: "g" },
    // Fat Subtypes
    { key: "fat_saturated_g", name: "Saturated Fat", unit: "g" },
    { key: "fat_polyunsaturated_g", name: "Polyunsaturated Fat", unit: "g" },
    { key: "fat_monounsaturated_g", name: "Monounsaturated Fat", unit: "g" },
    { key: "fat_trans_g", name: "Trans Fat", unit: "g" },
    { key: "omega_3_g", name: "Omega-3 Fatty Acids", unit: "g" },
    { key: "omega_6_g", name: "Omega-6 Fatty Acids", unit: "g" },
    // Carb Subtypes
    { key: "fiber_g", name: "Dietary Fiber", unit: "g" },
    { key: "fiber_soluble_g", name: "Soluble Fiber", unit: "g" },
    { key: "sugar_g", name: "Total Sugars", unit: "g" },
    { key: "sugar_added_g", name: "Added Sugars", unit: "g" },
    // Sterols
    { key: "cholesterol_mg", name: "Cholesterol", unit: "mg" },
    // Minerals
    { key: "sodium_mg", name: "Sodium", unit: "mg" },
    { key: "potassium_mg", name: "Potassium", unit: "mg" },
    { key: "calcium_mg", name: "Calcium", unit: "mg" },
    { key: "iron_mg", name: "Iron", unit: "mg" },
    { key: "magnesium_mg", name: "Magnesium", unit: "mg" },
    { key: "phosphorus_mg", name: "Phosphorus", unit: "mg" },
    { key: "zinc_mg", name: "Zinc", unit: "mg" },
    { key: "copper_mg", name: "Copper", unit: "mg" },
    { key: "manganese_mg", name: "Manganese", unit: "mg" },
    { key: "selenium_mcg", name: "Selenium", unit: "mcg" },
    // Vitamins (Fat-Soluble)
    { key: "vitamin_a_mcg_rae", name: "Vitamin A", unit: "mcg RAE" },
    { key: "vitamin_d_mcg", name: "Vitamin D", unit: "mcg" },
    { key: "vitamin_e_mg", name: "Vitamin E", unit: "mg" },
    { key: "vitamin_k_mcg", name: "Vitamin K", unit: "mcg" },
    // Vitamins (Water-Soluble)
    { key: "vitamin_c_mg", name: "Vitamin C", unit: "mg" },
    { key: "thiamin_mg", name: "Thiamin (B1)", unit: "mg" },
    { key: "riboflavin_mg", name: "Riboflavin (B2)", unit: "mg" },
    { key: "niacin_mg", name: "Niacin (B3)", unit: "mg" },
    { key: "pantothenic_acid_mg", name: "Pantothenic Acid (B5)", unit: "mg" },
    { key: "vitamin_b6_mg", name: "Vitamin B6", unit: "mg" },
    { key: "biotin_mcg", name: "Biotin (B7)", unit: "mcg" },
    { key: "folate_mcg_dfe", name: "Folate (B9)", unit: "mcg DFE" },
    { key: "vitamin_b12_mcg", name: "Vitamin B12", unit: "mcg" },
    // Calculated/Ratio Goals
    { key: "omega_ratio", name: "Omega 6:3 Ratio", unit: "ratio" },
  ];

  const { user, supabase, loading: authLoading, session } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false); // Mobile menu state
  const [message, setMessage] = useState(''); // Input field state
  const [sending, setSending] = useState(false); // Sending state
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]); // State for messages
  // Use more specific types instead of any
  const [pendingAction, setPendingAction] = useState<Record<string, unknown> | null>(null); 
  const [contextForNextRequest, setContextForNextRequest] = useState<Record<string, unknown> | null>(null); 
  const messagesEndRef = useRef<HTMLDivElement>(null); // Ref for scrolling

  // --- localStorage Persistence --- 
  const storageKey = user ? `chatHistory_${user.id}` : 'chatHistory_guest'; // User-specific key

  // --- Dashboard State ---
  const [userGoals, setUserGoals] = useState<UserGoal[]>([]);
  const [dailyTotals, setDailyTotals] = useState<DailyTotals>({});
  const [recentLogs, setRecentLogs] = useState<FoodLog[]>([]); // Only need totals for the combined view? Adjust later if needed.
  const [loadingDashboardData, setLoadingDashboardData] = useState(true);
  const [refreshingDashboard, setRefreshingDashboard] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  // Load history from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && user) { // Ensure localStorage is available and user is loaded
       try {
         const savedHistory = localStorage.getItem(storageKey);
         if (savedHistory) {
           const parsedHistory = JSON.parse(savedHistory);
           // Basic validation: Check if it's an array
           if (Array.isArray(parsedHistory)) {
               setChatHistory(parsedHistory);
           } else {
               console.warn('Invalid chat history format found in localStorage.');
               localStorage.removeItem(storageKey); // Clear invalid data
           }
         }
       } catch (error) {
         console.error('Failed to load or parse chat history from localStorage:', error);
         localStorage.removeItem(storageKey); // Clear potentially corrupted data
       }
    }
  }, [user, storageKey]); // Rerun if user changes (e.g., login/logout)

  // Save history to localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== 'undefined' && user && chatHistory.length > 0) { // Don't save initial empty array unless intended
      try {
        localStorage.setItem(storageKey, JSON.stringify(chatHistory));
      } catch (error) {
        console.error('Failed to save chat history to localStorage:', error);
      }
    }
  }, [chatHistory, user, storageKey]); // Rerun when history or user changes
  // --- End localStorage Persistence ---

  // == Helper: Process Bot Reply & Add Actions (Adapted slightly for web state) ==
  const processBotReply = (responseData: Record<string, unknown>): ChatMessage => {
    // Type assertion needed if accessing nested properties
    const replyText = responseData.message as string;
    const botMessage: ChatMessage = { 
        id: Date.now() + 1, 
        sender: 'bot', 
        text: replyText 
    };
    const responseType = responseData.response_type;

    // Reset context/pending action unless explicitly set by response
    setPendingAction(null);
    setContextForNextRequest(null);

    // Handle specific response types that require context/actions
    if (responseType === 'recipe_analysis_prompt' && responseData.pending_action) {
        console.log("Setting pending action based on recipe_analysis_prompt");
        // Ensure pending_action is an object before setting
        const action = responseData.pending_action;
        setPendingAction(action && typeof action === 'object' ? action as Record<string, unknown> : null);
        if (!botMessage.actions) { 
            botMessage.actions = [
                { label: 'Save & Log', payload: 'User selects Save & Log' },
                { label: 'Log Only', payload: 'User selects Log Only' },
                { label: 'Cancel', payload: 'User selects Cancel' },
            ];
        }
    } else if ((responseType === 'saved_recipe_confirmation_prompt' || responseType === 'saved_recipe_proactive_confirm') && responseData.context_for_reply) {
        console.log("Setting context for saved recipe confirmation prompt");
        // Ensure context_for_reply is an object before setting
        const context = responseData.context_for_reply;
        setContextForNextRequest(context && typeof context === 'object' ? context as Record<string, unknown> : null);
        if (!botMessage.actions) { 
             botMessage.actions = [
                 { label: 'Yes, log it', payload: 'confirm_log_saved_recipe' },
                 { label: 'No, cancel', payload: 'User selects Cancel' }
             ];
        }
    } else if (responseType === 'clarification_needed_recipe' && responseData.context_for_reply) {
        console.log("Setting context for clarification needed");
        // Ensure context_for_reply is an object before setting
        const context = responseData.context_for_reply;
        setContextForNextRequest(context && typeof context === 'object' ? context as Record<string, unknown> : null);
        if (!botMessage.actions) { 
             botMessage.actions = [
                 { label: 'It was homemade (list ingredients)', payload: 'User indicates homemade' }, 
                 { label: 'It was a standard item', payload: 'User indicates standard item' }
             ];
        }
    } else if ((responseType === 'saved_recipe_found_multiple' || responseType === 'saved_recipe_proactive_multiple') && responseData.context_for_reply) {
         console.log("Setting context for multiple recipes found");
         // Ensure context_for_reply is an object before setting
         const context = responseData.context_for_reply;
         setContextForNextRequest(context && typeof context === 'object' ? context as Record<string, unknown> : null);

         // Check if context is valid object AND has the matches property before accessing nested properties
         if (context && typeof context === 'object' && 'matches' in context && Array.isArray(context.matches) && !botMessage.actions) {
             // Now TypeScript knows context might have matches
             const mappedActions = (context.matches as RecipeMatch[]).map((match) => ({
                 label: `Log: ${match.recipe_name}`,
                 payload: `confirm_log_saved_recipe:${match.id}` // Example payload format
             }));
             mappedActions.push({ label: 'None of these', payload: 'User selects None' });
             botMessage.actions = mappedActions; 
         }
    }

    // Add any other standard action processing here if needed
    // const lowerReply = (replyText || '').toLowerCase();
    // ...

    return botMessage;
  };

  // == Handle Action Button Click ==
  // TODO: Update handleActionClick to use fetch and pass context correctly if actions are used.
  const handleActionClick = (payload: string, messageId: number) => {
    // Add check for supabase client
    if (!supabase) {
        console.error("Supabase client not available for action click.");
         // Optionally show an error message to the user
         const errorMessage: ChatMessage = { id: Date.now(), sender: 'error', text: 'Could not send action, please try refreshing.' };
         setChatHistory(prev => [...prev, errorMessage]);
        return; 
    }

    // 1. Remove actions from the original message to hide buttons
    setChatHistory(prev => 
        prev.map(msg => 
            msg.id === messageId ? { ...msg, actions: undefined } : msg
        )
    );

    // 2. Send the payload as a new message
    // We need to bypass the normal input state setting
    // We'll reuse parts of handleSend but send the payload directly

    const actionAsUserMessage: ChatMessage = { id: Date.now(), sender: 'user', text: payload };
    setChatHistory(prev => [...prev, actionAsUserMessage]);
    setSending(true);

    // Directly call the backend with the action payload
    supabase.functions.invoke('ai-handler-v2', {
        body: { message: payload, conversation_history: chatHistory }, 
    }).then(({ data, error }) => {
         if (error) throw new Error(error.message);

         const replyText = data?.reply;
         if (replyText && typeof replyText === 'string' && replyText.trim() !== '') {
             const botMessage = processBotReply(data); // Use helper
             setChatHistory(prev => [...prev, botMessage]);
        } else {
             console.error("Invalid response format from ai-handler-v2 after action:", data);
             const errorMessage: ChatMessage = { id: Date.now() + 1, sender: 'error', text: 'Sorry, I received an unexpected response. Please try again.' };
             setChatHistory(prev => [...prev, errorMessage]);
        }
    }).catch((error) => {
        console.error("Error invoking Supabase function after action:", error);
        const errorMessage: ChatMessage = { id: Date.now() + 1, sender: 'error', text: error instanceof Error ? error.message : 'An unknown error occurred calling the AI handler.' };
        setChatHistory(prev => [...prev, errorMessage]);
    }).finally(() => {
        setSending(false);
    });
  };

  // --- Mobile Menu Logic (Copied from Profile/Dashboard) ---
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      // Ensure sidebar closes if click is outside sidebar AND outside the menu button
      if (menuOpen && !target.closest('.sidebar') && !target.closest('.menu-button')) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  // == Auto Scroll to Bottom ==
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  useEffect(() => {
    scrollToBottom();
  }, [chatHistory]); // Scroll when history changes

  // == Handle Sending Message (Using Fetch + Context Logic) ==
  const handleSend = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!message.trim() || sending || !session?.access_token) return;

    const messageToSend = message;
    // Capture history *before* adding new message
    const historyForBackend = [...chatHistory];
    // Capture context *before* clearing states
    const currentContext = contextForNextRequest;
    const currentPendingAction = pendingAction;

    // Clear context/pending actions intended for *this* request only
    setContextForNextRequest(null);
    setPendingAction(null); 

    setSending(true);
    setMessage(''); // Clear input

    // Add user message locally
    const newUserMessage: ChatMessage = { id: Date.now(), sender: 'user', text: messageToSend };
    setChatHistory(prev => [...prev, newUserMessage]);

    try {
      // --- Use fetch directly, mimicking mobile --- 
      const functionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ai-handler-v2`;
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!functionUrl || !anonKey) {
         throw new Error('Supabase URL or Anon Key missing in environment variables. Check .env.local');
      }
      const accessToken = session.access_token;
      
      // Construct request body including context/pending action if they exist
      const requestBody: Record<string, unknown> = {
          message: messageToSend,
          conversation_history: historyForBackend,
          user_id: user?.id, // Pass user ID
      };

      let combinedContext: Record<string, unknown> = {};
      let contextWasSet = false;

      if (currentPendingAction) {
          combinedContext.pending_action = currentPendingAction;
          contextWasSet = true;
          console.log("DEBUG: Including pending action in context:", currentPendingAction);
      }
      if (currentContext) {
          combinedContext = { ...combinedContext, ...currentContext }; // Merge properties
          contextWasSet = true;
          console.log("DEBUG: Including stored context_for_reply in context:", currentContext);
      }
      if (contextWasSet) {
          requestBody.context = combinedContext;
      } // No need for else delete requestBody.context as it's not added initially

      console.log(`DEBUG: Calling function via fetch: ${functionUrl} with body:`, JSON.stringify(requestBody));
      const response = await fetch(functionUrl, {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`,
              'apikey': anonKey
          },
          body: JSON.stringify(requestBody)
      });

      console.log('DEBUG: Fetch response status:', response.status);
      if (!response.ok) {
          let errorData;
          try { errorData = await response.json(); } 
          catch (_error) { errorData = { message: await response.text() }; }
          console.error("Backend Error Data (fetch):", errorData);
          throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }
      const data = await response.json(); // Process response
      console.log("DEBUG: Received data (fetch):", data);
      // --- End fetch use ---

      // --- Process Valid Response (using processBotReply) --- 
      if (data && data.message) { // Check if essential fields exist
          const botMessage = processBotReply(data); // Use helper to handle actions/context
          setChatHistory(prev => [...prev, botMessage]);
      } else {
         // Handle cases where response is technically valid JSON but lacks expected structure
         console.error("Invalid response structure from ai-handler-v2 (fetch):", data);
         const errorMessage: ChatMessage = {
             id: Date.now() + 1,
             sender: 'error',
             text: 'Sorry, I received an incomplete response. Please try again.'
         };
         setChatHistory(prev => [...prev, errorMessage]);
      }
      // --- End Response Processing ---

    } catch (error) { // Outer catch block handles errors
       console.error("Error during handleSend:", error);
       const errorMessage: ChatMessage = {
           id: Date.now() + 1, 
           sender: 'error', 
           // Updated error message construction to handle non-Error objects
           text: error instanceof Error ? error.message : (typeof error === 'string' ? error : 'An unknown error occurred calling the AI handler.') 
       };
       setChatHistory(prev => [...prev, errorMessage]);
    } finally {
       setSending(false);
    }
  }; // End handleSend

  // --- Dashboard Data Fetching Logic ---
  const fetchDashboardData = useCallback(async (isRefreshing = false) => {
    if (!user || !supabase) {
        setLoadingDashboardData(false);
        setRefreshingDashboard(false);
        return;
    }
    if (!isRefreshing) setLoadingDashboardData(true);
    else setRefreshingDashboard(true);
    setDashboardError(null);

    const today = new Date();
    const dateString = formatDate(today);
    const startOfDay = `${dateString}T00:00:00.000Z`;
    const endOfDay = `${dateString}T23:59:59.999Z`;

    try {
        const [goalsResponse, logsResponse] = await Promise.all([
            supabase
                .from('user_goals')
                .select('nutrient, target_value, unit, goal_type')
                .eq('user_id', user.id),
            supabase
                .from('food_log')
                .select('*')
                .eq('user_id', user.id)
                .gte('timestamp', startOfDay)
                .lte('timestamp', endOfDay)
                .order('timestamp', { ascending: false })
        ]);

        if (goalsResponse.error) throw goalsResponse.error;
        if (logsResponse.error) throw logsResponse.error;

        const fetchedGoals = goalsResponse.data || [];
        const fetchedLogs = logsResponse.data || [];

        setUserGoals(fetchedGoals);
        // Keep track of recent logs for potential future use, but dashboard panel might only show totals
        setRecentLogs(fetchedLogs.slice(0, 5));

        // Calculate totals based on fetched goals and logs for today
        const totals: DailyTotals = {};
        fetchedGoals.forEach(goal => {
            let currentIntake = 0;
            fetchedLogs.forEach(log => {
                const logValue = log[goal.nutrient];
                if (typeof logValue === 'number' && !isNaN(logValue)) {
                    currentIntake += logValue;
                }
            });
            totals[goal.nutrient] = currentIntake;
        });
        // Ensure calories total is calculated even if not an explicit goal
        if (!totals['calories']) {
             let calorieTotal = 0;
             fetchedLogs.forEach(log => {
                 if (typeof log.calories === 'number' && !isNaN(log.calories)) {
                     calorieTotal += log.calories;
                 }
             });
             totals['calories'] = calorieTotal;
        }
        setDailyTotals(totals);

        console.log("Dashboard data fetched for chat view:", { fetchedGoals, fetchedLogs, totals });

    } catch (err: unknown) {
        console.error("Error fetching dashboard data for chat view:", err);
        const errorMessage = err instanceof Error ? err.message : String(err);
        setDashboardError(`Failed to load dashboard data: ${errorMessage}`);
        // Reset dashboard specific state on error
        setUserGoals([]);
        setDailyTotals({});
        setRecentLogs([]);
    } finally {
        setLoadingDashboardData(false);
        setRefreshingDashboard(false);
    }

  }, [user, supabase]);

  // --- Initial Data Fetch Trigger ---
  useEffect(() => {
    if (!authLoading) {
      if (user) {
        console.log("ChatPage Effect: Auth loaded, user found. Fetching dashboard data...");
        fetchDashboardData(); // Fetch dashboard data when user is available
      } else {
        console.log("ChatPage Effect: Auth loaded, no user. Clearing data.");
        setLoadingDashboardData(false);
        setUserGoals([]);
        setDailyTotals({});
        setRecentLogs([]);
        setDashboardError(null);
        // Clear chat history on logout? Optional.
        // if (typeof window !== 'undefined') localStorage.removeItem(storageKey);
        // setChatHistory([]);
      }
    }
     // Depend only on authLoading and user existence status
  }, [authLoading, user, fetchDashboardData]); // Added fetchDashboardData to deps

  // Auth Loading State
  if (authLoading) {
    return <div className="flex h-screen items-center justify-center"><p>Loading Authentication...</p></div>;
  }

  // Not Logged In State
  if (!user || !session) {
    return <div className="flex h-screen items-center justify-center"><p>Please <Link href="/login" className="text-blue-600 hover:underline">log in</Link> to use the chat.</p></div>;
  }

  // --- Define Content for Each Panel --- 

  // --- JSX for Chat Panel ---
  const chatPanelContent = (
    <div className="flex flex-col flex-1 bg-white overflow-hidden"> 
      {/* Chat Header (Optional - Now likely handled by parent layout) */}
      {/* <header className="bg-white border-b border-gray-200 p-4 z-10 flex-shrink-0">
         <h2 className="text-xl font-semibold text-gray-800">NutriPal AI Chat</h2>
      </header> */}

      {/* Message List - With color coding */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 h-0"> 
        {chatHistory.map((msg) => (
           <div key={msg.id} className={`flex mb-3 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}> 
              <div 
                className={`max-w-xs md:max-w-md lg:max-w-lg px-4 py-2 rounded-lg shadow-sm ${ 
                  msg.sender === 'user' 
                    ? 'bg-blue-500 text-white' 
                    : msg.sender === 'bot' 
                    ? 'bg-gray-100 text-gray-800' 
                    : 'bg-red-100 text-red-700' // Error style
                }`} 
              > 
                <p className="text-sm whitespace-pre-wrap">{msg.text}</p> 
                {/* Action Buttons */}
                {msg.sender === 'bot' && msg.actions && msg.actions.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                     {msg.actions.map((action, index) => (
                       <button 
                         key={index}
                         onClick={() => handleActionClick(action.payload, msg.id)} 
                         className="px-3 py-1 bg-blue-100 text-blue-700 rounded-md text-xs hover:bg-blue-200 transition-colors"
                       > 
                         {action.label}
                       </button> 
                     ))} 
                  </div>
                )}
              </div>
           </div>
         ))} 
         {sending && <TypingIndicator />} 
         <div ref={messagesEndRef} /> 
       </div> 

       {/* Input Area - With color coding */} 
       <div className="p-4 border-t border-gray-200 bg-white flex-shrink-0"> 
         <form onSubmit={handleSend} className="flex items-center space-x-3"> 
           <input 
             type="text" 
             value={message} 
             onChange={(e) => setMessage(e.target.value)} 
             placeholder="Ask NutriPal anything or log food..." 
             disabled={sending} 
             className="flex-1 border border-gray-300 rounded-md px-4 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100" 
           /> 
           <button 
             type="submit" 
             disabled={sending || message.trim().length === 0} 
             className="px-5 py-2 bg-blue-600 text-white rounded-md font-semibold hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors" 
           > 
             {sending ? 'Sending...' : 'Send'} 
           </button> 
         </form> 
       </div> 
    </div>
  );

  // --- JSX for Dashboard Panel (UPDATED) --- 
  const dashboardPanelContent = (
    <div className="flex flex-col flex-1 bg-gray-100 overflow-y-auto"> 
       {/* Dashboard Header */}
       {/* Header is now handled by the shared component */}
       {/* Dashboard Content Area - Using Shared Table */}
       <div className="flex-1 p-4 overflow-y-auto"> 
          <DashboardSummaryTable
            userGoals={userGoals}
            dailyTotals={dailyTotals}
            loading={loadingDashboardData}
            error={dashboardError}
            refreshing={refreshingDashboard}
            onRefresh={() => fetchDashboardData(true)}
          />
       </div>
    </div>
  );

  // --- CLEANED UP FINAL RENDER --- 
  // Removed sidebar, header, and outer container div.
  // Render ONLY the layout component, passing the panels.
  return (
    <DashboardShell headerTitle="Chat">
      <div className="flex h-[calc(100vh-56px)]"> {/* Full viewport minus header */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex-1 min-h-0 overflow-y-auto"> {/* Only chat panel scrolls */}
            {chatPanelContent}
          </div>
        </div>
        <div className="flex-shrink-0 h-full flex flex-col border-l border-gray-200 bg-gray-100"> {/* Summary always visible */}
          {dashboardPanelContent}
        </div>
      </div>
    </DashboardShell>
  );
} 