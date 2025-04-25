'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext'; // Assuming this provides Supabase client
import { TypingIndicator } from '@/components/LoadingIndicators'; // Reuse existing indicator

// Re-define interface if not shared from a common types file
interface ChatMessage {
  id: number; // Simple ID for key prop
  sender: 'user' | 'bot' | 'error';
  text: string;
  actions?: Array<{ label: string; payload: string }>; // Optional actions for bot messages
}

interface ChatMessageListProps {
  activeChatId: string | null;
  initialMessages?: ChatMessage[]; // Optional: Pass initial messages loaded by parent
}

const ChatMessageList: React.FC<ChatMessageListProps> = ({ activeChatId, initialMessages = [] }) => {
  const { supabase, session } = useAuth(); // Get Supabase client
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null); // Ref for scrolling

  useEffect(() => {
    const fetchMessages = async () => {
      if (!activeChatId || !supabase) {
        setMessages([]); // Clear messages if no active chat
        return;
      }

      setLoading(true);
      setError(null);
      console.log(`Fetching messages for chat ID: ${activeChatId}`); // Debug log

      try {
        const { data, error: dbError } = await supabase
          .from('chat_messages') // Ensure this table name is correct
          .select('id, sender, message, created_at') // Select necessary fields
          .eq('chat_id', activeChatId)
          .order('created_at', { ascending: true }); // Order by creation time

        if (dbError) {
          throw dbError;
        }

        // Transform data to ChatMessage interface
        const formattedMessages: ChatMessage[] = data?.map((msg: any, index: number) => ({
           // Use db id if available and unique, otherwise generate fallback key
          id: msg.id ?? `msg-${activeChatId}-${index}-${Date.now()}`, 
          sender: msg.sender, // Assuming sender is 'user' or 'bot'
          text: msg.message,
          // Add actions processing here if needed based on message content/metadata
        })) || [];

        setMessages(formattedMessages);

      } catch (err: any) {
        console.error('Error fetching chat messages:', err);
        setError(`Failed to load messages: ${err.message}`);
        setMessages([]); // Clear messages on error
      } finally {
        setLoading(false);
      }
    };

    fetchMessages();

    // Optional: Set up real-time subscription if needed
    // const channel = supabase.channel(`chat_${activeChatId}`)
    //   .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `chat_id=eq.${activeChatId}` }, payload => {
    //     console.log('New message received:', payload);
    //     // Append new message to state
    //     const newMessage: ChatMessage = { /* format payload.new */ };
    //     setMessages(currentMessages => [...currentMessages, newMessage]);
    //   })
    //   .subscribe();

    // return () => {
    //   supabase.removeChannel(channel);
    // };

  }, [activeChatId, supabase]); // Re-fetch when activeChatId or supabase client changes

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);


  // Render logic (reuse styling from the original page.tsx)
  return (
    <div className="flex-1 overflow-y-auto p-4 bg-gray-50 space-y-4">
      {loading && (
         <div className="flex justify-center items-center h-full">
            <TypingIndicator /> {/* Or another loading indicator */}
         </div>
       )}
       {error && (
         <div className="text-center text-red-600 bg-red-100 p-3 rounded-md">
            <p>Error loading messages:</p>
            <p className="text-sm">{error}</p>
          </div>
        )}
      {!loading && !error && messages.length === 0 && activeChatId && (
          <div className="text-center text-gray-500 pt-10">
            Start the conversation! Send your first message.
          </div>
      )}
       {!loading && !error && messages.length === 0 && !activeChatId && (
           <div className="text-center text-gray-500 pt-10">
               Select a chat or start a new one.
           </div>
       )}
      {!loading && messages.map((msg) => (
        <div
          key={msg.id}
          className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
        >
          <div
            className={`max-w-xs md:max-w-md lg:max-w-lg px-4 py-2 rounded-lg shadow ${
              msg.sender === 'user'
                ? 'bg-blue-500 text-white'
                : msg.sender === 'error'
                ? 'bg-red-100 text-red-700'
                : 'bg-white text-gray-800 border border-gray-200'
            }`}
          >
            <p className="whitespace-pre-wrap">{msg.text}</p>
            {/* Render actions if needed */}
             {msg.actions && msg.actions.length > 0 && (
               <div className="mt-2 pt-2 border-t border-gray-300/50 flex flex-wrap gap-2">
                 {msg.actions.map((action, index) => (
                   <button
                     key={index}
                     // onClick={() => handleActionClick(action.payload)} // Need to pass handler from parent
                     className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                   >
                     {action.label}
                   </button>
                 ))}
               </div>
             )}
          </div>
        </div>
      ))}
      <div ref={messagesEndRef} /> {/* Element to scroll to */}
    </div>
  );
};

export default ChatMessageList; 