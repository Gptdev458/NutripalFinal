import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Alert,
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

      const aiMessage = {
        id: (Date.now() + 2).toString(),
        text: data.message || "Sorry, I couldn't process that.",
        sender: 'ai',
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
  }, [inputText, loading, session, isOffline, user, isFetchingRecommendations]);

  const renderMessageItem = ({ item }) => {
    const isUser = item.sender === 'user';
    const cardStyle = isUser ? styles.userMessageCard : styles.aiMessageCard;
    const textStyle = isUser ? styles.userMessageText : styles.aiMessageText;
    const thinkingStyle = item.isLoading ? styles.thinkingText : {};
    const errorStyle = item.isError ? styles.errorText : {};

    return (
      <Card style={[styles.messageCard, cardStyle]} elevation={1}>
        <Paragraph style={[textStyle, thinkingStyle, errorStyle]}>
          {item.text}
        </Paragraph>
      </Card>
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
  userMessageCard: {
    alignSelf: 'flex-end',
    backgroundColor: Colors.accent,
  },
  aiMessageCard: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.lightGrey,
  },
  userMessageText: {
    color: Colors.background,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  aiMessageText: {
    color: Colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 12,
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
});

export default ChatScreen; 