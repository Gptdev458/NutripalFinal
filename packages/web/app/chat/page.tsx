'use client'; // Chat needs client-side interaction

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext'; // To check user auth status
import { TypingIndicator } from '@/components/LoadingIndicators'; // Import the indicator
import Link from 'next/link';
import ChatDashboardLayout from '@/components/ChatDashboardLayout'; // Import the new layout
import DashboardShell from '@/components/DashboardShell';
import DashboardSummaryTable from '@/components/DashboardSummaryTable';
import ChatMessageList from '@/components/ChatMessageList'; // <-- Import the new component

// Interface for chat messages
interface ChatMessage {
  id: number; // Simple ID for key prop
  sender: 'user' | 'bot' | 'error';
  text: string;
  actions?: Array<{ label: string; payload: string }>; // Optional actions for bot messages
}

// --- ADDED: Interface for UI Action State ---
interface UiActionState {
  actionType: string;
  payload: any;
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

interface ChatSessionMeta {
  chat_id: string;
  title: string;
  updated_at: string;
}

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
  const [chatSessions, setChatSessions] = useState<ChatSessionMeta[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [loadingChats, setLoadingChats] = useState(false);
  // Use more specific types instead of any
  const [pendingAction, setPendingAction] = useState<Record<string, unknown> | null>(null);
  const [contextForNextRequest, setContextForNextRequest] = useState<Record<string, unknown> | null>(null);

  // Persist activeChatId to localStorage whenever it changes
  useEffect(() => {
    if (activeChatId) {
      localStorage.setItem('activeChatId', activeChatId);
    }
  }, [activeChatId]);

  // On mount, restore activeChatId from localStorage if available
  useEffect(() => {
    if (!activeChatId) {
      const savedChatId = localStorage.getItem('activeChatId');
      if (savedChatId) {
        setActiveChatId(savedChatId);
      }
    }
  }, []);

  // Use a unique storageKey for each user and chat session
  const storageKey = user && activeChatId ? `chatHistory_${user.id}_${activeChatId}` : user ? `chatHistory_${user.id}` : 'chatHistory_guest';

  // --- ADDED: State for UI Actions from Markers ---
  const [currentUiAction, setCurrentUiAction] = useState<UiActionState | null>(null);

  // --- Dashboard State ---
  const [userGoals, setUserGoals] = useState<UserGoal[]>([]);
  const [dailyTotals, setDailyTotals] = useState<DailyTotals>({});
  const [recentLogs, setRecentLogs] = useState<FoodLog[]>([]); // Only need totals for the combined view? Adjust later if needed.
  const [loadingDashboardData, setLoadingDashboardData] = useState(true);
  const [refreshingDashboard, setRefreshingDashboard] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  // --- Fetch chat sessions on load ---
  const fetchChatSessions = useCallback(async () => {
    if (!user || !supabase) return;
    setLoadingChats(true);
    supabase
      .from('chat_sessions')
      .select('chat_id, title, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) {
          setChatSessions(data);
          if (data.length > 0 && !activeChatId) {
            setActiveChatId(data[0].chat_id);
          }
        }
        setLoadingChats(false);
      });
  }, [user, supabase]);

  // --- Keep useEffect for fetching chat sessions --- 
  useEffect(() => {
    if (user && supabase) {
      fetchChatSessions();
    }
  }, [user, supabase, fetchChatSessions]);

  // --- Fetch dashboard data ---
  const fetchDashboardData = useCallback(async (forceRefresh = false) => {
    if (!user || !supabase) {
        setLoadingDashboardData(false);
        setRefreshingDashboard(false);
        return;
    }
    if (!forceRefresh) setLoadingDashboardData(true);
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

  // --- Keep useEffect for fetching dashboard data ---
  useEffect(() => {
    if (user && supabase) {
      fetchDashboardData();
    }
  }, [user, supabase, fetchDashboardData]);

  // --- Process Bot Reply ---
  const processBotReply = (responseData: Record<string, unknown>): ChatMessage => {
    let replyText = (responseData.message as string) || 'Sorry, I received an empty response.';
    const responseType = responseData.response_type;

    // --- ADDED: Marker Processing --- 
    const markerRegex = /\s*\[UI_ACTION:([A-Z_]+):(.+)\]$/;
    console.log("Checking for UI_ACTION marker in:", replyText); // <-- Log 1: Check message
    const match = replyText.match(markerRegex);

    if (match) {
        console.log("UI_ACTION Marker FOUND!"); // <-- Log 2: Confirm match
        const actionType = match[1];
        const payloadString = match[2];
        console.log(`Extracted ActionType: ${actionType}, PayloadString: ${payloadString}`); // <-- Log 3: Show extracted parts
        const cleanedMessage = replyText.replace(markerRegex, '').trim(); // Remove marker for display
        replyText = cleanedMessage; // Update replyText to be the cleaned version

        try {
            const payload = JSON.parse(payloadString);
            console.log("Parsed Payload:", payload); // <-- Log 4: Show parsed payload
            console.log("Setting currentUiAction state..."); // <-- Log 5: Confirm state set attempt
            setCurrentUiAction({ actionType, payload });
            // Create the message object with the cleaned text
            const botMessage: ChatMessage = { 
                id: Date.now() + 1, 
                sender: 'bot', 
                text: replyText 
            };
            console.log("Returning bot message after setting UI action."); // <-- Log 6: Confirm early return
            return botMessage; // Return immediately after setting UI action state
        } catch (e) {
            console.error('Failed to parse UI_ACTION payload:', e, payloadString); // <-- Log Error
            // If parsing fails, fall through to display the original message (including the marker)
        }
    } else {
        console.log("No UI_ACTION marker found."); // <-- Log 7: Confirm no match
    }
    // --- End Marker Processing ---

    // Original context/action handling (can be removed/refactored if markers cover all cases)
    setPendingAction(null);
    setContextForNextRequest(null);

    const botMessage: ChatMessage = { 
        id: Date.now() + 1, 
        sender: 'bot', 
        text: replyText 
    };

    // Keep existing specific handling for now as fallback or transition 
    // (Ideally, backend markers should handle these)
    if (responseType === 'recipe_analysis_prompt' && responseData.pending_action) {
        console.log("Setting pending action based on recipe_analysis_prompt");
        const action = responseData.pending_action;
        setPendingAction(action && typeof action === 'object' ? action as Record<string, unknown> : null);
        if (!botMessage.actions) { 
            botMessage.actions = [
                { label: 'Save & Log', payload: 'User selects Save & Log' },
                { label: 'Log Only', payload: 'User selects Log Only' },
                { label: 'Cancel', payload: 'User selects Cancel' },
            ];
        }
    } else if ((responseType === 'saved_recipe_confirmation_prompt' /* || responseType === 'saved_recipe_proactive_confirm' */) && responseData.context_for_reply) {
         // This might be superseded by the CONFIRM_LOG_SAVED_RECIPE marker 
        console.warn("Legacy context handling for saved_recipe_confirmation_prompt triggered. Should markers handle this?");
        const context = responseData.context_for_reply;
        setContextForNextRequest(context && typeof context === 'object' ? context as Record<string, unknown> : null);
        // ... (button adding logic, potentially removable if markers work) ...
    } else if (responseType === 'clarification_needed_recipe' && responseData.context_for_reply) {
         console.warn("Legacy context handling for clarification_needed_recipe triggered. Should markers handle this?");
         // ... (context/button logic, potentially removable) ...
    } else if ((responseType === 'saved_recipe_found_multiple' /* || responseType === 'saved_recipe_proactive_multiple' */) && responseData.context_for_reply) {
          console.warn("Legacy context handling for saved_recipe_found_multiple triggered. Should markers handle this?");
          // ... (context/button logic, potentially removable) ...
    } else if (responseType === 'clarification_needed_typo' && responseData.context_for_reply) {
         // This should be handled by the CONFIRM_TYPO marker now.
         console.warn("Legacy context handling for clarification_needed_typo triggered. Should CONFIRM_TYPO marker handle this?");
        // ... (context/button logic, potentially removable) ...
    }

    return botMessage;
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

  // --- Create new chat session ---
  const handleNewChat = async () => {
    if (!user || !supabase) return;
    const now = new Date();
    const title = now.toLocaleString();
    const { data, error } = await supabase
      .from('chat_sessions')
      .insert([{ user_id: user.id, title }])
      .select('chat_id, title, updated_at')
      .single();
    if (!error && data) {
      setChatSessions((prev) => [data, ...prev]);
      setActiveChatId(data.chat_id);
      setMessage('');
      setPendingAction(null);
      setContextForNextRequest(null);
    }
  };

  // --- Switch chat ---
  const handleSelectChat = (chatId: string) => {
    setActiveChatId(chatId);
    setMessage('');
    setPendingAction(null);
    setContextForNextRequest(null);
  };

  // --- Send message (user) ---
  const handleSend = async (e?: React.FormEvent<HTMLFormElement>, actionPayload?: string) => {
    if (e) e.preventDefault();
    const textToSend = actionPayload || message.trim();
    if (!textToSend || sending || authLoading || !activeChatId) return;

    setSending(true);
    const userMessage: ChatMessage = { id: Date.now(), sender: 'user', text: textToSend };

    // --- OPTION A: Update ChatMessageList via re-render --- 
    // (Simplest) ChatMessageList will re-fetch when activeChatId changes (or manually trigger?) - Less ideal for immediate display
    
    // --- OPTION B: Pass a function to add message to ChatMessageList (More Complex Setup) ---
    // Example: Pass `addMessageToDisplay` prop to ChatMessageList
    // addMessageToDisplay(userMessage);

    // --- OPTION C: Assume ChatMessageList might not show user message immediately, 
    //             but backend will store it and it shows on next fetch. (Current approach - simplest)

    setMessage(''); // Clear input

    try {
        const response = await fetch('/api/chat', { // Assuming API route exists
             method: 'POST',
             headers: {
                 'Content-Type': 'application/json',
                 Authorization: `Bearer ${session?.access_token}`,
             },
             body: JSON.stringify({ 
                 message: textToSend,
                 chat_id: activeChatId,
                 context: contextForNextRequest, // Send current context
                 pending_action: pendingAction, // Send pending action
              }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'Failed to parse error response.' }));
            throw new Error(errorData.message || `Network response was not ok (${response.status})`);
        }

        const data = await response.json();

        // Process reply and update context/pending state
        const botMessage = processBotReply(data);
        setContextForNextRequest(data.context || null); // Update context for next request
        setPendingAction(data.pending_action || null); // Update pending action

        // --- Here you need to update the list in ChatMessageList --- 
        // Simplest way is just let ChatMessageList re-fetch/handle its own updates
        // If you need immediate updates, need Option B (pass down function)

         // If dashboard data might change (e.g., food logged), refresh it
         if (data.response_type?.includes('log')) {
             fetchDashboardData(true); // Force refresh
         }

    } catch (error: any) {
      console.error('Error sending message:', error);
      const errorMessage: ChatMessage = {
        id: Date.now() + 2,
        sender: 'error',
        text: `Error: ${error.message}`,
      };
      // Update ChatMessageList (Option B or C)
    } finally {
      setSending(false);
    }
  };

  // Auth Loading State
  if (authLoading) {
    return <div className="flex justify-center items-center h-screen"><TypingIndicator /></div>;
  }

  // Not Logged In State
  if (!user || !session) {
    return (
      <div className="flex flex-col justify-center items-center h-screen bg-gray-100">
        <h1 className="text-2xl font-semibold mb-4">Welcome to NutriPal</h1>
        <p className="mb-6 text-gray-600">Please log in to access your chat and dashboard.</p>
        <Link href="/login" legacyBehavior>
          <a className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">
            Log In
          </a>
        </Link>
      </div>
    );
  }

  // --- Construct Panels for Layout ---
  const chatPanelContent = (
      <div className="flex-1 flex flex-col h-full bg-gray-100 overflow-hidden"> {/* Ensure vertical flex and hide overflow */}
        {/* Message Display Area - Use the new component */}
        <ChatMessageList activeChatId={activeChatId} />
        
        {/* Typing Indicator */}
        {sending && (
          <div className="px-4 py-2 flex items-center justify-start">
            <TypingIndicator />
          </div>
        )}

        {/* Input Area */}
        <div className="p-4 bg-white border-t border-gray-200 flex-shrink-0"> {/* Prevent input from shrinking */}
          <form onSubmit={handleSend} className="flex items-center space-x-3">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={sending ? "Waiting for response..." : "Type your message..."}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
              disabled={sending || !activeChatId}
              aria-label="Chat message input"
            />
            <button
              type="submit"
              disabled={sending || !message.trim() || !activeChatId}
              className="px-5 py-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
              aria-label="Send message"
            >
              Send
            </button>
          </form>
        </div>
      </div>
  );

  const dashboardPanelContent = (
       <div className="flex-1 p-4 overflow-y-auto bg-gray-50"> {/* Scrollable dashboard content area */}
         <DashboardSummaryTable
           userGoals={userGoals}
           dailyTotals={dailyTotals}
           loading={loadingDashboardData}
           error={dashboardError}
           refreshing={refreshingDashboard}
           onRefresh={() => fetchDashboardData(true)}
         />
       </div>
  );

  // --- Main Render --- 
  return (
      // Use DashboardShell for overall page structure (header, sidebar)
      <DashboardShell
          headerTitle="Chat & Dashboard"
          chatSessions={chatSessions}
          activeChatId={activeChatId || undefined}
          onSelectChat={handleSelectChat}
          onNewChat={handleNewChat}
      >
          {/* Pass the constructed panels to the ChatDashboardLayout */}
          <ChatDashboardLayout
              chatPanel={chatPanelContent}
              dashboardPanel={dashboardPanelContent}
          />
      </DashboardShell>
  );
} 