import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders } from "../_shared/cors.ts"
import { handleError } from "../_shared/error-handler.ts"
import { createSupabaseClient } from "../_shared/supabase-client.ts"
import { orchestrate } from "./orchestrator.ts"

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createSupabaseClient(req)
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
        status: 401, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      })
    }

    const { message, session_id } = await req.json()
    if (!message) {
      return new Response(JSON.stringify({ error: 'Message is required' }), { 
        status: 400, 
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

    const result = await orchestrate(user.id, message, session_id, history)

    // Save message to history
    await supabaseClient.from('chat_messages').insert([
      { session_id, user_id: user.id, role: 'user', content: message },
      { session_id, user_id: user.id, role: 'assistant', content: result.message, metadata: result.data }
    ])

    return new Response(JSON.stringify(result), { 
      status: 200, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })

  } catch (error) {
    return handleError(error)
  }
})
