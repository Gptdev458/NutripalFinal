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
import { getSupabaseClient } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useNetInfo } from '@react-native-community/netinfo';
import { fetchUserProfile, fetchGoalRecommendations } from '../utils/profileUtils';
import useSafeTheme from '../hooks/useSafeTheme';

const ChatScreen = () => {
  const theme = useSafeTheme();
  const { user, session } = useAuth();
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [isFetchingRecommendations, setIsFetchingRecommendations] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [contextForNextRequest, setContextForNextRequest] = useState(null);
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

    // Store context *before* clearing inputText or setting loading states
    const currentContextToSend = contextForNextRequest;
    // Clear the context state immediately so it's only used for this message
    setContextForNextRequest(null); 

    const userMessageText = inputText.trim();
    const userMessage = {
      id: Date.now().toString(),
      text: userMessageText,
      sender: 'user',
    };

    // --- Add history BEFORE setting state --- 
    const MAX_HISTORY_FRONTEND = 8;
    const recentHistory = messages.slice(-MAX_HISTORY_FRONTEND); // Get last N messages
    const historyForBackend = recentHistory.map(msg => ({
      sender: msg.sender, // 'user' or 'ai'
      text: msg.text 
    }));
    // --- End add history ---

    setMessages(prevMessages => [...prevMessages, userMessage]);
    setInputText('');
    setIsAiThinking(true);
    setIsSending(true);

    try {
      if (!session?.access_token) {
        throw new Error('Authentication token not found.');
      }

      const supabase = getSupabaseClient(); // Get the client instance
      const url = `${supabase.supabaseUrl}/functions/v1/ai-handler-v2`;
      console.log('Attempting fetch to:', url);

      // --- Modify requestBody construction --- 
      const requestBody = {
        message: userMessageText,
        conversation_history: historyForBackend, // Add the prepared history
        context: null // Initialize context field
      };
      // --- End modification ---

      let combinedContext = {};
      let contextWasSet = false;

      if (pendingAction) {
        combinedContext.pending_action = pendingAction;
        contextWasSet = true;
        console.log("Including pending action in context:", pendingAction);
      }

      if (currentContextToSend) { // Use the variable captured at the start
        combinedContext = { ...combinedContext, ...currentContextToSend }; // Merge properties
        contextWasSet = true;
        console.log("Including stored context_for_reply in context:", currentContextToSend);
      }

      if (contextWasSet) {
        requestBody.context = combinedContext;
      } else {
        delete requestBody.context; 
        console.log("Sending request without pending action or stored context.");
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

          if (responseData.context_for_reply) {
             setContextForNextRequest(responseData.context_for_reply);
             console.log("Stored context_for_reply for next turn:", responseData.context_for_reply);
          } else {
             setContextForNextRequest(null);
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
    } finally {
        setIsAiThinking(false);
        setIsSending(false);
    }
  }, [inputText, isSending, isFetchingRecommendations, isAiThinking, session, pendingAction, contextForNextRequest, isOffline]);

  const renderMessageItem = ({ item }) => {
    const isUser = item.sender === 'user';

    // Base styles from StyleSheet
    const messageContainerBaseStyle = styles.messageContainer;
    const messageSpecificBaseStyle = isUser ? styles.userMessage : styles.aiMessage;
    const textContainerStyle = styles.textContainer;
    const textBaseStyle = styles.baseMessageText; // New base style for text
    const thinkingStyle = item.isLoading ? styles.thinkingText : {};
    const errorStyle = item.isError ? styles.errorText : {};

    // Theme-dependent inline styles
    const messageContainerInlineStyle = {
        backgroundColor: isUser ? theme.colors.primary : theme.colors.surface,
        borderColor: item.isError ? theme.colors.error : (isUser ? theme.colors.primary : theme.colors.outline),
        borderWidth: item.isError || item.sender === 'ai' ? 1 : 0, // Border for AI or errors
    };
    const textInlineStyle = {
        color: isUser ? theme.colors.onPrimary : (item.isError ? theme.colors.error : theme.colors.text)
    };
    const thinkingInlineStyle = { color: theme.colors.textSecondary }; // Apply thinking color inline
    const errorInlineStyle = { color: theme.colors.error }; // Apply error color inline

    // Combine base and inline styles
    const combinedContainerStyle = [messageContainerBaseStyle, messageSpecificBaseStyle, messageContainerInlineStyle];
    const combinedTextStyle = [textBaseStyle, textInlineStyle, item.isLoading ? thinkingInlineStyle : {}, item.isError ? errorInlineStyle : {}];

    const isRecipeConfirmation = item.responseType === 'recipe_save_confirmation_prompt' && pendingAction;
    const showRecipeAnalysisButtons = item.sender === 'ai' && item.responseType === 'recipe_analysis_prompt' && pendingAction?.type === 'log_analyzed_recipe';
    const showSavedRecipeConfirmButton = item.sender === 'ai' && item.responseType === 'saved_recipe_confirmation_prompt' && item.contextForReply?.recipe_id;
    
    // --- Add Flags for Proactive Recipe Buttons ---
    const showProactiveSingleConfirm = item.sender === 'ai' && item.responseType === 'saved_recipe_proactive_confirm' && item.contextForReply?.recipe_id;
    const showProactiveMultipleChoice = item.sender === 'ai' && item.responseType === 'saved_recipe_proactive_multiple' && Array.isArray(item.contextForReply?.matches) && item.contextForReply.matches.length > 0;
    // --- End Flags ---

    // --- Add console logs for debugging button conditions ---
    if (item.sender === 'ai') {
      console.log(`Rendering AI Msg ID: ${item.id}`);
      console.log(`  Response Type: ${item.responseType}`);
      console.log(`  ContextForReply: ${JSON.stringify(item.contextForReply)}`);
      console.log(`  Show Proactive Single Confirm? ${showProactiveSingleConfirm}`);
      console.log(`  Show Proactive Multiple Choice? ${showProactiveMultipleChoice}`);
      console.log(`  Show Standard Saved Confirm? ${showSavedRecipeConfirmButton}`);
    }
    // --- End console logs ---

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
             const supabase = getSupabaseClient(); // Get the client instance
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
      <View style={combinedContainerStyle}>
        <View style={textContainerStyle}>
          {item.isLoading ? (
            <ActivityIndicator size="small" color={isUser ? theme.colors.onPrimary : theme.colors.primary} />
          ) : (
            <PaperText style={combinedTextStyle}>
              {item.text}
            </PaperText>
          )}
        </View>
        
        {isRecipeConfirmation && (
          <View style={[styles.actionButtonsContainer, { backgroundColor: theme.colors.surfaceVariant }]}>
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
              labelStyle={[styles.secondaryButtonLabel, { color: theme.colors.primary }]}
            >
              No, just log (don't save)
            </Button>
            {isFetchingRecommendations && <ActivityIndicator size="small" style={styles.loader} color={theme.colors.primary} />}
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

        {/* --- Add Buttons for Proactive Single Confirm --- */}
        {showProactiveSingleConfirm && (
          <View style={styles.buttonContainer}>
            <Button
              mode="contained"
              onPress={() => {
                // Add debug log here
                console.log(`[Action Button Press] Proactive Single Confirm: Logging recipe ID ${item.contextForReply?.recipe_id}`);
                handleDirectAction('confirm_log_saved_recipe', item.contextForReply);
              }}
              style={styles.confirmButton}
            >
              {`Yes, Log '${item.contextForReply.recipe_name}'`}
            </Button>
            <Button
                mode="text"
                onPress={() => {
                  // Add debug log here
                  console.log("[Action Button Press] Proactive Single Confirm: Something else");
                  handleConfirmation("No, something else");
                }}
                style={styles.cancelButton}
            >
                Something else
            </Button>
          </View>
        )}
        {/* --- End Buttons for Proactive Single Confirm --- */}

        {/* --- Add Buttons for Proactive Multiple Choice --- */}
        {showProactiveMultipleChoice && (
          <View style={styles.buttonContainerMulti}>
            {item.contextForReply.matches.map((match) => (
              <Button
                key={match.id}
                mode="outlined"
                onPress={() => {
                   // Add debug log here
                  console.log(`[Action Button Press] Proactive Multi Choice: Logging recipe ID ${match.id}`);
                  handleDirectAction('confirm_log_saved_recipe', { recipe_id: match.id, recipe_name: match.recipe_name });
                }}
                style={[styles.multiChoiceButton, { borderColor: theme.colors.primary }]}
                labelStyle={[styles.multiChoiceButtonLabel, { color: theme.colors.primary }]}
              >
                {`Log '${match.recipe_name}'`}
              </Button>
            ))}
            <Button
              mode="text"
              onPress={() => {
                // Add debug log here
                console.log("[Action Button Press] Proactive Multi Choice: Something else");
                handleConfirmation("Something else");
              }}
              style={[styles.cancelButton, { marginTop: 5 }]}
            >
              Something else
            </Button>
          </View>
        )}
        {/* --- End Buttons for Proactive Multiple Choice --- */}
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }]}>
      {isOffline && (
            <View style={[styles.offlineBanner, { backgroundColor: theme.colors.warning }]}>
                <PaperText style={[styles.offlineText, { color: theme.colors.surface }]}>You are offline</PaperText>
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
              <Caption style={[styles.fetchingStatus, { color: theme.colors.textSecondary }]}>Fetching recommendations...</Caption>
        )}

        {isAiThinking && (
          <View style={[styles.loadingContainer, { backgroundColor: theme.colors.background }]}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
            <Caption style={[styles.loadingText, { color: theme.colors.textSecondary }]}>NutriPal is thinking...</Caption>
          </View>
        )}

        <Surface style={[styles.inputSurface, { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.outline }]} elevation={4}>
          <PaperTextInput
            style={[styles.input, { backgroundColor: theme.colors.background }]}
            value={inputText}
            onChangeText={setInputText}
            placeholder={isOffline ? "Offline - Cannot send" : "Type your message..."}
            mode="outlined"
            dense
            multiline
            editable={!isAiThinking && !isSending && !isOffline && !isFetchingRecommendations}
          />
          {(isAiThinking || isSending) ? (
              <ActivityIndicator animating={true} color={theme.colors.primary} style={styles.sendButtonContainer}/>
          ) : (
             <IconButton
               icon="send"
               iconColor={theme.colors.primary}
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
  },
  container: {
    flex: 1,
  },
  offlineBanner: {
    paddingVertical: 4,
    alignItems: 'center',
  },
  offlineText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  messageList: {
    flex: 1,
  },
  listContentContainer: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    flexGrow: 1,
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
    borderBottomRightRadius: 4,
    marginLeft: '15%',
  },
  aiMessage: {
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
    marginRight: '15%',
  },
  textContainer: {
    padding: 12,
  },
  baseMessageText: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '400',
  },
  thinkingText: {
    fontStyle: 'italic',
  },
  errorText: {
  },
  inputSurface: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    marginRight: 8,
    paddingVertical: 0,
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
    fontStyle: 'italic',
  },
  actionButtonsContainer: {
    padding: 12,
    paddingTop: 4,
    flexDirection: 'column',
    width: '100%',
  },
  actionButton: {
    marginVertical: 4,
    borderRadius: 8,
  },
  secondaryButton: {
  },
  buttonLabel: {
    fontSize: 14,
    paddingVertical: 2,
  },
  secondaryButtonLabel: {
    fontSize: 14,
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
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  buttonContainerMulti: {
    flexDirection: 'column',
    alignItems: 'stretch',
    marginTop: 10,
    paddingHorizontal: 10,
  },
  confirmButton: {
    marginHorizontal: 5,
  },
  cancelButton: {
    marginHorizontal: 5,
  },
  multiChoiceButton: {
    marginVertical: 4,
  },
  multiChoiceButtonLabel: {
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  loadingText: {
    marginLeft: 8,
  },
});

export default ChatScreen; 