'use client'; // Chat needs client-side interaction

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext'; // To check user auth status
import { TypingIndicator } from '@/components/LoadingIndicators'; // Import the indicator
import Link from 'next/link';
import ChatDashboardLayout from '@/components/ChatDashboardLayout'; // Import the new layout
import DashboardShell from '@/components/DashboardShell';
import DashboardSummaryTable from '@/components/DashboardSummaryTable';
import ChatMessageList from '@/components/ChatMessageList';

// Force dynamic rendering to bypass cache
export const dynamic = 'force-dynamic';

// Interface for chat messages
interface ChatMessage {
  id: string | number; // Updated to handle UUIDs
  sender: 'user' | 'bot' | 'assistant' | 'error';
  text: string;
  metadata?: any;
  message_type?: string;
  flagged?: boolean;
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
  id: string;
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
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);

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

  // --- Dashboard State ---
  const [userGoals, setUserGoals] = useState<UserGoal[]>([]);
  const [dailyTotals, setDailyTotals] = useState<DailyTotals>({});
  const [recentLogs, setRecentLogs] = useState<FoodLog[]>([]); // Only need totals for the combined view? Adjust later if needed.
  const [loadingDashboardData, setLoadingDashboardData] = useState(true);
  const [refreshingDashboard, setRefreshingDashboard] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  // Fetch initial messages when activeChatId changes
  useEffect(() => {
    const fetchInitialMessages = async () => {
      if (!activeChatId || !supabase) {
        setChatHistory([]); // Clear messages if no active chat
        return;
      }

      console.log(`Fetching initial messages for chat ID: ${activeChatId}`); // Debug log

      try {
        // Set loading state if needed
        const { data, error: dbError } = await supabase
          .from('chat_messages') 
          .select('id, role, content, metadata, message_type, flagged, created_at')
          .eq('session_id', activeChatId)
          .order('created_at', { ascending: true });

        if (dbError) {
          throw dbError;
        }

        // Transform data to ChatMessage interface
        const formattedMessages: ChatMessage[] = data?.map((msg: any) => {
          return {
            id: msg.id,
            sender: msg.role === 'assistant' ? 'bot' : msg.role,
            text: msg.content,
            metadata: msg.metadata,
            message_type: msg.message_type,
            flagged: msg.flagged || false
          };
        }) || [];

        console.log('Formatted messages:', formattedMessages);
        setChatHistory(formattedMessages);

      } catch (err: any) {
        console.error('Error fetching initial chat messages:', err);
        setChatHistory([]); // Clear messages on error
        // Optionally set an error state to display to the user
      } finally {
        // Set loading state to false if needed
      }
    };

    fetchInitialMessages();
  }, [activeChatId, supabase]);

  // --- Fetch chat sessions on load ---
  const fetchChatSessions = useCallback(async () => {
    if (!user || !supabase) return;
    setLoadingChats(true);
    supabase
      .from('chat_sessions')
      .select('id, title, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) {
          setChatSessions(data);
          if (data.length > 0 && !activeChatId) {
            setActiveChatId(data[0].id);
          }
        }
        setLoadingChats(false);
      });
  }, [user, supabase, activeChatId]);

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
    setRefreshingDashboard(true);
    setDashboardError(null);

    const today = new Date();
    const dateString = formatDate(today);
    // Use the date part for filtering
    const startOfDay = `${dateString}T00:00:00.000Z`;
    const endOfDay = `${dateString}T23:59:59.999Z`;

    try {
        console.log(`[ChatPage] fetchDashboardData called. Force refresh: ${forceRefresh}`); 
        const [goalsResponse, logsResponse] = await Promise.all([
            supabase
                .from('user_goals')
                .select('calories, protein_g, carbs_g, fat_total_g, fiber_g, sugar_g, sodium_mg')
                .eq('user_id', user.id)
                .maybeSingle(),
            supabase
                .from('food_log')
                .select('*')
                .eq('user_id', user.id)
                .gte('log_time', startOfDay)
                .lte('log_time', endOfDay)
                .order('log_time', { ascending: false })
        ]);

        if (goalsResponse.error) throw goalsResponse.error;
        if (logsResponse.error) throw logsResponse.error;

        const goals = goalsResponse.data;
        const fetchedLogs = logsResponse.data || [];

        // Transform goals to UserGoal[] for the table
        const formattedGoals: UserGoal[] = [];
        if (goals) {
          Object.entries(goals).forEach(([nutrient, target]) => {
            if (nutrient !== 'user_id' && nutrient !== 'id' && typeof target === 'number') {
              formattedGoals.push({
                nutrient,
                target_value: target,
                unit: nutrient.endsWith('_mg') ? 'mg' : (nutrient.endsWith('_g') ? 'g' : 'kcal'),
                goal_type: 'target'
              });
            }
          });
        }
        
        setUserGoals(formattedGoals);
        setRecentLogs(fetchedLogs.slice(0, 5));

        const totals: DailyTotals = {};
        fetchedLogs.forEach(log => {
          Object.keys(log).forEach(key => {
            if (typeof log[key] === 'number') {
              totals[key] = (totals[key] || 0) + (log[key] as number);
            }
          });
        });
        
        setDailyTotals(totals);

    } catch (err: unknown) {
        console.error("Error fetching dashboard data for chat view:", err);
        const errorMessage = err instanceof Error ? err.message : String(err);
        setDashboardError(`Failed to load dashboard data: ${errorMessage}`);
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
  const processBotReply = (responseData: any): ChatMessage => {
    const replyText = responseData.message || 'Sorry, I received an empty response.';
    const senderType = responseData.status === 'error' ? 'error' : 'bot';

    return {
        id: `bot-${Date.now()}`,
        sender: senderType,
        text: replyText,
        metadata: responseData.data,
        message_type: responseData.response_type,
    };
  };

  // --- Mobile Menu Logic (Copied from Profile/Dashboard) ---
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
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
    const title = `Chat ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;
    const { data, error } = await supabase
      .from('chat_sessions')
      .insert([{ user_id: user.id, title }])
      .select('id, title, updated_at')
      .single();
    if (!error && data) {
      setChatSessions((prev) => [data, ...prev]);
      setActiveChatId(data.id);
      setChatHistory([]);
      setMessage('');
    }
  };

  // --- Switch chat ---
  const handleSelectChat = (chatId: string) => {
    setActiveChatId(chatId);
    setMessage('');
  };

  // --- Send message (user) ---
  const handleSend = async (e?: React.FormEvent<HTMLFormElement>, actionPayload?: string) => {
    if (e) e.preventDefault();
    const textToSend = actionPayload || message.trim();
    if (!textToSend || sending || authLoading || !activeChatId) return;

    setSending(true);
    const userMessage: ChatMessage = { id: Date.now(), sender: 'user', text: textToSend, message: textToSend };

    // Immediately add user message to local state for optimistic update
    setChatHistory(prev => [...prev, userMessage]);

    setMessage(''); // Clear input

    try {
        const { data: response, error: funcError } = await supabase.functions.invoke('chat-handler', {
          body: { 
            message: textToSend,
            session_id: activeChatId 
          }
        });

        if (funcError) throw funcError;

        // Process actual reply and add bot message to local state
        const botMessage = processBotReply(response);
        setChatHistory(prev => [...prev, botMessage]);

        // Trigger dashboard refresh if food was logged
        if (response.response_type === 'food_logged') {
          console.log('[ChatPage] Food logged successfully, refreshing dashboard data...');
          fetchDashboardData(true);
        }

    } catch (error: any) {
      console.error('Error sending message:', error);
      const errorMessage: ChatMessage = {
        id: Date.now() + 2,
        sender: 'error',
        text: `Error: ${error.message}`,
        message: `Error: ${error.message}`, // Also include original message for compatibility
      };
      // Add error message to local state
      setChatHistory(prev => [...prev, errorMessage]);
    } finally {
      setSending(false);
      // No longer need refresh trigger
      // setRefreshTrigger(prev => prev + 1);
    }
  };

  // Handle flagging a message
  const handleFlagMessage = async (messageId: number) => {
    if (!session || !activeChatId) return;
    
    try {
      // Find the message in the local state
      const messageIndex = chatHistory.findIndex(msg => msg.id === messageId);
      if (messageIndex === -1) return;
      
      // Optimistically update the UI
      const updatedMessages = [...chatHistory];
      const newFlaggedState = !updatedMessages[messageIndex].flagged;
      updatedMessages[messageIndex] = {
        ...updatedMessages[messageIndex],
        flagged: newFlaggedState
      };
      setChatHistory(updatedMessages);
      
      // BACKEND DISCONNECTED: Flag message API has been removed during rehaul
      // TODO: Implement new backend architecture
      console.log('[ChatPage] Backend disconnected - flag message API not available');
      // Keep the optimistic update for now (UI only)
    } catch (error) {
      console.error('Error flagging message:', error);
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
        {/* Pass chatHistory directly */}
        <ChatMessageList 
          activeChatId={activeChatId} 
          messages={chatHistory} 
          onFlagMessage={handleFlagMessage}
        /> 
        
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
              className="flex-1 px-4 py-2 border border-gray-300 rounded-full text-black placeholder-black focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
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
       <div className="flex-1 p-4 bg-gray-50"> {/* Removed overflow-y-auto */}
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