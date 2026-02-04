export class PersistenceService {
  supabase;
  constructor(supabase){
    this.supabase = supabase;
  }
  async logExecution(userId, sessionId, intent, agentsInvolved, startTime, response, message, parentId) {
    const { data, error } = await this.supabase.from('agent_execution_logs').insert({
      user_id: userId,
      session_id: sessionId,
      intent: intent,
      agents_involved: agentsInvolved,
      execution_time_ms: Date.now() - startTime,
      status: response.status,
      logs: {
        input: message,
        output: response
      },
      parent_id: parentId
    }).select('id').single();
    if (error) {
      console.error('[PersistenceService] Error logging execution:', error);
      return undefined;
    }
    return data?.id;
  }
}
