'use client'; // Chat needs client-side interaction

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext'; // To check user auth status
import { TypingIndicator } from '@/components/LoadingIndicators'; // Import the indicator
import Link from 'next/link';

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

export default function ChatPage() {
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

  // == Mobile Menu Logic (Copied from Profile) ==
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
    if (!message.trim() || sending) return; // Removed supabase check as using fetch

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
      if (!session?.access_token) { 
           throw new Error('Authentication token not available.');
      }
      const functionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ai-handler-v2`;
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!functionUrl || !anonKey) {
         throw new Error('Supabase URL or Anon Key missing in environment variables. Check .env.local');
      }
      const accessToken = session.access_token;
      
      // Construct request body including context/pending action if they exist
      const requestBody: Record<string, unknown> = {
          message: messageToSend,
          conversation_history: historyForBackend
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

  // == Render Loading / Auth Check ==
  if (authLoading) {
    return <div className="flex min-h-screen items-center justify-center"><p>Loading chat...</p></div>;
  }
  if (!user) {
     // Middleware should handle this, but good fallback
    return <div className="flex min-h-screen items-center justify-center"><p>Please log in to use the chat.</p></div>;
  }

  // == Render Chat UI ==
  return (
    <div className="flex h-screen bg-white relative overflow-hidden"> {/* Changed bg-gray-50 to bg-white */}
      {/* Sidebar navigation (Standard) */}
       <div className={`sidebar fixed top-0 left-0 h-full w-64 bg-white shadow-lg z-50 transform transition-transform duration-300 ease-in-out ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}> 
          <div className="p-4 border-b border-gray-200 flex justify-between items-center"><h2 className="text-xl font-semibold text-gray-800">NutriPal</h2><button onClick={() => setMenuOpen(false)} className="p-2 rounded-md text-gray-600 hover:bg-gray-100"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button></div>
          <nav className="flex-1 p-4 space-y-1">
            {/* Inactive */} 
            <Link href="/dashboard" className="block px-3 py-2 text-gray-600 rounded-md hover:bg-gray-100 font-medium">Dashboard</Link>
            <Link href="/profile" className="block px-3 py-2 text-gray-600 rounded-md hover:bg-gray-100">Profile</Link>
            <Link href="/analytics" className="block px-3 py-2 text-gray-600 rounded-md hover:bg-gray-100">Analytics</Link>
            <Link href="/recipes" className="block px-3 py-2 text-gray-600 rounded-md hover:bg-gray-100">Saved Recipes</Link>
            {/* Active: Chat */}
            <Link href="/chat" className="block px-3 py-2 bg-blue-50 text-blue-700 rounded-md font-medium">Chat</Link>
            <Link href="/settings" className="block px-3 py-2 text-gray-600 rounded-md hover:bg-gray-100">Settings</Link>
          </nav>
       </div>

      {/* Main content area */} 
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header with hamburger (REMOVED md:hidden) */}
        <header className="bg-white border-b border-gray-200 p-4 z-10 flex-shrink-0"> {/* Added border-b */}
           <div className="flex items-center justify-between">
            {/* Hamburger Button ALWAYS visible */}
            <button className="menu-button p-2 rounded-md text-gray-600 hover:bg-gray-100" onClick={() => setMenuOpen(true)}>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <h2 className="text-xl font-semibold text-gray-800">Chat</h2>
            <div className="w-8"></div> { /* Balance */}
          </div>
        </header>

        {/* Chat Interface */}
        <main className="flex-1 flex flex-col overflow-hidden"> {/* REMOVED p-4 */}
          {/* NEW: Centered content container */} 
          <div className="w-full max-w-3xl mx-auto flex flex-col flex-1 overflow-hidden">
            {/* Message Display Area - kept p-4 */}
            <div className="flex-1 overflow-y-auto p-4 bg-white space-y-4">
              {chatHistory.length === 0 && !sending ? (
                 <p className="text-gray-500 text-center italic">Chat history will appear here...</p>
              ) : (
                 chatHistory.map((msg) => (
                   <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                     <span className={`inline-block rounded-lg px-4 py-2 max-w-[75%] ${ 
                         msg.sender === 'user' ? 'bg-blue-500 text-white' :
                         msg.sender === 'bot' ? 'bg-gray-200 text-gray-800' :
                         'bg-red-100 text-red-700 border border-red-300' // Error style
                       }`}
                     >
                       <p className="text-sm md:text-base whitespace-pre-wrap">{msg.text}</p>
                     </span>
                     {/* Render Action Buttons If Available */} 
                     {msg.sender === 'bot' && msg.actions && msg.actions.length > 0 && (
                       <div className="flex justify-start pl-2 pt-2 space-x-2">
                         {msg.actions.map((action, index) => (
                           <button
                             key={index}
                             onClick={() => handleActionClick(action.payload, msg.id)}
                             disabled={sending} // Disable buttons while waiting for response
                             className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm hover:bg-blue-200 disabled:opacity-50 disabled:cursor-not-allowed"
                           >
                             {action.label}
                           </button>
                         ))}
                       </div>
                     )}
                   </div>
                 ))
              )}
              {/* Show TypingIndicator when sending state is true */} 
              {sending && (
                <div className="flex justify-start pl-2 pt-2"> {/* Align left like bot message */} 
                   <TypingIndicator />
                 </div>
               )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area - kept p-4 */}
            <div className="border-t border-gray-200 bg-white p-4 flex-shrink-0">
              <form onSubmit={handleSend} className="flex items-center gap-2"> {/* Removed max-w-3xl mx-auto */}
                 <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Type your message..."
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-full focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-900"
                  disabled={sending}
                />
                <button
                  type="submit"
                  className="p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
                  disabled={sending || !message.trim()}
                >
                   {/* ... button content ... */}
                    { sending ? (
                       <svg className="animate-spin h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                   ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                   )}
                </button>
              </form>
            </div>
          </div> {/* End of Centered content container */}
        </main>
      </div>
    </div>
  );
} 