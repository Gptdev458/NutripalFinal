'use client';

import React, { useEffect, useRef } from 'react';
import { TypingIndicator } from '@/components/LoadingIndicators';
import ReactMarkdown from 'react-markdown';

// Interface for chat messages (keep or import from shared types)
interface ChatMessage {
  id: number;
  sender: 'user' | 'bot' | 'ai' | 'error';
  text?: string;
  message?: string;
  actions?: Array<{ label: string; payload: string }>;
  flagged?: boolean;
}

interface ChatMessageListProps {
  activeChatId: string | null;
  messages: ChatMessage[]; // <-- Accept messages array as prop
  onFlagMessage?: (messageId: number) => void;
}

const ChatMessageList: React.FC<ChatMessageListProps> = ({ activeChatId, messages, onFlagMessage }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom of messages when new ones are added
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
      {messages.map((msg) => {
        // Treat both 'bot' and 'ai' sender types the same way
        const isBotMessage = msg.sender === 'bot' || msg.sender === 'ai';
        const messageContent = (msg.text || msg.message || '').trim();
        const isEmpty = messageContent === '';
        
        return (
          <div
            key={msg.id} // Use message id from prop
            className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'} group relative`}
          >
            <div
              className={`max-w-xs md:max-w-md lg:max-w-lg px-4 py-2 rounded-lg shadow relative ${
                msg.sender === 'user'
                  ? 'bg-blue-500 text-white'
                  : msg.sender === 'error'
                  ? 'bg-red-100 text-red-700'
                  : isEmpty ? 'bg-orange-50 text-orange-800 border border-orange-200' 
                  : 'bg-white text-gray-900 border border-gray-200'
              } ${msg.flagged ? 'border-2 border-red-300' : ''}`}
            >
              {/* Flag/Report Button - positioned in top right of message */}
              {onFlagMessage && isBotMessage && (
                <button
                  onClick={() => onFlagMessage(msg.id)}
                  className={`absolute top-1 right-1 ${
                    msg.flagged ? 'text-red-500' : 'text-gray-400'
                  } opacity-0 group-hover:opacity-100 hover:text-red-500 transition-opacity duration-200`}
                  aria-label={msg.flagged ? "Unflag message" : "Flag message for review"}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
                  </svg>
                </button>
              )}
              
              {/* Message Text Content */}
              <div className={`break-words whitespace-pre-line ${isBotMessage ? 'prose prose-sm max-w-none' : ''}`}>
                {/* For bot/AI messages, render markdown. For user or error messages, just the text */}
                {isEmpty && isBotMessage ? (
                  <span className="italic text-orange-700 text-sm font-medium">
                    (Empty message)
                  </span>
                ) : isBotMessage ? (
                  <div className="text-gray-900 font-medium">
                    <ReactMarkdown>
                      {messageContent}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <span className={msg.sender === 'user' ? 'text-white font-medium' : 'text-gray-900 font-medium'}>
                    {messageContent}
                  </span>
                )}
              </div>
              
              {/* Render action buttons if available */}
              {msg.actions && msg.actions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {msg.actions.map((action, index) => (
                    <button
                      key={index}
                      className="px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded text-sm text-gray-800 transition-colors"
                      onClick={() => {
                        // You need to handle action button clicks here
                        // This depends on how your app manages actions
                        console.log('Action clicked:', action);
                      }}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
      <div ref={messagesEndRef} />
    </div>
  );
};

export default ChatMessageList; 