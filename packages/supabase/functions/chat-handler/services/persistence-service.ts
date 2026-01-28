import { AgentResponse } from '../../_shared/types.ts'

export class PersistenceService {
    constructor(private supabase: any) { }

    async logExecution(
        userId: string,
        sessionId: string | undefined,
        intent: string,
        agentsInvolved: string[],
        startTime: number,
        response: AgentResponse,
        message: string,
        parentId?: string
    ): Promise<string | undefined> {
        const { data, error } = await this.supabase.from('agent_execution_logs').insert({
            user_id: userId,
            session_id: sessionId,
            intent: intent,
            agents_involved: agentsInvolved,
            execution_time_ms: Date.now() - startTime,
            status: response.status,
            logs: { input: message, output: response },
            parent_id: parentId
        }).select('id').single()

        if (error) {
            console.error('[PersistenceService] Error logging execution:', error)
            return undefined
        }
        return data?.id
    }
}
