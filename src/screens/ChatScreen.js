import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Alert
} from 'react-native';
import {
  TextInput as PaperTextInput,
  IconButton,
  Text as PaperText,
  ActivityIndicator,
  Card,
  Paragraph,
  Surface,
  Caption,
  Button,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useNetInfo } from '@react-native-community/netinfo';
import { Colors } from '../constants/colors';
import { fetchUserProfile, fetchGoalRecommendations } from '../utils/profileUtils';

const ChatScreen = () => {
  const { user, session } = useAuth();
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [isFetchingRecommendations, setIsFetchingRecommendations] = useState(false);
  const [pendingRecipeData, setPendingRecipeData] = useState(null);
  const [isSavingRecipe, setIsSavingRecipe] = useState(false);

  const flatListRef = useRef(null);
  const netInfo = useNetInfo();

  useEffect(() => {
    setMessages([
      {
        id: '0',
        text: "Hi! I'm NutriPal, your nutrition assistant. I can help you log your meals, analyze recipes, and answer nutrition questions.",
        sender: 'ai'
      }
    ]);
  }, []);

  useEffect(() => {
    if (messages.length > 0 && flatListRef.current) {
      flatListRef.current.scrollToEnd({ animated: true });
    }
  }, [messages]);

  useEffect(() => {
    setIsOffline(netInfo.isConnected === false);
    if (netInfo.isConnected === false) {
        // Optionally show an alert or banner when offline
        // Alert.alert("Offline", "You are currently offline. Chat functionality may be limited.");
    }
  }, [netInfo.isConnected]);

  const triggerRecommendationFetch = async () => {
    setIsFetchingRecommendations(true);
    let fetchingMessageId = null;

    try {
      // Add a temporary "Fetching..." message
      fetchingMessageId = (Date.now() + 3).toString();
      const fetchingMessage = {
          id: fetchingMessageId,
          text: "Fetching recommendations...",
          sender: 'ai',
          isLoading: true
      };
      setMessages(prevMessages => [...prevMessages, fetchingMessage]);

      // 1. Fetch user profile
      const { data: profileData, error: profileError } = await fetchUserProfile(user.id);

      if (profileError || !profileData) {
        throw new Error(profileError?.message || 'Could not load your profile.');
      }
      if (!profileData.age || !profileData.weight_kg || !profileData.height_cm || !profileData.sex) {
         throw new Error('Your profile is incomplete. Please update it in Settings.');
      }

      // 2. Fetch recommendations using the profile
      const { data: recData, error: recError } = await fetchGoalRecommendations(profileData);

      if (recError) {
        throw new Error(recError.message || 'Failed to fetch recommendations.');
      }

      // Remove the temporary fetching message
       setMessages(prevMessages => prevMessages.filter(msg => msg.id !== fetchingMessageId));

      // Add success message
      const successMessage = {
        id: (Date.now() + 4).toString(),
        text: "Recommendations generated! You can find them as placeholders in the Goal Settings screen.",
        sender: 'ai',
      };
      setMessages(prevMessages => [...prevMessages, successMessage]);

    } catch (error) {
       console.error('Error triggering recommendation fetch:', error);
       // Remove the temporary fetching message
       setMessages(prevMessages => prevMessages.filter(msg => msg.id !== fetchingMessageId));
       // Add error message
        const errorMessage = {
            id: (Date.now() + 4).toString(),
            text: `Error fetching recommendations: ${error.message}`,
            sender: 'ai',
            isError: true,
        };
       setMessages(prevMessages => [...prevMessages, errorMessage]);
    } finally {
       setIsFetchingRecommendations(false);
    }
  };

  const handleSend = useCallback(async () => {
    if (!inputText.trim() || loading || isOffline || isFetchingRecommendations) {
      if (isOffline) {
          Alert.alert("Offline", "Cannot send messages while offline.");
      }
      return;
    }

    console.log('Send attempt - Auth state:', {
      hasUser: !!user,
      hasSession: !!session,
      hasToken: !!session?.access_token,
    });

    const userMessage = {
      id: Date.now().toString(),
      text: inputText,
      sender: 'user',
    };

    setMessages(prevMessages => [...prevMessages, userMessage]);
    setInputText('');
    setLoading(true);

    const thinkingMessageId = (Date.now() + 1).toString();
    const thinkingMessage = {
      id: thinkingMessageId,
      text: '...',
      sender: 'ai',
      isLoading: true,
    };
    setMessages(prevMessages => [...prevMessages, thinkingMessage]);

    try {
      if (!session?.access_token) {
        throw new Error('Authentication token not found.');
      }

      const url = `${supabase.supabaseUrl}/functions/v1/ai-handler-v2`;
      console.log('Attempting fetch to:', url);

      const response = await fetch(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ message: userMessage.text }),
        }
      );

      console.log('Response status:', response.status);

      setMessages(prevMessages => prevMessages.filter(msg => msg.id !== thinkingMessageId));

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      // Check for recipe save confirmation prompt
      if (data.response_type === 'recipe_save_confirmation_prompt' && data.recipe_data_to_save) {
        // Store the recipe data in state for later use
        setPendingRecipeData(data.recipe_data_to_save);
      } else {
        // Clear any pending recipe data if a different response type is received
        setPendingRecipeData(null);
      }

      const aiMessage = {
        id: (Date.now() + 2).toString(),
        text: data.message || "Sorry, I couldn't process that.",
        sender: 'ai',
        responseType: data.response_type, // Store the response type in the message
      };
      setMessages(prevMessages => [...prevMessages, aiMessage]);

      if (data.response_type === 'needs_recommendation_trigger') {
        console.log("Received needs_recommendation_trigger signal from backend.");
        triggerRecommendationFetch();
      }

    } catch (error) {
        console.error('Detailed fetch error:', {
          message: error.message,
          stack: error.stack,
          name: error.name,
          type: error.type
        });
        setMessages(prevMessages => prevMessages.filter(msg => msg.id !== thinkingMessageId));
      console.error('Error sending message:', error);
      const errorMessage = {
        id: (Date.now() + 2).toString(),
        text: `Error: ${error.message || 'Could not get response.'}`,
        sender: 'ai',
        isError: true,
      };
      setMessages(prevMessages => [...prevMessages, errorMessage]);
      Alert.alert('Error', `Failed to send message: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [inputText, loading, session, isOffline, user, isFetchingRecommendations, setPendingRecipeData]);

  // Function to handle saving and logging the recipe
  const handleSaveAndLogRecipe = async () => {
    if (!pendingRecipeData || !user || !session?.access_token) return;
    
    setIsSavingRecipe(true);
    
    // Add a temporary "Saving..." message
    const savingMessageId = Date.now().toString();
    const savingMessage = {
      id: savingMessageId,
      text: "Saving and logging recipe...",
      sender: 'ai',
      isLoading: true,
    };
    setMessages(prevMessages => [...prevMessages, savingMessage]);
    
    try {
      console.log('Sending save and log request for:', pendingRecipeData.name);
      
      // Construct the payload for the backend
      const payload = {
        action: "confirm_save_and_log_recipe",
        recipe_data: pendingRecipeData
      };
      
      // Send the request to the backend
      const url = `${supabase.supabaseUrl}/functions/v1/ai-handler-v2`;
      const response = await fetch(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(payload),
        }
      );
      
      // Remove the temporary saving message
      setMessages(prevMessages => prevMessages.filter(msg => msg.id !== savingMessageId));
      
      if (!response.ok) {
        const errorText = await response.text(); // Get the raw response
        let errorMessage = `HTTP error! status: ${response.status}`;
        
        try {
          // Try to parse as JSON
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error || errorData.message || errorMessage;
        } catch (parseError) {
          // If parsing fails, use the raw text
          console.error('Failed to parse error response:', parseError);
          errorMessage = errorText || errorMessage;
        }
        
        throw new Error(errorMessage);
      }
      
      let data;
      try {
        const responseText = await response.text();
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error('Error parsing response:', parseError);
        throw new Error('Error parsing response from server');
      }
      
      // Add the response message to the chat
      const confirmationMessage = {
        id: Date.now().toString(),
        text: data?.message || `Great! I've saved "${pendingRecipeData.name}" to your recipes and logged it for today.`,
        sender: 'ai',
      };
      setMessages(prevMessages => [...prevMessages, confirmationMessage]);
      
      // Clear the pending recipe data
      setPendingRecipeData(null);
    } catch (error) {
      console.error('Error saving/logging recipe:', error);
      
      // Remove the temporary saving message
      setMessages(prevMessages => prevMessages.filter(msg => msg.id !== savingMessageId));
      
      // Add error message to the chat
      const errorMessage = {
        id: Date.now().toString(),
        text: `Sorry, I encountered an error saving the recipe: ${error.message}`,
        sender: 'ai',
        isError: true,
      };
      setMessages(prevMessages => [...prevMessages, errorMessage]);
      
      Alert.alert('Error', `Failed to save and log recipe: ${error.message}`);
    } finally {
      setIsSavingRecipe(false);
    }
  };

  // Function to handle just logging the recipe without saving
  const handleJustLogRecipe = async () => {
    if (!pendingRecipeData || !user || !session?.access_token) return;
    
    setIsSavingRecipe(true);
    
    // Add a temporary "Logging..." message
    const loggingMessageId = Date.now().toString();
    const loggingMessage = {
      id: loggingMessageId,
      text: "Logging recipe...",
      sender: 'ai',
      isLoading: true,
    };
    setMessages(prevMessages => [...prevMessages, loggingMessage]);
    
    try {
      console.log('Sending log-only request for:', pendingRecipeData.name);
      
      // Construct the payload for the backend
      const payload = {
        action: "confirm_log_only_recipe",
        recipe_data: pendingRecipeData
      };
      
      // Send the request to the backend
      const url = `${supabase.supabaseUrl}/functions/v1/ai-handler-v2`;
      const response = await fetch(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(payload),
        }
      );
      
      // Remove the temporary logging message
      setMessages(prevMessages => prevMessages.filter(msg => msg.id !== loggingMessageId));
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Add the response message to the chat
      const confirmationMessage = {
        id: Date.now().toString(),
        text: data.message || `I've logged "${pendingRecipeData.name}" for today without saving it to your recipes.`,
        sender: 'ai',
      };
      setMessages(prevMessages => [...prevMessages, confirmationMessage]);
      
      // Clear the pending recipe data
      setPendingRecipeData(null);
    } catch (error) {
      console.error('Error logging recipe:', error);
      
      // Remove the temporary logging message
      setMessages(prevMessages => prevMessages.filter(msg => msg.id !== loggingMessageId));
      
      // Add error message to the chat
      const errorMessage = {
        id: Date.now().toString(),
        text: `Sorry, I encountered an error logging the recipe: ${error.message}`,
        sender: 'ai',
        isError: true,
      };
      setMessages(prevMessages => [...prevMessages, errorMessage]);
      
      Alert.alert('Error', `Failed to log recipe: ${error.message}`);
    } finally {
      setIsSavingRecipe(false);
    }
  };

  const renderMessageItem = ({ item }) => {
    const isUser = item.sender === 'user';
    const textStyle = isUser ? styles.userMessageText : styles.aiMessageText;
    const thinkingStyle = item.isLoading ? styles.thinkingText : {};
    const errorStyle = item.isError ? styles.errorText : {};

    const isRecipeConfirmation = 
      item.responseType === 'recipe_save_confirmation_prompt' && pendingRecipeData;
    
    return (
      <View style={[styles.messageContainer, isUser ? styles.userMessage : styles.aiMessage]}>
        <View style={styles.textContainer}>
          <PaperText style={[textStyle, thinkingStyle, errorStyle]}>
            {item.text}
          </PaperText>
        </View>
        
        {isRecipeConfirmation && (
          <View style={styles.actionButtonsContainer}>
            <Button
              mode="contained"
              onPress={handleSaveAndLogRecipe}
              disabled={isSavingRecipe}
              style={styles.actionButton}
              labelStyle={styles.buttonLabel}
            >
              Yes, save recipe & log
            </Button>
            <Button
              mode="outlined"
              onPress={handleJustLogRecipe}
              disabled={isSavingRecipe}
              style={[styles.actionButton, styles.secondaryButton]}
              labelStyle={styles.secondaryButtonLabel}
            >
              No, just log (don't save)
            </Button>
            {isSavingRecipe && <ActivityIndicator size="small" style={styles.loader} />}
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {isOffline && (
            <View style={styles.offlineBanner}>
                <PaperText style={styles.offlineText}>You are offline</PaperText>
            </View>
        )}

        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessageItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContentContainer}
          style={styles.messageList}
        />

        {isFetchingRecommendations && (
              <Caption style={styles.fetchingStatus}>Fetching recommendations...</Caption>
        )}

        <Surface style={styles.inputSurface} elevation={4}>
          <PaperTextInput
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder={isOffline ? "Offline - Cannot send" : "Type your message..."}
            mode="outlined"
            dense
            multiline
            editable={!loading && !isOffline && !isFetchingRecommendations}
          />
          {loading ? (
              <ActivityIndicator animating={true} color={Colors.accent} style={styles.sendButtonContainer}/>
          ) : (
             <IconButton
               icon="send"
               color={Colors.accent}
               size={28}
               onPress={handleSend}
               disabled={!inputText.trim() || loading || isOffline || isFetchingRecommendations}
               style={styles.sendButtonContainer}
             />
          )}
        </Surface>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: Colors.lightGrey,
  },
  offlineBanner: {
    backgroundColor: Colors.warning,
    paddingVertical: 4,
    alignItems: 'center',
  },
  offlineText: {
    color: Colors.background,
    fontSize: 14,
    fontWeight: 'bold',
  },
  messageList: {
    flex: 1,
  },
  listContentContainer: {
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  messageCard: {
    maxWidth: '80%',
    marginBottom: 10,
    borderRadius: 15,
  },
  messageContainer: {
    flexDirection: 'column',
    borderRadius: 16,
    marginBottom: 12,
    maxWidth: '85%',
    elevation: 1,
    overflow: 'hidden',
  },
  userMessage: {
    alignSelf: 'flex-end',
    backgroundColor: Colors.accent,
    borderBottomRightRadius: 4,
  },
  aiMessage: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.lightGrey,
    borderBottomLeftRadius: 4,
  },
  textContainer: {
    padding: 12,
  },
  userMessageText: {
    color: Colors.background,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '400',
  },
  aiMessageText: {
    color: Colors.primary,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '400',
  },
  thinkingText: {
    color: Colors.grey,
    fontStyle: 'italic',
  },
  errorText: {
    color: Colors.error,
  },
  inputSurface: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.lightGrey,
    backgroundColor: Colors.background,
  },
  input: {
    flex: 1,
    marginRight: 8,
    backgroundColor: Colors.background,
    paddingVertical: 8,
    paddingLeft: 12,
    textAlignVertical: 'center',
  },
  sendButtonContainer: {
      margin: 0,
  },
  fetchingStatus: {
    textAlign: 'center',
    paddingVertical: 4,
    color: Colors.textSecondary,
    fontStyle: 'italic',
  },
  actionButtonsContainer: {
    padding: 12,
    paddingTop: 4,
    flexDirection: 'column',
    width: '100%',
    backgroundColor: 'rgba(0,0,0,0.03)',
  },
  actionButton: {
    marginVertical: 4,
    borderRadius: 8,
  },
  secondaryButton: {
    borderColor: '#555',
  },
  buttonLabel: {
    fontSize: 14,
    paddingVertical: 2,
  },
  secondaryButtonLabel: {
    fontSize: 14,
    color: '#555',
    paddingVertical: 2,
  },
  loader: {
    marginTop: 8,
    alignSelf: 'center',
  },
});

export default ChatScreen; 