export class SessionService {
  supabase;
  constructor(supabase) {
    this.supabase = supabase;
  }
  /**
     * Retrieves the current session state for a user.
     * If no session exists, creates a fresh 'idle' session.
     */ async getSession(userId, sessionId) {
    let query = this.supabase.from('chat_sessions').select('*').eq('user_id', userId);
    if (sessionId) {
      query = query.eq('id', sessionId);
    } else {
      // If no specific session, get the most recent one
      query = query.order('updated_at', {
        ascending: false
      }).limit(1);
    }
    const { data, error } = await query.maybeSingle();
    if (error) {
      console.error('[SessionService] Error fetching session:', error);
      throw error;
    }
    if (!data) {
      // Create new session if none exists
      return await this.createSession(userId);
    }
    return data;
  }
  /**
     * Creates a new session for the user
     */ async createSession(userId) {
    const newSession = {
      user_id: userId,
      current_mode: 'idle',
      buffer: {},
      missing_fields: []
    };
    const { data, error } = await this.supabase.from('chat_sessions').insert(newSession).select().single();
    if (error) {
      console.error('[SessionService] Error creating session:', error);
      throw error;
    }
    return data;
  }
  /**
     * Updates the session with new state
     */ async updateSession(userId, updates) {
    const { error } = await this.supabase.from('chat_sessions').update(updates).eq('user_id', userId);
    if (error) {
      console.error('[SessionService] Error updating session:', error);
      throw error;
    }
  }
  /**
     * Clears the current flow and buffer, resetting to idle
     */ async clearSession(userId) {
    await this.updateSession(userId, {
      current_mode: 'idle',
      buffer: {},
      missing_fields: [],
      pending_action: undefined
    });
  }
  /**
     * Saves a pending action that requires user confirmation
     */ async savePendingAction(userId, action) {
    await this.supabase.from('chat_sessions').update({
      pending_action: {
        ...action,
        created_at: new Date().toISOString()
      }
    }).eq('user_id', userId);
  }
  /**
     * Clears the pending action after confirm/decline
     */ async clearPendingAction(userId) {
    await this.supabase.from('chat_sessions').update({
      pending_action: null
    }).eq('user_id', userId);
  }
  /**
     * Updates the agent context (last intent, agent, response type)
     */ async updateContext(userId, context) {
    await this.supabase.from('chat_sessions').update({
      last_intent: context.intent,
      last_agent: context.agent,
      last_response_type: context.responseType,
      updated_at: new Date().toISOString()
    }).eq('user_id', userId);
  }
  /**
     * Updates the session buffer with conversation context.
     * Phase 2.2: Conversation Context Preservation
     * 
     * @param userId - The user's ID
     * @param updates - Partial buffer updates to merge
     */ async updateBuffer(userId, updates) {
    // First, get the current session to merge buffer
    const { data: session } = await this.supabase.from('chat_sessions').select('buffer').eq('user_id', userId).maybeSingle();
    const currentBuffer = session?.buffer || {};
    // Merge recent foods (keep last 5)
    let mergedRecentFoods = currentBuffer.recentFoods || [];
    if (updates.recentFoods) {
      mergedRecentFoods = [
        ...mergedRecentFoods,
        ...updates.recentFoods
      ].slice(-5);
    }
    const newBuffer = {
      ...currentBuffer,
      ...updates,
      recentFoods: mergedRecentFoods
    };
    const { error } = await this.supabase.from('chat_sessions').update({
      buffer: newBuffer,
      updated_at: new Date().toISOString()
    }).eq('user_id', userId);
    if (error) {
      console.error('[SessionService] Error updating buffer:', error);
    }
  }
  /**
     * Adds a user correction to the buffer for learning preferences.
     * 
     * @param userId - The user's ID
     * @param original - The original value the system used
     * @param corrected - The value the user corrected it to
     */ async addUserCorrection(userId, original, corrected) {
    const { data: session } = await this.supabase.from('chat_sessions').select('buffer').eq('user_id', userId).maybeSingle();
    const currentBuffer = session?.buffer || {};
    const corrections = currentBuffer.userCorrections || [];
    // Keep last 10 corrections
    corrections.push({
      original,
      corrected
    });
    const trimmedCorrections = corrections.slice(-10);
    await this.updateBuffer(userId, {
      userCorrections: trimmedCorrections
    });
  }

  /**
   * Sets the clarification context when ambiguity is high.
   * This stores the original message and reasoning so we can replay it later.
   */
  async setClarificationContext(userId: string, context: any) {
    console.log('[SessionService] Setting clarification context for user:', userId);
    await this.updateBuffer(userId, {
      pending_clarification: {
        ...context,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Retrieves the pending clarification context if it exists.
   */
  async getClarificationContext(userId: string) {
    const { data: session } = await this.supabase
      .from('chat_sessions')
      .select('buffer')
      .eq('user_id', userId)
      .maybeSingle();

    return session?.buffer?.pending_clarification || null;
  }

  /**
   * Clears the pending clarification context.
   */
  async clearClarificationContext(userId: string) {
    // We need to fetch current buffer first to avoid wiping other data
    const { data: session } = await this.supabase
      .from('chat_sessions')
      .select('buffer')
      .eq('user_id', userId)
      .maybeSingle();

    const currentBuffer = session?.buffer || {};

    // Remove the pending_clarification key
    const newBuffer = { ...currentBuffer };
    delete newBuffer.pending_clarification;

    const { error } = await this.supabase
      .from('chat_sessions')
      .update({
        buffer: newBuffer,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId);

    if (error) {
      console.error('[SessionService] Error clearing clarification context:', error);
    }
  }
}
