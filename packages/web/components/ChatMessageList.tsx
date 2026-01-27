'use client';

import React, { useEffect, useRef } from 'react';
import { TypingIndicator } from '@/components/LoadingIndicators';
import ReactMarkdown from 'react-markdown';

// Interface for chat messages (keep or import from shared types)
interface ChatMessage {
  id: string | number;
  sender: 'user' | 'bot' | 'assistant' | 'error';
  text: string;
  metadata?: any;
  message_type?: string;
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
        // Treat both 'bot' and 'assistant' sender types the same way
        const isBotMessage = msg.sender === 'bot' || msg.sender === 'assistant';
        const messageContent = (msg.text || '').trim();
        const isEmpty = messageContent === '';
        
        return (
          <div
            key={msg.id} 
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
              {/* Flag/Report Button */}
              {onFlagMessage && isBotMessage && (
                <button
                  onClick={() => onFlagMessage(Number(msg.id))}
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
              
              {/* Structured Metadata Rendering */}
              {msg.metadata && isBotMessage && (
                <div className="mt-3 pt-2 border-t border-gray-100">
                  {msg.message_type === 'food_logged' && msg.metadata.nutrition && (
                    <div className="space-y-2">
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Nutrients Logged</p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                        {msg.metadata.nutrition.map((item: any, i: number) => (
                          <div key={i} className="col-span-2 pb-1 mb-1 border-b border-gray-50 last:border-0">
                            <div className="flex justify-between text-sm">
                              <span className="font-semibold">{item.food_name}</span>
                              <span className="text-blue-600">{item.calories} kcal</span>
                            </div>
                            <div className="flex gap-3 text-xs text-gray-500">
                              <span>P: {item.protein_g}g</span>
                              <span>C: {item.carbs_g}g</span>
                              <span>F: {item.fat_total_g}g</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {msg.message_type === 'nutrition_info' && msg.metadata.nutrition && (
                    <div className="space-y-2">
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Nutritional Info</p>
                      {msg.metadata.nutrition.map((item: any, i: number) => (
                        <div key={i} className="text-sm bg-blue-50 p-2 rounded">
                          <div className="flex justify-between font-bold">
                            <span>{item.food_name}</span>
                            <span>{item.calories} kcal</span>
                          </div>
                          <div className="grid grid-cols-3 gap-1 text-xs mt-1">
                            <div>Protein: {item.protein_g}g</div>
                            <div>Carbs: {item.carbs_g}g</div>
                            <div>Fat: {item.fat_total_g}g</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {msg.metadata.warnings && msg.metadata.warnings.length > 0 && (
                    <div className="mt-2 p-2 bg-yellow-50 rounded border border-yellow-100">
                      <p className="text-xs font-bold text-yellow-700 uppercase mb-1">Warnings</p>
                      {msg.metadata.warnings.map((w: string, i: number) => (
                        <p key={i} className="text-xs text-yellow-600">• {w}</p>
                      ))}
                    </div>
                  )}
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