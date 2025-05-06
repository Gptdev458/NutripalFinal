'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import ReactMarkdown from 'react-markdown';
import Link from 'next/link';
import { TypingIndicator } from '@/components/LoadingIndicators';

// Export this as dynamic for disabling cache
export const dynamic = 'force-dynamic';

// Define interfaces
interface User {
  id: string;
  email: string;
  last_sign_in_at?: string | null;
}

interface ChatSession {
  chat_id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface ChatMessage {
  id: number;
  chat_id: string;
  sender: 'user' | 'bot' | 'ai' | 'error';
  message: string;  // This is the actual field name in the database
  created_at: string;
  flagged: boolean;
}

export default function AdminPage() {
  const { user, supabase, loading: authLoading, session } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [userChats, setUserChats] = useState<ChatSession[]>([]);
  const [loadingChats, setLoadingChats] = useState(false);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [showOnlyFlagged, setShowOnlyFlagged] = useState(false);
  const [showDebugInfo, setShowDebugInfo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Password protection state
  const [password, setPassword] = useState('');
  const [passwordEntered, setPasswordEntered] = useState(false);
  const [passwordError, setPasswordError] = useState(false);
  
  // Handle password submission
  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === 'admin') {
      setPasswordEntered(true);
      setPasswordError(false);
      // Also save in sessionStorage so refresh doesn't require re-entering password
      sessionStorage.setItem('adminPasswordEntered', 'true');
    } else {
      setPasswordError(true);
    }
  };
  
  // Check if password was previously entered in this session
  useEffect(() => {
    const savedPasswordState = sessionStorage.getItem('adminPasswordEntered');
    if (savedPasswordState === 'true') {
      setPasswordEntered(true);
    }
  }, []);

  // Fetch list of users
  useEffect(() => {
    const fetchUsers = async () => {
      if (!supabase || !user || !passwordEntered) return;
      
      try {
        setLoadingUsers(true);
        setError(null);
        console.log("Starting to fetch users...");
        
        // Get list of users who have chat sessions
        const { data: uniqueUsers, error: usersError } = await supabase
          .from('chat_sessions')
          .select('user_id')
          .order('updated_at', { ascending: false });
        
        if (usersError) {
          console.error("Error fetching chat_sessions:", usersError);
          throw usersError;
        }
        
        console.log("Retrieved chat sessions:", uniqueUsers);
        
        // Deduplicate user IDs
        const uniqueUserIds = [...new Set(uniqueUsers.map(item => item.user_id))];
        console.log("Unique user IDs:", uniqueUserIds);
        
        // Fetch user details for each user ID from auth.users
        if (uniqueUserIds.length > 0) {
          // In Supabase, to query auth.users, we can use a function call or RPC
          // For simplicity, we'll just use the user IDs and show minimal info
          const usersList = uniqueUserIds.map(id => {
            // If this is the current user, use their email
            if (id === user.id) {
              return {
                id,
                email: `You (${user.email})`,
                last_sign_in_at: null as null
              };
            }
            // For other users, format ID in a readable way
            return {
              id,
              email: `User ${id.slice(0, 8)}...`,
              last_sign_in_at: null as null
            };
          });
          console.log("Created users list:", usersList);
          setUsers(usersList);
        } else {
          console.log("No users found with chat sessions");
          setUsers([]);
        }
      } catch (err: any) {
        console.error('Error fetching users:', err);
        setError(`Failed to load users: ${err.message}`);
      } finally {
        setLoadingUsers(false);
      }
    };
    
    fetchUsers();
  }, [supabase, user, passwordEntered]);
  
  // Fetch user's chats when a user is selected
  useEffect(() => {
    const fetchUserChats = async () => {
      if (!supabase || !selectedUserId || !passwordEntered) return;
      
      try {
        setLoadingChats(true);
        setError(null);
        console.log(`Fetching chats for user: ${selectedUserId}`);
        
        const { data, error: chatsError } = await supabase
          .from('chat_sessions')
          .select('*')
          .eq('user_id', selectedUserId)
          .order('updated_at', { ascending: false });
        
        if (chatsError) {
          console.error("Error fetching chat sessions:", chatsError);
          throw chatsError;
        }
        
        console.log("Retrieved chat sessions:", data);
        setUserChats(data || []);
        
        // Auto-select the first chat if available
        if (data && data.length > 0 && !selectedChatId) {
          console.log(`Auto-selecting first chat: ${data[0].chat_id}`);
          setSelectedChatId(data[0].chat_id);
        }
      } catch (err: any) {
        console.error('Error fetching user chats:', err);
        setError(`Failed to load chats: ${err.message}`);
      } finally {
        setLoadingChats(false);
      }
    };
    
    if (selectedUserId && passwordEntered) {
      fetchUserChats();
    } else {
      setUserChats([]);
      setSelectedChatId(null);
    }
  }, [supabase, selectedUserId, passwordEntered]);
  
  // Fetch chat messages when a chat is selected
  useEffect(() => {
    const fetchChatMessages = async () => {
      if (!supabase || !selectedChatId || !passwordEntered) return;
      
      try {
        setLoadingMessages(true);
        setError(null);
        console.log(`Fetching messages for chat: ${selectedChatId}`);
        
        const { data, error: messagesError } = await supabase
          .from('chat_messages')
          .select('*')
          .eq('chat_id', selectedChatId)
          .order('created_at', { ascending: true });
        
        if (messagesError) {
          console.error("Error fetching chat messages:", messagesError);
          throw messagesError;
        }
        
        // Enhanced debugging
        console.log("Retrieved messages count:", data?.length ?? 0);
        const senderTypes = data?.map(msg => msg.sender) ?? [];
        console.log("Message sender types:", [...new Set(senderTypes)]);
        
        if (data && data.length > 0) {
          const botMessages = data.filter(msg => msg.sender === 'bot' || msg.sender === 'ai');
          console.log(`Bot/AI messages count: ${botMessages.length}`);
          botMessages.forEach((msg, idx) => {
            console.log(`Bot message #${idx+1}:`, {
              id: msg.id,
              sender: msg.sender,
              messageContent: msg.message?.substring(0, 100),
              created_at: msg.created_at
            });
          });
        }
        
        // Map database fields to component expected structure
        const formattedMessages = data?.map(msg => {
          // Normalize sender type for consistency
          let normalizedSender = msg.sender;
          if (normalizedSender === 'ai') {
            normalizedSender = 'bot'; // Treat 'ai' sender as 'bot' for display consistency
          }
          
          return {
            id: msg.id,
            chat_id: msg.chat_id,
            sender: normalizedSender,
            message: msg.message || '(No message content)', // Ensure empty messages have placeholder text
            created_at: msg.created_at,
            flagged: msg.flagged || false
          };
        }) || [];
        
        setChatMessages(formattedMessages);
      } catch (err: any) {
        console.error('Error fetching chat messages:', err);
        setError(`Failed to load messages: ${err.message}`);
      } finally {
        setLoadingMessages(false);
      }
    };
    
    if (selectedChatId && passwordEntered) {
      fetchChatMessages();
    } else {
      setChatMessages([]);
    }
  }, [supabase, selectedChatId, passwordEntered]);
  
  // Handle user selection
  const handleUserSelect = (userId: string) => {
    setSelectedUserId(userId);
    setSelectedChatId(null);
  };
  
  // Handle chat selection
  const handleChatSelect = (chatId: string) => {
    setSelectedChatId(chatId);
  };
  
  // Handle toggling flagged messages filter
  const handleToggleFlagged = () => {
    setShowOnlyFlagged(!showOnlyFlagged);
  };
  
  // Filter displayed messages based on flagged status
  const displayedMessages = showOnlyFlagged
    ? chatMessages.filter(msg => msg.flagged)
    : chatMessages;
  
  // Loading state
  if (authLoading) {
    return <div className="flex justify-center items-center h-screen"><TypingIndicator /></div>;
  }
  
  // Not authenticated state
  if (!user) {
    return (
      <div className="flex flex-col justify-center items-center h-screen bg-gray-100">
        <h1 className="text-2xl font-semibold mb-4">Admin Access Required</h1>
        <p className="mb-6 text-gray-600">Please log in with admin credentials.</p>
        <Link href="/login" legacyBehavior>
          <a className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">
            Log In
          </a>
        </Link>
      </div>
    );
  }
  
  // Password entry form
  if (!passwordEntered) {
    return (
      <div className="flex flex-col justify-center items-center h-screen bg-gray-100">
        <div className="w-full max-w-md p-8 space-y-8 bg-white rounded-lg shadow-md">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900">Admin Access</h1>
            <p className="mt-2 text-sm text-gray-600">Enter password to access the admin panel</p>
          </div>
          
          <form className="mt-8 space-y-6" onSubmit={handlePasswordSubmit}>
            <div>
              <label htmlFor="password" className="sr-only">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className={`w-full px-4 py-2 border ${passwordError ? 'border-red-500' : 'border-gray-300'} rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500`}
                placeholder="Enter admin password"
              />
              {passwordError && (
                <p className="mt-2 text-sm text-red-600">
                  Incorrect password. Please try again.
                </p>
              )}
            </div>
            
            <div>
              <button
                type="submit"
                className="w-full px-4 py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                Access Admin Panel
              </button>
            </div>
            
            <div className="text-center">
              <Link href="/chat" className="text-sm text-blue-600 hover:text-blue-800">
                Return to Chat
              </Link>
            </div>
          </form>
        </div>
      </div>
    );
  }
  
  // Admin panel content (only shown after correct password)
  return (
    <div className="flex flex-col min-h-screen bg-gray-100">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-gray-900">Admin Chat Review</h1>
            <div className="flex items-center space-x-4">
              <button 
                onClick={() => {
                  setPasswordEntered(false);
                  sessionStorage.removeItem('adminPasswordEntered');
                }}
                className="text-sm text-red-600 hover:text-red-800"
              >
                Logout
              </button>
              <Link href="/chat" legacyBehavior>
                <a className="text-blue-600 hover:text-blue-800">Back to Chat</a>
              </Link>
            </div>
          </div>
        </div>
      </header>
      
      {error && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 text-red-600 bg-red-100 rounded-md mt-4">
          {error}
        </div>
      )}
      
      <main className="flex-grow max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Users List */}
          <div className="md:col-span-3 bg-white rounded-lg shadow">
            <div className="p-4 border-b">
              <h2 className="font-bold text-xl text-black">Users</h2>
            </div>
            <div className="p-2 max-h-[500px] overflow-y-auto">
              {loadingUsers ? (
                <div className="flex justify-center p-4">
                  <TypingIndicator />
                </div>
              ) : users.length === 0 ? (
                <p className="text-black text-center p-4">No users found</p>
              ) : (
                <ul className="space-y-1">
                  {users.map(u => (
                    <li key={u.id}>
                      <button
                        onClick={() => handleUserSelect(u.id)}
                        className={`w-full text-left px-3 py-2 rounded-md text-sm ${
                          selectedUserId === u.id
                            ? 'bg-blue-100 text-blue-800 font-medium'
                            : 'hover:bg-gray-100 text-black'
                        }`}
                      >
                        {u.email || 'Unknown User'}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          
          {/* Chats List */}
          <div className="md:col-span-3 bg-white rounded-lg shadow">
            <div className="p-4 border-b">
              <h2 className="font-bold text-xl text-black">Chats</h2>
            </div>
            <div className="p-2 max-h-[500px] overflow-y-auto">
              {!selectedUserId ? (
                <p className="text-black text-center p-4">Select a user to see their chats</p>
              ) : loadingChats ? (
                <div className="flex justify-center p-4">
                  <TypingIndicator />
                </div>
              ) : userChats.length === 0 ? (
                <p className="text-black text-center p-4">No chats found for this user</p>
              ) : (
                <ul className="space-y-1">
                  {userChats.map(chat => (
                    <li key={chat.chat_id}>
                      <button
                        onClick={() => handleChatSelect(chat.chat_id)}
                        className={`w-full text-left px-3 py-2 rounded-md text-sm ${
                          selectedChatId === chat.chat_id
                            ? 'bg-blue-100 text-blue-800 font-medium'
                            : 'hover:bg-gray-100 text-black'
                        }`}
                      >
                        <p className="font-medium truncate text-black">{chat.title || 'Untitled Chat'}</p>
                        <p className="text-xs text-black truncate">
                          {new Date(chat.updated_at).toLocaleString()}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          
          {/* Chat Messages */}
          <div className="md:col-span-6 bg-white rounded-lg shadow flex flex-col">
            <div className="p-4 border-b flex justify-between items-center">
              <h2 className="font-bold text-xl text-black">Chat Messages</h2>
              <div className="flex items-center space-x-4">
                <label className="inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showOnlyFlagged}
                    onChange={handleToggleFlagged}
                    className="form-checkbox h-4 w-4 text-blue-600 transition duration-150 ease-in-out"
                  />
                  <span className="ml-2 text-sm text-black font-medium">Show only flagged messages</span>
                </label>
                <button 
                  onClick={() => setShowDebugInfo(!showDebugInfo)} 
                  className="text-sm text-blue-700 hover:text-blue-900 font-medium"
                >
                  {showDebugInfo ? 'Hide Debug Info' : 'Show Debug Info'}
                </button>
              </div>
            </div>
            <div className="flex-grow p-4 overflow-y-auto max-h-[600px]">
              {!selectedChatId ? (
                <p className="text-black text-center p-4">Select a chat to see messages</p>
              ) : loadingMessages ? (
                <div className="flex justify-center p-4">
                  <TypingIndicator />
                </div>
              ) : displayedMessages.length === 0 ? (
                <p className="text-black text-center p-4">
                  {showOnlyFlagged ? 'No flagged messages in this chat' : 'No messages in this chat'}
                </p>
              ) : (
                <div className="space-y-4">
                  {/* Debug info - collapsible */}
                  {showDebugInfo && (
                    <div className="bg-yellow-100 p-2 rounded text-sm mb-4 border border-yellow-300">
                      <div className="flex justify-between items-center">
                        <p className="font-bold">Debug Info:</p>
                      </div>
                      <p className="text-gray-900">Total messages: {chatMessages.length}</p>
                      <p className="text-gray-900">User messages: {chatMessages.filter(m => m.sender === 'user').length}</p>
                      <p className="text-gray-900">Bot messages: {chatMessages.filter(m => m.sender === 'bot').length}</p>
                      <p className="text-gray-900">AI messages: {chatMessages.filter(m => m.sender === 'ai').length}</p>
                      <p className="text-gray-900">Error messages: {chatMessages.filter(m => m.sender === 'error').length}</p>
                      <p className="text-gray-900">Unknown messages: {chatMessages.filter(m => !['user', 'bot', 'ai', 'error'].includes(m.sender)).length}</p>
                      
                      <div className="mt-3 border-t border-yellow-300 pt-2">
                        <p className="font-bold text-gray-900">First few messages:</p>
                        {chatMessages.slice(0, 5).map((msg, idx) => (
                          <div key={idx} className="mt-2 p-2 bg-white rounded border border-gray-300">
                            <p className="text-gray-900"><strong>ID:</strong> {msg.id}</p>
                            <p className="text-gray-900"><strong>Sender:</strong> {msg.sender}</p>
                            <p className="text-gray-900"><strong>Time:</strong> {new Date(msg.created_at).toLocaleString()}</p>
                            <p className="text-gray-900"><strong>Content:</strong> <span className="text-black">{msg.message || '(empty)'}</span></p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {displayedMessages.map(msg => {
                    const isBotMessage = msg.sender === 'bot' || msg.sender === 'ai';
                    const messageContent = msg.message?.trim() || '';
                    // Check if message is empty or just whitespace
                    const isEmpty = messageContent === '';
                    
                    return (
                      <div
                        key={msg.id}
                        className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-lg px-4 py-2 rounded-lg relative ${
                            msg.sender === 'user'
                              ? 'bg-blue-500 text-white'
                              : msg.sender === 'error'
                              ? 'bg-red-100 text-red-700'
                              : isEmpty ? 'bg-orange-50 text-orange-800 border border-orange-200' 
                              : 'bg-white text-gray-800 border border-gray-300'
                          } ${msg.flagged ? 'border-2 border-red-500' : ''}`}
                        >
                          {msg.flagged && (
                            <div className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M3 6a3 3 0 013-3h10a1 1 0 01.8 1.6L14.25 8l2.55 3.4A1 1 0 0116 13H6a1 1 0 00-1 1v3a1 1 0 11-2 0V6z" clipRule="evenodd" />
                              </svg>
                            </div>
                          )}
                          <p className="text-xs opacity-70 mb-1">
                            {msg.sender === 'user' ? 'User' : msg.sender === 'bot' || msg.sender === 'ai' ? 'AI Assistant' : msg.sender} - {new Date(msg.created_at).toLocaleString()}
                          </p>
                          {/* Render message content with better text contrast */}
                          <div className={`whitespace-pre-wrap ${msg.sender === 'user' ? 'text-white' : 'text-black font-medium'}`}>
                            {isEmpty && isBotMessage ? (
                              <span className="italic text-orange-700">
                                (Empty AI response - This message appears in the database but has no content)
                              </span>
                            ) : (
                              <div className={msg.sender === 'user' ? 'text-white' : 'text-black font-medium'}>
                                {messageContent || '(Empty message)'}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
} 