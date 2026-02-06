import { corsHeaders } from './cors.ts'

export const handleError = (error: any) => {
  console.error('[Error Handler] Caught:', error)
  const status = error.status || 500
  const message = error.message || 'An unexpected error occurred'

  // Return 200 to ensure client can read the response body (supabase-js hides body on non-2xx)
  return new Response(
    JSON.stringify({
      error: message,
      message: message,
      status: 'error',
      original_status: status
    }),
    {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  )
}
