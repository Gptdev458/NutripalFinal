import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders } from "../_shared/cors.ts"
import { handleError } from "../_shared/error-handler.ts"
import { createSupabaseClient } from "../_shared/supabase-client.ts"
import { orchestrate } from "./orchestrator_v2.ts"

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('[Chat-Handler] Request received (v1.0.3 Debug)')
    const supabaseClient = createSupabaseClient(req)

    const authHeader = req.headers.get('Authorization')
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()

    if (userError || !user) {
      console.error('[Chat-Handler] Auth Error:', userError)
      return new Response(JSON.stringify({ error: 'Unauthorized', details: userError?.message }), {
        status: 200, // Return 200 for client visibility
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const body = await req.json()
    const { message, session_id, timezone } = body
    console.log('[Chat-Handler] User:', user.id, 'Session:', session_id, 'Message:', message)

    if (!message) {
      return new Response(JSON.stringify({ error: 'Message is required' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Fetch conversation history if session_id is provided
    let history: { role: string, content: string }[] = []
    if (session_id) {
      const { data: historyData } = await supabaseClient
        .from('chat_messages')
        .select('role, content')
        .eq('session_id', session_id)
        .order('created_at', { ascending: false })
        .limit(10)

      if (historyData) {
        history = historyData.reverse()
      }
    }

    const result = await orchestrate(user.id, message, session_id, history, timezone)

    // Save message to history - wrapped in safety
    try {
      if (session_id) {
        await supabaseClient.from('chat_messages').insert([
          { session_id, user_id: user.id, role: 'user', content: message },
          {
            session_id,
            user_id: user.id,
            role: 'assistant',
            content: result.message || 'Success!',
            metadata: result.data || {},
            message_type: result.response_type || 'standard'
          }
        ])
      } else {
        console.warn('[Chat-Handler] Skipping history insert: No session_id')
      }
    } catch (insertError) {
      console.error('[Chat-Handler] History Insert Error:', insertError)
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    return handleError(error)
  }
})
