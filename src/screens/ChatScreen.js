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
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [isFetchingRecommendations, setIsFetchingRecommendations] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [isSending, setIsSending] = useState(false);

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
    if (!inputText.trim() || isSending || isFetchingRecommendations || isAiThinking) {
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

    const userMessageText = inputText.trim();
    const userMessage = {
      id: Date.now().toString(),
      text: userMessageText,
      sender: 'user',
    };

    setMessages(prevMessages => [...prevMessages, userMessage]);
    setInputText('');
    setIsAiThinking(true);
    setIsSending(true);

    try {
      if (!session?.access_token) {
        throw new Error('Authentication token not found.');
      }

      const url = `${supabase.supabaseUrl}/functions/v1/ai-handler-v2`;
      console.log('Attempting fetch to:', url);

      const requestBody = {
        message: userMessageText,
      };

      if (pendingAction) {
        requestBody.context = {
            pending_action: pendingAction
        };
        console.log("Sending request with pending action:", pendingAction);
      } else {
         console.log("Sending request without pending action.");
      }

      let responseOk = false;
      let responseData = null;

      try {
          const response = await fetch(
            url,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
              },
              body: JSON.stringify(requestBody),
            }
          );

          console.log('Response status:', response.status);
          responseOk = response.ok;

          if (!responseOk) {
              let errorData;
              try {
                  errorData = await response.json();
              } catch (e) {
                  errorData = { message: await response.text() };
              }
              console.error("Backend Error Data:", errorData);
              throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
          }

          responseData = await response.json();
          console.log("Received data:", responseData);

      } catch (fetchError) {
          console.error('Fetch Error:', fetchError);
          throw fetchError;
      } finally {
          setIsAiThinking(false);
          setIsSending(false);
      }

      if (responseData && responseData.message) {
          const aiMessage = {
            id: (Date.now() + 2).toString(),
            text: responseData.message,
            sender: 'ai',
            responseType: responseData.response_type,
            contextForReply: responseData.context_for_reply || null,
            newPendingAction: responseData.pending_action || null
          };
          setMessages(prevMessages => [...prevMessages, aiMessage]);

          if (responseData.pending_action) {
            setPendingAction(responseData.pending_action);
            console.log("Stored NEW pending action for next turn:", responseData.pending_action);
          } else {
            setPendingAction(null);
            console.log("Cleared pending action state.");
          }

          if (responseData.response_type === 'needs_recommendation_trigger') {
            console.log("Received needs_recommendation_trigger signal from backend.");
            triggerRecommendationFetch();
          }
      } else {
          console.error("Invalid response structure received from backend:", responseData);
          throw new Error("Received an invalid response from the server.");
      }

    } catch (error) {
      console.error('Error in handleSend:', error);
       const errorMessage = {
         id: (Date.now() + 3).toString(),
         text: `Sorry, something went wrong: ${error.message}`,
         sender: 'ai',
         isError: true,
       };
       setMessages(prevMessages => [...prevMessages, errorMessage]);
       setPendingAction(null);
    }
  }, [inputText, isSending, isFetchingRecommendations, isAiThinking, session, pendingAction, isOffline]);

  const renderMessageItem = ({ item }) => {
    const isUser = item.sender === 'user';
    const textStyle = isUser ? styles.userMessageText : styles.aiMessageText;
    const thinkingStyle = item.isLoading ? styles.thinkingText : {};
    const errorStyle = item.isError ? styles.errorText : {};

    const isRecipeConfirmation = 
      item.responseType === 'recipe_save_confirmation_prompt' && pendingAction;
    
    const showRecipeAnalysisButtons =
      item.sender === 'ai' && item.responseType === 'recipe_analysis_prompt' && pendingAction?.type === 'log_analyzed_recipe';

    const showSavedRecipeConfirmButton =
      item.sender === 'ai' && item.responseType === 'saved_recipe_confirmation_prompt' && item.contextForReply?.recipe_id;

    const handleConfirmation = (confirmationMessage) => {
        setInputText(confirmationMessage);
        requestAnimationFrame(() => {
            handleSend();
        });
    };

    const handleDirectAction = async (actionName, contextPayload) => {
        if (isSending || isAiThinking) return;
         setIsAiThinking(true);
         setIsSending(true);

         try {
             const url = `${supabase.supabaseUrl}/functions/v1/ai-handler-v2`;
             const requestBody = { action: actionName, context: contextPayload };

             const response = await fetch(url, {
                 method: 'POST',
                 headers: {
                     'Content-Type': 'application/json',
                     'Authorization': `Bearer ${session.access_token}`,
                 },
                 body: JSON.stringify(requestBody),
             });

             if (!response.ok) {
                 const errorData = await response.json();
                 throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
             }
             const data = await response.json();
             const aiMessage = {
                 id: (Date.now() + 2).toString(),
                 text: data.message,
                 sender: 'ai',
                 responseType: data.response_type,
             };
             setMessages(prevMessages => [...prevMessages, aiMessage]);
             setPendingAction(null);

         } catch (error) {
             console.error('Error sending direct action:', error);
             const errorMessage = { id: (Date.now() + 3).toString(), text: `Action failed: ${error.message}`, sender: 'ai', isError: true };
             setMessages(prevMessages => [...prevMessages, errorMessage]);
         } finally {
             setIsAiThinking(false);
             setIsSending(false);
         }
     };

    return (
      <View style={[styles.messageContainer, isUser ? styles.userMessage : styles.aiMessage]}>
        <View style={styles.textContainer}>
          {item.isLoading ? (
            <ActivityIndicator size="small" color={isUser ? Colors.white : Colors.primary} />
          ) : (
            <PaperText style={[textStyle, thinkingStyle, errorStyle]}>
              {item.text}
            </PaperText>
          )}
        </View>
        
        {isRecipeConfirmation && (
          <View style={styles.actionButtonsContainer}>
            <Button
              mode="contained"
              onPress={() => handleConfirmation("Save and log")}
              disabled={isFetchingRecommendations}
              style={styles.actionButton}
              labelStyle={styles.buttonLabel}
            >
              Yes, save recipe & log
            </Button>
            <Button
              mode="outlined"
              onPress={() => handleConfirmation("Log only")}
              disabled={isFetchingRecommendations}
              style={[styles.actionButton, styles.secondaryButton]}
              labelStyle={styles.secondaryButtonLabel}
            >
              No, just log (don't save)
            </Button>
            {isFetchingRecommendations && <ActivityIndicator size="small" style={styles.loader} />}
          </View>
        )}

        {showRecipeAnalysisButtons && (
          <View style={styles.buttonContainer}>
            <Button mode="contained" onPress={() => handleConfirmation("Save and log")} style={styles.confirmButton}>Save & Log</Button>
            <Button mode="outlined" onPress={() => handleConfirmation("Log only")} style={styles.confirmButton}>Log Only</Button>
            <Button mode="text" onPress={() => handleConfirmation("Cancel")} style={styles.cancelButton}>Cancel</Button>
          </View>
        )}

        {showSavedRecipeConfirmButton && (
          <View style={styles.buttonContainer}>
            <Button
              mode="contained"
              onPress={() => handleDirectAction('confirm_log_saved_recipe', item.contextForReply)}
              style={styles.confirmButton}
            >
              Log '{item.contextForReply.recipe_name}'
            </Button>
            <Button
                mode="text"
                onPress={() => handleConfirmation("No, don't log it")}
                style={styles.cancelButton}
            >
                Cancel
            </Button>
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

        {isAiThinking && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={Colors.primary} />
            <Caption style={styles.loadingText}>NutriPal is thinking...</Caption>
          </View>
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
            editable={!isAiThinking && !isSending && !isOffline && !isFetchingRecommendations}
          />
          {(isAiThinking || isSending) ? (
              <ActivityIndicator animating={true} color={Colors.accent} style={styles.sendButtonContainer}/>
          ) : (
             <IconButton
               icon="send"
               color={Colors.accent}
               size={28}
               onPress={handleSend}
               disabled={!inputText.trim() || isAiThinking || isSending || isOffline || isFetchingRecommendations}
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
      width: 48,
      height: 48,
      alignItems: 'center',
      justifyContent: 'center',
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
  buttonContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 10,
    marginHorizontal: -5,
  },
  confirmButton: {
    marginHorizontal: 5,
    marginVertical: 4,
    flexGrow: 1,
    minWidth: 100,
  },
  cancelButton: {
      marginHorizontal: 5,
      marginVertical: 4,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    backgroundColor: Colors.background,
  },
  loadingText: {
    marginLeft: 8,
    color: Colors.textSecondary,
  },
});

export default ChatScreen; 