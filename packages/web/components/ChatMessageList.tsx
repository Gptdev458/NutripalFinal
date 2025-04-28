'use client';

import React, { useEffect, useRef } from 'react';
import { TypingIndicator } from '@/components/LoadingIndicators';

// Interface for chat messages (keep or import from shared types)
interface ChatMessage {
  id: number;
  sender: 'user' | 'bot' | 'error';
  text: string;
  actions?: Array<{ label: string; payload: string }>;
}

interface ChatMessageListProps {
  activeChatId: string | null;
  messages: ChatMessage[]; // <-- Accept messages array as prop
}

const ChatMessageList: React.FC<ChatMessageListProps> = ({ activeChatId, messages }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when messages prop changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]); // Dependency is now the messages prop

  // Render logic now uses the messages prop directly
  return (
    <div className="flex-1 overflow-y-auto p-4 bg-gray-50 space-y-4">
      {messages.length === 0 && activeChatId && (
          <div className="text-center text-gray-500 pt-10">
            Start the conversation! Send your first message.
          </div>
      )}
      {messages.length === 0 && !activeChatId && (
           <div className="text-center text-gray-500 pt-10">
               Select a chat or start a new one.
           </div>
       )}
      {messages.map((msg) => (
        <div
          key={msg.id} // Use message id from prop
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
            {msg.actions && msg.actions.length > 0 && (
               <div className="mt-2 pt-2 border-t border-gray-300/50 flex flex-wrap gap-2">
                 {msg.actions.map((action, index) => (
                   <button
                     key={index}
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