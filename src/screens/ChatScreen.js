import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  TextInput,
  Button,
  FlatList,
  Text,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useNetInfo } from '@react-native-community/netinfo';

const ChatScreen = () => {
  // Access auth context for user information
  const { user, session } = useAuth();
  
  // Set up state
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [waitingForContext, setWaitingForContext] = useState(null);
  
  // Reference to the FlatList to auto-scroll to bottom
  const flatListRef = useRef(null);

  // Inside component before other hooks
  const netInfo = useNetInfo();

  // Effect to scroll to bottom when messages change
  useEffect(() => {
    if (messages.length > 0 && flatListRef.current) {
      flatListRef.current.scrollToEnd({ animated: true });
    }
  }, [messages]);

  // Load initial message on mount
  useEffect(() => {
    // Add welcome message
    setMessages([
      {
        id: '0',
        text: "Hi! I'm NutriPal, your nutrition assistant. I can help you log your meals, analyze recipes, and answer nutrition questions.",
        sender: 'ai'
      }
    ]);
  }, []);

  // New consolidated async function for sending messages
  const handleSend = async () => {
    // Check for internet connectivity
    if (!netInfo.isConnected) {
      addMessage("No internet connection. Please check your network and try again.", 'ai');
      return;
    }
    
    // Get current text and context
    const currentText = inputText;
    const currentWaitingContext = waitingForContext;
    
    // Clear input text immediately for better UX
    setInputText('');
    
    // Return if text is empty
    if (!currentText.trim()) return;
    
    // Create and add user message
    const userMessage = {
      id: Date.now().toString(),
      text: currentText,
      sender: 'user'
    };
    setMessages(prevMessages => [...prevMessages, userMessage]);
    
    // Set loading state
    setLoading(true);
    
    // Add thinking message
    const thinkingMessageId = 'thinking-' + Date.now();
    const thinkingMessage = {
      id: thinkingMessageId,
      text: 'NutriPal is thinking...',
      sender: 'ai',
      isThinking: true
    };
    setMessages(prevMessages => [...prevMessages, thinkingMessage]);
    
    // Prepare request body
    const requestBody = {
      message: currentText,
      context: currentWaitingContext
    };
    
    // Clear waiting context
    setWaitingForContext(null);
    
    // Add logging before invoke
    console.log("Attempting to invoke function 'ai-handler-v2'");
    console.log("User Session Exists:", !!session); // Check if session object is present
    console.log("Request Body:", JSON.stringify(requestBody, null, 2)); // Log the body

    try {
      // Call the Edge Function
      const { data, error } = await supabase.functions.invoke('ai-handler-v2', {
        body: requestBody
      });

      // Add logging for the response
      console.log("Function Response Data:", data);
      console.log("Function Response Error:", error);

      if (error) {
        // Enhanced error logging
        console.error("Supabase function invocation error:", error); // Log the full error object
        const aiErrorMessage = {
          id: Date.now().toString(),
          // Provide more specific error if available, otherwise generic
          text: `Sorry, I encountered an error (${error.message || 'Unknown invoke error'}). Please try again.`,
          sender: 'ai'
        };
        setMessages(prevMessages => [...prevMessages, aiErrorMessage]);
      } else {
        // Handle successful response
        const aiMessage = {
          id: Date.now().toString(),
          text: data.message || "Received response, but no message content.", // Handle potentially missing message
          sender: 'ai'
        };
        setMessages(prevMessages => [...prevMessages, aiMessage]);
        
        // Check if we need to set context for ingredients
        if (data.status === 'needs_ingredients') {
          setWaitingForContext({
            type: 'ingredients',
            recipeName: data.recipeName
          });
        }
      }
    } catch (error) {
      // Log the error from the catch block as well
      console.error('Error invoking Supabase function:', error); // Log the full error from the catch block
      const aiErrorMessage = {
        id: Date.now().toString(),
        // Provide more specific error if available, otherwise generic
        text: `Sorry, a critical error occurred (${error.message || 'Unknown catch error'}). Please try again.`,
        sender: 'ai'
      };
      setMessages(prevMessages => [...prevMessages, aiErrorMessage]);
    } finally {
      // Reset loading state
      setLoading(false);
      // Remove thinking message
      setMessages(prevMessages => prevMessages.filter(msg => msg.id !== thinkingMessageId));
      // Ensure scroll happens after final message is added
      setTimeout(() => {
        if (flatListRef.current) {
          flatListRef.current.scrollToEnd({ animated: true });
        }
      }, 0);
    }
  };

  // Render a chat message
  const renderMessage = ({ item }) => {
    const isUser = item.sender === 'user';
    
    return (
      <View style={[
        styles.messageContainer,
        isUser ? styles.userMessage : styles.aiMessage
      ]}>
        <View style={[
          styles.messageBubble,
          !isUser && styles.aiMessageBubble,
          item.isThinking && styles.thinkingMessageBubble
        ]}>
          <Text style={[
            styles.messageText,
            !isUser && styles.aiMessageText
          ]}>
            {item.text}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={100}
    >
      <View style={styles.chatContainer}>
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.messagesList}
        />
        
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder={
              waitingForContext?.type === 'ingredients'
                ? `Enter ingredients for ${waitingForContext.recipeName}...`
                : "Type a message..."
            }
            multiline
            returnKeyType="send"
            onSubmitEditing={handleSend}
            editable={!loading}
          />
          
          {loading ? (
            <ActivityIndicator size="small" color="#007AFF" style={styles.sendButton} />
          ) : (
            <TouchableOpacity
              style={styles.sendButton}
              onPress={handleSend}
              disabled={!inputText.trim()}
            >
              <Text style={styles.sendButtonText}>Send</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  chatContainer: {
    flex: 1,
    justifyContent: 'space-between',
  },
  messagesList: {
    padding: 16,
    paddingBottom: 20,
  },
  messageContainer: {
    maxWidth: '80%',
    marginVertical: 8,
    padding: 16,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  userMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#007AFF',
    borderBottomRightRadius: 4, // Pointed edge
  },
  aiMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 4, // Pointed edge
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 18,
  },
  messageText: {
    fontSize: 16,
    color: '#FFFFFF',
    lineHeight: 22,
  },
  aiMessageText: {
    color: '#333333', // Darker text for AI messages on white background
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  input: {
    flex: 1,
    minHeight: 46, // Slightly taller
    maxHeight: 120,
    backgroundColor: '#F0F0F0',
    borderRadius: 23, // Half of height for perfect circle
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 16,
  },
  sendButton: {
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
    width: 46, 
    height: 46,
    backgroundColor: '#007AFF',
    borderRadius: 23, // Circle
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 15,
  },
  aiMessageBubble: {
    backgroundColor: '#E5E5EA',
    borderBottomLeftRadius: 4,
  },
  thinkingMessageBubble: {
    backgroundColor: '#E5E5EA',
    opacity: 0.7,
  },
});

export default ChatScreen; 