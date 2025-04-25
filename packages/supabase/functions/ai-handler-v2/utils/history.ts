// Conversation history helpers for AI handler
// Export fetchConversationHistory and any related types

export async function fetchConversationHistory(userId: string, supabaseClient: any, limit = 8): Promise<any[]> {
  console.log(`Fetching conversation history for user ${userId}`);
  try {
    const { data, error } = await supabaseClient
      .from('conversations')
      .select('sender, message, response_metadata')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) {
      console.error("Error fetching conversation history:", error);
      return [];
    }
    if (!data) {
      return [];
    }
    // Format data into OpenAI message format (reverse to get chronological order)
    const formattedHistory = data.reverse().map((row: any) => {
      if (row.sender === 'user') {
        return { role: 'user', content: row.message };
      } else if (row.sender === 'ai') {
        return { role: 'assistant', content: row.message };
      }
      return null;
    }).filter((msg: any) => msg !== null);
    return formattedHistory;
  } catch (err) {
    console.error("Exception fetching conversation history:", err);
    return [];
  }
}

export {}; 