import { SessionState } from '../../_shared/types.ts'

export class SessionService {
    constructor(public supabase: any) { }

    /**
     * Retrieves the current session state for a user.
     * If no session exists, creates a fresh 'idle' session.
     */
    async getSession(userId: string): Promise<SessionState> {
        const { data, error } = await this.supabase
            .from('chat_sessions')
            .select('*')
            .eq('user_id', userId)
            .maybeSingle()

        if (error) {
            console.error('[SessionService] Error fetching session:', error)
            throw error
        }

        if (!data) {
            // Create new session if none exists
            return await this.createSession(userId)
        }

        return data as SessionState
    }

    /**
     * Creates a new session for the user
     */
    async createSession(userId: string): Promise<SessionState> {
        const newSession: SessionState = {
            user_id: userId,
            current_mode: 'idle',
            buffer: {},
            missing_fields: []
        }

        const { data, error } = await this.supabase
            .from('chat_sessions')
            .insert(newSession)
            .select()
            .single()

        if (error) {
            console.error('[SessionService] Error creating session:', error)
            throw error
        }

        return data as SessionState
    }

    /**
     * Updates the session with new state
     */
    async updateSession(userId: string, updates: Partial<SessionState>) {
        const { error } = await this.supabase
            .from('chat_sessions')
            .update(updates)
            .eq('user_id', userId)

        if (error) {
            console.error('[SessionService] Error updating session:', error)
            throw error
        }
    }

    /**
     * Clears the current flow and buffer, resetting to idle
     */
    async clearSession(userId: string) {
        await this.updateSession(userId, {
            current_mode: 'idle',
            buffer: {},
            missing_fields: []
        })
    }
}
